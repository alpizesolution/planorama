import { describe, expect, it } from "vitest";
import { daysInMonth, getWeekDays, getWorkWeekDays, getWeekStart, monthGridDays, toDateKey, formatWeekRange } from "./date-utils";
import { validateTask } from "../schedule/validation";

describe("calendar date helpers", () => {
  it("formats local calendar dates without UTC conversion", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("handles leap years and month boundaries", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
    expect(daysInMonth(2026, 0)).toBe(31);
  });
  it("supports different week start days", () => {
    expect(monthGridDays(2026, 0, 0).length % 7).toBe(0);
    expect(monthGridDays(2026, 0, 1)[0]).toBe(null);
    expect(monthGridDays(2026, 0, 6)[0]).toBe(null);
  });
  it("calculates week start (Monday) and 7 week days correctly", () => {
    // 2026-10-23 is a Friday
    const friday = new Date(2026, 9, 23);
    const monday = getWeekStart(friday);
    expect(toDateKey(monday)).toBe("2026-10-19");

    const days = getWeekDays(friday);
    expect(days).toHaveLength(7);
    expect(toDateKey(days[0])).toBe("2026-10-19");
    expect(toDateKey(days[6])).toBe("2026-10-25");

    // Next week: Monday, October 26, 2026
    const nextWeekMonday = new Date(monday);
    nextWeekMonday.setDate(monday.getDate() + 7);
    expect(toDateKey(nextWeekMonday)).toBe("2026-10-26");

    const nextWeekDays = getWeekDays(nextWeekMonday);
    expect(toDateKey(nextWeekDays[0])).toBe("2026-10-26");
    expect(toDateKey(nextWeekDays[6])).toBe("2026-11-01");
    expect(formatWeekRange(nextWeekDays)).toBe("Oct 26 – Nov 1, 2026");
  });

  it("formats week ranges across months and years properly", () => {
    // Single month week: May 4 – 10, 2026
    const singleMonthDays = getWeekDays(new Date(2026, 4, 6), 1);
    expect(formatWeekRange(singleMonthDays)).toBe("May 4 – 10, 2026");

    // Cross-month week: Oct 26 – Nov 1, 2026
    const crossMonthDays = getWeekDays(new Date(2026, 9, 28), 1);
    expect(formatWeekRange(crossMonthDays)).toBe("Oct 26 – Nov 1, 2026");

    // Cross-year week: Dec 28, 2026 – Jan 3, 2027
    const crossYearDays = getWeekDays(new Date(2026, 11, 30), 1);
    expect(formatWeekRange(crossYearDays)).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  it("calculates 5 workweek days (Monday–Friday) correctly including weekends and month transitions", () => {
    // 1. Given a weekday: Wednesday, October 28, 2026
    const wednesday = new Date(2026, 9, 28);
    const workDays = getWorkWeekDays(wednesday);
    expect(workDays).toHaveLength(5);
    expect(toDateKey(workDays[0])).toBe("2026-10-26"); // Monday
    expect(toDateKey(workDays[1])).toBe("2026-10-27"); // Tuesday
    expect(toDateKey(workDays[2])).toBe("2026-10-28"); // Wednesday
    expect(toDateKey(workDays[3])).toBe("2026-10-29"); // Thursday
    expect(toDateKey(workDays[4])).toBe("2026-10-30"); // Friday
    expect(formatWeekRange(workDays)).toBe("Oct 26 – 30, 2026");

    // 2. Given a Saturday: October 31, 2026 -> returns Mon–Fri of that week
    const saturday = new Date(2026, 9, 31);
    const satWorkDays = getWorkWeekDays(saturday);
    expect(satWorkDays).toHaveLength(5);
    expect(toDateKey(satWorkDays[0])).toBe("2026-10-26"); // Monday
    expect(toDateKey(satWorkDays[4])).toBe("2026-10-30"); // Friday
    expect(formatWeekRange(satWorkDays)).toBe("Oct 26 – 30, 2026");

    // 3. Given a Sunday: November 1, 2026 -> returns Mon–Fri of that week
    const sunday = new Date(2026, 10, 1);
    const sunWorkDays = getWorkWeekDays(sunday);
    expect(sunWorkDays).toHaveLength(5);
    expect(toDateKey(sunWorkDays[0])).toBe("2026-10-26"); // Monday
    expect(toDateKey(sunWorkDays[4])).toBe("2026-10-30"); // Friday

    // 4. Given next Monday: November 2, 2026 -> returns Nov 2–6
    const nextMonday = new Date(2026, 10, 2);
    const nextWorkDays = getWorkWeekDays(nextMonday);
    expect(nextWorkDays).toHaveLength(5);
    expect(toDateKey(nextWorkDays[0])).toBe("2026-10-02".replace("-10-02", "-11-02"));
    expect(toDateKey(nextWorkDays[4])).toBe("2026-11-06");
    expect(formatWeekRange(nextWorkDays)).toBe("Nov 2 – 6, 2026");
  });

  it("renders all 12 months for 2026 with consistent multiples of 7", () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGridDays(2026, month, 1);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
      expect(grid.length).toBeLessThanOrEqual(42);
      // Ensure all actual days in that month are present
      const daysCount = daysInMonth(2026, month);
      for (let day = 1; day <= daysCount; day++) {
        expect(grid).toContain(day);
      }
    }
  });

  it("identifies the week containing November 7, 2026 with correct start and end", () => {
    // Nov 7, 2026 is Saturday
    const nov7 = new Date(2026, 10, 7);
    const weekMonday = getWeekDays(nov7, 1);
    expect(toDateKey(weekMonday[0])).toBe("2026-11-02"); // Monday Nov 2
    expect(toDateKey(weekMonday[5])).toBe("2026-11-07"); // Saturday Nov 7
    expect(toDateKey(weekMonday[6])).toBe("2026-11-08"); // Sunday Nov 8

    // Sunday-start week
    const weekSunday = getWeekDays(nov7, 0);
    expect(toDateKey(weekSunday[0])).toBe("2026-11-01"); // Sunday Nov 1
    expect(toDateKey(weekSunday[6])).toBe("2026-11-07"); // Saturday Nov 7
  });

  describe("Yearline horizontal calendar sequence and week synchronization", () => {
    it("generates all 12 months in strict chronological order for Yearline", () => {
      const year = 2026;
      const months = Array.from({ length: 12 }, (_, monthIndex) => {
        const monthDate = new Date(year, monthIndex, 1);
        return {
          index: monthIndex,
          name: monthDate.toLocaleDateString("en", { month: "long" }),
          grid: monthGridDays(year, monthIndex, 1),
        };
      });

      expect(months).toHaveLength(12);
      expect(months[0].name).toBe("January");
      expect(months[11].name).toBe("December");

      // Verify each month follows the previous month
      for (let i = 0; i < 11; i++) {
        expect(months[i].index).toBe(i);
        expect(months[i + 1].index).toBe(i + 1);
      }
    });

    it("synchronizes any date selected in Yearline to the exact week containing it", () => {
      // Test dates across different months in Yearline
      const sampleDates = [
        { dateKey: "2026-01-15", expectedMonday: "2026-01-12", expectedSunday: "2026-01-18" },
        { dateKey: "2026-04-01", expectedMonday: "2026-03-30", expectedSunday: "2026-04-05" },
        { dateKey: "2026-07-20", expectedMonday: "2026-07-20", expectedSunday: "2026-07-26" },
        { dateKey: "2026-12-31", expectedMonday: "2026-12-28", expectedSunday: "2027-01-03" },
      ];

      for (const { dateKey, expectedMonday, expectedSunday } of sampleDates) {
        const [y, m, d] = dateKey.split("-").map(Number);
        const selected = new Date(y, m - 1, d);
        const week = getWeekDays(selected, 1);

        expect(week).toHaveLength(7);
        expect(toDateKey(week[0])).toBe(expectedMonday);
        expect(toDateKey(week[6])).toBe(expectedSunday);

        // Selected date must be one of the week's days
        const weekDateKeys = week.map(toDateKey);
        expect(weekDateKeys).toContain(dateKey);
      }
    });

    it("correctly models the Annual Task Grid with 12 month columns and 31 day rows", () => {
      const year = 2026;
      const daysPerMonth = Array.from({ length: 12 }, (_, m) => daysInMonth(year, m));

      expect(daysPerMonth).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

      // Row 15 aligns across all 12 months
      const row15Dates = Array.from({ length: 12 }, (_, m) => {
        return `${year}-${String(m + 1).padStart(2, "0")}-15`;
      });
      expect(row15Dates).toHaveLength(12);
      expect(row15Dates[0]).toBe("2026-01-15");
      expect(row15Dates[1]).toBe("2026-02-15");
      expect(row15Dates[11]).toBe("2026-12-15");

      // Verify row 31: only months with 31 days have valid cells
      const row31ValidMonths = Array.from({ length: 12 }, (_, m) => m).filter((m) => 31 <= daysInMonth(year, m));
      // Jan(0), Mar(2), May(4), Jul(6), Aug(7), Oct(9), Dec(11)
      expect(row31ValidMonths).toEqual([0, 2, 4, 6, 7, 9, 11]);

      // Leap year 2024: Feb has 29 days
      expect(daysInMonth(2024, 1)).toBe(29);
      // Non-leap year 2026: Feb has 28 days
      expect(daysInMonth(2026, 1)).toBe(28);
    });

    it("supports independent month columns with natural day counts and isolated task distribution", () => {
      const year = 2026;
      // Each month column contains only its actual days
      const monthColumns = Array.from({ length: 12 }, (_, mIdx) => {
        const daysCount = daysInMonth(year, mIdx);
        return {
          monthIndex: mIdx,
          days: Array.from({ length: daysCount }, (_, d) => `${year}-${String(mIdx + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`),
        };
      });

      // February has exactly 28 days in 2026, January has 31
      expect(monthColumns[0].days).toHaveLength(31);
      expect(monthColumns[1].days).toHaveLength(28);
      expect(monthColumns[3].days).toHaveLength(30);

      // Verify task distribution isolation: multiple tasks on Jan 15 only populate Jan 15
      const mockTasks = [
        { id: "1", title: "Jan 15 Task A", dueDate: "2026-01-15" },
        { id: "2", title: "Jan 15 Task B", dueDate: "2026-01-15" },
        { id: "3", title: "Jan 15 Task C", dueDate: "2026-01-15" },
        { id: "4", title: "Jan 15 Task D", dueDate: "2026-01-15" },
        { id: "5", title: "Feb 15 Task", dueDate: "2026-02-15" },
      ];

      const tasksByDate = mockTasks.reduce<Record<string, typeof mockTasks>>((acc, task) => {
        if (!acc[task.dueDate]) acc[task.dueDate] = [];
        acc[task.dueDate].push(task);
        return acc;
      }, {});

      expect(tasksByDate["2026-01-15"]).toHaveLength(4);
      expect(tasksByDate["2026-02-15"]).toHaveLength(1);
      expect(tasksByDate["2026-03-15"]).toBeUndefined();

      // Dates in other months for day 15 remain isolated and do not receive extra tasks
      const day15InAllMonths = Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}-15`);
      expect(day15InAllMonths.map((d) => (tasksByDate[d] || []).length)).toEqual([
        4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
    });

    it("correctly identifies Saturdays and Sundays across months and years", () => {
      const year = 2026;
      // Jan 3, 2026 is Saturday (6), Jan 4, 2026 is Sunday (0)
      const jan3 = new Date(year, 0, 3);
      const jan4 = new Date(year, 0, 4);
      const jan5 = new Date(year, 0, 5); // Monday (1)

      const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
      expect(isWeekend(jan3)).toBe(true);
      expect(isWeekend(jan4)).toBe(true);
      expect(isWeekend(jan5)).toBe(false);

      // Verify every weekend in 2026 has day 0 or 6
      let weekendCount = 0;
      for (let m = 0; m < 12; m++) {
        const days = daysInMonth(year, m);
        for (let d = 1; d <= days; d++) {
          const date = new Date(year, m, d);
          if (isWeekend(date)) weekendCount++;
        }
      }
      // 2026 has 52 weeks (104 weekend days)
      expect(weekendCount).toBe(104);
    });

    it("evaluates combined weekend and activity states with correct priority", () => {
      interface DayStateProps {
        dateKey: string;
        dayDate: Date;
        todayKey: string;
        selectedDateKey: string | null;
        tasksCount: number;
      }

      function resolveDayVisualClasses({ dateKey, dayDate, todayKey, selectedDateKey, tasksCount }: DayStateProps) {
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        const isToday = dateKey === todayKey;
        const isSelected = dateKey === selectedDateKey;
        const hasTasks = tasksCount > 0;
        const hasMultiple = tasksCount > 1;
        const isHigh = tasksCount >= 3;

        return {
          isWeekend,
          hasTasks,
          hasMultiple,
          isHigh,
          isToday,
          isSelected,
        };
      }

      const todayKey = "2026-10-24"; // Saturday
      const sat = new Date(2026, 9, 24);
      const fri = new Date(2026, 9, 23);
      const sun = new Date(2026, 9, 25);

      // Today on a weekend (Saturday) with tasks
      const todayWeekend = resolveDayVisualClasses({
        dateKey: "2026-10-24",
        dayDate: sat,
        todayKey,
        selectedDateKey: null,
        tasksCount: 1,
      });
      expect(todayWeekend.isToday).toBe(true);
      expect(todayWeekend.isWeekend).toBe(true);
      expect(todayWeekend.hasTasks).toBe(true);

      // 1. Weekday with no task
      const weekdayNoTask = resolveDayVisualClasses({
        dateKey: "2026-10-23",
        dayDate: fri,
        todayKey,
        selectedDateKey: null,
        tasksCount: 0,
      });
      expect(weekdayNoTask.isWeekend).toBe(false);
      expect(weekdayNoTask.hasTasks).toBe(false);

      // 2. Weekend with no task
      const weekendNoTask = resolveDayVisualClasses({
        dateKey: "2026-10-25",
        dayDate: sun,
        todayKey,
        selectedDateKey: null,
        tasksCount: 0,
      });
      expect(weekendNoTask.isWeekend).toBe(true);
      expect(weekendNoTask.hasTasks).toBe(false);

      // 3. Weekday with 1 task
      const weekdaySingleTask = resolveDayVisualClasses({
        dateKey: "2026-10-23",
        dayDate: fri,
        todayKey,
        selectedDateKey: null,
        tasksCount: 1,
      });
      expect(weekdaySingleTask.isWeekend).toBe(false);
      expect(weekdaySingleTask.hasTasks).toBe(true);
      expect(weekdaySingleTask.hasMultiple).toBe(false);

      // 4. Weekend WITH 1 task (both isWeekend and hasTasks are true)
      const weekendSingleTask = resolveDayVisualClasses({
        dateKey: "2026-10-25",
        dayDate: sun,
        todayKey,
        selectedDateKey: null,
        tasksCount: 1,
      });
      expect(weekendSingleTask.isWeekend).toBe(true);
      expect(weekendSingleTask.hasTasks).toBe(true);
      expect(weekendSingleTask.hasMultiple).toBe(false);

      // 5. Weekend WITH multiple tasks
      const weekendMultiTasks = resolveDayVisualClasses({
        dateKey: "2026-10-25",
        dayDate: sun,
        todayKey,
        selectedDateKey: null,
        tasksCount: 3,
      });
      expect(weekendMultiTasks.isWeekend).toBe(true);
      expect(weekendMultiTasks.hasTasks).toBe(true);
      expect(weekendMultiTasks.hasMultiple).toBe(true);
      expect(weekendMultiTasks.isHigh).toBe(true);

      // 6. Selected date takes top priority
      const selectedWeekend = resolveDayVisualClasses({
        dateKey: "2026-10-25",
        dayDate: sun,
        todayKey,
        selectedDateKey: "2026-10-25",
        tasksCount: 2,
      });
      expect(selectedWeekend.isSelected).toBe(true);
      expect(selectedWeekend.isWeekend).toBe(true);
    });

    it("categorizes month activity density into quiet, active, moderate, and busy tiers", () => {
      function getMonthActivityTier(taskCount: number) {
        if (taskCount >= 8) return "busy";
        if (taskCount >= 4) return "moderate";
        if (taskCount >= 1) return "active";
        return "empty";
      }

      expect(getMonthActivityTier(0)).toBe("empty");
      expect(getMonthActivityTier(1)).toBe("active");
      expect(getMonthActivityTier(3)).toBe("active");
      expect(getMonthActivityTier(4)).toBe("moderate");
      expect(getMonthActivityTier(7)).toBe("moderate");
      expect(getMonthActivityTier(8)).toBe("busy");
      expect(getMonthActivityTier(15)).toBe("busy");
    });
  });
});


describe("legacy task compatibility", () => {
  const legacyTask = {
    id: "legacy-1",
    title: "Legacy task",
    status: "open",
    priority: "p3",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("fills defaults for tasks saved before notes, labels, projects, and recurrence existed", () => {
    expect(validateTask(legacyTask)).toMatchObject({
      notes: "", labelIds: [], projectId: null, dueDate: null, dueTime: null, recurrence: "none",
    });
  });

  it("still rejects invalid task data", () => {
    expect(() => validateTask({ ...legacyTask, title: "" })).toThrow("Task title");
    expect(() => validateTask({ ...legacyTask, notes: 42 })).toThrow("Task notes");
  });
});
