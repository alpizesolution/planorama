import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { getSyncMeta, saveSyncMeta } from "@/lib/server/google-token-store";
import {
  fetchCalendarEvents,
  insertCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type GoogleCalendarEvent,
} from "@/lib/server/google-calendar";
import type { GoogleCalendarConfig, GoogleCalendarSyncSettings } from "@/lib/google-calendar/types";
import { plannerTaskToGoogleEventPayload } from "@/lib/google-calendar/sync-service";
import type { PlannerTask } from "@/lib/schedule/types";

export const dynamic = "force-dynamic";

interface SyncRequestBody {
  settings: GoogleCalendarSyncSettings;
  tasksToExport?: Array<{
    id: string;
    title: string;
    notes: string;
    location?: string;
    dueDate: string | null;
    dueTime: string | null;
    status: PlannerTask["status"];
    priority: PlannerTask["priority"];
    recurrence?: PlannerTask["recurrence"];
    googleEventId?: string;
    googleCalendarId?: string;
    googleAccountId?: string;
    updatedAt: string;
  }>;
  tasksToDelete?: Array<{
    queueItemId: string;
    googleEventId: string;
    googleCalendarId: string;
    googleAccountId?: string;
  }>;
}

/**
 * POST /api/integrations/google/sync
 * Two-way synchronization between Planorama and Google Calendar.
 * Supports multi-account, location, attendees, recurrence, and durable deletion propagation.
 */
