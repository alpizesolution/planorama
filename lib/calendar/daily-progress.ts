import type { PlannerTask } from "@/lib/schedule/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import { isHabitScheduledForDate, formatLocalDateKey } from "@/lib/habits/streak-utils";
import { isTaskItem, isHolidayItem } from "./item-classifier";
import { isAllDayItem, parseMinutesFromTime } from "./day-layout";

/**
 * Daily progress calculations for the Day View "Daily Workspace".
 *
 * Definitions (kept deliberately strict so the numbers can be trusted):
 * - Tasks: genuine planner to-dos (see `isTaskItem`). Completed when `status === "completed"`.
 *   An incomplete task whose scheduled end has passed is overdue.
 * - Activities: calendar events and appointment slots, timed or all-day. Holidays are
 *   informational and are not counted. A cancelled event is never completed and is
 *   left out of the totals (it shows up as "skipped"). An activity is completed when it
 *   is marked completed or once it has ended.
 * - Habits: active habits scheduled for the date that already existed on that date.
 *   Completed only when a check-in record for that habit and date says so. A scheduled
 *   habit with no check-in on a past date is skipped.
 * - An event and a task linked through the same Google event id are one item,
 *   counted once as a task. Duplicate recurring instances on the same date collapse.
 */

export type DayItemKind = "task" | "activity";
export type DayItemState = "completed" | "in_progress" | "upcoming" | "overdue" | "cancelled";

export interface ProgressCount {
  completed: number;
  total: number;
  percent: number;
}

export interface DailySummaryCounts {
  completed: number;
  remaining: number;
  overdue: number;
  skipped: number;
}

export interface DailyProgress {
  dateKey: string;
  /** "past" | "today" | "future" relative to `now`. */
  relation: "past" | "today" | "future";
  tasks: ProgressCount;
  activities: ProgressCount;
  habits: ProgressCount;
  overall: ProgressCount & { remaining: number };
  summary: DailySummaryCounts;
}

export function toPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

function count(completed: number, total: number): ProgressCount {
  return { completed, total, percent: toPercent(completed, total) };
}

export function isCancelledItem(item: Partial<PlannerTask>): boolean {
  return item.eventStatus === "cancelled";
}

export function getDayItemKind(item: PlannerTask): DayItemKind {
  return isTaskItem(item) ? "task" : "activity";
}

/** Local Date for a YYYY-MM-DD key plus minutes from midnight. */
function atMinutes(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, minutes, 0, 0);
}

function getRelation(dateKey: string, now: Date): DailyProgress["relation"] {
  const todayKey = formatLocalDateKey(now);
  if (dateKey < todayKey) return "past";
  if (dateKey > todayKey) return "future";
  return "today";
}

/**
 * Visual / counting state of a single scheduled item on `dateKey` at time `now`.
 */
export function getDayItemState(item: PlannerTask, dateKey: string, now: Date): DayItemState {
  if (isCancelledItem(item)) return "cancelled";
  if (item.status === "completed") return "completed";

  const kind = getDayItemKind(item);
  const relation = getRelation(dateKey, now);

  if (isAllDayItem(item)) {
    if (relation === "past") return kind === "task" ? "overdue" : "completed";
    if (relation === "future") return "upcoming";
    return kind === "task" ? "upcoming" : "in_progress";
  }

  const startMin = parseMinutesFromTime(item.dueTime) ?? 0;
  const duration = item.durationMinutes && item.durationMinutes > 0 ? item.durationMinutes : 60;
  const start = atMinutes(dateKey, startMin);
  const end = atMinutes(dateKey, Math.min(1440, startMin + duration));
  const t = now.getTime();

  if (t >= end.getTime()) return kind === "task" ? "overdue" : "completed";
  if (t >= start.getTime()) return "in_progress";
  return "upcoming";
}

function recurringKey(item: PlannerTask): string | null {
  if (item.recurringEventId) {
    return `r:${item.googleCalendarId ?? ""}|${item.recurringEventId}|${item.dueDate}|${item.dueTime ?? ""}`;
  }
  if (item.recurrence && item.recurrence !== "none" && isTaskItem(item)) {
    return `l:${item.title.trim().toLowerCase()}|${item.recurrence}|${item.dueDate}|${item.dueTime ?? ""}`;
  }
  return null;
}

