import type { PlannerTask, Recurrence, RecurrenceConfig, RecurrenceWeekday } from "./types";

function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function nextOccurrenceDate(
  dateKey: string,
  recurrence: Recurrence,
  config: RecurrenceConfig = {}
): string | null {
  if (recurrence === "none") return null;
  const interval = Math.max(1, Math.floor(config.interval ?? 1));
  const date = parseDate(dateKey);
  if (recurrence === "daily") {
    const weekdays = config.weekdays;
    if (weekdays?.length) {
      do { date.setUTCDate(date.getUTCDate() + 1); } while (!weekdays.includes(date.getUTCDay() as RecurrenceWeekday));
    } else {
      date.setUTCDate(date.getUTCDate() + interval);
    }
  } else if (recurrence === "weekly") {
    const weekdays = config.weekdays?.length ? [...config.weekdays].sort((a, b) => a - b) : [date.getUTCDay() as RecurrenceWeekday];
    const current = date.getUTCDay();
    const next = weekdays.find((day) => day > current);
    date.setUTCDate(date.getUTCDate() + (next === undefined ? 7 - current + weekdays[0] : next - current) + (next === undefined ? (interval - 1) * 7 : 0));
  } else if (recurrence === "monthly") {
    const targetDay = date.getUTCDate();
    date.setUTCMonth(date.getUTCMonth() + interval, 1);
    date.setUTCDate(Math.min(targetDay, daysInMonth(date.getUTCFullYear(), date.getUTCMonth())));
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + interval);
  }
  const next = keyOf(date);
  return config.endDate && next > config.endDate ? null : next;
}

export function nextOccurrenceTask(task: PlannerTask): PlannerTask | null {
  if (!task.dueDate || task.recurrence === "none") return null;
  const nextDate = nextOccurrenceDate(task.dueDate, task.recurrence, task.recurrenceConfig);
  if (!nextDate) return null;
  return {
    ...task,
    id: `${task.seriesId ?? task.id}:${nextDate}`,
    dueDate: nextDate,
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seriesId: task.seriesId ?? task.id,
    occurrenceDate: nextDate,
    originalDueDate: task.originalDueDate ?? task.dueDate,
  };
}
