import type { PlannerTask } from "../schedule/types";
import type { Habit, HabitCheckIn } from "../habits/types";
import { isHabitScheduledForDate } from "../habits/streak-utils";
import { toDateKey } from "../calendar/date-utils";

export interface DailyOverviewStats {
  totalDueToday: number;
  completedToday: number;
  remainingToday: number;
  overdueCount: number;
  progressPercent: number;
}

export function calculateDailyOverview(
  tasks: PlannerTask[],
  todayKey: string
): DailyOverviewStats {
  const dueToday = tasks.filter((t) => t.dueDate === todayKey);
  const totalDueToday = dueToday.length;
  const completedToday = dueToday.filter((t) => t.status === "completed").length;
  const remainingToday = totalDueToday - completedToday;
  const overdueCount = tasks.filter(
    (t) => t.status !== "completed" && Boolean(t.dueDate && t.dueDate < todayKey)
  ).length;

  let progressPercent = 0;
  if (totalDueToday > 0) {
    progressPercent = Math.round((completedToday / totalDueToday) * 100);
  } else if (overdueCount === 0 && tasks.length > 0) {
    progressPercent = 100;
  }

  return {
    totalDueToday,
    completedToday,
    remainingToday,
    overdueCount,
    progressPercent,
  };
}

export const PRIORITY_WEIGHTS: Record<PlannerTask["priority"], number> = {
  p1: 1, // Do This Now
  p2: 2, // High
  p3: 3, // Medium
  p4: 4, // Low
  none: 5, // No Priority
};

