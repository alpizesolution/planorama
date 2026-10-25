import type { NewPlannerTask, PlannerTask } from "./types";

const priorities = new Set(["p1", "p2", "p3", "p4", "none"]);
const statuses = new Set(["open", "in_progress", "completed"]);
const recurrences = new Set(["none", "daily", "weekly", "monthly", "yearly"]);
const timingPreferences = new Set(["scheduled", "whenever"]);

export function validateTask(value: unknown): PlannerTask {
  if (!value || typeof value !== "object") throw new Error("Task must be an object.");
  const task = value as Record<string, unknown>;
  if (typeof task.id !== "string" || !task.id.trim()) throw new Error("Task ID is required.");
  if (typeof task.title !== "string" || !task.title.trim() || task.title.length > 240) throw new Error("Task title must be between 1 and 240 characters.");
  if (task.notes === undefined) task.notes = "";
  if (task.projectId === undefined) task.projectId = null;
  if (task.labelIds === undefined) task.labelIds = [];
  if (task.dueDate === undefined) task.dueDate = null;
  if (task.dueTime === undefined) task.dueTime = null;
  if (task.recurrence === undefined) task.recurrence = "none";
  if (task.priority === undefined) task.priority = "none";
  if (task.isPinned === undefined) task.isPinned = false;
  if (task.isPersonal === undefined) task.isPersonal = false;
  if (task.timingPreference === undefined) task.timingPreference = "scheduled";
  if (typeof task.notes !== "string" || task.notes.length > 10000) throw new Error("Task notes are invalid.");
  if (typeof task.status !== "string" || !statuses.has(task.status)) throw new Error("Task status is invalid.");
  if (typeof task.priority !== "string" || !priorities.has(task.priority)) throw new Error("Task priority is invalid.");
  if (typeof task.isPinned !== "boolean") throw new Error("Task pin status is invalid.");
  if (typeof task.isPersonal !== "boolean") throw new Error("Task personal category is invalid.");
  if (typeof task.timingPreference !== "string" || !timingPreferences.has(task.timingPreference)) throw new Error("Task timing preference is invalid.");
  if (task.projectId !== null && typeof task.projectId !== "string") throw new Error("Task project is invalid.");
  if (!Array.isArray(task.labelIds) || !task.labelIds.every((id) => typeof id === "string")) throw new Error("Task labels are invalid.");
  if (task.dueDate !== null && (typeof task.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))) throw new Error("Task due date must use YYYY-MM-DD.");
  if (task.dueTime !== null && (typeof task.dueTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime))) throw new Error("Task due time must use HH:mm.");
  if (typeof task.recurrence !== "string" || !recurrences.has(task.recurrence)) throw new Error("Task recurrence is invalid.");
  if (typeof task.createdAt !== "string" || typeof task.updatedAt !== "string") throw new Error("Task timestamps are invalid.");
  return task as unknown as PlannerTask;
}

export function validateNewTask(value: NewPlannerTask): Omit<PlannerTask, "id" | "createdAt" | "updatedAt"> {
  const title = value.title.trim();
  if (!title || title.length > 240) throw new Error("Task title must be between 1 and 240 characters.");
  const priority = value.priority ?? "none";
  if (!priorities.has(priority)) throw new Error("Task priority is invalid.");
  const notes = value.notes ?? "";
  if (typeof notes !== "string" || notes.length > 10000) throw new Error("Task notes are invalid.");
  const isPinned = Boolean(value.isPinned);
  const isPersonal = Boolean(value.isPersonal);
  const timingPreference = value.timingPreference ?? "scheduled";
  if (!timingPreferences.has(timingPreference)) throw new Error("Task timing preference is invalid.");
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
    isPinned,
    isPersonal,
    timingPreference,
    googleEventId: value.googleEventId,
    googleCalendarId: value.googleCalendarId,
    googleCalendarName: value.googleCalendarName,
    googleCalendarColor: value.googleCalendarColor,
    googleHtmlLink: value.googleHtmlLink,
    isGoogleEvent: value.isGoogleEvent,
    isReadOnlyCalendar: value.isReadOnlyCalendar,
    isPrivateAvailabilityOnly: value.isPrivateAvailabilityOnly,
    googleETag: value.googleETag,
    source: value.source ?? (value.isGoogleEvent ? "google" : "local"),
    location: value.location,
    attendees: value.attendees,
    googleAccountId: value.googleAccountId,
    googleAccountEmail: value.googleAccountEmail,
    lastSyncedAt: value.lastSyncedAt,
    syncStatus: value.syncStatus,
    recurringEventId: value.recurringEventId,
  };
}
