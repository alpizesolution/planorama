import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/server/session";
import {
  getSyncMeta,
  saveSyncMeta,
  formatSyncTokenKey,
  acquireSyncLock,
  releaseSyncLock,
  getAllConnectedAccounts,
} from "@/lib/server/google-token-store";
import {
  fetchCalendarList,
  fetchCalendarEvents,
  insertCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  GooglePreconditionFailedError,
  type GoogleCalendarEvent,
  type GoogleCalendarItem,
} from "@/lib/server/google-calendar";
import type { GoogleCalendarConfig, GoogleCalendarSyncSettings } from "@/lib/google-calendar/types";
import { plannerTaskToGoogleEventPayload } from "@/lib/google-calendar/sync-service";
import type { PlannerTask } from "@/lib/schedule/types";

export const dynamic = "force-dynamic";

const MAX_TASKS_TO_EXPORT = 250;
const MAX_TASKS_TO_DELETE = 250;
const MAX_PAGES_PER_CALENDAR = 50;

interface SyncRequestBody {
  settings: GoogleCalendarSyncSettings;
  tasksToExport?: Array<{
    id: string;
    title: string;
    notes?: string;
    location?: string;
    dueDate: string | null;
    dueTime: string | null;
    status: PlannerTask["status"];
    priority: PlannerTask["priority"];
    recurrence?: PlannerTask["recurrence"];
    googleEventId?: string;
    googleCalendarId?: string;
    googleAccountId?: string;
    googleETag?: string;
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
 * Validates date format "YYYY-MM-DD".
 */
function isValidDateKey(dateKey?: string | null): boolean {
  if (!dateKey) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

/**
 * Validates time format "HH:mm".
 */
function isValidTimeKey(timeKey?: string | null): boolean {
  if (!timeKey) return true; // optional
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeKey);
}

/**
 * POST /api/integrations/google/sync
 * Two-way synchronization between Planorama and Google Calendar.
 *
 * Security & Integrity Protections:
 * 1. Requires verified session identity (tied to Firebase UID or secure session).
 * 2. In-flight sync mutex lock prevents race conditions and token corruption.
 * 3. Never trusts browser-supplied calendar configurations or permissions:
 *    re-verifies access role and owning account from server-verified Google records.
 * 4. Strictly protects read-only client calendars from write or delete attempts.
 * 5. Redacts private/availability-only event details on the server.
 * 6. Account-scoped, calendar-scoped sync token tracking with atomic updates.
 * 7. Recovers safely from expired sync tokens (410 Gone) via full sync reconciliation.
 * 8. Conditional event updates using ETags to prevent silent overwrites.
 * 9. Enforces request size limits and payload validation.
 */
export async function POST(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: "Session required." }, { status: 401 });
  }

  // 1. In-flight synchronization mutex lock
  const lockAcquired = await acquireSyncLock(session.userId);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: "A synchronization operation is already in progress for this account. Please wait a moment." },
      { status: 409 }
    );
  }

  try {
    // 2. Request body & payload validation
    let body: SyncRequestBody;
    try {
      body = (await request.json()) as SyncRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { settings, tasksToExport = [], tasksToDelete = [] } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Missing synchronization settings." }, { status: 400 });
    }

    if (tasksToExport.length > MAX_TASKS_TO_EXPORT) {
      return NextResponse.json(
        { error: `Too many tasks to export in a single sync batch (max ${MAX_TASKS_TO_EXPORT}).` },
        { status: 400 }
      );
    }

    if (tasksToDelete.length > MAX_TASKS_TO_DELETE) {
      return NextResponse.json(
        { error: `Too many tasks to delete in a single sync batch (max ${MAX_TASKS_TO_DELETE}).` },
        { status: 400 }
      );
    }

    // 3. Server-side account & calendar verification (DO NOT trust client-supplied permissions)
    const connectedAccounts = await getAllConnectedAccounts(session.userId);
    if (!connectedAccounts || connectedAccounts.length === 0) {
      return NextResponse.json(
        { error: "No connected Google accounts found for this session." },
        { status: 400 }
      );
    }

    const connectedAccountIds = new Set(connectedAccounts.map((a) => a.accountId));

    // Fetch verified calendar list from Google (or use fresh server cache)
    const syncMeta = await getSyncMeta(session.userId);
    let verifiedCalendarItems: GoogleCalendarItem[] = [];

    const now = Date.now();
    if (
      syncMeta.verifiedCalendars &&
      syncMeta.verifiedCalendars.cachedAt &&
      now - syncMeta.verifiedCalendars.cachedAt < 5 * 60 * 1000 &&
      syncMeta.verifiedCalendars.items.length > 0
    ) {
      verifiedCalendarItems = syncMeta.verifiedCalendars.items;
    } else {
      try {
        verifiedCalendarItems = await fetchCalendarList(session.userId);
        syncMeta.verifiedCalendars = {
          items: verifiedCalendarItems,
          cachedAt: now,
        };
      } catch (calListErr) {
        console.warn("[Sync] Could not refresh calendar list from Google, using cached if available:", calListErr);
        if (syncMeta.verifiedCalendars?.items) {
          verifiedCalendarItems = syncMeta.verifiedCalendars.items;
        } else {
          throw calListErr;
        }
      }
    }

    // Map verified calendars by ID
    const verifiedMap = new Map<string, GoogleCalendarItem>();
    for (const item of verifiedCalendarItems) {
      verifiedMap.set(item.id, item);
    }

    // Validate and sanitize active calendars from client settings against verified records
    const verifiedActiveCalendars: GoogleCalendarConfig[] = [];
    for (const clientCal of Object.values(settings.calendarConfigs || {})) {
      if (!clientCal || !clientCal.id || !clientCal.enabled) continue;

      const verified = verifiedMap.get(clientCal.id);
      if (!verified) {
        // Calendar is not in user's authorized Google account list -> reject / ignore
        continue;
      }

      // Ensure accountId matches connected account
      const owningAccountId = verified.accountId || clientCal.accountId;
      if (!owningAccountId || !connectedAccountIds.has(owningAccountId)) {
        continue;
      }

      // Enforce server-derived access role
      const realRole = verified.accessRole;
      const isReadOnly = realRole === "reader" || realRole === "freeBusyReader";
      const isAvailabilityOnly = realRole === "freeBusyReader" || clientCal.privacyMode === "availability_only";

      verifiedActiveCalendars.push({
        id: verified.id,
        name: verified.summary,
        description: verified.description,
        primary: verified.primary,
        accessRole: realRole,
        color: clientCal.color || verified.backgroundColor || "#3b5bff",
        enabled: true,
        // Override client's claimed sync direction if calendar is read-only
        syncDirection: isReadOnly ? "import_only" : (clientCal.syncDirection || "two_way"),
        privacyMode: isAvailabilityOnly ? "availability_only" : "full_details",
        accountId: owningAccountId,
        accountEmail: verified.accountEmail || clientCal.accountEmail,
      });
    }

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

    // 4. Import events from Google Calendar (Google -> Planorama)
    for (const calendar of verifiedActiveCalendars) {
      if (calendar.syncDirection === "export_only") continue;

      const syncKey = formatSyncTokenKey(calendar.accountId, calendar.id);
      const calendarSyncToken = updatedSyncTokens[syncKey] || updatedSyncTokens[calendar.id]; // fallback to legacy key

      try {
        let pageToken: string | undefined = undefined;
        let hasMorePages = true;
        let pageCount = 0;
        let latestNextSyncToken: string | undefined = undefined;

        while (hasMorePages && pageCount < MAX_PAGES_PER_CALENDAR) {
          pageCount++;
          const eventsResponse = await fetchCalendarEvents(session.userId, calendar.id, {
            syncToken: calendarSyncToken,
            pageToken,
            accountId: calendar.accountId,
          });

          // Handle recovery from expired syncToken (410 Gone)
          if (eventsResponse.fullSyncRequired) {
            delete updatedSyncTokens[syncKey];
            delete updatedSyncTokens[calendar.id];
          }

          for (const ev of eventsResponse.items) {
            // Server-side privacy redaction for availability-only or free/busy calendars
            if (calendar.privacyMode === "availability_only") {
              ev.summary = "Busy";
              ev.description = "Private calendar appointment";
              ev.location = undefined;
              ev.attendees = undefined;
            }

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
              latestNextSyncToken = eventsResponse.nextSyncToken;
            }
          }
        }

        // Only commit the new sync token if pagination finished completely without errors
        if (latestNextSyncToken) {
          updatedSyncTokens[syncKey] = latestNextSyncToken;
        }
      } catch (calErr) {
        const msg = calErr instanceof Error ? calErr.message : `Failed to sync calendar "${calendar.name}".`;
        console.warn(`[Sync] Calendar error (${calendar.id}):`, msg);
        errors.push(`${calendar.name}: ${msg}`);
      }
    }

    // 5. Process authorized deletions to Google Calendar (Planorama -> Google)
    if (tasksToDelete.length > 0 && settings.deleteGoogleEventOnTaskDelete) {
      for (const item of tasksToDelete) {
        if (!item.googleCalendarId || !item.googleEventId) {
          deletedQueueItemIds.push(item.queueItemId);
          continue;
        }

        const verifiedCal = verifiedMap.get(item.googleCalendarId);
        if (!verifiedCal) {
          // Unverified calendar -> skip deleting on Google
          deletedQueueItemIds.push(item.queueItemId);
          continue;
        }

        // Server-side permission check: NEVER delete from read-only calendars
        if (verifiedCal.accessRole === "reader" || verifiedCal.accessRole === "freeBusyReader") {
          deletedQueueItemIds.push(item.queueItemId);
          continue;
        }

        const targetAccountId = verifiedCal.accountId || item.googleAccountId;

        try {
          await deleteCalendarEvent(
            session.userId,
            item.googleCalendarId,
            item.googleEventId,
            targetAccountId
          );
          deletedQueueItemIds.push(item.queueItemId);
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : `Failed to delete event ${item.googleEventId}`;
          console.warn(`[Sync] Deletion error (${item.googleEventId}):`, msg);
          errors.push(`Delete Event: ${msg}`);
        }
      }
    } else if (tasksToDelete.length > 0) {
      // If deleteGoogleEventOnTaskDelete is disabled, just mark queue items as handled locally
      for (const item of tasksToDelete) {
        deletedQueueItemIds.push(item.queueItemId);
      }
    }

    // 6. Export / Push tasks to Google Calendar (Planorama -> Google)
    // Find default writable calendar
    const defaultCal = settings.defaultCalendarId
      ? verifiedActiveCalendars.find((c) => c.id === settings.defaultCalendarId)
      : undefined;

    const fallbackWritable =
      verifiedActiveCalendars.find((c) => c.primary && c.accessRole !== "reader" && c.accessRole !== "freeBusyReader") ||
      verifiedActiveCalendars.find((c) => c.accessRole !== "reader" && c.accessRole !== "freeBusyReader");

    const resolvedDefaultCal =
      defaultCal && defaultCal.accessRole !== "reader" && defaultCal.accessRole !== "freeBusyReader"
        ? defaultCal
        : fallbackWritable;

    if (tasksToExport.length > 0) {
      for (const task of tasksToExport) {
        if (!task.dueDate || !isValidDateKey(task.dueDate)) continue;
        if (task.dueTime && !isValidTimeKey(task.dueTime)) continue;

        const targetCalId = task.googleCalendarId || resolvedDefaultCal?.id;
        if (!targetCalId) continue;

        const verifiedCal = verifiedMap.get(targetCalId);
        if (!verifiedCal) {
          errors.push(`Task "${task.title}": Destination calendar is not authorized.`);
          continue;
        }

        // Enforce write permissions strictly on the server
        if (verifiedCal.accessRole === "reader" || verifiedCal.accessRole === "freeBusyReader") {
          errors.push(`Task "${task.title}": Destination calendar "${verifiedCal.summary}" is read-only.`);
          continue;
        }

        const targetAccountId = verifiedCal.accountId || task.googleAccountId;

        try {
          const eventPayload = plannerTaskToGoogleEventPayload({
            id: task.id,
            title: task.title?.slice(0, 240) || "Untitled Task",
            notes: (task.notes || "").slice(0, 5000),
            location: task.location?.slice(0, 500),
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            recurrence: task.recurrence || "none",
            status: task.status,
            priority: task.priority,
            projectId: null,
            labelIds: [],
            createdAt: task.updatedAt || new Date().toISOString(),
            updatedAt: task.updatedAt || new Date().toISOString(),
          });

          if (task.googleEventId) {
            // Update existing event with conditional ETag check
            const updated = await updateCalendarEvent(
              session.userId,
              targetCalId,
              task.googleEventId,
              eventPayload,
              targetAccountId,
              task.googleETag
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
              session.userId,
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
          if (taskErr instanceof GooglePreconditionFailedError) {
            // ETag mismatch: event was modified remotely on Google
            errors.push(`Conflict: Event "${task.title}" was modified remotely on Google Calendar.`);
          } else {
            const msg = taskErr instanceof Error ? taskErr.message : `Failed to export task "${task.title}".`;
            console.warn(`[Sync] Task export error (${task.id}):`, msg);
            errors.push(`Task "${task.title}": ${msg}`);
          }
        }
      }
    }

    // 7. Save updated sync metadata atomically to durable store
    const nowIso = new Date().toISOString();
    await saveSyncMeta(session.userId, {
      ...syncMeta,
      syncTokens: updatedSyncTokens,
      lastSyncedAt: nowIso,
      lastSyncStatus: errors.length > 0 ? "error" : "success",
      lastSyncError: errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
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
  } finally {
    // Always release in-flight sync lock
    await releaseSyncLock(session.userId);
  }
}