export function sortTodaysFocusTasks(
  tasks: PlannerTask[],
  todayKey: string
): PlannerTask[] {
  return tasks
    .filter((t) => t.dueDate === todayKey)
    .sort((a, b) => {
      // 1. Pinned tasks stay prominently at the top
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      // 2. Priority order: Do This Now (p1) -> High (p2) -> Med (p3) -> Low (p4) -> None
      const pA = PRIORITY_WEIGHTS[a.priority ?? "none"] ?? 5;
      const pB = PRIORITY_WEIGHTS[b.priority ?? "none"] ?? 5;
      if (pA !== pB) return pA - pB;

      // 3. Due time if present
      if (a.dueTime && b.dueTime) {
        const timeComp = a.dueTime.localeCompare(b.dueTime);
        if (timeComp !== 0) return timeComp;
      } else if (a.dueTime && !b.dueTime) {
        return -1;
      } else if (!a.dueTime && b.dueTime) {
        return 1;
      }

      // 4. Stable by creation date
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export interface UpcomingDateGroup {
  title: string;
  dateKey: string;
  weekday: string;
  isWeekend: boolean;
  tasks: PlannerTask[];
}

export interface UpcomingSummary {
  overdueGroup: {
    title: string;
    tasks: PlannerTask[];
  } | null;
  dateGroups: UpcomingDateGroup[];
  totalUpcomingTasks: number;
}

export function getUpcomingDateGroups(
  tasks: PlannerTask[],
  todayKey: string,
  numDays = 7
): UpcomingSummary {
  const [y, m, d] = todayKey.split("-").map(Number);
  const baseDate = new Date(y, m - 1, d);

  // Overdue tasks
  const overdueTasks = tasks.filter(
    (t) => Boolean(t.dueDate && t.dueDate < todayKey)
  ).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const dateGroups: UpcomingDateGroup[] = [];
  let totalUpcomingCount = 0;

  for (let i = 1; i <= numDays; i++) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + i);

    const dateKey = toDateKey(nextDate);
    const dayOfWeek = nextDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekday = nextDate.toLocaleDateString("en", { weekday: "short" });
    const shortDate = nextDate.toLocaleDateString("en", { month: "short", day: "numeric" });

    let title: string;
    if (i === 1) {
      title = `Tomorrow · ${shortDate}`;
    } else {
      title = `${weekday}, ${shortDate}`;
    }

    const dayTasks = tasks
      .filter((t) => t.dueDate === dateKey)
      .sort((a, b) => {
        const pA = PRIORITY_WEIGHTS[a.priority ?? "none"] ?? 5;
        const pB = PRIORITY_WEIGHTS[b.priority ?? "none"] ?? 5;
        if (pA !== pB) return pA - pB;
        return (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
      });

    totalUpcomingCount += dayTasks.length;
    dateGroups.push({
      title,
      dateKey,
      weekday,
      isWeekend,
      tasks: dayTasks,
    });
  }

  return {
    overdueGroup:
      overdueTasks.length > 0
        ? {
            title: `Overdue (${overdueTasks.length})`,
            tasks: overdueTasks,
          }
        : null,
    dateGroups,
    totalUpcomingTasks: totalUpcomingCount,
  };
}

export interface DailyChartPoint {
  dateKey: string;
  dayName: string;
  dayShort: string;
  completedTasks: number;
  totalTasks: number;
  isToday: boolean;
  completionPercent: number;
}

export interface WeeklyProgressStats {
  tasksCompleted: number;
  tasksRemaining: number;
  totalWeekTasks: number;
  taskCompletionPercent: number;
  dailyChart: DailyChartPoint[];
  habitsCompleted: number;
  habitsExpected: number;
  habitCompletionPercent: number;
}

export function calculateWeeklyProgress(
  tasks: PlannerTask[],
  habits: Habit[],
  checkIns: HabitCheckIn[],
  weekDays: Date[],
  todayKey: string
): WeeklyProgressStats {
  const weekDateKeys = new Set(weekDays.map(toDateKey));

  const weekTasks = tasks.filter(
    (t) => t.dueDate && weekDateKeys.has(t.dueDate)
  );
  const tasksCompleted = weekTasks.filter((t) => t.status === "completed").length;
  const tasksRemaining = weekTasks.length - tasksCompleted;
  const taskCompletionPercent =
    weekTasks.length > 0 ? Math.round((tasksCompleted / weekTasks.length) * 100) : 0;

  const dailyChart: DailyChartPoint[] = weekDays.map((dayDate) => {
    const dateKey = toDateKey(dayDate);
    const dayName = dayDate.toLocaleDateString("en", { weekday: "narrow" });
    const dayShort = dayDate.toLocaleDateString("en", { weekday: "short" });
    const dayTasks = tasks.filter((t) => t.dueDate === dateKey);
    const dayCompleted = dayTasks.filter((t) => t.status === "completed").length;
    const totalTasks = dayTasks.length;
    const completionPercent =
      totalTasks > 0 ? Math.round((dayCompleted / totalTasks) * 100) : 0;

    return {
      dateKey,
      dayName,
      dayShort,
      completedTasks: dayCompleted,
      totalTasks,
      isToday: dateKey === todayKey,
      completionPercent,
    };
  });

  // Habits statistics for current week
  const activeHabits = habits.filter((h) => !h.archived);
  const activeHabitIds = new Set(activeHabits.map((h) => h.id));

  let habitsExpected = 0;
  for (const dayDate of weekDays) {
    for (const habit of activeHabits) {
      if (isHabitScheduledForDate(habit, dayDate)) {
        habitsExpected += 1;
      }
    }
  }

  const habitsCompleted = checkIns.filter(
    (c) =>
      c.completed &&
      weekDateKeys.has(c.date) &&
      activeHabitIds.has(c.habitId)
  ).length;

  const habitCompletionPercent =
    habitsExpected > 0 ? Math.round((habitsCompleted / habitsExpected) * 100) : 0;

  return {
    tasksCompleted,
    tasksRemaining,
    totalWeekTasks: weekTasks.length,
    taskCompletionPercent,
    dailyChart,
    habitsCompleted,
    habitsExpected,
    habitCompletionPercent,
  };
}
