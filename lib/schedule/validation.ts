import type { NewPlannerTask, PlannerTask } from "./types";

const priorities = new Set(["p1", "p2", "p3", "p4"]);
const statuses = new Set(["open", "completed"]);
const recurrences = new Set(["none", "daily", "weekly", "monthly"]);

export function validateTask(value: unknown): PlannerTask {
  if (!value || typeof value !== "object") throw new Error("Task must be an object.");
  const task = value as Record<string, unknown>;
  if (typeof task.id !== "string" || !task.id.trim()) throw new Error("Task ID is required.");
  if (typeof task.title !== "string" || !task.title.trim() || task.title.length > 240) throw new Error("Task title must be between 1 and 240 characters.");
  if (typeof task.notes !== "string" || task.notes.length > 10000) throw new Error("Task notes are invalid.");
  if (typeof task.status !== "string" || !statuses.has(task.status)) throw new Error("Task status is invalid.");
  if (typeof task.priority !== "string" || !priorities.has(task.priority)) throw new Error("Task priority is invalid.");
  if (task.projectId !== null && typeof task.projectId !== "string") throw new Error("Task project is invalid.");
  if (!Array.isArray(task.labelIds) || !task.labelIds.every((id) => typeof id === "string")) throw new Error("Task labels are invalid.");
  if (task.dueDate !== null && (typeof task.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))) throw new Error("Task due date must use YYYY-MM-DD.");
  if (task.dueTime !== null && (typeof task.dueTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime))) throw new Error("Task due time must use HH:mm.");
  if (task.recurrence !== undefined && (typeof task.recurrence !== "string" || !recurrences.has(task.recurrence))) throw new Error("Task recurrence is invalid.");
  if (task.recurrence === undefined) task.recurrence = "none";
  if (typeof task.createdAt !== "string" || typeof task.updatedAt !== "string") throw new Error("Task timestamps are invalid.");
  return task as unknown as PlannerTask;
}

export function validateNewTask(value: NewPlannerTask): Omit<PlannerTask, "id" | "createdAt" | "updatedAt"> {
  const title = value.title.trim();
  if (!title || title.length > 240) throw new Error("Task title must be between 1 and 240 characters.");
  const priority = value.priority ?? "p4";
  if (!priorities.has(priority)) throw new Error("Task priority is invalid.");
  const notes = value.notes ?? "";
  if (typeof notes !== "string" || notes.length > 10000) throw new Error("Task notes are invalid.");
  return {
    title,
    notes,
    status: value.status ?? "open",
    priority,
    projectId: value.projectId ?? null,
    labelIds: value.labelIds ?? [],
    dueDate: value.dueDate ?? null,
    dueTime: value.dueTime ?? null,
    recurrence: value.recurrence ?? "none",
  };
}
