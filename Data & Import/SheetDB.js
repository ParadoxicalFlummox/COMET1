/**
 * COMET 1 Scoped Database Configuration and Data Access 
 */

const DB_CONFIG = Object.freeze({
    // Object.freeze prevents script modifications while the config is being setup, protecting tables names.
    LOCK_TIMEOUT_MS: 10000,
    TABLES: {
        // Table 1: Master Employee Directory - Contains information that is manually set plus UKG import metadata
        EMPLOYEES: {
            name: "Employees",
            // Initialize the headers so there is no guessing at column positions
            headers: ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']
        },

        // Table 2: Schedules & Coverage - Table containing the weekly generated schedules and staggered break metrics
        SCHEDULES: {
            name: "Schedules",
            headers: ['id', 'department', 'payload_json', 'created_at']
        },

        // Table 3: Time Off - This table contains sick leave, call outs, pto, etc.
        TIME_OFF: {
            name: "TimeOffLogs",
            headers: ['id', 'employee_id', 'payload_json', 'created_at']
        },

        // Table 4: Attendance - This table contains tardies, any diciplinary actions taken and counsling notices
        ATTENDANCE: {
            name: "AttendanceLogs",
            headers: ['id', 'employee_id', 'payload_json', 'created_at']
        }
    }
});

function initDatabase() {
    // Function to create the individual sheets if they dont exist.
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    Object.keys(DB_CONFIG.TABLES).forEach(key => {
        const table = DB_CONFIG.TABLES[key];
        let sheet = ss.getSheetByName(table.name);
        if (!sheet) {
            sheet = ss.insertSheet(table.name);

            // Write the table headers from the config to row 1 of the sheet
            sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]);

            // Set the font of the first row to bold
            sheet.getRange(1, 1, 1, table.headers.length).setFontWeight('bold');

            // Freeze the first row to the top of the window so you always know what that row is.
            sheet.setFrozenRows(1);
        }
    });
}