function preferItem(a: PlannerTask, b: PlannerTask): PlannerTask {
  // Keep the task side of a linked pair, and keep completion if either copy is completed.
  const aTask = isTaskItem(a);
  const bTask = isTaskItem(b);
  const base = aTask === bTask ? a : aTask ? a : b;
  const completed = a.status === "completed" || b.status === "completed";
  return completed && base.status !== "completed" ? { ...base, status: "completed" } : base;
}

/**
 * Items scheduled on `dateKey`, de-duplicated:
 * - same record id only once
 * - a task and an event sharing a Google event id count once (as the task)
 * - repeated copies of one recurring instance on the same date count once
 * Holidays are excluded since they are not something to complete.
 */
export function getCountableDayItems(tasks: PlannerTask[], dateKey: string): PlannerTask[] {
  const byKey = new Map<string, PlannerTask>();
  const aliases = new Map<string, string>();

  for (const item of tasks) {
    if (item.dueDate !== dateKey) continue;
    if (isHolidayItem(item)) continue;

    const keys = [`id:${item.id}`];
    if (item.googleEventId) keys.push(`g:${item.googleEventId}`);
    const rk = recurringKey(item);
    if (rk) keys.push(rk);

    const existingPrimary = keys.map((k) => aliases.get(k)).find((k): k is string => Boolean(k));
    if (existingPrimary) {
      const merged = preferItem(byKey.get(existingPrimary)!, item);
      byKey.set(existingPrimary, merged);
      for (const k of keys) aliases.set(k, existingPrimary);
    } else {
      const primary = keys[0];
      byKey.set(primary, item);
      for (const k of keys) aliases.set(k, primary);
    }
  }

  return Array.from(byKey.values());
}

function habitExistedOn(habit: Habit, dateKey: string): boolean {
  if (!habit.createdAt) return true;
  const created = new Date(habit.createdAt);
  if (isNaN(created.getTime())) return true;
  return formatLocalDateKey(created) <= dateKey;
}

export function getScheduledHabitsForDate(habits: Habit[], dateKey: string): Habit[] {
  return habits.filter((h) => !h.archived && isHabitScheduledForDate(h, dateKey) && habitExistedOn(h, dateKey));
}

export function computeDailyProgress(input: {
  tasks: PlannerTask[];
  habits?: Habit[];
  checkIns?: HabitCheckIn[];
  dateKey: string;
  now: Date;
}): DailyProgress {
  const { tasks, habits = [], checkIns = [], dateKey, now } = input;
  const relation = getRelation(dateKey, now);
  const items = getCountableDayItems(tasks, dateKey);

  let taskDone = 0;
  let taskTotal = 0;
  let actDone = 0;
  let actTotal = 0;
  let remaining = 0;
  let overdue = 0;
  let skipped = 0;

  for (const item of items) {
    const kind = getDayItemKind(item);
    const state = getDayItemState(item, dateKey, now);

    if (state === "cancelled") {
      skipped++;
      continue;
    }

    const done = state === "completed";
    if (kind === "task") {
      taskTotal++;
      if (done) taskDone++;
    } else {
      actTotal++;
      if (done) actDone++;
    }

    if (state === "overdue") overdue++;
    else if (!done) remaining++;
  }

  const scheduledHabits = getScheduledHabitsForDate(habits, dateKey);
  const doneHabitIds = new Set(
    checkIns.filter((c) => c.date === dateKey && c.completed).map((c) => c.habitId)
  );
  let habitDone = 0;
  for (const habit of scheduledHabits) {
    if (doneHabitIds.has(habit.id)) habitDone++;
    else if (relation === "past") skipped++;
    else remaining++;
  }
  const habitTotal = scheduledHabits.length;

  const completed = taskDone + actDone + habitDone;
  const total = taskTotal + actTotal + habitTotal;

  return {
    dateKey,
    relation,
    tasks: count(taskDone, taskTotal),
    activities: count(actDone, actTotal),
    habits: count(habitDone, habitTotal),
    overall: { ...count(completed, total), remaining: total - completed },
    summary: { completed, remaining, overdue, skipped },
  };
}
