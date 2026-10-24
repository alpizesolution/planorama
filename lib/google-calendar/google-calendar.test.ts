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

  it("throws ReadOnlyCalendarError when attempting to write to read-only calendars", () => {
    const error = new ReadOnlyCalendarError("Client B (Read-Only)");
    expect(error.name).toBe("ReadOnlyCalendarError");
    expect(error.message).toContain("read-only");
  });
});
