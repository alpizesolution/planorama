import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";
import { isTaskItem } from "./item-classifier";
import { getWeekDays, toDateKey } from "./date-utils";

export type KanbanDateFilter = "all" | "today" | "this_week" | "this_month" | "overdue" | "completed";

export interface FilterKanbanTasksOptions {
  tasks: PlannerTask[];
  dateFilter: KanbanDateFilter;
  projectFilter?: string; // "" or undefined for all, "__unassigned" for unassigned, or specific project id
  todayKey: string;
  today?: Date;
  weekStartsOn?: 0 | 1 | 6;
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>;
}

export const KANBAN_DATE_FILTER_LABELS: Record<KanbanDateFilter, string> = {
  all: "All Tasks",
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  overdue: "Overdue",
  completed: "Completed",
};

/**
 * Filters tasks for the Kanban board with strict item classification and date/client filtering.
 *
 * Rules:
 * 1. ONLY genuine tasks are included (isTaskItem === true).
 *    Google events, public holidays, all-day events, appointments, and read-only calendar items are NEVER included.
 * 2. Date filtering:
 *    - "all": All genuine tasks regardless of due date (or without due date).
 *    - "today": Tasks due today (dueDate === todayKey).
 *    - "this_week": Tasks due in the current week (using weekStartsOn).
 *    - "this_month": Tasks due in the current month (dueDate.startsWith(todayKey.slice(0, 7))).
 *    - "overdue": Tasks not completed with dueDate < todayKey.
 *    - "completed": Tasks with status === "completed".
 * 3. Client/Project filtering:
 *    - If projectFilter is set: matches task.projectId. Does NOT mix with Google Calendar account identity.
 */
export function filterKanbanTasks(options: FilterKanbanTasksOptions): PlannerTask[] {
  const {
    tasks,
    dateFilter,
    projectFilter,
    todayKey,
    today = new Date(),
    weekStartsOn = 1,
  } = options;

  // 1. Calculate this week's date keys
  const weekDays = getWeekDays(today, weekStartsOn);
  const thisWeekKeys = new Set(weekDays.map(toDateKey));

  // 2. Current month prefix (e.g. "2026-11")
  const currentMonthPrefix = todayKey.slice(0, 7);

  return tasks.filter((task) => {
    // STRICT CLASSIFICATION: Only genuine tasks are ever allowed on the Kanban board!
    if (!isTaskItem(task)) {
      return false;
    }

    // Client / Project filter
    if (projectFilter) {
      if (projectFilter === "__unassigned") {
        if (task.projectId) return false;
      } else if (task.projectId !== projectFilter) {
        return false;
      }
    }

    // Date filter
    switch (dateFilter) {
      case "all":
        return true;
      case "today":
        return task.dueDate === todayKey;
      case "this_week":
        return Boolean(task.dueDate && thisWeekKeys.has(task.dueDate));
      case "this_month":
        return Boolean(task.dueDate && task.dueDate.startsWith(currentMonthPrefix));
      case "overdue":
        return task.status !== "completed" && Boolean(task.dueDate && task.dueDate < todayKey);
      case "completed":
        return task.status === "completed";
      default:
        return true;
    }
  });
}

/**
 * Groups filtered Kanban tasks into columns by status: open ("To Do"), in_progress ("In Progress"), completed ("Done").
 */
export function groupKanbanTasksByStatus(tasks: PlannerTask[]): Record<PlannerTask["status"], PlannerTask[]> {
  const map: Record<PlannerTask["status"], PlannerTask[]> = {
    open: [],
    in_progress: [],
    completed: [],
  };

  for (const task of tasks) {
    if (!isTaskItem(task)) continue;
    if (map[task.status]) {
      map[task.status].push(task);
    } else {
      map.open.push(task);
    }
  }

  return map;
}
