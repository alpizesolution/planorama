import type { PlannerTask } from "../schedule/types";
import type {
  GoogleCalendarConfig,
  GoogleCalendarSyncSettings,
  GoogleIntegrationStatus,
  SyncResult,
} from "./types";
import type { GoogleCalendarEvent, GoogleEventDateTime } from "../server/google-calendar";

/**
 * Extracts a "YYYY-MM-DD" date key from a GoogleEventDateTime object.
 */
export function extractDateKeyFromGoogleDateTime(dt?: GoogleEventDateTime): { dateKey: string | null; timeKey: string | null } {
  if (!dt) return { dateKey: null, timeKey: null };

  if (dt.date) {
    // All-day event: dt.date is "YYYY-MM-DD"
    return { dateKey: dt.date, timeKey: null };
  }

  if (dt.dateTime) {
    // Timed event: dt.dateTime is ISO string, e.g. "2026-10-24T14:30:00+08:00"
    const parsed = new Date(dt.dateTime);
    if (isNaN(parsed.getTime())) return { dateKey: null, timeKey: null };

    // Format local date YYYY-MM-DD
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    const dateKey = `${y}-${m}-${d}`;

    // Format local time HH:mm
    const hh = String(parsed.getHours()).padStart(2, "0");
    const mm = String(parsed.getMinutes()).padStart(2, "0");
    const timeKey = `${hh}:${mm}`;

    return { dateKey, timeKey };
  }

  return { dateKey: null, timeKey: null };
}

/**
 * Maps a recurrence rule from Google format to Planorama recurrence type.
 */
export function mapGoogleRecurrence(recurrenceRules?: string[]): PlannerTask["recurrence"] {
  if (!recurrenceRules || recurrenceRules.length === 0) return "none";
  const rule = recurrenceRules.join(";").toUpperCase();
  if (rule.includes("FREQ=DAILY")) return "daily";
  if (rule.includes("FREQ=WEEKLY")) return "weekly";
  if (rule.includes("FREQ=MONTHLY")) return "monthly";
  return "none";
}

/**
 * Convert a Google Calendar event into a Planorama PlannerTask.
 */
export function googleEventToPlannerTask(
  event: GoogleCalendarEvent,
  calendar: GoogleCalendarConfig,
  existingTask?: PlannerTask
): PlannerTask {
  const { dateKey, timeKey } = extractDateKeyFromGoogleDateTime(event.start);
  const isReadOnly = calendar.accessRole === "reader" || calendar.accessRole === "freeBusyReader";
  const isAvailabilityOnly = calendar.privacyMode === "availability_only" || event.visibility === "private";

  let title = event.summary?.trim() || "(No title)";
  let notes = event.description?.trim() || "";

  if (isAvailabilityOnly) {
    title = "Busy";
    notes = "Private calendar appointment";
  }

  const now = new Date().toISOString();
  const taskId = existingTask?.id || `gcal-${calendar.id.slice(0, 16)}-${event.id}`;

  return {
    id: taskId,
    title: title.slice(0, 240),
    notes: notes.slice(0, 5000),
    status: existingTask?.status || "open",
    priority: existingTask?.priority || "none",
    projectId: existingTask?.projectId || null,
    labelIds: existingTask?.labelIds || [],
    dueDate: dateKey,
    dueTime: timeKey,
    recurrence: mapGoogleRecurrence(event.recurrence),
    createdAt: existingTask?.createdAt || event.updated || now,
    updatedAt: event.updated || now,
    isPinned: Boolean(existingTask?.isPinned),
    isPersonal: Boolean(calendar.name.toLowerCase().includes("personal") || existingTask?.isPersonal),
    timingPreference: "scheduled",
    googleEventId: event.id,
    googleCalendarId: calendar.id,
    googleCalendarName: calendar.name,
    googleCalendarColor: calendar.color,
    googleHtmlLink: event.htmlLink,
    isGoogleEvent: true,
    isReadOnlyCalendar: isReadOnly,
    isPrivateAvailabilityOnly: isAvailabilityOnly,
    googleETag: event.etag,
  };
}

/**
 * Convert an eligible Planorama PlannerTask into a Google Calendar event payload.
 */
export function plannerTaskToGoogleEventPayload(task: PlannerTask): {
  summary: string;
  description?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
} {
  if (!task.dueDate) {
    throw new Error("Task must have a due date to sync with Google Calendar.");
  }

  const summary = task.title.slice(0, 240);
  const statusNote = task.status === "completed" ? "\n[Planorama: Completed]" : "";
  const description = `${task.notes || ""}${statusNote}`.trim() || undefined;

  if (task.dueTime) {
    // Timed event: start and end
    const startIso = `${task.dueDate}T${task.dueTime}:00`;
    // Calculate 1 hour duration
    const [y, m, d] = task.dueDate.split("-").map(Number);
    const [hh, mm] = task.dueTime.split(":").map(Number);
    const endDate = new Date(y, m - 1, d, hh + 1, mm, 0);
    const endIso = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

    return {
      summary,
      description,
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    };
  }

  // All-day event: Google end date is exclusive (day + 1)
  const [y, m, d] = task.dueDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  return {
    summary,
    description,
    start: { date: task.dueDate },
    end: { date: nextDayStr },
  };
}

