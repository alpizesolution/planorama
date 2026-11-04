export type HabitScheduleType = "everyday" | "weekdays" | "weekends" | "custom";

export type Habit = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scheduleType: HabitScheduleType;
  customDays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  target?: string;
  reminderTime?: string;
  archived: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
};

export type NewHabitInput = {
  name: string;
  icon?: string;
  description?: string;
  scheduleType?: HabitScheduleType;
  customDays?: number[];
  target?: string;
  reminderTime?: string;
};

export type HabitCheckIn = {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD local calendar date
  completed: boolean;
  completedAt: string; // ISO string
};

export type HabitStats = {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate: number; // 0 to 100 percentage
  isScheduledToday: boolean;
  isCompletedToday: boolean;
};
