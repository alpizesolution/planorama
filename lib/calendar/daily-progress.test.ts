import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeDailyProgress,
  getCountableDayItems,
  getDayItemState,
  toPercent,
} from "./daily-progress";
import type { PlannerTask } from "../schedule/types";
import type { Habit, HabitCheckIn } from "../habits/types";

const DAY = "2026-11-04"; // Wednesday
const base: PlannerTask = {
  id: "t",
  title: "Item",
  notes: "",
  status: "open",
  priority: "none",
  projectId: null,
  labelIds: [],
  dueDate: DAY,
  dueTime: null,
  recurrence: "none",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const task = (o: Partial<PlannerTask>): PlannerTask => ({ ...base, itemType: "task", source: "local", ...o });
const event = (o: Partial<PlannerTask>): PlannerTask => ({ ...base, itemType: "event", ...o });

const habit = (o: Partial<Habit>): Habit => ({
  id: "h",
  name: "Habit",
  scheduleType: "everyday",
  customDays: [0, 1, 2, 3, 4, 5, 6],
  archived: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...o,
});
const checkIn = (habitId: string, date: string, completed = true): HabitCheckIn => ({
  id: `${habitId}-${date}`,
  habitId,
  date,
  completed,
  completedAt: `${date}T08:00:00Z`,
});

// 2:00 PM local time on DAY
const noon = new Date(2026, 10, 4, 14, 0, 0);

describe("Daily progress calculations", () => {
  it("returns 0% for empty totals", () => {
    expect(toPercent(0, 0)).toBe(0);
    expect(toPercent(1, 3)).toBe(33);
    expect(toPercent(5, 4)).toBe(100);
  });

  it("counts completed tasks and flags overdue ones", () => {
    const p = computeDailyProgress({
      tasks: [
        task({ id: "a", status: "completed" }),
        task({ id: "b", dueTime: "09:00" }), // ended at 10:00 → overdue
        task({ id: "c", dueTime: "18:00" }), // upcoming
        task({ id: "d", dueDate: "2026-11-05" }), // other day
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.tasks).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(p.summary).toEqual({ completed: 1, remaining: 1, overdue: 1, skipped: 0, canceled: 0 });
    expect(p.overall.remaining).toBe(2);
  });

  it("never counts cancelled events as completed and includes all-day events as activities", () => {
    const p = computeDailyProgress({
      tasks: [
        event({ id: "e1", dueTime: "09:00", durationMinutes: 30 }), // ended → completed
        event({ id: "e2", dueTime: "11:00", eventStatus: "cancelled", status: "completed" }),
        event({ id: "e3", isAllDay: true }), // all-day today → in progress
        event({ id: "e4", dueTime: "16:00" }),
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.activities).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(p.summary.skipped).toBe(0);
    expect(p.summary.canceled).toBe(1);
    expect(p.summary.completed).toBe(1);
    expect(p.summary.remaining).toBe(2);
  });

  it("does not count Google events as tasks and excludes holidays", () => {
    const p = computeDailyProgress({
      tasks: [
        { ...base, id: "gcal-1", isGoogleEvent: true, source: "google", dueTime: "08:00" },
        { ...base, id: "hol", isHoliday: true, isAllDay: true, itemType: "event" },
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.tasks.total).toBe(0);
    expect(p.activities.total).toBe(1);
  });

  it("does not double-count an event and its linked task", () => {
    const items = getCountableDayItems(
      [
        task({ id: "local-1", googleEventId: "g-1", status: "completed", dueTime: "15:00" }),
        event({ id: "gcal-g-1", googleEventId: "g-1", isGoogleEvent: true, source: "google", dueTime: "15:00" }),
      ],
      DAY
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("local-1");

    const p = computeDailyProgress({ tasks: items, dateKey: DAY, now: noon });
    expect(p.overall).toEqual({ completed: 1, total: 1, percent: 100, remaining: 0 });
    expect(p.activities.total).toBe(0);
  });

  it("collapses duplicate recurring instances on the same date", () => {
    const p = computeDailyProgress({
      tasks: [
        event({ id: "i1", recurringEventId: "series", googleCalendarId: "c", dueTime: "07:00" }),
        event({ id: "i2", recurringEventId: "series", googleCalendarId: "c", dueTime: "07:00" }),
        task({ id: "r1", title: "Water plants", recurrence: "daily" }),
        task({ id: "r2", title: "Water plants", recurrence: "daily", status: "completed" }),
        task({ id: "r1" }), // same id twice
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.activities.total).toBe(1);
    expect(p.tasks).toEqual({ completed: 1, total: 1, percent: 100 });
  });

  it("uses real habit check-ins for the selected date only, but keeps habits out of the Daily Workspace totals", () => {
    const habits = [
      habit({ id: "h1" }),
      habit({ id: "h2" }),
      habit({ id: "weekend", scheduleType: "weekends" }), // not scheduled Wednesday
      habit({ id: "old", archived: true }),
      habit({ id: "new", createdAt: "2026-11-10T00:00:00Z" }), // did not exist yet
    ];
    const checkIns = [checkIn("h1", DAY), checkIn("h2", DAY, false), checkIn("h2", "2026-11-03")];
    const p = computeDailyProgress({ tasks: [], habits, checkIns, dateKey: DAY, now: noon });
    // The Habits tracker still reports its own completion...
    expect(p.habits).toEqual({ completed: 1, total: 2, percent: 50 });
    // ...but an empty Daily Workspace must never show phantom scheduled items because
    // of habits the UI doesn't list there.
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
    expect(p.summary).toEqual({ completed: 0, remaining: 0, overdue: 0, skipped: 0, canceled: 0 });
  });

  it("recalculates for historical dates without carrying today's counts, and never counts habits in the summary", () => {
    const habits = [habit({ id: "h1" }), habit({ id: "h2" })];
    const checkIns = [checkIn("h1", DAY), checkIn("h2", DAY), checkIn("h1", "2026-11-03")];
    const tasks = [task({ id: "today", status: "completed" }), task({ id: "yday", dueDate: "2026-11-03" })];

    const today = computeDailyProgress({ tasks, habits, checkIns, dateKey: DAY, now: noon });
    const yesterday = computeDailyProgress({ tasks, habits, checkIns, dateKey: "2026-11-03", now: noon });

    expect(today.relation).toBe("today");
    expect(today.overall.percent).toBe(100);

    expect(yesterday.relation).toBe("past");
    expect(yesterday.tasks).toEqual({ completed: 0, total: 1, percent: 0 });
    expect(yesterday.habits).toEqual({ completed: 1, total: 2, percent: 50 });
    // Only the one overdue task (not shown in the Daily Workspace list) is in the summary;
    // the habit's completion/skip never leaks into Daily Progress's overall numbers.
    expect(yesterday.summary).toEqual({ completed: 0, remaining: 0, overdue: 1, skipped: 0, canceled: 0 });
  });

  it("excludes skipped, canceled, and deleted tasks from eligible progress", () => {
    const p = computeDailyProgress({
      tasks: [
        task({ id: "done-1", status: "completed" }),
        task({ id: "done-2", status: "completed" }),
        task({ id: "done-3", status: "completed" }),
        task({ id: "skipped-1", isSkipped: true }),
        task({ id: "skipped-2", isSkipped: true }),
        task({ id: "skipped-3", isSkipped: true }),
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.tasks).toEqual({ completed: 3, total: 3, percent: 100 });
    expect(p.overall).toEqual({ completed: 3, total: 3, percent: 100, remaining: 0 });
    expect(p.summary.skipped).toBe(3);

    const deleted = computeDailyProgress({
      tasks: [task({ id: "done-1", status: "completed" }), task({ id: "done-2", status: "completed" }), task({ id: "done-3", status: "completed" })],
      dateKey: DAY,
      now: noon,
    });
    expect(deleted.tasks.total).toBe(3);
    expect(deleted.overall.percent).toBe(100);
  });

  it("excludes canceled tasks while reporting them separately", () => {
    const p = computeDailyProgress({
      tasks: [task({ id: "done-1", status: "completed" }), task({ id: "done-2", status: "completed" }), task({ id: "done-3", status: "completed" }), task({ id: "c1", isCanceled: true })],
      dateKey: DAY,
      now: noon,
    });
    expect(p.tasks).toEqual({ completed: 3, total: 3, percent: 100 });
    expect(p.summary.canceled).toBe(1);
  });

  it("treats future dates as upcoming", () => {
    const future = "2026-11-06";
    const p = computeDailyProgress({
      tasks: [task({ id: "f", dueDate: future }), event({ id: "fe", dueDate: future, dueTime: "09:00" })],
      habits: [habit({ id: "h1" })],
      dateKey: future,
      now: noon,
    });
    expect(p.relation).toBe("future");
    // Two Daily Workspace items only; the habit is reported separately via p.habits.
    expect(p.summary).toEqual({ completed: 0, remaining: 2, overdue: 0, skipped: 0, canceled: 0 });
    expect(p.habits).toEqual({ completed: 0, total: 1, percent: 0 });
  });

  it("derives timeline states for timed items", () => {
    expect(getDayItemState(task({ dueTime: "13:30" }), DAY, noon)).toBe("in_progress");
    expect(getDayItemState(task({ dueTime: "09:00" }), DAY, noon)).toBe("overdue");
    expect(getDayItemState(event({ dueTime: "09:00" }), DAY, noon)).toBe("completed");
    expect(getDayItemState(event({ dueTime: "20:00" }), DAY, noon)).toBe("upcoming");
    expect(getDayItemState(event({ eventStatus: "cancelled" }), DAY, noon)).toBe("cancelled");
  });
});

describe("Daily Progress regression: phantom scheduled items", () => {
  it("1. shows 0/0 - 0% for an empty selected date with no tasks, events or habits", () => {
    const p = computeDailyProgress({ tasks: [], dateKey: DAY, now: noon });
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
    expect(p.summary).toEqual({ completed: 0, remaining: 0, overdue: 0, skipped: 0, canceled: 0 });
  });

  it("2. never counts a task assigned to yesterday against today", () => {
    const p = computeDailyProgress({
      tasks: [task({ id: "yesterday", dueDate: "2026-11-03" })],
      dateKey: DAY,
      now: noon,
    });
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
  });

  it("3. never counts a task assigned to tomorrow against today", () => {
    const p = computeDailyProgress({
      tasks: [task({ id: "tomorrow", dueDate: "2026-11-05" })],
      dateKey: DAY,
      now: noon,
    });
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
  });

  it("4. a deleted task (removed from the source array) leaves no trace in the count", () => {
    // Deletion in Planorama removes the record from storage entirely, so the fix is
    // simply that computeDailyProgress never invents items beyond what it is given.
    const beforeDelete = computeDailyProgress({
      tasks: [task({ id: "will-delete" })],
      dateKey: DAY,
      now: noon,
    });
    const afterDelete = computeDailyProgress({ tasks: [], dateKey: DAY, now: noon });
    expect(beforeDelete.overall.total).toBe(1);
    expect(afterDelete.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
  });

  it("5. a skipped occurrence is reported as skipped, not as a remaining item", () => {
    const p = computeDailyProgress({ tasks: [task({ id: "s1", isSkipped: true })], dateKey: DAY, now: noon });
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
    expect(p.summary).toEqual({ completed: 0, remaining: 0, overdue: 0, skipped: 1, canceled: 0 });
  });

  it("6. a canceled occurrence is reported as canceled, not as a remaining item", () => {
    const p = computeDailyProgress({ tasks: [task({ id: "c1", isCanceled: true })], dateKey: DAY, now: noon });
    expect(p.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
    expect(p.summary).toEqual({ completed: 0, remaining: 0, overdue: 0, skipped: 0, canceled: 1 });
  });

  it("7. a completed recurring occurrence counts once as done", () => {
    const p = computeDailyProgress({
      tasks: [
        task({ id: "r1", title: "Water plants", recurrence: "daily", status: "completed" }),
        task({ id: "r1" }), // duplicate copy of the same occurrence
      ],
      dateKey: DAY,
      now: noon,
    });
    expect(p.overall).toEqual({ completed: 1, total: 1, percent: 100, remaining: 0 });
  });

  it("8. a future recurring occurrence is upcoming, not overdue or completed", () => {
    const future = "2026-11-06";
    const p = computeDailyProgress({
      tasks: [task({ id: "r2", title: "Water plants", recurrence: "daily", dueDate: future })],
      dateKey: future,
      now: noon,
    });
    expect(p.relation).toBe("future");
    expect(p.summary).toEqual({ completed: 0, remaining: 1, overdue: 0, skipped: 0, canceled: 0 });
  });

  it("9. a Google Calendar event on the date counts as an activity, consistent with local events", () => {
    const p = computeDailyProgress({
      tasks: [{ ...base, id: "gcal-1", isGoogleEvent: true, source: "google", itemType: "event", dueTime: "08:00" }],
      dateKey: DAY,
      now: noon,
    });
    expect(p.activities.total).toBe(1);
    expect(p.overall.total).toBe(1);
  });

  it("10. a dueDate exactly at the day boundary belongs to that day only (no timezone drift)", () => {
    const midnightTask = task({ id: "midnight", dueTime: "00:00" });
    expect(getDayItemState(midnightTask, DAY, new Date(2026, 10, 4, 0, 0, 1))).toBe("in_progress");
    const p = computeDailyProgress({ tasks: [midnightTask], dateKey: DAY, now: new Date(2026, 10, 4, 0, 0, 1) });
    expect(p.overall.total).toBe(1);
    // The same record, viewed from the adjacent calendar day, is not counted there.
    const adjacent = computeDailyProgress({ tasks: [midnightTask], dateKey: "2026-11-05", now: noon });
    expect(adjacent.overall.total).toBe(0);
  });

  it("11. recomputing from the same stored tasks after a refresh yields identical counts", () => {
    const tasks = [task({ id: "a", status: "completed" }), task({ id: "b" })];
    const first = computeDailyProgress({ tasks, dateKey: DAY, now: noon });
    const second = computeDailyProgress({ tasks: JSON.parse(JSON.stringify(tasks)), dateKey: DAY, now: noon });
    expect(second).toEqual(first);
  });

  it("12. navigating between days with different task counts recomputes independently each time", () => {
    const tasks = [
      task({ id: "busy-1", dueDate: "2026-11-04" }),
      task({ id: "busy-2", dueDate: "2026-11-04", status: "completed" }),
      task({ id: "quiet", dueDate: "2026-11-05" }),
    ];
    const busyDay = computeDailyProgress({ tasks, dateKey: "2026-11-04", now: noon });
    const quietDay = computeDailyProgress({ tasks, dateKey: "2026-11-05", now: noon });
    const emptyDay = computeDailyProgress({ tasks, dateKey: "2026-11-06", now: noon });
    expect(busyDay.overall.total).toBe(2);
    expect(quietDay.overall.total).toBe(1);
    expect(emptyDay.overall).toEqual({ completed: 0, total: 0, percent: 0, remaining: 0 });
  });
});

describe("Daily Workspace UI wiring", () => {
  const dayView = fs.readFileSync(path.resolve(__dirname, "../../app/components/calendar/day-view.tsx"), "utf-8");
  const panel = fs.readFileSync(
    path.resolve(__dirname, "../../app/components/calendar/daily-progress-panel.tsx"),
    "utf-8"
  );
  const page = fs.readFileSync(path.resolve(__dirname, "../../app/app/page.tsx"), "utf-8");

  it("renders the progress panel from computed data for the selected date", () => {
    expect(dayView).toContain("<DailyProgressPanel");
    expect(dayView).toContain("computeDailyProgress");
    expect(dayView).toContain("dateKey: currentDateKey");
  });

  it("uses a progress bar without a charting dependency", () => {
    expect(panel).toContain("dp-bar");
    expect(panel).toContain("dp-bar-fill");
    expect(panel).not.toMatch(/from ["'](chart\.js|recharts|d3|apexcharts)/);
  });

  it("passes real habits and check-ins into the Day View", () => {
    expect(page).toMatch(/<DayView[\s\S]*habits=\{habits\}[\s\S]*habitCheckIns=\{checkIns\}/);
  });
});
