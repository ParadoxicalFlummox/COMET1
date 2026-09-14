/** 
 * COMET 1 Schedule Service
 * The Schedule service is a budget driven auto schedule generation service
 * that calculates the optimal shifts, staggers breaks and respects weekly hour budgets.
 */

const SchedulerService = (function () {
    // Hour rule constants (make adjustments here as policy changes)
    const RULES = Object.freeze({
        FT_HOURS: 40, // Full time employees have 40 hours guaranteed no more no less
        PT_MIN_HOURS: 24, // Part time floor
        PT_MAX_HOURS: 40, // Part time cap
        LPT_MAX_HOURS: 24, // Limited part time cap
        MIN_DAYS_OFF: 2, // Required days off per week
        VACATION_HOURS_PER_DAY: 8,
        MIN_WORKING_HOURS: 4, // Smallest scheduleable shift
        BREAK_STAGGER_MINUTES: 15 // How much stagger should exist between employee start times
    });

    /**
     * Sort employees by employment type then by seniority
     */

    function _sortBySeniority(employees) {
        return [...employees].sort((a, b) => {
            const order = { FT: 3, PT: 2, LPT: 1, LOA: 0 };
            const aFT = order[a.employmentStatus] !== undefined ? order[a.employmentStatus] : ((a.maxHoursPerWeek || 40) >= 32 ? 2 : 2);
            const bFT = order[b.employmentStatus] !== undefined ? order[b.employmentStatus] : ((b.maxHoursPerWeek || 40) >= 32 ? 2 : 2);
            if (aFT !== bFT) return bFT - aFT;

            // Seniority by hire date (earlier hire date  gives greater priority)
            const dateA = new Date(a.hireDate || '2099-01-01').getTime();
            const dateB = new Date(b.hireDate || '2099-01-01').getTime();
            return dateA - dateB;
        });
    }

    /**
     * Calculate break/lunch schedules for a given shift length.
     * Staggers the breaks to that employees in the same department don't have to go on break simultaneously
     */
    const BREAK_SCHEDULE = Object.freeze([
        { type: 'REST_15', hourMark: 2, durationMinutes: 15, minShift: null },
        { type: 'MEAL_30', hourMark: 4, durationMinutes: 30, minShift: 5 },
        { type: 'REST_15', hourMark: 6, durationMinutes: 15, minShift: 6 }
    ]);

    function _generateStaggeredBreaks(shiftStartHour, shiftLength, staggerOffsetMinutes) {
        const baseStart = shiftStartHour * 60 // Convert to minutes from midnight

        return BREAK_SCHEDULE
            .filter(b => b.minShift === null || shiftLength > b.minShift)
            .map(b => ({
                type: b.type,
                time: _minutesToTimeString(baseStart + b.hourMark * 60 + staggerOffsetMinutes),
                durationMinutes: b.durationMinutes
            }));
    }

    function _minutesToTimeString(totalMinutes) {
        const hrs = Math.floor(totalMinutes / 60) % 24;
        const mins = totalMinutes % 60;
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${pad(hrs)}:${pad(mins)}`;
    }

    return {
        /**
         * Core Auto-scheduler engine
         * 
         * the auto scheduler is set up to read the weeky allowance, daily hourly foot traffic estimates and the store's open and close windows from the settings table
         * 
         * the rules enforced are as follows
         * - FT = exactly 40h, PT = 24-40h, LPT = <24h, LOA is not scheduled
         * - Vacation days count toward the employees weekly hours
         * - All employees get two days off per week
         * - Seniority shifts more hours to senior employees unless otherwise specified, with preferredWeekyHours override
         * - preferred days off + locked flag are respected between schedule generations and regenerations
         * - Coverage on the floor on Fri/Sat/Sun are protected with no gaps, weekday Mon/Tues/Wed absorb gaps
         * - Breaks are staggered by 15 minutes
         */
        generateSchedule(params) {
            const department = params.department;
            const weekStartDate = params.weekStartDate;

            // ===== Load department configurations from settings table =====
            const cfg = SettingsService.getConfig(department) || {};
            const budgetHours = cfg.weeklyAllowanceHours || params.weeklyHoursBudget || 0;
            const dailyEstimates = cfg.dailyHourEstimates || {};
            const openClose = cfg.openClose || {};

            // Defaults for scheduleable hours if they are not configured (this is based on 634)
            const weekdayWindow = openClose.weekday || ['4:00', '23:30'];
            const saturdayWindow = openClose.saturday || ['4:00', '22:00'];
            const sundayWindow = openClose.sunday || ['4:00', '21:00'];

            // Day specific key, value table
            const dayWindows = {
                Monday: weekdayWindow,
                Tuesday: weekdayWindow,
                Wednesday: weekdayWindow,
                Thursday: weekdayWindow,
                Friday: weekdayWindow,
                Saturday: saturdayWindow,
                Sunday: sundayWindow
            };

            // ===== Fetch employee data =====
            const allEmployees = SheetDB.getAll(DB_CONFIG.TABLES.EMPLOYEES.name);
            const deptEmployees = allEmployees.filter(emp =>
                emp.employmentStatus !== 'LOA' &&
                !emp.locked &&
                (emp.homeDepartment === department ||
                    (emp.isCombo &&
                        emp.qualifiedDepartments &&
                        emp.qualifiedDepartments.includes(department))));
            if (deptEmployees.length === 0) {
                throw new Error(`No active employees found for department: ${department}`);
            }
            const sortedEmployees = _sortBySeniority(deptEmployees);
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            let remainingBudget = budgetHours;
            const assignedSchedules = [];
            let breakStaggerTracker = 0;

            function toMinutes(t) {
                const [h, m] = String(t).split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            }
            function dayWindowMinutes(day) {
                const [open, close] = dayWindows[day];
                return { openMin: toMinutes(open), closeMin: toMinutes(close) };
            }
            function dailyTarget(day) {
                return dailyEstimates[day] || 0;
            }

            sortedEmployees.forEach(emp => {
                const status = emp.employmentStatus
            })
        }
    }
})