// SheetDB the main object that gets called, it returns functions that can be executed within it, the functions call on helper functions internally if they are needed
const SheetDB = (function () {
    // Private base function that just checks if a sheet exists and returns it otherwise it calls on init and then returns the new sheet
    function _getTable(sheetName) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
            initDatabase();
            sheet = ss.getSheetByName(sheetName);
        }
        return sheet;
    }

    // Helper function to dynamically get the return the index of each header element so it is not hardcoded and always dynamically generated in case the tables ever expand
    function _getHeaderMap(headersRow) {
        const map = {};
        headersRow.forEach((headerName, colIdx) => {
            if (headerName) map[String(headerName).trim()] = colIdx;
        });
        return map;
    }

    // Function to convert javascript record objects into an array that can be written to cells, extracts grid columns and stringifies everything not extracted into `payload_json`
    function _formatRowForSheet(headers, col, rec) {
        const row = new Array(headers.length).fill('');

        if (col.id !== undefined) row[col.id] = rec.id || `rec_${Date.now()}`;
        if (col.employee_id !== undefined) row[col.employee_id] = rec.employee_id || rec.id;
        if (col.department !== undefined) row[col.department] = rec.department || '';

        if (col.primary_identifier !== undefined) {
            if (rec.lastName || rec.firstName) {
                row[col.primary_identifier] = `${rec.lastName || ''}, ${rec.firstName || ''}`.trim();
            } else {
                row[col.primary_identifier] = rec.primary_identifier || rec.id;
            }
        }

        if (col.updated_at !== undefined) row[col.updated_at] = new Date().toISOString();
        if (col.created_at !== undefined) row[col.created_at] = rec.created_at || new Date().toISOString();
        if (col.status !== undefined) row[col.status] = rec.status || 'ACTIVE';

        // Extract non-grid attributes into JSON payload string
        const { _rowNum, id, primary_identifier, employee_id, department, updated_at, created_at, status, ...payload } = rec;

        if (col.payload_json !== undefined) {
            row[col.payload_json] = JSON.stringify(payload);
        }

        return row;
    }

    return {
        getAll(sheetName) {
            const sheet = _getTable(sheetName)
            const data = sheet.getDataRange().getValues();
            if (data.length <= 1) return [];

            // Get the spreadsheet headers and assign col a "map" of all headers so its dynamic
            const headers = data[0];
            const col = _getHeaderMap(headers);

            // Using the same method for each row slice the values and map the records by row and column index so it looks as a call saying find `id` from x employee it then knows to search for what index `idx` matches the key `id` and returns the value at row x idx y.
            return data.slice(1).map((row, idx) => {
                let record = {
                    _rowNum: idx + 2
                };

                // First step to reading the JSON data is to check if it exists then unpack the data
                if (col.payload_json !== undefined && row[col.payload_json]) {
                    try {
                        const payload = JSON.parse(row[col.payload_json]);
                        // Using the spread operator (...) to unpack all of the internal key value pairs of the JSON payload
                        record = { ...record, ...payload };
                    } catch (e) {
                        Logger.log(`JSON parse error on sheet ${sheetName} row ${idx + 2}: ${e.message}`);
                    }
                }

                // Second step is to dynamically assign all explicit spreadsheet columns found in the header (that aren't the JSON that was parsed in step 1), that way even if a manager adds a new column or shifts them around the application will know how to handle it and continue to function without "any" issues (there are always issues, good testing is required)
                Object.keys(col).forEach(headerName => {
                    if (headerName !== 'payload_json') {
                        record[headerName] = row[col[headerName]] !== '' ? String(row[col[headerName]]) : null;
                    }
                });

                return record;
            });
        },

        saveOne(sheetName, record) {
            // Using script locking to prevent race conditions, better described in saveAll function.
            const lock = LockService.getScriptLock();
            const acquired = lock.tryLock(DB_CONFIG.LOCK_TIMEOUT_MS);

            if (!acquired) {
                throw new Error("System busy. Please try again.");
            }

            try {
                const sheet = _getTable(sheetName);
                const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
                const col = _getHeaderMap(headers);

                const formattedRow = _formatRowForSheet(headers, col, record);

                if (record._rowNum && record._rowNum > 1) {
                    sheet.getRange(record._rowNum, 1, 1, headers.length).setValues([formattedRow]);
                } else {
                    const nextRow = sheet.getLastRow() + 1;
                    sheet.getRange(nextRow, 1, 1, headers.length).setValues([formattedRow]);
                }
                SpreadsheetApp.flush();
            } finally {
                lock.releaseLock();
            }
        },

        saveAll(sheetName, records) {
            // Using file or script locks to prevent race conditions where one manager overwrites another managers work because in the unlikly scenario that two managers click save data in the same 10 second span, but better to be safer than sorry.
            const lock = LockService.getScriptLock();
            const acquired = lock.tryLock(DB_CONFIG.LOCK_TIMEOUT_MS);

            if (!acquired) {
                throw new Error("System busy. Please try again.");
            }

            try {
                const sheet = _getTable(sheetName);
                const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
                const col = _getHeaderMap(headers);

                const lastRow = sheet.getLastRow();
                if (lastRow > 1) {
                    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
                }

                if (!records || records.length === 0) return;

                const rowsToWrite = records.map(rec => _formatRowForSheet(headers, col, rec));

                sheet.getRange(2, 1, rowsToWrite.length, headers.length).setValues(rowsToWrite);
                SpreadsheetApp.flush();

            } finally {
                lock.releaseLock();
            }
        },

        // Range protection, this function locks the spreadsheet data rows so managers cannot manually edit or delete grid cells directly. All changes must flow safely though the sidebar
        lockDataRows(sheetName) {
            const sheet = _getTable(sheetName);

            // Remove any existing protection on the sheet to avoid dupes
            const existingProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
            existingProtections.forEach(p => p.remove());

            // Re-apply protections from rows 2-1000
            const protection = sheet.getRange("2:1000").protect();
            protection.setDescription("COMET Protected - Edits allowed via Sidebar UI only");

            // Set owner authority so only the script is able to modify the cells
            const me = Session.getEffectiveUser();
            protection.addEditor(me);

            // Remove all other managers from direct cell editing
            const editors = protection.getEditors();
            editors.forEach(ed => {
                if (ed.getEmail() !== me.getEmail()) {
                    protection.removeEditor(ed);
                }
            });

            if (protection.canDomainEdit()) {
                protection.setDomainEdit(false);
            }
        }
    };
})();
