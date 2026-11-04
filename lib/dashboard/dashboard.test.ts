import { describe, it, expect } from "vitest";
import {
  resolveDashboardWidgets,
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_METADATA,
} from "./types";
import {
  calculateDailyOverview,
  sortTodaysFocusTasks,
  getUpcomingDateGroups,
  calculateWeeklyProgress,
} from "./dashboard-utils";
import type { PlannerTask } from "../schedule/types";
import type { Habit, HabitCheckIn } from "../habits/types";

describe("Dashboard Widgets Resolution", () => {
  it("returns default 6 widgets in order for undefined or empty input", () => {
    const res = resolveDashboardWidgets(undefined);
    expect(res).toEqual(DEFAULT_DASHBOARD_WIDGETS);
    expect(res.map((w) => w.id)).toEqual([
      "daily_overview",
      "todays_focus",
      "daily_habits",
      "upcoming",
      "mini_calendar",
      "weekly_progress",
    ]);
    expect(res.every((w) => w.visible)).toBe(true);
  });

  it("preserves custom user order and visibility", () => {
    const custom = [
      { id: "mini_calendar" as const, visible: true },
      { id: "daily_habits" as const, visible: false },
      { id: "daily_overview" as const, visible: true },
      { id: "todays_focus" as const, visible: true },
      { id: "upcoming" as const, visible: false },
      { id: "weekly_progress" as const, visible: true },
    ];
    const res = resolveDashboardWidgets(custom);
    expect(res[0].id).toBe("mini_calendar");
    expect(res[1].id).toBe("daily_habits");
    expect(res[1].visible).toBe(false);
    expect(res[4].id).toBe("upcoming");
    expect(res[4].visible).toBe(false);
  });

  it("appends missing widgets and filters invalid ids", () => {
    const partial = [
      { id: "todays_focus" as const, visible: true },
      { id: "invalid_id", visible: true },
    ];
    const res = resolveDashboardWidgets(partial);
    expect(res.length).toBe(6);
    expect(res[0].id).toBe("todays_focus");
    expect(res.map((w) => w.id)).toContain("daily_overview");
    expect(res.map((w) => w.id)).toContain("mini_calendar");
    expect(res.find((w) => (w.id as string) === "invalid_id")).toBeUndefined();
  });

  it("provides complete metadata for all 6 widgets", () => {
    for (const w of DEFAULT_DASHBOARD_WIDGETS) {
      const meta = DASHBOARD_WIDGET_METADATA[w.id];
      expect(meta).toBeDefined();
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });
});

describe("Dashboard Daily Overview Calculations", () => {
  const todayKey = "2026-10-24";
  const mockTasks: PlannerTask[] = [
    {
      id: "1",
      title: "Task 1",
      notes: "",
      status: "completed",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: "09:00",
      recurrence: "none",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "2",
      title: "Task 2",
      notes: "",
      status: "open",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: "14:00",
      recurrence: "none",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    },
    {
      id: "3",
      title: "Task 3 (Overdue)",
      notes: "",
      status: "open",
      priority: "p3",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-22",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00Z",
    },
    {
      id: "4",
      title: "Task 4 (Future)",
      notes: "",
      status: "open",
      priority: "none",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-28",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
  ];

  it("accurately computes today's totals, completion, and overdue count", () => {
    const stats = calculateDailyOverview(mockTasks, todayKey);
    expect(stats.totalDueToday).toBe(2);
    expect(stats.completedToday).toBe(1);
    expect(stats.remainingToday).toBe(1);
    expect(stats.overdueCount).toBe(1);
    expect(stats.progressPercent).toBe(50);
  });

  it("handles zero tasks due today gracefully", () => {
    const emptyStats = calculateDailyOverview([], todayKey);
    expect(emptyStats.totalDueToday).toBe(0);
    expect(emptyStats.completedToday).toBe(0);
    expect(emptyStats.remainingToday).toBe(0);
    expect(emptyStats.overdueCount).toBe(0);
    expect(emptyStats.progressPercent).toBe(0);
  });
});

describe("Dashboard Today's Focus Sorting", () => {
  const todayKey = "2026-10-24";
  const tasks: PlannerTask[] = [
    {
      id: "low",
      title: "Low priority task",
      notes: "",
      status: "open",
      priority: "p4",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "10:00",
      recurrence: "none",
      createdAt: "2026-10-24T01:00:00Z",
      updatedAt: "2026-10-24T01:00:00Z",
    },
    {
      id: "urgent",
      title: "Do This Now task",
      notes: "",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "12:00",
      recurrence: "none",
      createdAt: "2026-10-24T02:00:00Z",
      updatedAt: "2026-10-24T02:00:00Z",
    },
    {
      id: "pinned-med",
      title: "Pinned Medium task",
      notes: "",
      status: "open",
      priority: "p3",
      isPinned: true,
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "16:00",
      recurrence: "none",
      createdAt: "2026-10-24T03:00:00Z",
      updatedAt: "2026-10-24T03:00:00Z",
    },
    {
      id: "high",
      title: "High priority task",
      notes: "",
      status: "open",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "08:00",
      recurrence: "none",
      createdAt: "2026-10-24T04:00:00Z",
      updatedAt: "2026-10-24T04:00:00Z",
    },
    {
      id: "none-pri",
      title: "No priority task",
      notes: "",
      status: "open",
      priority: "none",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-24T05:00:00Z",
      updatedAt: "2026-10-24T05:00:00Z",
    },
  ];

  it("prioritizes pinned tasks first, followed strictly by priority order (p1 -> p2 -> p3 -> p4 -> none)", () => {
    const sorted = sortTodaysFocusTasks(tasks, todayKey);
    expect(sorted.map((t) => t.id)).toEqual([
      "pinned-med", // Pinned takes precedence
      "urgent",     // p1: Do This Now
      "high",       // p2: High
      "low",        // p4: Low
      "none-pri",   // none: No Priority
    ]);
  });
});

describe("Dashboard Upcoming Tasks Grouping", () => {
  const todayKey = "2026-10-24";
  const tasks: PlannerTask[] = [
    {
      id: "overdue-1",
      title: "Late task",
      notes: "",
      status: "open",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-22",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "tomorrow",
      title: "Tomorrow task",
      notes: "",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-25",
      dueTime: "11:00",
      recurrence: "none",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "day3",
      title: "Day 3 task",
      notes: "",
      status: "open",
      priority: "p3",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-27",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
  ];

  it("groups tasks for the next 7 days and isolates overdue items", () => {
    const upcoming = getUpcomingDateGroups(tasks, todayKey, 7);
    expect(upcoming.overdueGroup).not.toBeNull();
    expect(upcoming.overdueGroup?.tasks.length).toBe(1);
    expect(upcoming.overdueGroup?.tasks[0].id).toBe("overdue-1");

    expect(upcoming.dateGroups.length).toBe(7);
    expect(upcoming.dateGroups[0].dateKey).toBe("2026-10-25");
    expect(upcoming.dateGroups[0].title).toContain("Tomorrow");
    expect(upcoming.dateGroups[0].tasks.length).toBe(1);
    expect(upcoming.dateGroups[0].tasks[0].id).toBe("tomorrow");

    expect(upcoming.totalUpcomingTasks).toBe(2);
  });
});

describe("Dashboard Weekly Progress Calculation", () => {
  const todayKey = "2026-10-24";
  const weekDays = [
    new Date(2026, 9, 18),
    new Date(2026, 9, 19),
    new Date(2026, 9, 20),
    new Date(2026, 9, 21),
    new Date(2026, 9, 22),
    new Date(2026, 9, 23),
    new Date(2026, 9, 24),
  ];

  const tasks: PlannerTask[] = [
    {
      id: "w1",
      title: "Done task",
      notes: "",
      status: "completed",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-20",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-18T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "w2",
      title: "Open task",
      notes: "",
      status: "open",
      priority: "p3",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: null,
      recurrence: "none",
      createdAt: "2026-10-18T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    },
  ];

  const habits: Habit[] = [
    {
      id: "h1",
      name: "Water",
      icon: "💧",
      scheduleType: "everyday",
      customDays: [],
      target: "8 glasses",
      archived: false,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ];

  const checkIns: HabitCheckIn[] = [
    { id: "c1", habitId: "h1", date: "2026-10-18", completed: true, completedAt: "2026-10-18T08:00:00Z" },
    { id: "c2", habitId: "h1", date: "2026-10-19", completed: true, completedAt: "2026-10-19T08:00:00Z" },
    { id: "c3", habitId: "h1", date: "2026-10-20", completed: true, completedAt: "2026-10-20T08:00:00Z" },
  ];

  it("calculates weekly tasks completion, daily breakdown chart, and habit stats", () => {
    const progress = calculateWeeklyProgress(tasks, habits, checkIns, weekDays, todayKey);
    expect(progress.totalWeekTasks).toBe(2);
    expect(progress.tasksCompleted).toBe(1);
    expect(progress.tasksRemaining).toBe(1);
    expect(progress.taskCompletionPercent).toBe(50);
    expect(progress.dailyChart.length).toBe(7);
    expect(progress.habitsCompleted).toBe(3);
    expect(progress.habitsExpected).toBe(7); // everyday habit across 7 days
    expect(progress.habitCompletionPercent).toBe(43); // 3/7 = 43%
  });
});
