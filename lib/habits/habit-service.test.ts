import { beforeEach, describe, expect, it } from "vitest";
import {
  createHabit,
  getHabits,
  updateHabit,
  archiveHabit,
  unarchiveHabit,
  deleteHabit,
  toggleCheckIn,
  setCheckIn,
  getCheckIns,
  getHabitStats,
} from "./habit-service";
import {
  calculateHabitStats,
  isHabitScheduledForDate,
  parseDateKey,
  formatLocalDateKey,
  getPastDays,
} from "./streak-utils";
import { writeHabitsToStorage, writeCheckInsToStorage } from "./storage";
import type { Habit, HabitCheckIn } from "./types";

describe("Daily Habits — Schedule and Date Helpers", () => {
  it("correctly identifies scheduled days for 'everyday' habits", () => {
    const habit: Habit = {
      id: "h1",
      name: "Water",
      scheduleType: "everyday",
      customDays: [],
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Sunday (0), Monday (1), Saturday (6)
    expect(isHabitScheduledForDate(habit, "2026-10-24")).toBe(true); // Saturday
    expect(isHabitScheduledForDate(habit, "2026-10-25")).toBe(true); // Sunday
    expect(isHabitScheduledForDate(habit, "2026-10-26")).toBe(true); // Monday
  });

  it("correctly identifies scheduled days for 'weekdays' habits (Mon-Fri)", () => {
    const habit: Habit = {
      id: "h2",
      name: "Coding",
      scheduleType: "weekdays",
      customDays: [1, 2, 3, 4, 5],
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(isHabitScheduledForDate(habit, "2026-10-23")).toBe(true); // Friday -> true
    expect(isHabitScheduledForDate(habit, "2026-10-24")).toBe(false); // Saturday -> false
    expect(isHabitScheduledForDate(habit, "2026-10-25")).toBe(false); // Sunday -> false
    expect(isHabitScheduledForDate(habit, "2026-10-26")).toBe(true); // Monday -> true
  });

  it("correctly identifies scheduled days for 'weekends' habits (Sat-Sun)", () => {
    const habit: Habit = {
      id: "h3",
      name: "Long Walk",
      scheduleType: "weekends",
      customDays: [0, 6],
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(isHabitScheduledForDate(habit, "2026-10-23")).toBe(false); // Friday
    expect(isHabitScheduledForDate(habit, "2026-10-24")).toBe(true); // Saturday
    expect(isHabitScheduledForDate(habit, "2026-10-25")).toBe(true); // Sunday
    expect(isHabitScheduledForDate(habit, "2026-10-26")).toBe(false); // Monday
  });

  it("correctly handles 'custom' days schedule (e.g. Mon, Wed, Fri)", () => {
    const habit: Habit = {
      id: "h4",
      name: "Gym",
      scheduleType: "custom",
      customDays: [1, 3, 5], // Mon, Wed, Fri
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(isHabitScheduledForDate(habit, "2026-10-19")).toBe(true); // Mon -> true
    expect(isHabitScheduledForDate(habit, "2026-10-20")).toBe(false); // Tue -> false
    expect(isHabitScheduledForDate(habit, "2026-10-21")).toBe(true); // Wed -> true
    expect(isHabitScheduledForDate(habit, "2026-10-22")).toBe(false); // Thu -> false
    expect(isHabitScheduledForDate(habit, "2026-10-23")).toBe(true); // Fri -> true
    expect(isHabitScheduledForDate(habit, "2026-10-24")).toBe(false); // Sat -> false
  });

  it("formats and parses local calendar dates consistently", () => {
    const date = new Date(2026, 9, 24); // Oct 24, 2026
    const key = formatLocalDateKey(date);
    expect(key).toBe("2026-10-24");

    const parsed = parseDateKey(key);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9);
    expect(parsed.getDate()).toBe(24);
  });

  it("generates past days sequence for visual history strips", () => {
    const days = getPastDays(7, "2026-10-24");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-10-18");
    expect(days[6]).toBe("2026-10-24");
  });
});

describe("Daily Habits — Streak Calculations & Schedule Resilience", () => {
  it("calculates streak for everyday habits", () => {
    const habit: Habit = {
      id: "h-water",
      name: "Water",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    // Checked in on Oct 21, 22, 23, and today Oct 24
    const checkIns: HabitCheckIn[] = [
      { id: "1", habitId: "h-water", date: "2026-10-21", completed: true, completedAt: "" },
      { id: "2", habitId: "h-water", date: "2026-10-22", completed: true, completedAt: "" },
      { id: "3", habitId: "h-water", date: "2026-10-23", completed: true, completedAt: "" },
      { id: "4", habitId: "h-water", date: "2026-10-24", completed: true, completedAt: "" },
    ];

    const stats = calculateHabitStats(habit, checkIns, "2026-10-24");
    expect(stats.currentStreak).toBe(4);
    expect(stats.longestStreak).toBe(4);
    expect(stats.totalCompletions).toBe(4);
    expect(stats.isCompletedToday).toBe(true);
  });

  it("preserves current streak when today is scheduled but in progress (not completed yet)", () => {
    const habit: Habit = {
      id: "h-water",
      name: "Water",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    // Checked in Oct 21, 22, 23 (yesterday was done, today Oct 24 is NOT checked in yet)
    const checkIns: HabitCheckIn[] = [
      { id: "1", habitId: "h-water", date: "2026-10-21", completed: true, completedAt: "" },
      { id: "2", habitId: "h-water", date: "2026-10-22", completed: true, completedAt: "" },
      { id: "3", habitId: "h-water", date: "2026-10-23", completed: true, completedAt: "" },
    ];

    const stats = calculateHabitStats(habit, checkIns, "2026-10-24");
    // Yesterday was completed, so current streak remains 3 while today is in progress!
    expect(stats.currentStreak).toBe(3);
    expect(stats.isCompletedToday).toBe(false);
  });

  it("CRITICAL: does NOT lose weekday habit streak over unscheduled weekends", () => {
    // Oct 19 (Mon) to Oct 23 (Fri) completed.
    // Today is Saturday Oct 24 (unscheduled).
    const habit: Habit = {
      id: "h-work",
      name: "Focus Work",
      scheduleType: "weekdays",
      customDays: [1, 2, 3, 4, 5],
      archived: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    const checkIns: HabitCheckIn[] = [
      { id: "1", habitId: "h-work", date: "2026-10-19", completed: true, completedAt: "" },
      { id: "2", habitId: "h-work", date: "2026-10-20", completed: true, completedAt: "" },
      { id: "3", habitId: "h-work", date: "2026-10-21", completed: true, completedAt: "" },
      { id: "4", habitId: "h-work", date: "2026-10-22", completed: true, completedAt: "" },
      { id: "5", habitId: "h-work", date: "2026-10-23", completed: true, completedAt: "" }, // Friday
    ];

    // Reference date: Saturday Oct 24 (weekend)
    const statsSaturday = calculateHabitStats(habit, checkIns, "2026-10-24");
    expect(statsSaturday.isScheduledToday).toBe(false);
    expect(statsSaturday.currentStreak).toBe(5); // Weekend did not break streak!

    // Reference date: Sunday Oct 25 (weekend)
    const statsSunday = calculateHabitStats(habit, checkIns, "2026-10-25");
    expect(statsSunday.isScheduledToday).toBe(false);
    expect(statsSunday.currentStreak).toBe(5); // Still 5!

    // Reference date: Monday morning Oct 26 (scheduled, in-progress)
    const statsMondayMorning = calculateHabitStats(habit, checkIns, "2026-10-26");
    expect(statsMondayMorning.isScheduledToday).toBe(true);
    expect(statsMondayMorning.isCompletedToday).toBe(false);
    expect(statsMondayMorning.currentStreak).toBe(5); // Carried over from Friday!

    // Now complete Monday Oct 26!
    const checkInsWithMonday = [
      ...checkIns,
      { id: "6", habitId: "h-work", date: "2026-10-26", completed: true, completedAt: "" },
    ];
    const statsMondayCompleted = calculateHabitStats(habit, checkInsWithMonday, "2026-10-26");
    expect(statsMondayCompleted.currentStreak).toBe(6);
  });

  it("breaks streak when a scheduled day was missed in the past", () => {
    const habit: Habit = {
      id: "h-daily",
      name: "Meditation",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    // Checked in Oct 20, 21. Oct 22 missed. Checked in Oct 23, Oct 24.
    const checkIns: HabitCheckIn[] = [
      { id: "1", habitId: "h-daily", date: "2026-10-20", completed: true, completedAt: "" },
      { id: "2", habitId: "h-daily", date: "2026-10-21", completed: true, completedAt: "" },
      // Oct 22 missed!
      { id: "3", habitId: "h-daily", date: "2026-10-23", completed: true, completedAt: "" },
      { id: "4", habitId: "h-daily", date: "2026-10-24", completed: true, completedAt: "" },
    ];

    const stats = calculateHabitStats(habit, checkIns, "2026-10-24");
    expect(stats.currentStreak).toBe(2); // Oct 23 + Oct 24
    expect(stats.longestStreak).toBe(2);
    expect(stats.totalCompletions).toBe(4);
  });
});

describe("Daily Habits — Service CRUD, Check-ins, and Persistence", () => {
  beforeEach(() => {
    // Clear storage keys before each test
    writeHabitsToStorage([]);
    writeCheckInsToStorage([]);
  });

  it("creates a habit and persists it", async () => {
    const created = await createHabit({
      name: "Drink Water",
      icon: "💧",
      scheduleType: "everyday",
      target: "8 glasses",
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Drink Water");
    expect(created.icon).toBe("💧");
    expect(created.target).toBe("8 glasses");
    expect(created.archived).toBe(false);

    const habits = await getHabits();
    expect(habits.some((h) => h.id === created.id)).toBe(true);
  });

  it("updates an existing habit", async () => {
    const habit = await createHabit({ name: "Read" });
    const updated = await updateHabit(habit.id, {
      name: "Read Nonfiction",
      target: "30 mins",
    });

    expect(updated.name).toBe("Read Nonfiction");
    expect(updated.target).toBe("30 mins");

    const habits = await getHabits();
    const found = habits.find((h) => h.id === habit.id);
    expect(found?.name).toBe("Read Nonfiction");
  });

  it("archives and unarchives a habit while preserving history", async () => {
    const habit = await createHabit({ name: "Old Habit" });
    await toggleCheckIn(habit.id, "2026-10-24");

    const archived = await archiveHabit(habit.id);
    expect(archived.archived).toBe(true);

    // Check-in history is preserved
    const checkIns = await getCheckIns();
    expect(checkIns.some((c) => c.habitId === habit.id && c.completed)).toBe(true);

    const unarchived = await unarchiveHabit(habit.id);
    expect(unarchived.archived).toBe(false);
  });

  it("deletes a habit and retains check-in history by default", async () => {
    const habit = await createHabit({ name: "Temporary" });
    await toggleCheckIn(habit.id, "2026-10-24");

    await deleteHabit(habit.id);

    const habits = await getHabits();
    expect(habits.some((h) => h.id === habit.id)).toBe(false);

    // Historical check-in records are preserved
    const checkIns = await getCheckIns();
    expect(checkIns.some((c) => c.habitId === habit.id)).toBe(true);
  });

  it("toggles check-in on and off (undo)", async () => {
    const habit = await createHabit({ name: "Stretch" });

    // 1st toggle: complete
    const res1 = await toggleCheckIn(habit.id, "2026-10-24");
    expect(res1.completed).toBe(true);

    let checkIns = await getCheckIns();
    let record = checkIns.find((c) => c.habitId === habit.id && c.date === "2026-10-24");
    expect(record?.completed).toBe(true);

    // 2nd toggle: undo check-in (mark incomplete)
    const res2 = await toggleCheckIn(habit.id, "2026-10-24");
    expect(res2.completed).toBe(false);

    checkIns = await getCheckIns();
    record = checkIns.find((c) => c.habitId === habit.id && c.date === "2026-10-24");
    expect(record?.completed).toBe(false);

    // 3rd toggle: re-complete
    const res3 = await toggleCheckIn(habit.id, "2026-10-24");
    expect(res3.completed).toBe(true);
  });

  it("does not create duplicate check-ins for the same habit and date", async () => {
    const habit = await createHabit({ name: "Journal" });

    await setCheckIn(habit.id, "2026-10-24", true);
    await setCheckIn(habit.id, "2026-10-24", true);
    await toggleCheckIn(habit.id, "2026-10-24");
    await toggleCheckIn(habit.id, "2026-10-24");

    const checkIns = await getCheckIns();
    const matches = checkIns.filter((c) => c.habitId === habit.id && c.date === "2026-10-24");
    expect(matches).toHaveLength(1);
  });

  it("computes habit stats dynamically via service", async () => {
    const habit = await createHabit({
      name: "Vitamins",
      scheduleType: "everyday",
    });

    await setCheckIn(habit.id, "2026-10-23", true);
    await setCheckIn(habit.id, "2026-10-24", true);

    const stats = await getHabitStats(habit, "2026-10-24");
    expect(stats.currentStreak).toBe(2);
    expect(stats.totalCompletions).toBe(2);
    expect(stats.isCompletedToday).toBe(true);
  });
});
