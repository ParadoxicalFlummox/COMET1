/**
 * COMET1 - Controller layer for the public API that the UI and sidebar hook into to run functions and manage data
 */

/**
 * Domain payload keys: these are the only keys in non-grid fields that are allowed in a record.
 * This matches the employee 
 */
const ALLOWED_PAYLOAD_KEYS = Object.freeze([
    'firstName',
    'lastName',
    'homeDepartment',
    'jobTitle',
    'preferredDaysOff',
    'vacationDays',
    'qualifiedDepartments',
    'maxHoursPerWeek',
    'sickLeaveBalanceHours',
    'lastImportedAt',
    'locked',
    'employmentStatus',
    'isCombo',
    'preferredWeeklyHours'
]);

/**
 * Validates the requested sheet name matches those in the SheetDB config
 */
function _validateTableName(sheetName) {
    if (!sheetName || typeof sheetName !== 'string') {
        throw new Error("Table name must be a non-empty string");
    }
    const validTables = Object.values(DB_CONFIG.TABLES).map(t => t.name);
    if (!validTables.includes(sheetName)) {
        throw new Error(`Unauthorized table access: "${sheetName}".`);
    }
}

/**
 * Whitelists a record's keys before they reach SheetDB
 */
function _whitelistRecordKeys(sheetName, record) {
    const table = Object.values(DB_CONFIG.TABLES).find(t => t.name === SheetName);
    const allowed = new Set(table.headers.concat(ALLOWED_PAYLOAD_KEYS));
    const clean = {};
    for (const [key, value] of Object.entries(record)) {
        if (allowed.has(key) || key.startsWith('_')) {
            clean[key] = value;
        }
    }
    return clean;
}
/**
 * Function to sanitize the input records before passing them to SheetDB, also guards against formula injection either intentionally or accidentally 
 */
const Sanitizer = {
    cleanValue(val) {
        // Cleans up strings by using trim on the string object
        if (typeof val === 'string') {
            let cleaned = val.trim();
            // Formula injection protection, if the text starts with a special character like =, +, -, @ it prefixes the text with a ' to force sheets to treat it as a string
            if (/^[=+\-@]/.test(cleaned)) {
                cleaned = "'" + cleaned;
            }
            // Strip any non printable ASCII characters excluding newlines and tabs
            cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            return cleaned;
        }
        if (Array.isArray(val)) {
            return val.map(item => this.cleanValue(item));
        }
        if (val !== null && typeof val === 'object') {
            return this.cleanObject(val);
        }
        return val;
    },

    cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const clean = {};
        for (const [key, value] of Object.entries(obj)) {
            // Remove any prototyping pollution keys to prevent any javascript exploits
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            clean[key] = this.cleanValue(value);
        }
        return clean;
    }
};

/**
 * Generic CRUD operations
 */

// Read all of the records from the database table that is passed to this function
function getAllRecords(sheetName) {
    _validateTableName(sheetName);
    return SheetDB.getAll(sheetName);
}

// Read a single record by its id.
function getRecord(sheetName, id) {
    _validateTableName(sheetName);
    if (id === undefined || id === null || String(id).trim() === '') {
        throw new Error("Invalid ID supplied to getRecord.");
    }
    const cleanId = String(id).trim();
    return SheetDB.getOne(sheetName, cleanId);
}

// Creates or updates a single record. Sanitizes the input and uses a targeted saveOne
function upsertRecord(sheetName, record) {
    _validateTableName(sheetName);
    if (!record || typeof record !== 'object') {
        throw new Error("No valid record object provided.");
    }
    const sanitizedRecord = Sanitizer.cleanObject(record);
    const whitelistedRecord = _whitelistRecordKeys(sheetName, sanitizedRecord);
    SheetDB.saveOne(sheetName, whitelistedRecord.id);
    return SheetDB.getOne(sheetName, whitelistedRecord.id);
}

