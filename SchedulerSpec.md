# COMET Scheduler v1 - Spec Sheet
Status: pre-MVP. anything blocking will be marked with **[BLOCKER]**.

## 1. Scheduling modes (Department Settings)
- Two modes per department, stored in the department settings payload:
  - `anchor` - every employee on the shift starts at that shift's day-specific anchor (merch; special project shifts get custom times)
  - `gapfill` - starts are derived to close coverage gaps (front end, gas, maintenance).
- Ported from `COMET_beta`: per-shift per-day anchors (`weekdayStart`/`satStart`/`sunStart`, weekday fallback) plus `flexWindowEarliest`/`flexWindowLatest`.
- In gapfill, windows are placement constraints, not stagger spreads. Opener pinned to store open; every shift must end by close (cap: `closingTime - blockMinutes`).

## 2. Placement rules
- The only employee preference is days off. No start-time preferences, no per-person overrides.
- Starts vary per day (9:00 Monday, 10:30 Wednesday is valid). Attendance/expectation displays must tolerate per-day start variation.
- Tiebreak deterministically: earliest legal start, then employee ID. Regeneration must be reproduceable for audit.

## 3. Hours budget (the driver)
- Manager enters a weekly hours budget, weighted toward Fri/Sat/Sun via daily estimates.
- Headcount is derived from the budget. Role map is the CONSTRAINT hours pour into, never the driver.

## 4. Role capacity map with floors (Department Settings)
- Per role: `capacity` (who can HOLD it at once; `null`/inf = unbounded), `minimum` (floor; per traffic level where applicable).
- Example: SCO `{capacity:1, minimum:1`} | Cashier `{capacity:null, minimum:{low:2, moderate:3, high:5}}`
- Floors are hard constants at generation. If floors are pushed past budget: schedule is still marked as valid but flagged as `overbudget` with delta.