/**
 * API Client methods
 */

export async function fetchGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  const res = await fetch("/api/integrations/google/status", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Calendar status: ${res.statusText}`);
  }
  return (await res.json()) as GoogleIntegrationStatus;
}

export async function fetchGoogleCalendars(): Promise<GoogleCalendarConfig[]> {
  const res = await fetch("/api/integrations/google/calendars", { cache: "no-store" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to load Google Calendars.");
  }
  const data = await res.json();
  return (data.calendars || []) as GoogleCalendarConfig[];
}

export async function disconnectGoogleAccount(): Promise<void> {
  const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to disconnect Google Calendar.");
  }
}

/**
 * Runs a two-way synchronization between Planorama and Google Calendar.
 */
export async function executeTwoWaySync(
  currentTasks: PlannerTask[],
  settings: GoogleCalendarSyncSettings
): Promise<{
  updatedTasks: PlannerTask[];
  result: SyncResult;
}> {
  // Collect tasks eligible for export:
  // - If autoSyncTasks is enabled: tasks with dueDate and timingPreference === "scheduled" that are NOT already imported from Google
  // - Or tasks that already have a googleEventId (update push)
  const tasksToExport = currentTasks.filter((task) => {
    if (task.isGoogleEvent && !task.googleEventId) return false;
    if (task.googleEventId) return true; // push edits to existing Google event
    if (settings.autoSyncTasks && task.dueDate && !task.isGoogleEvent) return true; // new task export
    return false;
  });

  const payload = {
    settings,
    tasksToExport: tasksToExport.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      status: t.status,
      priority: t.priority,
      googleEventId: t.googleEventId,
      googleCalendarId: t.googleCalendarId,
      updatedAt: t.updatedAt,
    })),
  };

  const res = await fetch("/api/integrations/google/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Synchronization request failed.");
  }

  const syncResponse = await res.json();
  const {
    importedEvents = [],
    deletedEventIds = [],
    exportedTaskUpdates = [],
    errors = [],
  } = syncResponse;

  const tasksMap = new Map<string, PlannerTask>(currentTasks.map((t) => [t.id, t]));

  // 1. Process deleted Google events
  const deletedSet = new Set<string>(deletedEventIds);
  for (const [id, task] of tasksMap.entries()) {
    if (task.googleEventId && deletedSet.has(task.googleEventId)) {
      if (task.isGoogleEvent) {
        // Event was created in Google and deleted in Google -> remove from Planorama
        tasksMap.delete(id);
      } else {
        // Planorama task that was exported -> unlink Google ID but preserve local task
        tasksMap.set(id, {
          ...task,
          googleEventId: undefined,
          googleCalendarId: undefined,
        });
      }
    }
  }

  // 2. Process imported Google events
  let importedCount = 0;
  let updatedCount = 0;

  for (const item of importedEvents as Array<{ event: GoogleCalendarEvent; calendar: GoogleCalendarConfig }>) {
    const { event, calendar } = item;
    if (event.status === "cancelled") continue;

    // Find if task already exists with this googleEventId
    let existingTask: PlannerTask | undefined;
    for (const task of tasksMap.values()) {
      if (task.googleEventId === event.id) {
        existingTask = task;
        break;
      }
    }

    const converted = googleEventToPlannerTask(event, calendar, existingTask);

    if (existingTask) {
      tasksMap.set(existingTask.id, converted);
      updatedCount++;
    } else {
      tasksMap.set(converted.id, converted);
      importedCount++;
    }
  }

  // 3. Process exported task updates (saved googleEventId and ETag)
  let exportedCount = 0;
  for (const update of exportedTaskUpdates as Array<{ taskId: string; googleEventId: string; googleCalendarId: string; etag?: string }>) {
    const local = tasksMap.get(update.taskId);
    if (local) {
      tasksMap.set(update.taskId, {
        ...local,
        googleEventId: update.googleEventId,
        googleCalendarId: update.googleCalendarId,
        googleETag: update.etag,
      });
      exportedCount++;
    }
  }

  const updatedTasks = Array.from(tasksMap.values());
  const nowStr = new Date().toISOString();

  return {
    updatedTasks,
    result: {
      importedCount,
      exportedCount,
      updatedCount,
      deletedCount: deletedSet.size,
      errors,
      lastSyncTime: nowStr,
    },
  };
}