export async function POST(request: Request) {
  try {
    const sessionId = await getVerifiedSessionId();
    if (!sessionId) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const body = (await request.json()) as SyncRequestBody;
    const { settings, tasksToExport = [], tasksToDelete = [] } = body;

    const syncMeta = await getSyncMeta(sessionId);
    const updatedSyncTokens = { ...(syncMeta.syncTokens || {}) };

    const importedEvents: Array<{ event: GoogleCalendarEvent; calendar: GoogleCalendarConfig }> = [];
    const deletedEventIds: string[] = [];
    const exportedTaskUpdates: Array<{
      taskId: string;
      googleEventId: string;
      googleCalendarId: string;
      etag?: string;
      htmlLink?: string;
    }> = [];
    const deletedQueueItemIds: string[] = [];
    const errors: string[] = [];

    // 1. Process each enabled calendar (pulling changes from Google)
    const activeCalendars = Object.values(settings.calendarConfigs || {}).filter((cal) => cal.enabled);

    for (const calendar of activeCalendars) {
      if (calendar.syncDirection === "export_only") continue;

      try {
        let pageToken: string | undefined = undefined;
        const calendarSyncToken = updatedSyncTokens[calendar.id];
        let hasMorePages = true;

        while (hasMorePages) {
          const eventsResponse = await fetchCalendarEvents(sessionId, calendar.id, {
            syncToken: calendarSyncToken,
            pageToken,
            accountId: calendar.accountId,
          });

          for (const ev of eventsResponse.items) {
            if (ev.status === "cancelled") {
              deletedEventIds.push(ev.id);
            } else {
              importedEvents.push({ event: ev, calendar });
            }
          }

          pageToken = eventsResponse.nextPageToken;
          if (!pageToken) {
            hasMorePages = false;
            if (eventsResponse.nextSyncToken) {
              updatedSyncTokens[calendar.id] = eventsResponse.nextSyncToken;
            }
          }
        }
      } catch (calErr) {
        const msg = calErr instanceof Error ? calErr.message : `Failed to sync calendar "${calendar.name}".`;
        console.warn(`[Sync] Calendar error (${calendar.id}):`, msg);
        errors.push(`${calendar.name}: ${msg}`);
      }
    }

    // 2. Process authorized deletions to Google Calendar
    if (tasksToDelete.length > 0 && settings.deleteGoogleEventOnTaskDelete) {
      for (const item of tasksToDelete) {
        const targetCal = activeCalendars.find((c) => c.id === item.googleCalendarId);
        // Protect read-only client calendars against writes/deletions
        if (targetCal && (targetCal.accessRole === "reader" || targetCal.accessRole === "freeBusyReader")) {
          deletedQueueItemIds.push(item.queueItemId);
          continue;
        }

        try {
          await deleteCalendarEvent(
            sessionId,
            item.googleCalendarId,
            item.googleEventId,
            item.googleAccountId || targetCal?.accountId
          );
          deletedQueueItemIds.push(item.queueItemId);
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : `Failed to delete event ${item.googleEventId}`;
          console.warn(`[Sync] Deletion error (${item.googleEventId}):`, msg);
          errors.push(`Delete Google Event: ${msg}`);
        }
      }
    } else if (tasksToDelete.length > 0) {
      // If deleteGoogleEventOnTaskDelete is disabled, just mark queue items as handled
      for (const item of tasksToDelete) {
        deletedQueueItemIds.push(item.queueItemId);
      }
    }

    // 3. Export eligible tasks to Google Calendar (pushing changes)
    // Find target writable calendar (explicit default, primary, or first writable)
    const defaultCal = settings.defaultCalendarId
      ? activeCalendars.find((c) => c.id === settings.defaultCalendarId)
      : undefined;

    const fallbackWritable =
      activeCalendars.find((c) => c.primary && c.accessRole !== "reader" && c.accessRole !== "freeBusyReader") ||
      activeCalendars.find((c) => c.accessRole !== "reader" && c.accessRole !== "freeBusyReader");

    const resolvedDefaultCal = (defaultCal && defaultCal.accessRole !== "reader" && defaultCal.accessRole !== "freeBusyReader")
      ? defaultCal
      : fallbackWritable;

    if (tasksToExport.length > 0) {
      for (const task of tasksToExport) {
        if (!task.dueDate) continue;

        try {
          const targetCalId = task.googleCalendarId || resolvedDefaultCal?.id;
          if (!targetCalId) continue;

          const targetCal = activeCalendars.find((c) => c.id === targetCalId);
          if (targetCal && (targetCal.accessRole === "reader" || targetCal.accessRole === "freeBusyReader")) {
            // Cannot write to read-only calendar
            continue;
          }

          const targetAccountId = task.googleAccountId || targetCal?.accountId;

          const eventPayload = plannerTaskToGoogleEventPayload({
            id: task.id,
            title: task.title,
            notes: task.notes,
            location: task.location,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            recurrence: task.recurrence || "none",
            status: task.status,
            priority: task.priority,
            projectId: null,
            labelIds: [],
            createdAt: task.updatedAt,
            updatedAt: task.updatedAt,
          });

          if (task.googleEventId) {
            // Update existing event
            const updated = await updateCalendarEvent(
              sessionId,
              targetCalId,
              task.googleEventId,
              eventPayload,
              targetAccountId
            );
            exportedTaskUpdates.push({
              taskId: task.id,
              googleEventId: updated.id,
              googleCalendarId: targetCalId,
              etag: updated.etag,
              htmlLink: updated.htmlLink,
            });
          } else if (settings.autoSyncTasks || task.googleCalendarId) {
            // Insert new event
            const created = await insertCalendarEvent(
              sessionId,
              targetCalId,
              eventPayload,
              targetAccountId
            );
            exportedTaskUpdates.push({
              taskId: task.id,
              googleEventId: created.id,
              googleCalendarId: targetCalId,
              etag: created.etag,
              htmlLink: created.htmlLink,
            });
          }
        } catch (taskErr) {
          const msg = taskErr instanceof Error ? taskErr.message : `Failed to export task "${task.title}".`;
          console.warn(`[Sync] Task export error (${task.id}):`, msg);
          errors.push(`Task "${task.title}": ${msg}`);
        }
      }
    }

    // 4. Save sync metadata
    const nowIso = new Date().toISOString();
    await saveSyncMeta(sessionId, {
      syncTokens: updatedSyncTokens,
      lastSyncedAt: nowIso,
      lastSyncStatus: errors.length > 0 ? "error" : "success",
      lastSyncError: errors.length > 0 ? errors.join("; ") : undefined,
    });

    return NextResponse.json({
      success: true,
      importedEvents,
      deletedEventIds,
      exportedTaskUpdates,
      deletedQueueItemIds,
      errors,
      lastSyncTime: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronization failed.";
    console.error("[Integrations/Google/Sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
