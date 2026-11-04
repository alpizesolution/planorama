import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { getSyncMeta, saveSyncMeta } from "@/lib/server/google-token-store";
import {
  fetchCalendarEvents,
  insertCalendarEvent,
  updateCalendarEvent,
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
    dueDate: string | null;
    dueTime: string | null;
    status: PlannerTask["status"];
    priority: PlannerTask["priority"];
    googleEventId?: string;
    googleCalendarId?: string;
    updatedAt: string;
  }>;
}

/**
 * POST /api/integrations/google/sync
 * Two-way synchronization between Planorama and Google Calendar.
 */
export async function POST(request: Request) {
  try {
    const sessionId = await getVerifiedSessionId();
    if (!sessionId) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const body = (await request.json()) as SyncRequestBody;
    const { settings, tasksToExport = [] } = body;

    const syncMeta = await getSyncMeta(sessionId);
    const updatedSyncTokens = { ...(syncMeta.syncTokens || {}) };

    const importedEvents: Array<{ event: GoogleCalendarEvent; calendar: GoogleCalendarConfig }> = [];
    const deletedEventIds: string[] = [];
    const exportedTaskUpdates: Array<{
      taskId: string;
      googleEventId: string;
      googleCalendarId: string;
      etag?: string;
    }> = [];
    const errors: string[] = [];

    // 1. Process each enabled calendar (pulling changes)
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

    // 2. Export eligible tasks to Google Calendar (pushing changes)
    // Find primary or default writable calendar
    const writableCalendar =
      activeCalendars.find((c) => c.primary && c.accessRole !== "reader" && c.accessRole !== "freeBusyReader") ||
      activeCalendars.find((c) => c.accessRole !== "reader" && c.accessRole !== "freeBusyReader");

    if (writableCalendar && tasksToExport.length > 0) {
      for (const task of tasksToExport) {
        if (!task.dueDate) continue;

        try {
          const eventPayload = plannerTaskToGoogleEventPayload({
            ...task,
            createdAt: task.updatedAt,
            updatedAt: task.updatedAt,
            projectId: null,
            labelIds: [],
            recurrence: "none",
          });

          const targetCalId = task.googleCalendarId || writableCalendar.id;

          if (task.googleEventId) {
            // Update existing event
            const updated = await updateCalendarEvent(sessionId, targetCalId, task.googleEventId, eventPayload);
            exportedTaskUpdates.push({
              taskId: task.id,
              googleEventId: updated.id,
              googleCalendarId: targetCalId,
              etag: updated.etag,
            });
          } else if (settings.autoSyncTasks) {
            // Insert new event
            const created = await insertCalendarEvent(sessionId, targetCalId, eventPayload);
            exportedTaskUpdates.push({
              taskId: task.id,
              googleEventId: created.id,
              googleCalendarId: targetCalId,
              etag: created.etag,
            });
          }
        } catch (taskErr) {
          const msg = taskErr instanceof Error ? taskErr.message : `Failed to export task "${task.title}".`;
          console.warn(`[Sync] Task export error (${task.id}):`, msg);
          errors.push(`Task "${task.title}": ${msg}`);
        }
      }
    }

    // 3. Save sync metadata
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
      errors,
      lastSyncTime: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronization failed.";
    console.error("[Integrations/Google/Sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
