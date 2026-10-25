import type { PlannerTask } from "../schedule/types";
import type {
  GoogleCalendarConfig,
  GoogleCalendarSyncSettings,
  GoogleIntegrationStatus,
  SyncResult,
} from "./types";
import type {
  GoogleCalendarEvent,
  GoogleEventDateTime,
  GoogleEventPayload,
} from "../server/google-calendar";
import {
  getSyncQueue,
  dequeueSyncItem,
  getDeletedGoogleEventIds,
  isEventTombstoned,
  resolveEventConflict,
} from "./sync-queue";

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
  if (rule.includes("FREQ=YEARLY")) return "yearly";
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
  let location: string | undefined = event.location?.trim() || undefined;
  const attendees = event.attendees?.map((att) => ({
    email: att.email,
    displayName: att.displayName,
    responseStatus: att.responseStatus,
  }));

  if (isAvailabilityOnly) {
    title = "Busy";
    notes = "Private calendar appointment";
    location = undefined;
  }

  const now = new Date().toISOString();
  const accountPrefix = calendar.accountId ? `${calendar.accountId.slice(0, 8)}-` : "";
  const taskId = existingTask?.id || `gcal-${accountPrefix}${calendar.id.slice(0, 16)}-${event.id}`;

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
    source: "google",
    location,
    attendees: isAvailabilityOnly ? undefined : attendees,
    googleAccountId: calendar.accountId,
    googleAccountEmail: calendar.accountEmail,
    lastSyncedAt: now,
    syncStatus: "synced",
    recurringEventId: event.recurringEventId,
  };
}

/**
 * Convert an eligible Planorama PlannerTask into a Google Calendar event payload.
 */
