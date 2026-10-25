import { describe, it, expect } from "vitest";
import {
  encryptText,
  decryptText,
  createSignedOAuthState,
  verifySignedOAuthState,
} from "../server/crypto";
import {
  extractDateKeyFromGoogleDateTime,
  mapGoogleRecurrence,
  googleEventToPlannerTask,
  plannerTaskToGoogleEventPayload,
} from "./sync-service";
import type { GoogleCalendarConfig } from "./types";
import type { GoogleCalendarEvent, GoogleEventDateTime } from "../server/google-calendar";
import { ReadOnlyCalendarError } from "../server/google-calendar";
import type { PlannerTask } from "../schedule/types";

describe("Google Calendar Integration - Cryptographic Security", () => {
  it("encrypts and decrypts sensitive tokens at rest using AES-256-GCM", () => {
    const originalToken = "ya29.a0AfH6SMD_very_secret_refresh_token_123456789";
    const encrypted = encryptText(originalToken);

    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.ciphertext).not.toContain(originalToken);

    const decrypted = decryptText(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it("fails to decrypt if ciphertext is altered (authenticated encryption tamper detection)", () => {
    const encrypted = encryptText("secret-access-token");
    // Tamper with first byte of ciphertext
    const tamperedCiphertext = (encrypted.ciphertext[0] === "a" ? "b" : "a") + encrypted.ciphertext.slice(1);
    const tamperedPayload = { ...encrypted, ciphertext: tamperedCiphertext };

    expect(() => decryptText(tamperedPayload)).toThrow();
  });

  it("fails to decrypt if authentication tag is altered", () => {
    const encrypted = encryptText("secret-access-token");
    const tamperedTag = (encrypted.tag[0] === "f" ? "0" : "f") + encrypted.tag.slice(1);
    const tamperedPayload = { ...encrypted, tag: tamperedTag };

    expect(() => decryptText(tamperedPayload)).toThrow();
  });

  it("generates signed, tamper-proof OAuth state bound to user session", () => {
    const sessionId = "session_user_abc123456789";
    const state = createSignedOAuthState(sessionId, "/settings");

    expect(state).toContain(".");
    const verified = verifySignedOAuthState(state, sessionId);

    expect(verified.valid).toBe(true);
    expect(verified.returnUrl).toBe("/settings");
  });

  it("rejects OAuth state if session ID does not match (session fixation / CSRF prevention)", () => {
    const sessionId = "legitimate_session_123456";
    const attackerSessionId = "attacker_session_654321";

    const state = createSignedOAuthState(sessionId, "/");
    const result = verifySignedOAuthState(state, attackerSessionId);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not match");
  });

  it("rejects tampered OAuth state signatures", () => {
    const sessionId = "test_session_id_12345";
    const state = createSignedOAuthState(sessionId, "/");
    const tamperedState = state + "tampered";

    const result = verifySignedOAuthState(tamperedState, sessionId);
    expect(result.valid).toBe(false);
  });

  it("rejects expired OAuth state requests", () => {
    const sessionId = "test_session_id_12345";
    const state = createSignedOAuthState(sessionId, "/");

    // Test with maxAgeMs = 0 (immediately expired)
    const result = verifySignedOAuthState(state, sessionId, -100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });
});

describe("Google Calendar Integration - Event to Task Mapping", () => {
  const sampleCalendar: GoogleCalendarConfig = {
    id: "client-a-cal@example.com",
    name: "Client A Schedule",
    color: "#ff3d8b",
    accessRole: "writer",
    enabled: true,
    syncDirection: "two_way",
    privacyMode: "full_details",
  };

  it("extracts date and time correctly from all-day and timed Google events", () => {
    const allDay: GoogleEventDateTime = { date: "2026-10-24" };
    const timed: GoogleEventDateTime = { dateTime: "2026-10-24T15:30:00+08:00" };

    expect(extractDateKeyFromGoogleDateTime(allDay)).toEqual({
      dateKey: "2026-10-24",
      timeKey: null,
    });

    const parsedTimed = extractDateKeyFromGoogleDateTime(timed);
    expect(parsedTimed.dateKey).toBe("2026-10-24");
    expect(typeof parsedTimed.timeKey).toBe("string");
  });

  it("maps Google event to Planorama task with calendar branding and source metadata", () => {
    const googleEvent: GoogleCalendarEvent = {
      id: "event_12345",
      status: "confirmed",
      summary: "Client Strategy Meeting",
      description: "Review Q4 deliverables and timeline.",
      start: { dateTime: "2026-10-24T10:00:00Z" },
      end: { dateTime: "2026-10-24T11:00:00Z" },
      htmlLink: "https://calendar.google.com/event?eid=123",
      etag: '"etag123"',
    };

    const task = googleEventToPlannerTask(googleEvent, sampleCalendar);

    expect(task.title).toBe("Client Strategy Meeting");
    expect(task.notes).toBe("Review Q4 deliverables and timeline.");
    expect(task.isGoogleEvent).toBe(true);
    expect(task.googleEventId).toBe("event_12345");
    expect(task.googleCalendarId).toBe("client-a-cal@example.com");
    expect(task.googleCalendarName).toBe("Client A Schedule");
    expect(task.googleCalendarColor).toBe("#ff3d8b");
    expect(task.isReadOnlyCalendar).toBe(false);
  });

  it("protects read-only calendars and sets isReadOnlyCalendar flag", () => {
    const readOnlyCal: GoogleCalendarConfig = {
      ...sampleCalendar,
      accessRole: "reader",
    };

    const googleEvent: GoogleCalendarEvent = {
      id: "event_ro_1",
      status: "confirmed",
      summary: "Executive Keynote",
      start: { date: "2026-10-25" },
    };

    const task = googleEventToPlannerTask(googleEvent, readOnlyCal);
    expect(task.isReadOnlyCalendar).toBe(true);
  });

  it("respects availability-only privacy mode by hiding sensitive summary", () => {
    const privateCal: GoogleCalendarConfig = {
      ...sampleCalendar,
      privacyMode: "availability_only",
    };

    const sensitiveEvent: GoogleCalendarEvent = {
      id: "event_sens_1",
      status: "confirmed",
      summary: "Confidential M&A Discussion",
      description: "Do not disclose",
      start: { dateTime: "2026-10-24T14:00:00Z" },
    };

    const task = googleEventToPlannerTask(sensitiveEvent, privateCal);
    expect(task.title).toBe("Busy");
    expect(task.isPrivateAvailabilityOnly).toBe(true);
    expect(task.notes).not.toContain("Confidential M&A");
  });

  it("maps recurring event rules accurately", () => {
    expect(mapGoogleRecurrence(["RRULE:FREQ=DAILY;INTERVAL=1"])).toBe("daily");
    expect(mapGoogleRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"])).toBe("weekly");
    expect(mapGoogleRecurrence(["RRULE:FREQ=MONTHLY"])).toBe("monthly");
    expect(mapGoogleRecurrence([])).toBe("none");
  });

  it("converts Planorama tasks into valid Google Calendar event payloads", () => {
    const task: PlannerTask = {
      id: "task-101",
      title: "Draft Client Report",
      notes: "Include analytics charts",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: "09:00",
      recurrence: "none",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payload = plannerTaskToGoogleEventPayload(task);
    expect(payload.summary).toBe("Draft Client Report");
    expect(payload.description).toContain("Include analytics charts");
    expect(payload.start.dateTime).toBe("2026-10-24T09:00:00");
  });

  it("converts all-day Planorama tasks with exclusive next-day end date per Google spec", () => {
    const allDayTask: PlannerTask = {
      id: "task-102",
      title: "Quarterly Planning Day",
      notes: "",
      status: "open",
      priority: "none",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: null,
      recurrence: "none",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payload = plannerTaskToGoogleEventPayload(allDayTask);
    expect(payload.start.date).toBe("2026-10-24");
    expect(payload.end.date).toBe("2026-10-25"); // Next day
  });

  it("converts yearly recurring Planorama tasks into RFC 5545 RRULE format", () => {
    const yearlyTask: PlannerTask = {
      id: "task-103",
      title: "Annual Client Retainer Review",
      notes: "",
      status: "open",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-24",
      dueTime: "14:00",
      recurrence: "yearly",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payload = plannerTaskToGoogleEventPayload(yearlyTask);
    expect(payload.recurrence).toEqual(["RRULE:FREQ=YEARLY"]);
  });

  it("maps yearly Google recurrence rule to Planorama 'yearly'", () => {
    expect(mapGoogleRecurrence(["RRULE:FREQ=YEARLY;INTERVAL=1"])).toBe("yearly");
    expect(mapGoogleRecurrence(["RRULE:FREQ=YEARLY"])).toBe("yearly");
  });

  it("extracts and preserves event location and attendees", () => {
    const googleEvent: GoogleCalendarEvent = {
      id: "event_loc_1",
      status: "confirmed",
      summary: "Client Onboarding Workshop",
      location: "Room 402, Building A / Zoom: https://zoom.us/j/123",
      attendees: [
        { email: "assistant@va-agency.com", displayName: "Sarah VA", responseStatus: "accepted" },
        { email: "client@acme.com", displayName: "Alex Client", responseStatus: "needsAction" },
      ],
      start: { dateTime: "2026-10-24T11:00:00Z" },
    };

    const task = googleEventToPlannerTask(googleEvent, sampleCalendar);
    expect(task.location).toBe("Room 402, Building A / Zoom: https://zoom.us/j/123");
    expect(task.attendees).toHaveLength(2);
    expect(task.attendees?.[0].displayName).toBe("Sarah VA");
    expect(task.attendees?.[1].email).toBe("client@acme.com");

    const payload = plannerTaskToGoogleEventPayload(task);
    expect(payload.location).toBe("Room 402, Building A / Zoom: https://zoom.us/j/123");
  });

  it("throws ReadOnlyCalendarError when attempting to write to read-only calendars", () => {
    const error = new ReadOnlyCalendarError("Client B (Read-Only)");
    expect(error.name).toBe("ReadOnlyCalendarError");
    expect(error.message).toContain("read-only");
  });
});

describe("Google Calendar Integration - Multi-Account Storage & Client Isolation", () => {
  it("stores and isolates multiple client Google accounts under a single user session", async () => {
    const {
      saveEncryptedCredentials,
      getDecryptedCredentials,
      getAllConnectedAccounts,
      deleteCredentials,
    } = await import("../server/google-token-store");

    const testSessionId = `test_session_${Date.now()}`;
    const primaryAccount = {
      sessionId: testSessionId,
      accountId: "va@agency.com",
      userEmail: "va@agency.com",
      userName: "Virtual Assistant",
      accessToken: "ya29.va_access_token",
      refreshToken: "va_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: true,
    };

    const clientAccount = {
      sessionId: testSessionId,
      accountId: "client_bob@corp.com",
      userEmail: "client_bob@corp.com",
      userName: "Bob Client",
      accessToken: "ya29.client_bob_access_token",
      refreshToken: "client_bob_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: false,
    };

    // Save both accounts
    await saveEncryptedCredentials(testSessionId, primaryAccount);
    await saveEncryptedCredentials(testSessionId, clientAccount);

    // Retrieve all connected accounts
    const allAccounts = await getAllConnectedAccounts(testSessionId);
    expect(allAccounts).toHaveLength(2);
    const emails = allAccounts.map((a) => a.userEmail);
    expect(emails).toContain("va@agency.com");
    expect(emails).toContain("client_bob@corp.com");

    // Fetch client credentials selectively
    const fetchedClient = await getDecryptedCredentials(testSessionId, "client_bob@corp.com");
    expect(fetchedClient?.userEmail).toBe("client_bob@corp.com");
    expect(fetchedClient?.accessToken).toBe("ya29.client_bob_access_token");

    // Selective disconnect: disconnect only client account
    await deleteCredentials(testSessionId, "client_bob@corp.com");

    const remainingAccounts = await getAllConnectedAccounts(testSessionId);
    expect(remainingAccounts).toHaveLength(1);
    expect(remainingAccounts[0].userEmail).toBe("va@agency.com");

    // Clean up
    await deleteCredentials(testSessionId);
  });
});

describe("Google Calendar Integration - Durable Sync Queue & Coalescing", () => {
  it("coalesces pending local changes in the queue before syncing", async () => {
    const {
      enqueueSyncAction,
      getSyncQueue,
      clearSyncQueue,
      dequeueSyncItem,
      hasPendingSync,
    } = await import("./sync-queue");

    clearSyncQueue();

    // Enqueue a create action
    enqueueSyncAction({
      action: "create",
      taskId: "task-coalesce-1",
      localUpdatedAt: new Date().toISOString(),
      payload: {
        summary: "Initial Draft",
        start: { date: "2026-10-25" },
        end: { date: "2026-10-26" },
      },
    });

    expect(getSyncQueue()).toHaveLength(1);
    expect(hasPendingSync("task-coalesce-1")).toBe(true);

    // Enqueue an update on the same un-synced task -> coalesces into create with updated payload
    enqueueSyncAction({
      action: "update",
      taskId: "task-coalesce-1",
      localUpdatedAt: new Date().toISOString(),
      payload: {
        summary: "Updated Draft",
        start: { date: "2026-10-25" },
        end: { date: "2026-10-26" },
      },
    });

    const queueAfterUpdate = getSyncQueue();
    expect(queueAfterUpdate).toHaveLength(1);
    expect(queueAfterUpdate[0].action).toBe("create");
    expect(queueAfterUpdate[0].payload?.summary).toBe("Updated Draft");

    // Enqueue a delete before syncing to Google -> cancelled completely
    enqueueSyncAction({
      action: "delete",
      taskId: "task-coalesce-1",
      localUpdatedAt: new Date().toISOString(),
    });

    expect(getSyncQueue()).toHaveLength(0);
    expect(hasPendingSync("task-coalesce-1")).toBe(false);

    // Dequeue item test
    enqueueSyncAction({
      action: "update",
      taskId: "task-coalesce-2",
      googleEventId: "g-event-99",
      localUpdatedAt: new Date().toISOString(),
    });
    const items = getSyncQueue();
    expect(items).toHaveLength(1);
    dequeueSyncItem(items[0].id);
    expect(getSyncQueue()).toHaveLength(0);
  });

  it("tracks deleted Google event tombstones to prevent resurrection", async () => {
    const {
      recordDeletedGoogleEventId,
      getDeletedGoogleEventIds,
      clearTombstones,
    } = await import("./sync-queue");

    clearTombstones();
    recordDeletedGoogleEventId("g-event-tombstone-1");
    recordDeletedGoogleEventId("g-event-tombstone-2");

    const tombstones = getDeletedGoogleEventIds();
    expect(tombstones.has("g-event-tombstone-1")).toBe(true);
    expect(tombstones.has("g-event-tombstone-2")).toBe(true);
    expect(tombstones.has("other-event")).toBe(false);

    clearTombstones();
    expect(getDeletedGoogleEventIds().size).toBe(0);
  });
});

describe("Google Calendar Integration - Conflict Resolution", () => {
  it("accurately detects and resolves conflicts between local and Google modifications", async () => {
    const { resolveEventConflict, clearSyncQueue, enqueueSyncAction } = await import("./sync-queue");
    clearSyncQueue();

    const baseTask: PlannerTask = {
      id: "task-conflict-1",
      title: "Quarterly Strategy Review",
      notes: "Local notes",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-25",
      dueTime: "10:00",
      recurrence: "none",
      createdAt: "2026-10-24T00:00:00Z",
      updatedAt: "2026-10-24T00:00:00Z",
      lastSyncedAt: "2026-10-24T12:00:00Z",
    };

    // Case 1: Google was updated after last sync, local has no pending edits -> Google wins cleanly
    const newerGoogleEvent: GoogleCalendarEvent = {
      id: "g-event-1",
      status: "confirmed",
      summary: "Quarterly Strategy Review (Updated by Client)",
      updated: "2026-10-25T08:00:00Z",
      start: { dateTime: "2026-10-25T11:00:00Z" },
    };

    const res1 = resolveEventConflict(baseTask, newerGoogleEvent, baseTask.lastSyncedAt);
    expect(res1.winner).toBe("google");
    expect(res1.hasConflict).toBe(false);

    // Case 2: Local was updated offline (pending sync), Google was not modified since sync -> Local wins cleanly
    enqueueSyncAction({
      action: "update",
      taskId: baseTask.id,
      localUpdatedAt: "2026-10-25T09:00:00Z",
    });

    const unmodifiedGoogleEvent: GoogleCalendarEvent = {
      id: "g-event-1",
      status: "confirmed",
      summary: "Quarterly Strategy Review",
      updated: "2026-10-24T10:00:00Z", // Older than lastSyncedAt
      start: { dateTime: "2026-10-25T10:00:00Z" },
    };

    const res2 = resolveEventConflict(baseTask, unmodifiedGoogleEvent, baseTask.lastSyncedAt);
    expect(res2.winner).toBe("local");
    expect(res2.hasConflict).toBe(false);

    // Case 3: Both modified after last sync -> genuine conflict detected
    const conflictingGoogleEvent: GoogleCalendarEvent = {
      id: "g-event-1",
      status: "confirmed",
      summary: "Quarterly Strategy Review (Concurrent Client Edit)",
      updated: "2026-10-25T14:00:00Z", // Newer than local updatedAt
      start: { dateTime: "2026-10-25T15:00:00Z" },
    };

    const res3 = resolveEventConflict(
      { ...baseTask, updatedAt: "2026-10-25T10:00:00Z" },
      conflictingGoogleEvent,
      baseTask.lastSyncedAt
    );
    expect(res3.hasConflict).toBe(true);
    expect(res3.winner).toBe("google"); // newer edit applied with conflict warning
    expect(res3.resolutionMessage).toContain("Conflict detected");

    clearSyncQueue();
  });
});
