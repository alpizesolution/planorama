import type { Habit, HabitCheckIn, HabitStats, NewHabitInput } from "./types";
import {
  readHabitsFromStorage,
  writeHabitsToStorage,
  readCheckInsFromStorage,
  writeCheckInsToStorage,
  validateHabit,
} from "./storage";
import { calculateHabitStats } from "./streak-utils";
import { generateId } from "../schedule/id";

export async function getHabits(): Promise<Habit[]> {
  return readHabitsFromStorage();
}

export async function createHabit(input: NewHabitInput): Promise<Habit> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Habit name is required.");
  }

  const now = new Date().toISOString();
  const newHabit: Habit = validateHabit({
    id: generateId(),
    name,
    icon: input.icon?.trim() || undefined,
    description: input.description?.trim() || undefined,
    scheduleType: input.scheduleType || "everyday",
    customDays: input.customDays && input.customDays.length > 0 ? input.customDays : [0, 1, 2, 3, 4, 5, 6],
    target: input.target?.trim() || undefined,
    reminderTime: input.reminderTime?.trim() || undefined,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });

  const habits = readHabitsFromStorage();
  writeHabitsToStorage([...habits, newHabit]);
  return newHabit;
}

export async function updateHabit(id: string, updates: Partial<Habit>): Promise<Habit> {
  const habits = readHabitsFromStorage();
  const existing = habits.find((h) => h.id === id);
  if (!existing) {
    throw new Error(`Habit not found with id: ${id}`);
  }

  const updated: Habit = validateHabit({
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  const nextList = habits.map((h) => (h.id === id ? updated : h));
  writeHabitsToStorage(nextList);
  return updated;
}

export async function archiveHabit(id: string): Promise<Habit> {
  return updateHabit(id, { archived: true });
}

export async function unarchiveHabit(id: string): Promise<Habit> {
  return updateHabit(id, { archived: false });
}

export async function deleteHabit(id: string, purgeCheckIns = false): Promise<void> {
  const habits = readHabitsFromStorage();
  writeHabitsToStorage(habits.filter((h) => h.id !== id));

  if (purgeCheckIns) {
    const checkIns = readCheckInsFromStorage();
    writeCheckInsToStorage(checkIns.filter((c) => c.habitId !== id));
  }
}

export async function getCheckIns(): Promise<HabitCheckIn[]> {
  return readCheckInsFromStorage();
}

export async function toggleCheckIn(
  habitId: string,
  dateKey: string
): Promise<{ checkIn: HabitCheckIn; completed: boolean }> {
  if (!habitId) throw new Error("habitId is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("dateKey must be in YYYY-MM-DD format");
  }

  const checkIns = readCheckInsFromStorage();
  const existingIndex = checkIns.findIndex((c) => c.habitId === habitId && c.date === dateKey);

  let nextCompleted = true;
  let resultItem: HabitCheckIn;
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = checkIns[existingIndex];
    nextCompleted = !existing.completed;
    resultItem = {
      ...existing,
      completed: nextCompleted,
      completedAt: now,
    };
    checkIns[existingIndex] = resultItem;
  } else {
    resultItem = {
      id: `${habitId}:${dateKey}`,
      habitId,
      date: dateKey,
      completed: true,
      completedAt: now,
    };
    checkIns.push(resultItem);
  }

  writeCheckInsToStorage(checkIns);
  return { checkIn: resultItem, completed: nextCompleted };
}

export async function setCheckIn(
  habitId: string,
  dateKey: string,
  completed: boolean
): Promise<HabitCheckIn> {
  if (!habitId) throw new Error("habitId is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("dateKey must be in YYYY-MM-DD format");
  }

  const checkIns = readCheckInsFromStorage();
  const existingIndex = checkIns.findIndex((c) => c.habitId === habitId && c.date === dateKey);
  const now = new Date().toISOString();

  let item: HabitCheckIn;
  if (existingIndex >= 0) {
    item = {
      ...checkIns[existingIndex],
      completed,
      completedAt: now,
    };
    checkIns[existingIndex] = item;
  } else {
    item = {
      id: `${habitId}:${dateKey}`,
      habitId,
      date: dateKey,
      completed,
      completedAt: now,
    };
    checkIns.push(item);
  }

  writeCheckInsToStorage(checkIns);
  return item;
}

export async function getHabitStats(
  habit: Habit,
  referenceDate?: Date | string
): Promise<HabitStats> {
  const checkIns = readCheckInsFromStorage();
  return calculateHabitStats(habit, checkIns, referenceDate);
}
