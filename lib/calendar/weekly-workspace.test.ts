import { describe, it, expect } from "vitest";
import { createSignedOAuthState, verifySignedOAuthState } from "../server/crypto";
import { getWeekDays, toDateKey } from "./date-utils";
import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";

describe("PLANORAMA Weekly Workspace & Google Calendar Integration", () => {
  describe("1. OAuth State Verification — Session & User Identity Binding", () => {
    it("successfully validates state when sessionId is refreshed for the same authenticated user", () => {
      const userUid = "firebase_user_chamontero_123";
      const initialSessionId = "session_uuid_initial_111";
      const state = createSignedOAuthState(initialSessionId, "/?view=week", userUid);

      // Simulate session refresh/rotation where a new session UUID is generated for the same user
      const refreshedSessionId = "session_uuid_refreshed_222";
      const result = verifySignedOAuthState(state, refreshedSessionId, undefined, userUid);

      expect(result.valid).toBe(true);
      expect(result.returnUrl).toBe("/?view=week");
      expect(result.userId).toBe(userUid);
    });

    it("strictly rejects state if attempted by a different authenticated user (cross-user attack prevention)", () => {
      const victimUid = "user_victim_111";
      const attackerUid = "user_attacker_222";
      const victimSessionId = "session_victim_999";
      const state = createSignedOAuthState(victimSessionId, "/?view=week", victimUid);

      const result = verifySignedOAuthState(state, victimSessionId, undefined, attackerUid);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("State user identity does not match authenticated user");
    });

    it("strictly validates exact sessionId match for unauthenticated guest sessions", () => {
      const guestSessionId = "guest_session_xyz789";
      const guestUserId = `guest_${guestSessionId}`;
      const state = createSignedOAuthState(guestSessionId, "/?view=week", guestUserId);

      // Same guest session succeeds
      const validResult = verifySignedOAuthState(state, guestSessionId, undefined, guestUserId);
      expect(validResult.valid).toBe(true);

      // Mismatched guest session is rejected
      const invalidResult = verifySignedOAuthState(state, "guest_session_different", undefined, "guest_different");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain("does not match");
    });

    it("rejects tampered state signatures and expired requests", () => {
      const sessionId = "valid_session_123";
      const state = createSignedOAuthState(sessionId, "/?view=week");

      // Tampered signature
      const tampered = state + "tampered";
      expect(verifySignedOAuthState(tampered, sessionId).valid).toBe(false);

      // Expired state (-100ms maxAge)
      expect(verifySignedOAuthState(state, sessionId, -100).valid).toBe(false);
    });
  });

  describe("2. Weekly Workspace Calendar Visibility & Item Filtering", () => {
    const calendarConfigs: Record<string, GoogleCalendarConfig> = {
      "client-acme": {
        id: "client-acme",
        name: "Acme Corp (Client)",
        color: "#0284c7",
        enabled: true,
        accessRole: "writer",
        syncDirection: "two_way",
        privacyMode: "full_details",
      },
      "client-beta": {
        id: "client-beta",
        name: "Beta Industries (Client Read-only)",
        color: "#ea580c",
        enabled: false, // Toggled off in sidebar
        accessRole: "reader",
        syncDirection: "import_only",
        privacyMode: "full_details",
      },
    };

    const sampleTasks: PlannerTask[] = [
      {
        id: "local-task-1",
        title: "Personal Weekly Planning",
        status: "open",
        dueDate: "2026-10-28",
        dueTime: "09:00",
        priority: "p2",
        recurrence: "none",
        isPinned: false,
        labelIds: [],
        projectId: null,
        notes: "",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
      {
        id: "client-event-acme",
        title: "Sprint Review with Acme",
        status: "open",
        dueDate: "2026-10-28",
        dueTime: "14:00",
        priority: "p1",
        recurrence: "none",
        isPinned: true,
        labelIds: [],
        projectId: null,
        notes: "",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
        isGoogleEvent: true,
        googleCalendarId: "client-acme",
        googleCalendarName: "Acme Corp",
      },
      {
        id: "client-event-beta",
        title: "Beta All Hands (Disabled)",
        status: "open",
        dueDate: "2026-10-29",
        dueTime: "11:00",
        priority: "p3",
        recurrence: "none",
        isPinned: false,
        labelIds: [],
        projectId: null,
        notes: "",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
        isGoogleEvent: true,
        googleCalendarId: "client-beta",
        googleCalendarName: "Beta Industries",
        isReadOnlyCalendar: true,
      },
    ];

    function filterWeeklyTasks(
      tasks: PlannerTask[],
      configs: Record<string, GoogleCalendarConfig>,
      localEnabled: boolean
    ): PlannerTask[] {
      return tasks.filter((task) => {
        if (!localEnabled && !task.isGoogleEvent && !task.googleCalendarId) {
          return false;
        }
        if (task.googleCalendarId && configs[task.googleCalendarId]?.enabled === false) {
          return false;
        }
        return true;
      });
    }

    it("filters out disabled client calendars while keeping active client and local events", () => {
      const visible = filterWeeklyTasks(sampleTasks, calendarConfigs, true);

      expect(visible.map((t) => t.id)).toEqual(["local-task-1", "client-event-acme"]);
      expect(visible.some((t) => t.id === "client-event-beta")).toBe(false);
    });

    it("excludes local tasks when local calendar is toggled off in the sidebar", () => {
      const visible = filterWeeklyTasks(sampleTasks, calendarConfigs, false);

      expect(visible.map((t) => t.id)).toEqual(["client-event-acme"]);
      expect(visible.some((t) => t.id === "local-task-1")).toBe(false);
    });
  });

  describe("3. Mini-Calendar Navigation & Weekly Date Anchor", () => {
    it("anchors the 7-day week correctly when a day is selected from the mini-calendar", () => {
      // User clicks Wednesday, Oct 28, 2026
      const selectedDayKey = "2026-10-28";
      const [y, m, d] = selectedDayKey.split("-").map(Number);
      const anchorDate = new Date(y, m - 1, d);

      // Week starts on Monday (1)
      const weekDaysMonday = getWeekDays(anchorDate, 1);
      const weekKeysMonday = weekDaysMonday.map(toDateKey);

      expect(weekKeysMonday).toHaveLength(7);
      expect(weekKeysMonday[0]).toBe("2026-10-26"); // Monday
      expect(weekKeysMonday[2]).toBe("2026-10-28"); // Wednesday (selected)
      expect(weekKeysMonday[6]).toBe("2026-11-01"); // Sunday

      // Week starts on Sunday (0)
      const weekDaysSunday = getWeekDays(anchorDate, 0);
      const weekKeysSunday = weekDaysSunday.map(toDateKey);

      expect(weekKeysSunday).toHaveLength(7);
      expect(weekKeysSunday[0]).toBe("2026-10-25"); // Sunday
      expect(weekKeysSunday[3]).toBe("2026-10-28"); // Wednesday
      expect(weekKeysSunday[6]).toBe("2026-10-31"); // Saturday
    });
  });
});
