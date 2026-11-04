import type { PlannerTask, Priority } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";
import { isTaskItem } from "./item-classifier";
import { getWeekDays, toDateKey } from "./date-utils";

export type KanbanDateFilter = "all" | "today" | "this_week" | "this_month" | "overdue" | "completed";
export type KanbanSortKey = "due" | "priority" | "created";

export const PRIORITY_ORDER: Record<Priority, number> = { p1: 0, p2: 1, p3: 2, p4: 3, none: 4 };

export interface FilterKanbanTasksOptions {
  tasks: PlannerTask[];
  dateFilter: KanbanDateFilter;
  projectFilter?: string;
  priorityFilter?: Priority | "";
  labelFilter?: string;
  search?: string;
  sortBy?: KanbanSortKey;
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
    priorityFilter,
    labelFilter,
    search,
    sortBy,
    todayKey,
    today = new Date(),
    weekStartsOn = 1,
  } = options;

  const weekDays = getWeekDays(today, weekStartsOn);
  const thisWeekKeys = new Set(weekDays.map(toDateKey));
  const currentMonthPrefix = todayKey.slice(0, 7);
  const searchLower = search?.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    if (!isTaskItem(task)) return false;

    // Project filter
    if (projectFilter) {
      if (projectFilter === "__unassigned") {
        if (task.projectId) return false;
      } else if (task.projectId !== projectFilter) {
        return false;
      }
    }

    // Priority filter
    if (priorityFilter) {
      if (task.priority !== priorityFilter) return false;
    }

    // Label filter
    if (labelFilter) {
      if (!task.labelIds?.includes(labelFilter)) return false;
    }

    // Search filter
    if (searchLower) {
      const inTitle = task.title.toLowerCase().includes(searchLower);
      const inNotes = task.notes?.toLowerCase().includes(searchLower);
      if (!inTitle && !inNotes) return false;
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

  if (sortBy) {
    filtered.sort((a, b) => {
      if (sortBy === "priority") {
        const pa = PRIORITY_ORDER[a.priority] ?? 4;
        const pb = PRIORITY_ORDER[b.priority] ?? 4;
        if (pa !== pb) return pa - pb;
      }
      if (sortBy === "due" || sortBy === "priority") {
        const da = a.dueDate ?? "9999-99-99";
        const db = b.dueDate ?? "9999-99-99";
        if (da !== db) return da < db ? -1 : 1;
      }
      if (sortBy === "created") {
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      }
      return 0;
    });
  }

  return filtered;
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