/**
 * Delete a record, this function is included to ensure full CRUD operations but will rarely be used
 * the delete function will be used like a surgical delete in case a mistake is made. uses a delete
 * by id then a saveall to push the table without that record.
 */
function deleteRecord(sheetName, id) {
    _validateTableName(sheetName);
    if (id === undefined || id === null || String(id).trim() === '') {
        throw new Error("Invalid ID supplied to deleteRecord.");
    }
    const cleanId = String(id).trim();
    const all = sheetDB.getAll(sheetNmame).filter(rec => String(rec.id) !== cleanId);
    SheetDB.saveAll(sheetName, all);
    return { deletedId: cleanId, remaining: all.length };
}

/**
 * Lock spreadsheet data rows so that grid edits are blocked.
 * calls SheetDB lockDataRows
 */
function protectTable(sheetName) {
    _validateTableName(sheetName);
    SheetDB.lockDataRows(sheetName);
    return { locked: true, sheet: sheetName };
}

/**
 * UKG Import actions
 * 
 * Ingests raw text from UKG paste data. sanitizes the input and delegates parsing and upserts to the UKGImporter file.
 */
function importUKGData(rawInput) {
    if (!rawInput) {
        throw new Error("No import data provided.");
    }
    /**
     * Accept two shapes of input for redundancy:
     * 1. a long string with commas, parsed as a real CSV internally
     * 2. a long string with tabs, parsed as TSV spreadsheet which would be a clipboard paste
     * 3. a already parsed array, sanitize the inputs as values are passed through
     */
    const sanitizedInput = Sanitizer.cleanValue(rawInput);
    return UKGImporter.importFromPasteData(sanitizedInput);
}

/**
 * Settings and department configuration endpoints
 */

// Read the full scheduling config for a department
function getDepartmentConfig(dept) {
    if (!dept || typeof dept !== 'string') {
        throw new Error("Department name must be a non-empty string.");
    }
    return SettingsService.getConfig(dept);
}

// Upsert the scheduling config for a department
function setDepartmentConfig(dept, config) {
    if (!dept || typeof dept !== 'string') {
        throw new Error("Department name must be a non-empty string.");
    }
    if (!config || typeof config !== 'object') {
        throw new Error("Config must be an object.");
    }
    const sanitizedConfig = Sanitizer.cleanObject(config);
    return SettingsService.setConfig(dept, sanitizedConfig);
}

// Return all department configuration settings as a readable summary for the UI
function getAllDepartmentConfigs() {
    const records = SheetDB.getAll(DB_CONFIG.TABLES.SETTINGS.name);
    return records.amp(r => ({
        dept: r.dept || r.id,
        weeklyAllowanceHours: r.weeklyAllowanceHours || 0,
        dailyHourEstimates: r.dailyHourEstimates || {},
        openClose: r.openClose || {}
    }));
}


/** 
 * Sidebar Row Inspection Callbacks
 */

function getSelectedRowData(sheetName) {
    const resolvedSheet = sheetName || SpreadsheetApp.getActiveSheet().getName();
    _validateTableName(resolvedSheet);

    const activeRow = SpreadsheetApp.getActiveSheet().getActiveCell().getRow();
    if (activeRow <= 1) return null; // protects against pulling the header row for inspection

    const records = SheetDB.getAll(resolvedSheet);
    return records.find(rec._rowNum === activeRow) || null;
}

function saveSelectedRowData(updatedRecord, sheetName) {
    if (!updatedRecord) throw new Error("No record provided.");
    const resolvedSheet = sheetName || SpreadsheetApp.getActiveSheet().getName();
    _validateTableName(resolvedSheet);

    const sanitized = Sanitizer.cleanObject(updatedRecord);
    const whitelisted = _whitelistRecordKeys(resolvedSheet, sanitized);
    SheetDB.saveOne(resolvedSheet, whitelisted);
    return { saved: true, id: whitelisted.id };
}

function reloadRecord(sheetName, id) {
    return getRecord(sheetName, id);
}
