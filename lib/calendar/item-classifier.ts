import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";
import type { GoogleCalendarEvent } from "../server/google-calendar";

/**
 * Reliably identifies if a Google Calendar configuration represents a Public Holiday calendar.
 * Uses official Google calendar IDs, names, and descriptions.
 * Does not rely on matching specific holiday names.
 */
export function isHolidayCalendar(
  calendar?: { id?: string; name?: string; description?: string; isHolidayCalendar?: boolean } | null
): boolean {
  if (!calendar) return false;
  if (calendar.isHolidayCalendar === true) return true;

  const id = (calendar.id || "").toLowerCase();
  // Google public holiday calendar IDs follow the standard pattern:
  // e.g., en.philippines#holiday@group.v.calendar.google.com, en.usa#holiday@group.v.calendar.google.com
  if (
    id.includes("#holiday@group.v.calendar.google.com") ||
    id.includes("#holiday@group.calendar.google.com") ||
    id.includes("#holiday@") ||
    id.startsWith("holiday@")
  ) {
    return true;
  }

  const name = (calendar.name || "").toLowerCase();
  if (name.includes("holiday") || name.includes("holidays")) {
    return true;
  }

  const desc = (calendar.description || "").toLowerCase();
  if (desc.includes("public holiday") || desc.includes("holidays in ") || desc.includes("official holidays")) {
    return true;
  }

  return false;
}

/**
 * Identifies if a Google Calendar event is a holiday event using official Google eventType or calendar identity.
 */
export function isHolidayGoogleEvent(
  event: Partial<GoogleCalendarEvent>,
  calendar?: Partial<GoogleCalendarConfig> | null
): boolean {
  // Google Calendar API v3 eventType property
  if (event.eventType === "holiday") {
    return true;
  }
  if (calendar && isHolidayCalendar(calendar)) {
    return true;
  }
  if (event.htmlLink && event.htmlLink.includes("#holiday@")) {
    return true;
  }
  return false;
}

/**
 * Identifies if a PlannerTask is a holiday event using explicit holiday flags,
 * parent calendar metadata, or source event links.
 */
export function isHolidayItem(
  item?: Partial<PlannerTask> | null,
  calendar?: Partial<GoogleCalendarConfig> | null
): boolean {
  if (!item) return false;
  if (item.isHoliday === true) return true;
  if ((item as { eventType?: string }).eventType === "holiday") return true;
  if (calendar && isHolidayCalendar(calendar)) return true;
  if (
    item.googleCalendarId &&
    isHolidayCalendar({ id: item.googleCalendarId, name: item.googleCalendarName })
  ) {
    return true;
  }
  if (item.googleCalendarName && isHolidayCalendar({ name: item.googleCalendarName })) {
    return true;
  }
  if (item.googleHtmlLink && item.googleHtmlLink.includes("#holiday@")) {
    return true;
  }
  return false;
}

/**
 * Strictly classifies whether a record is an actual genuine Task.
 *
 * Rules:
 * 1. Google Calendar events (isGoogleEvent === true, source === "google", or googleEventId without local origin) are EVENTS, not tasks.
 * 2. Google Calendar holidays are HOLIDAY EVENTS, never tasks.
 * 3. Appointment slots (itemType === "appointment" or scheduleId) are APPOINTMENTS, not tasks.
 * 4. Only genuine planner to-dos return true.
 */
export function isTaskItem(item?: Partial<PlannerTask> | null): boolean {
  if (!item) return false;

  // 1. Explicit event or appointment itemType
  if (item.itemType === "event" || item.itemType === "appointment") {
    return false;
  }

  // 2. Holiday items are never tasks
  if (isHolidayItem(item)) {
    return false;
  }

  // 3. Google Calendar imported events are events
  if (item.isGoogleEvent || item.source === "google") {
    return false;
  }

  // 4. Appointment schedules
  if ((item as { scheduleId?: string }).scheduleId) {
    return false;
  }

  // 5. Imported Google events with gcal- id prefix
  if (item.id && item.id.startsWith("gcal-")) {
    return false;
  }

  // 6. If task has googleEventId but source is local (exported local task), it remains a task!
  if (item.googleEventId && item.source !== "local" && !item.itemType) {
    return false;
  }

  // 7. Read-only calendar records or private availability slots
  if (item.isReadOnlyCalendar || item.isPrivateAvailabilityOnly) {
    return false;
  }

  // 8. Google Calendar events from synced calendar where source is not local
  if (item.googleCalendarId && item.source !== "local" && item.itemType !== "task") {
    return false;
  }

  // 9. Google Calendar non-task eventType
  if (item.eventType && item.eventType !== "task" && item.source !== "local") {
    return false;
  }

  return true;
}

