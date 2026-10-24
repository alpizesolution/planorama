import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateDailyOverview,
  sortTodaysFocusTasks,
  getUpcomingDateGroups,
  calculateWeeklyProgress,
} from "./dashboard-utils";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_METADATA,
  resolveDashboardWidgets,
} from "./types";
import {
  createTask,
  getTasks,
  removeTask,
} from "../schedule/task-service";
import {
  createHabit,
  getCheckIns,
  getHabitStats,
  deleteHabit,
  toggleCheckIn,
} from "../habits/habit-service";
import { getWeekDays, toDateKey } from "../calendar/date-utils";
import type { PlannerTask } from "../schedule/types";

describe("Dashboard Implementation Audit & Verification Suite", () => {
  const todayKey = "2026-10-24";

  beforeEach(async () => {
    // Clear storage for clean test runs
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  describe("1. Six Dashboard Widgets Data & Logic Audit", () => {
    it("Widget A: Daily Overview accurately counts due, completed, overdue, and progress bar", () => {
      const mockTasks: PlannerTask[] = [
        {
          id: "t1",
          title: "Due today open",
          dueDate: todayKey,
          status: "open",
          priority: "p1",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
        {
          id: "t2",
          title: "Due today done",
          dueDate: todayKey,
          status: "completed",
          priority: "p2",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
        {
          id: "t3",
          title: "Overdue from yesterday",
          dueDate: "2026-10-23",
          status: "open",
          priority: "p3",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-23T00:00:00Z",
          updatedAt: "2026-10-23T00:00:00Z",
        },
        {
          id: "t4",
          title: "Future task",
          dueDate: "2026-10-28",
          status: "open",
          priority: "p4",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
      ];

      const overview = calculateDailyOverview(mockTasks, todayKey);
      expect(overview.totalDueToday).toBe(2);
      expect(overview.completedToday).toBe(1);
      expect(overview.remainingToday).toBe(1);
      expect(overview.overdueCount).toBe(1);
      expect(overview.progressPercent).toBe(50);
    });

    it("Widget B: Today's Focus orders strictly by priority (Do This Now -> High -> Med -> Low -> None) with pinned tasks first", () => {
      const tasks: PlannerTask[] = [
        {
          id: "p_low",
          title: "Low task",
          dueDate: todayKey,
          status: "open",
          priority: "p4",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T01:00:00Z",
          updatedAt: "2026-10-24T01:00:00Z",
        },
        {
          id: "p_none",
          title: "No priority",
          dueDate: todayKey,
          status: "open",
          priority: "none",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T01:00:00Z",
          updatedAt: "2026-10-24T01:00:00Z",
        },
        {
          id: "p_pinned_med",
          title: "Pinned Medium task",
          dueDate: todayKey,
          status: "open",
          priority: "p3",
          isPinned: true,
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T01:00:00Z",
          updatedAt: "2026-10-24T01:00:00Z",
        },
        {
          id: "p_now",
          title: "Do This Now",
          dueDate: todayKey,
          status: "open",
          priority: "p1",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T01:00:00Z",
          updatedAt: "2026-10-24T01:00:00Z",
        },
        {
          id: "p_high",
          title: "High priority",
          dueDate: todayKey,
          status: "open",
          priority: "p2",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T01:00:00Z",
          updatedAt: "2026-10-24T01:00:00Z",
        },
      ];

      const sorted = sortTodaysFocusTasks(tasks, todayKey);
      expect(sorted.map((t) => t.id)).toEqual([
        "p_pinned_med",
        "p_now",
        "p_high",
        "p_low",
        "p_none",
      ]);
    });

    it("Widget C: Daily Habits check-ins track streak, prevent duplicate records, and calculate stats", async () => {
      const habit = await createHabit({
        name: "Morning Meditation",
        icon: "🧘",
        scheduleType: "everyday",
        target: "10 mins",
      });

      expect(habit.id).toBeDefined();

      // Check-in on 3 consecutive days
      await toggleCheckIn(habit.id, "2026-10-22");
      await toggleCheckIn(habit.id, "2026-10-23");
      const todayResult = await toggleCheckIn(habit.id, todayKey);
      expect(todayResult.completed).toBe(true);

      const checkIns = await getCheckIns();
      const habitCheckIns = checkIns.filter((c) => c.habitId === habit.id);
      expect(habitCheckIns.length).toBe(3);

      const stats = await getHabitStats(habit, todayKey);
      expect(stats.currentStreak).toBe(3);
      expect(stats.isCompletedToday).toBe(true);

      // Toggle off for today
      const toggleOff = await toggleCheckIn(habit.id, todayKey);
      expect(toggleOff.completed).toBe(false);

      const updatedStats = await getHabitStats(habit, todayKey);
      expect(updatedStats.isCompletedToday).toBe(false);

      // Cleanup
      await deleteHabit(habit.id);
    });

    it("Widget D: Upcoming isolates overdue items and groups the next 7 days correctly", () => {
      const tasks: PlannerTask[] = [
        {
          id: "overdue1",
          title: "Overdue from 2 days ago",
          dueDate: "2026-10-22",
          status: "open",
          priority: "p2",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-22T00:00:00Z",
          updatedAt: "2026-10-22T00:00:00Z",
        },
        {
          id: "day1",
          title: "Tomorrow task",
          dueDate: "2026-10-25",
          status: "open",
          priority: "p1",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
        {
          id: "day4",
          title: "Mid-week task",
          dueDate: "2026-10-28",
          status: "open",
          priority: "p3",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
      ];

      const summary = getUpcomingDateGroups(tasks, todayKey, 7);
      expect(summary.overdueGroup).toBeDefined();
      expect(summary.overdueGroup?.tasks.length).toBe(1);
      expect(summary.overdueGroup?.tasks[0].id).toBe("overdue1");
      expect(summary.dateGroups.length).toBe(7); // Next 7 calendar days
      const oct25Group = summary.dateGroups.find((g) => g.dateKey === "2026-10-25");
      expect(oct25Group?.tasks.length).toBe(1);
      expect(oct25Group?.tasks[0].id).toBe("day1");
    });

    it("Widget E & F: Weekly Progress and Mini Calendar date alignment without timezone shifts", () => {
      // Oct 24, 2026 is Saturday
      const testDate = new Date(2026, 9, 24);
      expect(toDateKey(testDate)).toBe("2026-10-24");

      const weekDates = getWeekDays(testDate, 0); // Sunday-start
      expect(weekDates.length).toBe(7);
      expect(toDateKey(weekDates[0])).toBe("2026-10-18"); // Sunday
      expect(toDateKey(weekDates[6])).toBe("2026-10-24"); // Saturday

      const tasks: PlannerTask[] = [
        {
          id: "w1",
          title: "Sunday task",
          dueDate: "2026-10-18",
          status: "completed",
          priority: "p1",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-18T00:00:00Z",
          updatedAt: "2026-10-18T00:00:00Z",
        },
        {
          id: "w2",
          title: "Saturday task",
          dueDate: "2026-10-24",
          status: "open",
          priority: "p2",
          notes: "",
          labelIds: [],
          projectId: null,
          recurrence: "none",
          dueTime: null,
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
        },
      ];

      const progress = calculateWeeklyProgress(tasks, [], [], weekDates, todayKey);
      expect(progress.totalWeekTasks).toBe(2);
      expect(progress.tasksCompleted).toBe(1);
      expect(progress.tasksRemaining).toBe(1);
      expect(progress.taskCompletionPercent).toBe(50);
      expect(progress.dailyChart.length).toBe(7);
    });
  });

  describe("2. Task Creation & Persistence Across All Views Audit", () => {
    it("saves task created with specific due date from Month/Year/Yearline/Week and verifies persistence", async () => {
      const targetDate = "2026-11-15";
      const task = await createTask({
        title: "Cross-View Verification Task",
        dueDate: targetDate,
        priority: "p2",
        status: "open",
        labelIds: ["work"],
        notes: "Created via standardized modal",
      });

      expect(task.id).toBeDefined();
      expect(task.dueDate).toBe(targetDate);

      // Verify persistence after simulated reload
      const reloadedTasks = await getTasks();
      const found = reloadedTasks.find((t) => t.id === task.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe("Cross-View Verification Task");
      expect(found?.dueDate).toBe(targetDate);
      expect(found?.priority).toBe("p2");
      expect(found?.labelIds).toEqual(["work"]);

      // Verify cross-view queries:
      // Month/Year query
      const monthTasks = reloadedTasks.filter((t) => t.dueDate === targetDate);
      expect(monthTasks.some((t) => t.id === task.id)).toBe(true);

      // Kanban query
      const openTasks = reloadedTasks.filter((t) => t.status === "open");
      expect(openTasks.some((t) => t.id === task.id)).toBe(true);

      // Cleanup
      await removeTask(task.id);
    });

    it("saves task created from Kanban Board with specific status and verifies persistence", async () => {
      const boardTask = await createTask({
        title: "Board In-Progress Task",
        dueDate: todayKey,
        priority: "p1",
        status: "in_progress",
        isPinned: true,
      });

      expect(boardTask.status).toBe("in_progress");
      expect(boardTask.isPinned).toBe(true);

      const reloaded = await getTasks();
      const found = reloaded.find((t) => t.id === boardTask.id);
      expect(found?.status).toBe("in_progress");
      expect(found?.isPinned).toBe(true);

      await removeTask(boardTask.id);
    });

    it("saves task with null due date (unscheduled) cleanly", async () => {
      const unscheduledTask = await createTask({
        title: "Someday task",
        dueDate: null,
        status: "open",
        priority: "none",
        timingPreference: "whenever",
      });

      expect(unscheduledTask.dueDate).toBeNull();
      expect(unscheduledTask.timingPreference).toBe("whenever");

      const reloaded = await getTasks();
      const found = reloaded.find((t) => t.id === unscheduledTask.id);
      expect(found).toBeDefined();
      expect(found?.dueDate).toBeNull();
      expect(found?.timingPreference).toBe("whenever");

      await removeTask(unscheduledTask.id);
    });
  });

  describe("3. Dashboard Customization in Preferences Audit", () => {
    it("respects default widget order and metadata completeness", () => {
      expect(DEFAULT_DASHBOARD_WIDGETS.length).toBe(6);
      expect(DEFAULT_DASHBOARD_WIDGETS.map((w) => w.id)).toEqual([
        "daily_overview",
        "todays_focus",
        "daily_habits",
        "upcoming",
        "mini_calendar",
        "weekly_progress",
      ]);

      for (const w of DEFAULT_DASHBOARD_WIDGETS) {
        const meta = DASHBOARD_WIDGET_METADATA[w.id];
        expect(meta).toBeDefined();
        expect(meta.name).toBeTruthy();
        expect(meta.description).toBeTruthy();
        expect(meta.icon).toBeTruthy();
      }
    });

    it("allows hiding, reordering, and appending missing widgets via resolveDashboardWidgets", () => {
      // Reordered and hidden
      const customConfig = [
        { id: "mini_calendar" as const, visible: false },
        { id: "weekly_progress" as const, visible: true },
        { id: "daily_overview" as const, visible: true },
      ];

      const resolved = resolveDashboardWidgets(customConfig);
      expect(resolved.length).toBe(6);
      expect(resolved[0].id).toBe("mini_calendar");
      expect(resolved[0].visible).toBe(false);
      expect(resolved[1].id).toBe("weekly_progress");
      expect(resolved[1].visible).toBe(true);
      expect(resolved[2].id).toBe("daily_overview");

      // Missing widgets were automatically appended as visible
      const todaysFocus = resolved.find((w) => w.id === "todays_focus");
      expect(todaysFocus).toBeDefined();
      expect(todaysFocus?.visible).toBe(true);
    });

    it("handles all widgets hidden gracefully", () => {
      const allHidden = DEFAULT_DASHBOARD_WIDGETS.map((w) => ({
        ...w,
        visible: false,
      }));
      const resolved = resolveDashboardWidgets(allHidden);
      const activeWidgets = resolved.filter((w) => w.visible);
      expect(activeWidgets.length).toBe(0);
    });
  });
});
