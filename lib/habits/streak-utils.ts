import type { Habit, HabitCheckIn, HabitStats } from "./types";

export function parseDateKey(dateKey: string): Date {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a habit is scheduled for a specific date (Date or YYYY-MM-DD string).
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export function isHabitScheduledForDate(habit: Habit, dateInput: Date | string): boolean {
  const date = typeof dateInput === "string" ? parseDateKey(dateInput) : dateInput;
  const dayOfWeek = date.getDay();

  switch (habit.scheduleType) {
    case "everyday":
      return true;
    case "weekdays":
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case "weekends":
      return dayOfWeek === 0 || dayOfWeek === 6;
    case "custom":
      return Array.isArray(habit.customDays) && habit.customDays.includes(dayOfWeek);
    default:
      return true;
  }
}

/**
 * Calculates current streak, longest streak, total completions, and completion rate
 * strictly respecting the habit's active schedule (e.g., weekends don't break weekday streaks).
 */
export function calculateHabitStats(
  habit: Habit,
  checkIns: HabitCheckIn[],
  referenceDateInput?: Date | string
): HabitStats {
  const refDate = referenceDateInput
    ? typeof referenceDateInput === "string"
      ? parseDateKey(referenceDateInput)
      : new Date(referenceDateInput.getFullYear(), referenceDateInput.getMonth(), referenceDateInput.getDate())
    : new Date();

  // Normalize refDate to local midnight
  const refDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const todayKey = formatLocalDateKey(refDay);

  // Set of completed date strings for this specific habit
  const completedDates = new Set<string>();
  for (const c of checkIns) {
    if (c.habitId === habit.id && c.completed) {
      completedDates.add(c.date);
    }
  }

  const isScheduledToday = isHabitScheduledForDate(habit, refDay);
  const isCompletedToday = completedDates.has(todayKey);
  const totalCompletions = completedDates.size;

  // 1. Calculate Current Streak
  let currentStreak = 0;

  // Determine starting point for stepping backwards
  const cursor = new Date(refDay);

  if (isScheduledToday) {
    if (isCompletedToday) {
      // Today is scheduled and completed -> streak starts at 1
      currentStreak = 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Today is scheduled but not yet completed.
      // Since today is in-progress, we look back at the most recent scheduled day.
      cursor.setDate(cursor.getDate() - 1);
    }
  } else {
    // Today is not scheduled (e.g. Saturday for weekday habit)
    // The streak carries over from the most recent scheduled day.
    cursor.setDate(cursor.getDate() - 1);
  }

  // Step backwards through past days (up to 365 days)
  let pastDaysChecked = 0;
  const maxDaysBack = 365;

  while (pastDaysChecked < maxDaysBack) {
    const isScheduled = isHabitScheduledForDate(habit, cursor);
    if (isScheduled) {
      const dateKey = formatLocalDateKey(cursor);
      if (completedDates.has(dateKey)) {
        currentStreak++;
      } else {
        // Scheduled day was missed; streak ends here
        break;
      }
    }
    // If not scheduled, skip without breaking or incrementing streak
    cursor.setDate(cursor.getDate() - 1);
    pastDaysChecked++;
  }

  // 2. Calculate Longest Streak
  // Determine earliest date to check
  let earliestDate = new Date(refDay);
  earliestDate.setDate(earliestDate.getDate() - 365); // Check up to 1 year back
  if (habit.createdAt) {
    const createdDate = parseDateKey(habit.createdAt.slice(0, 10));
    if (createdDate < earliestDate) earliestDate = createdDate;
  }
  // Also consider earliest check-in date
  for (const dateKey of completedDates) {
    const cDate = parseDateKey(dateKey);
    if (cDate < earliestDate) earliestDate = cDate;
  }

  let longestStreak = 0;
  let runningStreak = 0;
  const scanCursor = new Date(earliestDate);

  while (scanCursor <= refDay) {
    const isScheduled = isHabitScheduledForDate(habit, scanCursor);
    const dateKey = formatLocalDateKey(scanCursor);
    const isToday = dateKey === todayKey;

    if (isScheduled) {
      if (completedDates.has(dateKey)) {
        runningStreak++;
        if (runningStreak > longestStreak) {
          longestStreak = runningStreak;
        }
      } else {
        // Missed scheduled day
        if (isToday) {
          // Today is still in progress, so don't zero out running streak for today
        } else {
          runningStreak = 0;
        }
      }
    }
    scanCursor.setDate(scanCursor.getDate() + 1);
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  // 3. Calculate 30-day Completion Rate
  const rateCursor = new Date(refDay);
  let windowScheduledDays = 0;
  let windowCompletedDays = 0;

  for (let i = 0; i < 30; i++) {
    if (isHabitScheduledForDate(habit, rateCursor)) {
      windowScheduledDays++;
      const k = formatLocalDateKey(rateCursor);
      if (completedDates.has(k)) {
        windowCompletedDays++;
      }
    }
    rateCursor.setDate(rateCursor.getDate() - 1);
  }

  const completionRate =
    windowScheduledDays > 0 ? Math.round((windowCompletedDays / windowScheduledDays) * 100) : 0;

  return {
    currentStreak,
    longestStreak,
    totalCompletions,
    completionRate,
    isScheduledToday,
    isCompletedToday,
  };
}

/**
 * Returns an array of formatted date keys for the past `count` days ending on `referenceDate`.
 * e.g. for count=14, returns 14 date keys from oldest to referenceDate.
 */
export function getPastDays(count: number, referenceDate?: Date | string): string[] {
  const ref = referenceDate
    ? typeof referenceDate === "string"
      ? parseDateKey(referenceDate)
      : new Date(referenceDate)
    : new Date();

  const days: string[] = [];
  const cursor = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    days.push(formatLocalDateKey(d));
  }

  return days;
}