/**
 * Identifies if a record is a calendar event (regular event or holiday).
 */
export function isEventItem(item?: Partial<PlannerTask> | null): boolean {
  if (!item) return false;
  if (item.itemType === "event") return true;
  if (item.isHoliday || isHolidayItem(item)) return true;
  if (item.isGoogleEvent || item.source === "google" || item.id?.startsWith("gcal-")) return true;
  if (item.isReadOnlyCalendar || item.isPrivateAvailabilityOnly) return true;
  return false;
}

/**
 * Identifies if a record is an appointment slot.
 */
export function isAppointmentItem(item?: Partial<PlannerTask> | null): boolean {
  if (!item) return false;
  return item.itemType === "appointment" || Boolean((item as { scheduleId?: string }).scheduleId);
}

/**
 * Safely repairs and sanitizes existing records stored in local storage or database:
 * - Ensures imported Google events have itemType = "event"
 * - Accurately sets isHoliday on holiday records
 * - Preserves all IDs, dates, titles, notes, attendees, links, and user data
 * - Leaves legitimate user tasks untouched
 */
export function sanitizePlannerTask(
  task: PlannerTask,
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>
): { task: PlannerTask; wasCorrected: boolean } {
  let wasCorrected = false;
  const cal = task.googleCalendarId && allCalendarConfigs ? allCalendarConfigs[task.googleCalendarId] : undefined;
  const isHoliday = isHolidayItem(task, cal);

  const isGoogle = Boolean(
    task.isGoogleEvent ||
    task.source === "google" ||
    (task.id && task.id.startsWith("gcal-")) ||
    (task.googleEventId && task.source !== "local") ||
    task.isReadOnlyCalendar ||
    task.isPrivateAvailabilityOnly ||
    (task.googleCalendarId && task.source !== "local" && task.itemType !== "task") ||
    (task.eventType && task.eventType !== "task" && task.source !== "local")
  );

  let nextItemType = task.itemType;
  if (isGoogle || isHoliday) {
    if (task.itemType !== "event") {
      nextItemType = "event";
      wasCorrected = true;
    }
  } else if ((task as { scheduleId?: string }).scheduleId || (task.id && task.id.startsWith("sched_"))) {
    if (task.itemType !== "appointment") {
      nextItemType = "appointment";
      wasCorrected = true;
    }
  } else if (!task.itemType) {
    nextItemType = "task";
    wasCorrected = true;
  }

  let nextIsHoliday = task.isHoliday;
  if (isHoliday && !task.isHoliday) {
    nextIsHoliday = true;
    wasCorrected = true;
  }

  if (!wasCorrected) {
    return { task, wasCorrected: false };
  }

  return {
    task: {
      ...task,
      itemType: nextItemType,
      isHoliday: nextIsHoliday,
      isGoogleEvent: isGoogle ? true : task.isGoogleEvent,
      source: isGoogle && task.source !== "local" ? "google" : task.source,
    },
    wasCorrected: true,
  };
}

export function sanitizePlannerTasks(
  tasks: PlannerTask[],
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>
): { sanitized: PlannerTask[]; correctedCount: number } {
  let correctedCount = 0;
  const sanitized = tasks.map((t) => {
    const res = sanitizePlannerTask(t, allCalendarConfigs);
    if (res.wasCorrected) correctedCount++;
    return res.task;
  });
  return { sanitized, correctedCount };
}
