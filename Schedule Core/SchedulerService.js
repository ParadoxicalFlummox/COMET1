/**
 * COMET Schedule Service
 * The schedule service is a budget driven auto schedule generation service
 * that calculates the optimal shifts, staggers breaks and respects weekly hour budgets.
 */

const SchedulerService = function () {
  // Hour rule constants (make adjustments here as policy changes)
  const RULES = Object.freeze({
    FT_HOURS: 40, // Full time employees have 40 hours guaranteed no more no less
    PT_MIN_HOURS: 24, // Part time floor
    PT_MAX_HOURS: 40, // Part time cap
    LPT_MAX_HOURS: 24, // Limited part time cap
    MIN_DAYS_OFF: 2, // Required days off per week
    VACATION_HOURS_PER_DAY: 8,
    MIN_WORKING_HOURS: 4, // Smallest scheduleable shift
    BREAK_STAGGER_MINUTES: 15, // How much stagger should exist between employee start times
  });

  /**
   * Status policy table: this table determines how each employment status derives a weekly hour target.
   *
   * > A fixed target forces exact hours derived from the RULES table above.
   * > A min/max target clamps an employees desired hours between the values in the RULES table above (also takes into consideration the hourly budget).
   * > A null or no entry is assigned to missing data or LOA employees.
   *
   * > Adding a new status entry requires defining the role below and adding new RULES above (or manual specification).
   */
  const STATUS_POLICY = Object.freeze({
    FT: { fixed: RULES.FT_HOURS },
    PT: { min: RULES.PT_MIN_HOURS, max: RULES.PT_MAX_HOURS },
    LPT: { min: null, max: LPT_MAX_HOURS },
  });

  /**
   * Resolves an employee status with weekly hour target from STATUS_POLICY
   * will return null when the status has no policy (LOA or unknown)
   */
  function _resolveTargetHours(emp) {
    const status =
      emp.employmentStatus || ((emp.maxHoursPerWeek || 40) >= 32 ? "FT" : "PT");
    const policy = STATUS_POLICY[status];
    if (!policy) return null;
    if (policy.fixed !== undefined)
      return { status, targetHours: policy.fixed };

    // Desired hours: preferred > maxHoursPerWeek > policy floor > 0 (if unbound)
    const desired =
      emp.preferredWeeklyHours || emp.maxHoursPerWeek || policy.min || 0;
    let target = desired;
    if (policy.min !== null) target = Math.max(policy.min, target);
    if (policy.max !== null) target = Math.min(policy.max, target);

    return { status, targetHours: target };
  }

  // Sort employees by employment type then by seniority
  function _sortBySeniority(employees) {
    return [...employees].sort((a, b) => {
      const order = { FT: 3, PT: 2, LPT: 1, LOA: 0 };
      const aFT =
        order[a.employmentStatus] !== undefined
          ? order[a.employmentStatus]
          : (a.maxHoursPerWeek || 40) >= 32
            ? 2
            : 2;
      const bFT =
        order[b.employmentStatus] !== undefined
          ? order[b.employmentStatus]
          : (b.maxHoursPerWeek || 40) >= 32
            ? 2
            : 2;
      if (aFT !== bFT) return bFT - aFT;

      // Seniority by hire date (earlier hire date  gives greater priority)
      const dateA = new Date(a.hireDate || "2099-01-01").getTime();
      const dateB = new Date(b.hireDate || "2099-01-01").getTime(); // Good chance this software will be retired before this point
      return dateA - dateB;
    });
  }

  //Calculate break/lunch schedules for a given shift length.
  //Staggers the breaks to that employees in the same department don't have to go on break simultaneously
  const BREAK_SCHEDULE = Object.freeze([
    { type: "REST_15", hourMark: 2, durationMinutes: 15, minShift: null },
    { type: "MEAL_30", hourMark: 4, durationMinutes: 30, minShift: 5 },
    { type: "REST_15", hourMark: 6, durationMinutes: 15, minShift: 7 },
  ]);

  function _generateStaggeredBreaks(
    shiftStartHour,
    shiftLength,
    staggerOffsetMinutes,
  ) {
    const baseStart = shiftStartHour * 60; // Convert to minutes from midnight

    return BREAK_SCHEDULE.filter(
      (b) => b.minShift === null || shiftLength > b.minShift,
    ).map((b) => ({
      type: b.type,
      time: _minutesToTimeString(
        baseStart + b.hourMark * 60 + staggerOffsetMinutes,
      ),
      durationMinutes: b.durationMinutes,
    }));
  }

  function _minutesToTimeString(totalMinutes) {
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const pad = (n) => (n < 10 ? "0" + n : n);
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

      // ===== Load department configurations from settings table (SELF-HEALING) =====
      // Bad or missing configuration entries degrade to sensible defaults instead of breaking generation.
      const cfg = SettingsService.getConfig(department) || {};
      
      // Budget: prefer the stored allowance, if missing or invalid self-heal by summing the daily estimates, if those are unusable fall back to caller's values
      // then fall back to 0 as a safe no-op
      let budgetHours = Number(cfg.weeklyAllowanceHours);
      if (!isFinite(budgetHours) || budgetHours < 0) budgetHours = params.weeklyHoursBudget || 0;

      // Daily estimates: coerce every entry to a non-negative number, anything that is missing or malformed counts as 0
      const rawEstimates = cfg.dailyHoursEstimates || {};
      const dailyEstimates = {};
      ALL_DAYS.forEach(d => {
        const v = Number(rawEstimates[d]);
        dailyEstimates[d] = isFinite(v) && v > 0 ? v : 0;
      });

      // Self heal the budget: if the stored allowance is unusable, fall back to the total of (now-coerced from above) daily estimates
      if (!budgetHours) {
        const estimateSum = ALL_DAYS.reduce((sum, d) => sum + dailyEstimates[d], 0);
        if (estimateSum > 0) budgetHours = estimateSum;
      }

      // Day windows: only valid HH:MM pairs survive, anything else malformed fails and reverts back to the defaults
      const openClose = cfg.openClose || {};
      const DEFAULT_WINDOWS = {
        weekday: ["4:00", "23:30"], saturday: ["4:00", "22:00"], sunday: ["4:00", "21:00"]
      };
      const isValidWindow = (w) => Array.isArray(w) && w.length === 2 && w.every(t => /^\d{1,2}:\d{2}$/.test(String(t)));
      // Defaults for scheduleable hours if they are not configured (this is based on 634 EST)
      const weekdayWindow = isValidWindow(openClose.weekday) ? openClose.weekday : DEFAULT_WINDOWS.weekday;
      const saturdayWindow = isValidWindow(openClose.saturday) ? openClose.saturday : DEFAULT_WINDOWS.saturday;
      const sundayWindow = isValidWindow(openClose.sunday) ? openClose.sunday : DEFAULT_WINDOWS.sunday;
      // Day specific key, value table
      const dayWindows = {
        Monday: weekdayWindow,
        Tuesday: weekdayWindow,
        Wednesday: weekdayWindow,
        Thursday: weekdayWindow,
        Friday: weekdayWindow,
        Saturday: saturdayWindow,
        Sunday: sundayWindow,
      };

      // ===== Fetch employee data =====
      // Fetches all employees from the selected department that are not LOA, locked, also pulls combo employees with the selected department as one of their qualified departments
      const allEmployees = SheetDB.getAll(DB_CONFIG.TABLES.EMPLOYEES.name);
      const deptEmployees = allEmployees.filter((emp) => emp.employmentStatus !== 'LOA' && !emp.locked && (emp.homeDepartment === department || (emp.isCombo && emp.qualifiedDepartments && emp.qualifiedDepartments.includes(department))));

      if (deptEmployees.length === 0) {
        throw new Error(`No active employees found for department: ${department}`);
      }

      const sortedEmployees = _sortBySeniority(deptEmployees);

      /**
       * Config driven week (self-healing): a day is scheduleable if it has a positive demand estimate or a configured window. Malformed entries
       * cannot poison this value. Every value was coerced by functions above, and unknown day keys in the config are ignored. If nothing validates meaning the config
       * is empty or broken it falls back to the full 7-day week so that the generator can degrade the schedule to today's behavior rather than producing an empty schedule.
       * This works for where I work but ideally would allow anyone to toggle working days, a company that only works 5 days a week could still use this program.
       */
      const openDays = ALL_DAYS.filter(d => dailyEstimates[d] > 0 || (openClose[d] && isValidWindow(openClose[d])));
      const days = openDays.length ? openDays : [...ALL_DAYS];
      const weekLen = days.length;
      let remainingBudget = budgetHours;
      const assignedSchedules = [];
      let breakStaggerTracker = 0;

      function toMinutes(t) {
        const [h, m] = String(t).split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      }
      function dayWindowMinutes(day) {
        const [open, close] = dayWindows[day];
        return { openMin: toMinutes(open), closeMin: toMinutes(close) };
      }
      function dailyTarget(day) {
        return dailyEstimates[day] || 0;
      }
      
      // Convert weekStartDate + weekday index (0=monday) to an ISO value
      // Returns null if any date part is missing, non-numeric, or is out of range
      // provides no silent rollovers (e.g. Feb 30 -> Mar 2) and no silent fallbacks.
      function _weekDateToISO(weekStartStr, dayIndex) {
        if (!weekStartStr || dayIndex < 0 || dayIndex > 6) return null;
        const [year, month, day] = String(weekStartStr).split('-').map(Number);
        if (!year || !month || !day) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const d = new Date(year, month - 1, day);
        if (d.getDate() !== day || d.getMonth() !== month - 1) return null; // catches feb 30 etc.
        d.setDate(d.getDate() + dayIndex);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
      }

      // Build once, before the per-employee loop: approved spans for the week, with store-wide (__ALL__) spans e.g. FY holiday calendar expanded to every employee
      const blockedMap = TimeOffService.getBlockedDatesByEmployee(weekStartDate, sortedEmployees.map(e => e.id));
      
      sortedEmployees.forEach(emp => {
        const resolved = _resolveTargetHours(emp);
        if (!resolved) return; // LOA or unknown status
        const { status, targetHours } = resolved;

        /**
         * ===== Time off system =====
         * Approved spans from TimeOffLogs (6th table)
         * VAC burn is an input not something that is calculated by this section. The VAC burn
         * day are set by the manager in the UI at approval time and frozen into the span record.
         * This system only reads them, RDO and FH day block the date but dont burn any time.
         * Vacation days burn exactly what was approved. If a burn is wrong, fixing the TimeOff
         * record will correct the problem instead of modification of this code.
         */
        const empBlocked = blockedMap[emp.id] || {};
        const blockedDates = Object.keys(empBlocked);

        // Days off, not stacked: blocked dates (approved time off) and preferred
        // days off both count toward the 2-day minimum rest requirement
        const preferredOff = Array.isArray(emp.preferredDaysOff) ? emp.preferredDaysOff.length : 0;
        const blockedDays = preferredOff + blockedDates.length;

        const totalDaysOff = Math.max(RULES.MIN_DAYS_OFF, blockedDays);
        const divisorDays = Math.mex(1, 7 - totalDaysOff);

        // Safeguard #1 true rest days: blocked days
        if (7 - blockedDays < RULES.MIN_DAYS_OFF) {
          log('WARN', 'Skipping employee %s: week leaves < %d free days (no rest period possible).'[emp.id] || emp.name, RULES.MIN_DAYS_OFF]);
          return;
        }
        // Safeguard #2 vacation burn cap: VAC only burns on days beyond the 2-day rest period 
        const isRestEligible = t => t !== 'VAC' && t !== 'HOL';
        const freeDays = blockedDates.filter(d => isRestEligible(empBlocked[d].type)).length;
        const vacBurnCapDays = Math.max(0, blockedDates.length - Math.max(0, RULES.MIN_DAYS_OFF - preferredOff - freeDays));
        let vacBurnableCount = 0;
        const vacationHours = blockedDates.reduce((total, dateISO) => {
          const day = empBlocked[dateISO];
          if (day.type !== 'VAC') return total;
          if (vacBurnableCount >= vacBurnCapDays) return total; // The rest period is covers the time off
          vacBurnableCount++;
          return total + (day.hours || 0);
        }, 0);
        
        const workingTarget = Math.max(0, targetHours - vacationHours);
        if (workingTarget < RULES.MIN_WORKING_HOURS || remainingBudget <= 0) return;

        const shiftLength = status === 'FT' ? 8 : Math.min(8, Math.max(RULES.MIN_WORKING_HOURS, workingTarget / divisorDays));
        const requiredDays = Math.min(divisorDays, Math.max(2, Math.ciel(workingTarget / shiftLength)));

        const empShifts = [];
        let empHoursAllocated = 0;

        // Prefer weekends first (protect gaps for Sat/Sun coverage), then fill the weekdays
        const dayOrder = [...days].sort((a, b) => {
          const weekend = d => (d === 'Saturday' || d === 'Sunday') ? 1 : 0;
          return weekend(b) - weekend(a);
        });

        dayOrder.forEach((day, dayIndex) => {
          if (emp.preferredDaysOff && emp.preferredDaysOff.includes(day)) return;
          // Approved time off: convert the weekday to this week's ISO date
          const dayIndex = days.indexOf(day);
          const blockedISO = _weekDateToISO(weekStartDate, dayIndex);
          if (empBlocked[blockedISO]) return; // RDO/FH/VAC day: unavailable to be scheduled
          if (empShifts.length >= requiredDays) return;

          // Final shift may be trimmed to hit the target exactly
          const remaining = workingTarget - empHoursAllocated;
          const thisLen = Math.min(shiftLength, remaining);
          if (thisLen < RULES.MIN_WORKING_HOURS) return; // Cannot schedule an employee less than the minimum shift length if they dont have enough time remaining

          const { openMin, closeMin } = dayWindowMinutes(day);





        })
      });
    },
  };
};
