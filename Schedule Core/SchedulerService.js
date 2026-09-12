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
})