export function plannerTaskToGoogleEventPayload(task: PlannerTask): GoogleEventPayload {
  if (!task.dueDate) {
    throw new Error("Task must have a due date to sync with Google Calendar.");
  }

  const summary = task.title.slice(0, 240);
  const statusNote = task.status === "completed" ? "\n[Planorama: Completed]" : "";
  const description = `${task.notes || ""}${statusNote}`.trim() || undefined;
  const location = task.location?.trim() || undefined;

  let recurrence: string[] | undefined;
  if (task.recurrence === "daily") recurrence = ["RRULE:FREQ=DAILY"];
  else if (task.recurrence === "weekly") recurrence = ["RRULE:FREQ=WEEKLY"];
  else if (task.recurrence === "monthly") recurrence = ["RRULE:FREQ=MONTHLY"];
  else if (task.recurrence === "yearly") recurrence = ["RRULE:FREQ=YEARLY"];

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
      location,
      recurrence,
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
    location,
    recurrence,
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

export async function disconnectGoogleAccount(accountId?: string): Promise<void> {
  const res = await fetch("/api/integrations/google/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
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
  // 1. Gather pending queued offline actions
  const queue = getSyncQueue();
  const queuedDeletions: Array<{
    queueItemId: string;
    googleEventId: string;
    googleCalendarId: string;
    googleAccountId?: string;
  }> = [];

  for (const item of queue) {
    if (item.action === "delete" && item.googleEventId && item.googleCalendarId) {
      queuedDeletions.push({
        queueItemId: item.id,
        googleEventId: item.googleEventId,
        googleCalendarId: item.googleCalendarId,
        googleAccountId: item.googleAccountId,
      });
    }
  }

  // 2. Collect tasks eligible for export:
  // - If autoSyncTasks is enabled: tasks with dueDate and timingPreference === "scheduled" that are NOT imported from Google
  // - Or tasks that already have a googleEventId (update push)
  // - Or tasks with source === "google" or explicitly designated to sync
  const tasksToExport = currentTasks.filter((task) => {
    if (task.isReadOnlyCalendar) return false; // Never push to read-only calendars
    if (task.isGoogleEvent && !task.googleEventId) return false;
    if (task.googleEventId) return true; // push edits to existing Google event
    if (settings.autoSyncTasks && task.dueDate && !task.isGoogleEvent) return true; // new task export
    if (task.googleCalendarId && task.dueDate) return true; // task created with a target calendar selected
    return false;
  });

  const payload = {
    settings,
    tasksToExport: tasksToExport.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      location: t.location,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      recurrence: t.recurrence,
      status: t.status,
      priority: t.priority,
      googleEventId: t.googleEventId,
      googleCalendarId: t.googleCalendarId,
      googleAccountId: t.googleAccountId,
      updatedAt: t.updatedAt,
    })),
    tasksToDelete: queuedDeletions,
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
    deletedQueueItemIds = [],
    errors = [],
  } = syncResponse;

  // Dequeue successfully processed offline deletions
  for (const qId of (deletedQueueItemIds as string[])) {
    dequeueSyncItem(qId);
  }

  const tasksMap = new Map<string, PlannerTask>(currentTasks.map((t) => [t.id, t]));
  const tombstones = getDeletedGoogleEventIds();

  // 3. Process deleted Google events
  const deletedSet = new Set<string>(deletedEventIds);
  for (const [id, task] of tasksMap.entries()) {
    if (task.googleEventId && deletedSet.has(task.googleEventId)) {
      if (task.isGoogleEvent || task.source === "google") {
        // Event was created in Google and deleted in Google -> remove from Planorama
        tasksMap.delete(id);
      } else {
        // Planorama task that was exported -> unlink Google ID but preserve local task
        tasksMap.set(id, {
          ...task,
          googleEventId: undefined,
          googleCalendarId: undefined,
          googleHtmlLink: undefined,
          syncStatus: undefined,
        });
      }
    }
  }

  // 4. Process imported Google events with Conflict Resolution
  let importedCount = 0;
  let updatedCount = 0;
  let conflictsResolved = 0;

  for (const item of importedEvents as Array<{ event: GoogleCalendarEvent; calendar: GoogleCalendarConfig }>) {
    const { event, calendar } = item;
    if (event.status === "cancelled") continue;

    // Check tombstones (ignore events previously unlinked locally)
    if (isEventTombstoned(event.id, calendar.id, calendar.accountId, tombstones)) {
      continue;
    }

    // Find if task already exists with this composite event identity: (accountId, calendarId, eventId)
    let existingTask: PlannerTask | undefined;
    for (const task of tasksMap.values()) {
      if (
        task.googleEventId === event.id &&
        (!task.googleCalendarId || task.googleCalendarId === calendar.id) &&
        (!task.googleAccountId || !calendar.accountId || task.googleAccountId === calendar.accountId)
      ) {
        existingTask = task;
        break;
      }
    }

    if (existingTask) {
      const conflictCheck = resolveEventConflict(existingTask, event, settings.lastSyncTime);
      if (conflictCheck.hasConflict) {
        conflictsResolved++;
      }

      if (conflictCheck.winner === "local") {
        // Local edit takes precedence; do not overwrite with stale Google data
        continue;
      }

      const converted = googleEventToPlannerTask(event, calendar, existingTask);
      tasksMap.set(existingTask.id, converted);
      updatedCount++;
    } else {
      const converted = googleEventToPlannerTask(event, calendar);
      tasksMap.set(converted.id, converted);
      importedCount++;
    }
  }

  // 5. Process exported task updates (saved googleEventId and ETag)
  let exportedCount = 0;
  for (const update of exportedTaskUpdates as Array<{ taskId: string; googleEventId: string; googleCalendarId: string; etag?: string; htmlLink?: string }>) {
    const local = tasksMap.get(update.taskId);
    if (local) {
      tasksMap.set(update.taskId, {
        ...local,
        googleEventId: update.googleEventId,
        googleCalendarId: update.googleCalendarId,
        googleETag: update.etag,
        googleHtmlLink: update.htmlLink || local.googleHtmlLink,
        syncStatus: "synced",
        lastSyncedAt: new Date().toISOString(),
      });
      exportedCount++;
      // Dequeue any pending update/create queue items for this task
      for (const qItem of queue) {
        if (qItem.taskId === update.taskId) {
          dequeueSyncItem(qItem.id);
        }
      }
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
      conflictsResolved,
      errors,
      lastSyncTime: nowStr,
    },
  };
}
