/**
 * SheetDB Unit Tests
 *
 * Run with: node "Data & Import/SheetDB.test.js"
 *
 * Stubs all Google Apps Script globals so the module can be loaded in Node.js.
 * Tests cover: initDatabase, getAll, saveOne, saveAll, and known bugs.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── GAS Global Stubs ────────────────────────────────────────────────────────

let _sheets = {};

function _makeSheet(name) {
    const rows = _sheets[name]._rows;
    const protections = [];
    return {
        getName:      () => name,
        getDataRange: () => ({ getValues: () => rows }),
        getRange:     (r, c, numRows, numCols) => ({
            getValues: () => {
                const out = [];
                for (let i = 0; i < (numRows || 1); i++) {
                    const sheetRow = rows[r - 1 + i] || [];
                    out.push(sheetRow.slice(c - 1, c - 1 + (numCols || sheetRow.length)));
                }
                return out;
            },
            setValues:    (vals) => vals.forEach((row, i) => { rows[r - 1 + i] = row; }),
            setFontWeight: () => {},
            clearContent: () => {
                for (let i = 0; i < numRows; i++) rows[r - 1 + i] = new Array(numCols).fill('');
            },
            protect: () => {
                const p = {
                    setDescription: () => {},
                    addEditor:      () => {},
                    getEditors:     () => [{ getEmail: () => 'other@example.com' }],
                    removeEditor:   () => {},
                    canDomainEdit:  () => true,
                    setDomainEdit:  () => {},
                    remove:         () => {},
                };
                protections.push(p);
                return p;
            },
        }),
        getLastRow:      () => rows.length,
        getLastColumn:   () => (rows[0] || []).length,
        setFrozenRows:   () => {},
        getProtections:  () => protections,
    };
}

global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
        getSheetByName: (name) => _sheets[name] ? _makeSheet(name) : null,
        insertSheet:    (name) => {
            _sheets[name] = { _rows: [] };
            return _makeSheet(name);
        },
    }),
    flush:          () => {},
    ProtectionType: { RANGE: 'RANGE' },
};

global.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
};

global.Session = {
    getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }),
};

global.Logger = { log: () => {} };

// ─── Load Module ─────────────────────────────────────────────────────────────
// GAS files rely on implicit globals. Wrapping in an IIFE lets us capture the
// `const`-declared SheetDB and the `function` initDatabase without modifying source.

const src = fs.readFileSync(path.join(__dirname, 'SheetDB.js'), 'utf8');
// eslint-disable-next-line no-eval
const { SheetDB, initDatabase } = eval(`(function () { ${src}; return { SheetDB, initDatabase }; })()`);

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (e) {
        console.error(`  FAIL  ${name}`);
        console.error(`        ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label = '') {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${label ? label + '\n' : ''}  Expected: ${b}\n  Got:      ${a}`);
}

function resetSheets() { _sheets = {}; }

// ─── initDatabase ─────────────────────────────────────────────────────────────

console.log('\ninitDatabase');

test('creates all four tables when none exist', () => {
    resetSheets();
    initDatabase();
    ['Employees', 'Schedules', 'TimeOffLogs', 'AttendanceLogs'].forEach(name => {
        assert(_sheets[name], `Sheet "${name}" was not created`);
        assert(_sheets[name]._rows.length >= 1, `Sheet "${name}" has no header row`);
    });
});

test('does not overwrite an existing sheet', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_exist', 'Existing, Row', '{}', '2024-01-01', 'ACTIVE'],
    ]};
    initDatabase();
    assertEqual(_sheets['Employees']._rows.length, 2, 'pre-existing rows should be untouched');
});

test('writes correct headers for Employees table', () => {
    resetSheets();
    initDatabase();
    assertEqual(_sheets['Employees']._rows[0],
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']);
});

test('writes correct headers for Schedules table', () => {
    resetSheets();
    initDatabase();
    assertEqual(_sheets['Schedules']._rows[0],
        ['id', 'department', 'payload_json', 'created_at']);
});

// ─── SheetDB.getOne ───────────────────────────────────────────────────────────

console.log('\nSheetDB.getOne');

test('returns null when sheet has only headers', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    assertEqual(SheetDB.getOne('Employees', 'emp_1'), null);
});

test('returns the matching record with correct _rowNum', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_1', 'Smith, John', '{"phone":"555-1234"}', '2024-06-01T00:00:00Z', 'ACTIVE'],
        ['emp_2', 'Doe, Jane',   '{"phone":"555-5678"}', '2024-06-02T00:00:00Z', 'ACTIVE'],
    ]};
    const rec = SheetDB.getOne('Employees', 'emp_2');
    assertEqual(rec.id, 'emp_2');
    assertEqual(rec._rowNum, 3, '_rowNum should reflect actual spreadsheet row (1-indexed + header)');
    assertEqual(rec.phone, '555-5678', 'payload should be unpacked');
});

test('returns null when id does not exist', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_1', 'Smith, John', '{}', '2024-06-01T00:00:00Z', 'ACTIVE'],
    ]};
    assertEqual(SheetDB.getOne('Employees', 'emp_999'), null);
});

test('finds the first matching row when ids are not unique', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['dup_id', 'First, One',  '{"seq":1}', '2024-01-01', 'ACTIVE'],
        ['dup_id', 'Second, Two', '{"seq":2}', '2024-01-02', 'ACTIVE'],
    ]};
    const rec = SheetDB.getOne('Employees', 'dup_id');
    assertEqual(rec._rowNum, 2, 'should return the first matching row');
    assertEqual(rec.seq, 1);
});

test('survives a malformed payload_json cell in the matched row without throwing', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_bad', 'Bad, Data', '{NOT VALID JSON}', '2024-01-01', 'ACTIVE'],
    ]};
    let result;
    assert(() => { result = SheetDB.getOne('Employees', 'emp_bad'); }, 'should not throw on bad JSON');
    result = SheetDB.getOne('Employees', 'emp_bad');
    assertEqual(result.id, 'emp_bad', 'record should still be returned despite bad JSON');
});

// ─── SheetDB.getAll ───────────────────────────────────────────────────────────

console.log('\nSheetDB.getAll');

test('returns empty array when sheet has only headers', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    assertEqual(SheetDB.getAll('Employees'), []);
});

test('parses a basic employee row and attaches _rowNum', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_1', 'Smith, John', '{"phone":"555-1234"}', '2024-06-01T00:00:00Z', 'ACTIVE'],
    ]};
    const [rec] = SheetDB.getAll('Employees');
    assertEqual(rec._rowNum, 2);
    assertEqual(rec.id, 'emp_1');
    assertEqual(rec.primary_identifier, 'Smith, John');
    assertEqual(rec.status, 'ACTIVE');
    assertEqual(rec.phone, '555-1234', 'payload JSON should be unpacked onto record');
});

test('assigns sequential _rowNum values across multiple data rows', () => {
    resetSheets();
    _sheets['Schedules'] = { _rows: [
        ['id', 'department', 'payload_json', 'created_at'],
        ['sched_1', 'Pharmacy', '{}', '2024-01-01T00:00:00Z'],
        ['sched_2', 'Grocery',  '{}', '2024-01-02T00:00:00Z'],
    ]};
    const rows = SheetDB.getAll('Schedules');
    assertEqual(rows.length, 2);
    assertEqual(rows[0]._rowNum, 2);
    assertEqual(rows[1]._rowNum, 3);
    assertEqual(rows[1].department, 'Grocery');
});

test('returns null for empty cells instead of empty string', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_2', '', '{}', '', ''],
    ]};
    const [rec] = SheetDB.getAll('Employees');
    assertEqual(rec.primary_identifier, null);
    assertEqual(rec.status, null);
});

test('survives a malformed payload_json cell without throwing', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_3', 'Bad, Data', '{NOT VALID JSON}', '2024-01-01', 'ACTIVE'],
    ]};
    const result = SheetDB.getAll('Employees');
    assertEqual(result[0].id, 'emp_3', 'row should still be returned despite bad JSON');
});

test('payload keys do not overwrite explicit column values', () => {
    // If payload_json contains a key that matches a column (e.g. "id"), the explicit column wins
    // because Object.keys(col) assignment runs after the spread.
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['real_id', 'Doe, Jane', '{"id":"payload_id","extra":"yes"}', '2024-01-01', 'ACTIVE'],
    ]};
    const [rec] = SheetDB.getAll('Employees');
    assertEqual(rec.id, 'real_id', 'column value should win over payload value for same key');
    assertEqual(rec.extra, 'yes', 'non-collision payload keys should still be present');
});

// ─── SheetDB.saveOne ──────────────────────────────────────────────────────────

console.log('\nSheetDB.saveOne');

test('appends a new row when record has no _rowNum', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { id: 'emp_10', lastName: 'Jones', firstName: 'Alice', status: 'ACTIVE', phone: '555-9999' });
    assertEqual(_sheets['Employees']._rows.length, 2, 'header + 1 data row');
    const row = _sheets['Employees']._rows[1];
    assertEqual(row[0], 'emp_10',      'id column');
    assertEqual(row[1], 'Jones, Alice', 'primary_identifier column');
    assert(row[2].includes('555-9999'), `phone should be in payload_json, got: ${row[2]}`);
    assertEqual(row[4], 'ACTIVE',      'status column');
});

test('updates an existing row in-place when _rowNum is provided', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_11', 'Old, Name', '{}', '2024-01-01', 'ACTIVE'],
    ]};
    SheetDB.saveOne('Employees', { _rowNum: 2, id: 'emp_11', lastName: 'New', firstName: 'Name', status: 'INACTIVE' });
    assertEqual(_sheets['Employees']._rows.length, 2, 'should not append a new row');
    assertEqual(_sheets['Employees']._rows[1][4], 'INACTIVE',  'status should be updated');
    assertEqual(_sheets['Employees']._rows[1][1], 'New, Name', 'primary_identifier should be updated');
});

test('auto-generates an id when none is provided', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { lastName: 'Auto', firstName: 'Id' });
    const id = _sheets['Employees']._rows[1][0];
    assert(id && id.startsWith('rec_'), `id should start with "rec_", got: "${id}"`);
});

test('defaults status to ACTIVE when not provided', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { id: 'emp_12', lastName: 'Defaulted' });
    assertEqual(_sheets['Employees']._rows[1][4], 'ACTIVE');
});

test('sets updated_at to a valid ISO timestamp', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    const before = new Date().toISOString();
    SheetDB.saveOne('Employees', { id: 'emp_ts' });
    const after  = new Date().toISOString();
    const ts = _sheets['Employees']._rows[1][3];
    assert(ts >= before && ts <= after, `updated_at "${ts}" should be between "${before}" and "${after}"`);
});

test('throws "System busy" when lock cannot be acquired', () => {
    const original = global.LockService;
    global.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => {} }) };
    let threw = false;
    try {
        SheetDB.saveOne('Employees', { id: 'x' });
    } catch (e) {
        threw = true;
        assert(e.message.toLowerCase().includes('busy'), `expected "busy" in message, got: "${e.message}"`);
    }
    global.LockService = original;
    assert(threw, 'saveOne should throw when lock fails');
});

// ─── SheetDB.saveAll ──────────────────────────────────────────────────────────

console.log('\nSheetDB.saveAll');

test('clears existing data rows then writes all new records', () => {
    resetSheets();
    _sheets['Schedules'] = { _rows: [
        ['id', 'department', 'payload_json', 'created_at'],
        ['old_1', 'OldDept', '{}', '2023-01-01'],
    ]};
    SheetDB.saveAll('Schedules', [
        { id: 'sched_A', department: 'Pharmacy' },
        { id: 'sched_B', department: 'Grocery'  },
    ]);
    assertEqual(_sheets['Schedules']._rows.length, 3, 'header + 2 new rows');
    assertEqual(_sheets['Schedules']._rows[1][0], 'sched_A');
    assertEqual(_sheets['Schedules']._rows[2][1], 'Grocery');
});

test('handles an empty records array — clears existing data, writes nothing', () => {
    resetSheets();
    _sheets['Schedules'] = { _rows: [
        ['id', 'department', 'payload_json', 'created_at'],
        ['sched_old', 'Old', '{}', '2023-01-01'],
    ]};
    SheetDB.saveAll('Schedules', []);
    const row2 = _sheets['Schedules']._rows[1];
    assert(row2.every(cell => cell === ''), `row 2 should be cleared, got: ${JSON.stringify(row2)}`);
});

test('preserves payload extras in payload_json', () => {
    resetSheets();
    _sheets['TimeOffLogs'] = { _rows: [['id', 'employee_id', 'payload_json', 'created_at']] };
    SheetDB.saveAll('TimeOffLogs', [
        { id: 'to_1', employee_id: 'emp_1', reason: 'sick', days: 2 },
    ]);
    const payload = JSON.parse(_sheets['TimeOffLogs']._rows[1][2]);
    assertEqual(payload.reason, 'sick');
    assertEqual(payload.days, 2);
});

test('throws "System busy" when lock cannot be acquired', () => {
    const original = global.LockService;
    global.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => {} }) };
    let threw = false;
    try { SheetDB.saveAll('Schedules', []); } catch (e) { threw = true; }
    global.LockService = original;
    assert(threw, 'saveAll should throw when lock fails');
});

// ─── Regression Tests (bugs fixed) ───────────────────────────────────────────

console.log('\nRegressions');

test('_getHeaderMap handles all header types without throwing (was: string() instead of String())', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [
        ['id', 'primary_identifier', 'payload_json', 'updated_at', 'status'],
        ['emp_99', 'Test, User', '{"extra":1}', '2024-01-01', 'ACTIVE'],
    ]};
    let result;
    assert(() => { result = SheetDB.getAll('Employees'); }, 'getAll should not throw');
    result = SheetDB.getAll('Employees');
    assertEqual(result[0].id, 'emp_99');
});

test('firstName-only record builds "Last, First" correctly (was: firsName typo)', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { id: 'fix_test', firstName: 'Alice' });
    const written = _sheets['Employees']._rows[1][1];
    assertEqual(written, ', Alice', 'firstName-only should produce ", Alice" (no lastName)');
});

test('lastName-only record builds "Last," correctly (.trim() removes trailing space)', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { id: 'fix_test2', lastName: 'Smith' });
    const written = _sheets['Employees']._rows[1][1];
    assertEqual(written, 'Smith,', 'lastName-only should produce "Smith," — trailing space is trimmed');
});

test('full name record builds "Last, First" correctly', () => {
    resetSheets();
    _sheets['Employees'] = { _rows: [['id', 'primary_identifier', 'payload_json', 'updated_at', 'status']] };
    SheetDB.saveOne('Employees', { id: 'fix_test3', lastName: 'Johnson', firstName: 'Bob' });
    const written = _sheets['Employees']._rows[1][1];
    assertEqual(written, 'Johnson, Bob');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(54)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
