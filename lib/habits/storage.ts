import type { Habit, HabitCheckIn } from "./types";
import { generateId } from "../schedule/id";

export const HABITS_STORAGE_KEY = "planorama:habits:v1";
export const CHECKINS_STORAGE_KEY = "planorama:habit-checkins:v1";

let memoryHabits: Habit[] | null = null;
let memoryCheckIns: HabitCheckIn[] | null = null;

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function getDefaultStarterHabits(): Habit[] {
  const now = new Date().toISOString();
  return [
    {
      id: "habit-water-1",
      name: "Drink 8 glasses of water",
      icon: "💧",
      description: "Stay hydrated throughout the day",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      target: "8 glasses",
      archived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "habit-stretch-2",
      name: "Morning stretch & breath",
      icon: "🧘",
      description: "Quick 10-15 min body check-in",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      target: "15 mins",
      archived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "habit-reading-3",
      name: "Read 20 minutes",
      icon: "📚",
      description: "Book, article, or learning",
      scheduleType: "weekdays",
      customDays: [1, 2, 3, 4, 5],
      target: "20 mins",
      archived: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function validateHabit(raw: unknown): Habit {
  if (!raw || typeof raw !== "object") {
    throw new Error("Habit record must be an object.");
  }
  const item = raw as Record<string, unknown>;

  const id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id.trim() : generateId();
  const name = typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim().slice(0, 120) : "Untitled Habit";

  const validScheduleTypes = ["everyday", "weekdays", "weekends", "custom"] as const;
  const scheduleType = validScheduleTypes.includes(item.scheduleType as typeof validScheduleTypes[number])
    ? (item.scheduleType as typeof validScheduleTypes[number])
    : "everyday";

  const customDays = Array.isArray(item.customDays)
    ? item.customDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  const now = new Date().toISOString();
  return {
    id,
    name,
    icon: typeof item.icon === "string" ? item.icon.trim() : undefined,
    description: typeof item.description === "string" ? item.description.trim().slice(0, 500) : undefined,
    scheduleType,
    customDays: customDays.length > 0 ? customDays : [0, 1, 2, 3, 4, 5, 6],
    target: typeof item.target === "string" ? item.target.trim().slice(0, 60) : undefined,
    reminderTime: typeof item.reminderTime === "string" && /^\d{2}:\d{2}$/.test(item.reminderTime) ? item.reminderTime : undefined,
    archived: Boolean(item.archived),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
  };
}

export function validateCheckIn(raw: unknown): HabitCheckIn {
  if (!raw || typeof raw !== "object") {
    throw new Error("Habit check-in record must be an object.");
  }
  const item = raw as Record<string, unknown>;

  if (typeof item.habitId !== "string" || !item.habitId.trim()) {
    throw new Error("Check-in habitId is required.");
  }
  if (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    throw new Error("Check-in date must be formatted YYYY-MM-DD.");
  }

  const id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id.trim() : `${item.habitId}:${item.date}`;
  const now = new Date().toISOString();

  return {
    id,
    habitId: item.habitId.trim(),
    date: item.date,
    completed: Boolean(item.completed),
    completedAt: typeof item.completedAt === "string" ? item.completedAt : now,
  };
}

export function readHabitsFromStorage(): Habit[] {
  try {
    const storage = getStorage();
    if (!storage) {
      if (memoryHabits === null) {
        memoryHabits = getDefaultStarterHabits();
      }
      return memoryHabits;
    }

    const raw = storage.getItem(HABITS_STORAGE_KEY);
    if (!raw) {
      // First run: seed starter habits
      const defaults = getDefaultStarterHabits();
      storage.setItem(HABITS_STORAGE_KEY, JSON.stringify(defaults));
      memoryHabits = defaults;
      return defaults;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const defaults = getDefaultStarterHabits();
      memoryHabits = defaults;
      return defaults;
    }

    const habits = parsed.map(validateHabit);
    memoryHabits = habits;
    return habits;
  } catch {
    if (memoryHabits === null) memoryHabits = getDefaultStarterHabits();
    return memoryHabits;
  }
}

export function writeHabitsToStorage(habits: Habit[]): void {
  const validated = habits.map(validateHabit);
  memoryHabits = validated;
  try {
    const storage = getStorage();
    storage?.setItem(HABITS_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    throw new Error("Could not save habits to device storage. Storage quota may be exceeded.");
  }
}

export function readCheckInsFromStorage(): HabitCheckIn[] {
  try {
    const storage = getStorage();
    if (!storage) {
      if (memoryCheckIns === null) memoryCheckIns = [];
      return memoryCheckIns;
    }

    const raw = storage.getItem(CHECKINS_STORAGE_KEY);
    if (!raw) {
      memoryCheckIns = [];
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      memoryCheckIns = [];
      return [];
    }

    // Deduplicate by habitId:date
    const map = new Map<string, HabitCheckIn>();
    for (const item of parsed) {
      try {
        const valid = validateCheckIn(item);
        map.set(`${valid.habitId}:${valid.date}`, valid);
      } catch {
        // Skip malformed individual entries
      }
    }

    const checkIns = Array.from(map.values());
    memoryCheckIns = checkIns;
    return checkIns;
  } catch {
    if (memoryCheckIns === null) memoryCheckIns = [];
    return memoryCheckIns;
  }
}

export function writeCheckInsToStorage(checkIns: HabitCheckIn[]): void {
  // Deduplicate by habitId:date
  const map = new Map<string, HabitCheckIn>();
  for (const item of checkIns) {
    const valid = validateCheckIn(item);
    map.set(`${valid.habitId}:${valid.date}`, valid);
  }
  const cleanList = Array.from(map.values());
  memoryCheckIns = cleanList;

  try {
    const storage = getStorage();
    storage?.setItem(CHECKINS_STORAGE_KEY, JSON.stringify(cleanList));
  } catch {
    throw new Error("Could not save habit check-in to device storage. Storage quota may be exceeded.");
  }
}
