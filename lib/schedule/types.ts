export type Priority = "p1" | "p2" | "p3" | "p4";
export type TaskStatus = "open" | "completed";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export type PlannerTask = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string | null;
  labelIds: string[];
  dueDate: string | null;
  dueTime: string | null;
  recurrence: Recurrence;
  createdAt: string;
  updatedAt: string;
};

export type NewPlannerTask = Pick<PlannerTask, "title"> & Partial<Omit<PlannerTask, "id" | "title" | "createdAt" | "updatedAt">>;

export type PlannerPreferences = {
  theme: "light" | "dark" | "system";
  weekStartsOn: 0 | 1 | 6;
  timeZone: string;
};

export const DEFAULT_PREFERENCES: PlannerPreferences = {
  theme: "system",
  weekStartsOn: 0,
  timeZone: "Asia/Manila",
};
