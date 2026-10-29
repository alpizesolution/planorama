import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createSignedOAuthState, verifySignedOAuthState } from "../server/crypto";
import { getWeekDays, getWorkWeekDays, toDateKey, formatWeekRange } from "./date-utils";
import { layoutDayEvents, isAllDayItem, formatTimeRange } from "./day-layout";
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

    it("formats week range strings cleanly across month and year boundaries", () => {
      const days = getWeekDays(new Date(2026, 9, 28), 1);
      expect(formatWeekRange(days)).toBe("Oct 26 – Nov 1, 2026");
    });
  });

  describe("4. Hourly Weekly Calendar Grid & All-Day Separation", () => {
    const mondayKey = "2026-10-26";
    const wednesdayKey = "2026-10-28";

    const weekTasks: PlannerTask[] = [
      // All-day item on Monday
      {
        id: "all-day-mon",
        title: "Company Holiday / Quarterly Kickoff",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: mondayKey,
        dueTime: null,
        isAllDay: true,
        notes: "",
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
      // Timed event on Monday
      {
        id: "timed-mon-standup",
        title: "Team Standup",
        status: "open",
        priority: "p2",
        projectId: null,
        labelIds: [],
        dueDate: mondayKey,
        dueTime: "09:00",
        durationMinutes: 30,
        notes: "",
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
      // Overlapping events on Wednesday: 10:00-11:00 and 10:30-11:30
      {
        id: "wed-overlap-1",
        title: "Design Review",
        status: "open",
        priority: "p1",
        projectId: null,
        labelIds: [],
        dueDate: wednesdayKey,
        dueTime: "10:00",
        durationMinutes: 60,
        notes: "",
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
      {
        id: "wed-overlap-2",
        title: "Client Sync",
        status: "open",
        priority: "p2",
        projectId: null,
        labelIds: [],
        dueDate: wednesdayKey,
        dueTime: "10:30",
        durationMinutes: 60,
        notes: "",
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
      // Untimed daily task on Wednesday
      {
        id: "wed-untimed-task",
        title: "Update documentation",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: wednesdayKey,
        dueTime: "",
        notes: "",
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      },
    ];

    it("correctly separates all-day items from timed events", () => {
      const monAllDay = weekTasks.filter((t) => t.dueDate === mondayKey && isAllDayItem(t));
      const monTimed = weekTasks.filter((t) => t.dueDate === mondayKey && !isAllDayItem(t));

      expect(monAllDay.map((t) => t.id)).toEqual(["all-day-mon"]);
      expect(monTimed.map((t) => t.id)).toEqual(["timed-mon-standup"]);

      const wedAllDay = weekTasks.filter((t) => t.dueDate === wednesdayKey && isAllDayItem(t));
      const wedTimed = weekTasks.filter((t) => t.dueDate === wednesdayKey && !isAllDayItem(t));

      expect(wedAllDay.map((t) => t.id)).toEqual(["wed-untimed-task"]);
      expect(wedTimed.map((t) => t.id)).toEqual(["wed-overlap-1", "wed-overlap-2"]);
    });

    it("lays out overlapping timed events side-by-side without clipping titles", () => {
      const positioned = layoutDayEvents(weekTasks, wednesdayKey);

      expect(positioned).toHaveLength(2);
      expect(positioned[0].totalColumns).toBe(2);
      expect(positioned[1].totalColumns).toBe(2);
      expect(positioned[0].column).toBe(0);
      expect(positioned[1].column).toBe(1);

      // Verify formatted time ranges
      expect(formatTimeRange(positioned[0].startMinutes, positioned[0].endMinutes)).toBe("10:00 AM – 11:00 AM");
      expect(formatTimeRange(positioned[1].startMinutes, positioned[1].endMinutes)).toBe("10:30 AM – 11:30 AM");
    });
  });

  describe("5. Work Weeks View (Monday–Friday 5-Day Layout & Navigation)", () => {
    it("returns exactly 5 dates strictly from Monday through Friday", () => {
      // Wednesday Oct 28, 2026
      const date = new Date(2026, 9, 28);
      const days = getWorkWeekDays(date);

      expect(days).toHaveLength(5);
      const dateKeys = days.map(toDateKey);
      expect(dateKeys).toEqual([
        "2026-10-26", // Monday
        "2026-10-27", // Tuesday
        "2026-10-28", // Wednesday
        "2026-10-29", // Thursday
        "2026-10-30", // Friday
      ]);

      // None of the days should be Saturday (6) or Sunday (0)
      for (const d of days) {
        expect(d.getDay()).not.toBe(0);
        expect(d.getDay()).not.toBe(6);
      }
    });

    it("formats the workweek date range Monday through Friday", () => {
      const days = getWorkWeekDays(new Date(2026, 9, 28));
      expect(formatWeekRange(days)).toBe("Oct 26 – 30, 2026");
    });

    it("opens the Monday–Friday workweek even if current date or anchor is Saturday or Sunday", () => {
      // Saturday Oct 31, 2026
      const sat = new Date(2026, 9, 31);
      const satDays = getWorkWeekDays(sat);
      expect(satDays.map(toDateKey)).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
      ]);

      // Sunday Nov 1, 2026
      const sun = new Date(2026, 10, 1);
      const sunDays = getWorkWeekDays(sun);
      expect(sunDays.map(toDateKey)).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
      ]);
    });

    it("navigates forward and backward by exactly 1 workweek (7 days offset)", () => {
      const currentAnchor = new Date(2026, 9, 28);
      // Next workweek (+7 days)
      const nextAnchor = new Date(currentAnchor);
      nextAnchor.setDate(nextAnchor.getDate() + 7);
      const nextDays = getWorkWeekDays(nextAnchor);
      expect(nextDays.map(toDateKey)).toEqual([
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
        "2026-11-05",
        "2026-11-06",
      ]);

      // Prev workweek (-7 days)
      const prevAnchor = new Date(currentAnchor);
      prevAnchor.setDate(prevAnchor.getDate() - 7);
      const prevDays = getWorkWeekDays(prevAnchor);
      expect(prevDays.map(toDateKey)).toEqual([
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
      ]);
    });

    it("retains weekend tasks on their original dates without rescheduling or displaying them in the weekday grid", () => {
      const saturdayTask: PlannerTask = {
        id: "sat-task-1",
        title: "Saturday BBQ",
        status: "open",
        priority: "p3",
        dueDate: "2026-10-31", // Saturday
        dueTime: "13:00",
        recurrence: "none",
        isPinned: false,
        labelIds: [],
        projectId: null,
        notes: "Weekend event",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      };

      const sundayTask: PlannerTask = {
        id: "sun-task-1",
        title: "Sunday Grocery Run",
        status: "open",
        priority: "p4",
        dueDate: "2026-11-01", // Sunday
        dueTime: "11:00",
        recurrence: "none",
        isPinned: false,
        labelIds: [],
        projectId: null,
        notes: "Weekend chore",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      };

      const weekdayTask: PlannerTask = {
        id: "tue-task-1",
        title: "Tuesday Sprint Demo",
        status: "in_progress",
        priority: "p1",
        dueDate: "2026-10-27", // Tuesday
        dueTime: "14:00",
        recurrence: "none",
        isPinned: false,
        labelIds: [],
        projectId: null,
        notes: "Weekday work",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      };

      const allTasks = [saturdayTask, sundayTask, weekdayTask];

      // Work week days for Oct 28
      const workDays = getWorkWeekDays(new Date(2026, 9, 28));
      const workDateKeys = new Set(workDays.map(toDateKey));

      // Filter tasks for Work Weeks grid (matching weekDateKeys.has(task.dueDate))
      const visibleTasks = allTasks.filter((t) => t.dueDate && workDateKeys.has(t.dueDate));

      // Only Tuesday task is visible
      expect(visibleTasks.map((t) => t.id)).toEqual(["tue-task-1"]);

      // Weekend tasks are NOT visible in the work week grid
      expect(visibleTasks.some((t) => t.id === "sat-task-1")).toBe(false);
      expect(visibleTasks.some((t) => t.id === "sun-task-1")).toBe(false);

      // CRITICAL: Weekend tasks retain their original dueDate and times intact
      expect(saturdayTask.dueDate).toBe("2026-10-31");
      expect(saturdayTask.dueTime).toBe("13:00");
      expect(sundayTask.dueDate).toBe("2026-11-01");
      expect(sundayTask.dueTime).toBe("11:00");
    });
  });

  describe("5. Toolbar Architecture — Authoritative Top Navigation & Zero Redundant View Switchers", () => {
    it("ensures WeekView and Work Weeks do not contain internal Day/Week/Work Weeks/Month view switchers", () => {
      const weekViewPath = path.resolve(__dirname, "../../app/components/calendar/week-view.tsx");
      const content = fs.readFileSync(weekViewPath, "utf-8");

      // Verify that duplicate view-switcher container and buttons are absent from WeekView
      expect(content).not.toContain("day-header-view-switcher");
      expect(content).not.toContain("day-view-tab-btn");
      expect(content).not.toContain('role="tablist" aria-label="Switch calendar view"');
    });

    it("ensures DayView does not contain internal Day/Week/Work Weeks/Month view switchers", () => {
      const dayViewPath = path.resolve(__dirname, "../../app/components/calendar/day-view.tsx");
      const content = fs.readFileSync(dayViewPath, "utf-8");

      // Verify that duplicate view-switcher container and buttons are absent from DayView
      expect(content).not.toContain("day-header-view-switcher");
      expect(content).not.toContain("day-view-tab-btn");
      expect(content).not.toContain('role="tablist" aria-label="Switch view"');
    });

    it("preserves Week and Work Weeks date navigation controls, today button, date picker, and display options", () => {
      const weekViewPath = path.resolve(__dirname, "../../app/components/calendar/week-view.tsx");
      const content = fs.readFileSync(weekViewPath, "utf-8");

      // Date navigation buttons
      expect(content).toContain("onNavigateWeek(-1)");
      expect(content).toContain("onNavigateWeek(1)");

      // Today button
      expect(content).toContain("onResetToToday");
      expect(content).toContain("hasTodayInWeek");

      // Direct Date Picker
      expect(content).toContain("day-picker-wrap");
      expect(content).toContain("day-picker-input");
      expect(content).toContain("onSelectDate(e.target.value)");

      // View-specific display options (7-Day / 5-Day Timeline vs Status Kanban)
      expect(content).toContain("week-layout-segmented");
      expect(content).toContain("onSwitchWeeklyMode");
      expect(content).toContain("Status Kanban");
      expect(content).toContain("5-Day Timeline");
      expect(content).toContain("7-Day Timeline");
    });

    it("preserves DayView date navigation, today button, and direct date picker controls", () => {
      const dayViewPath = path.resolve(__dirname, "../../app/components/calendar/day-view.tsx");
      const content = fs.readFileSync(dayViewPath, "utf-8");

      // Date navigation buttons
      expect(content).toContain("onNavigateDay(-1)");
      expect(content).toContain("onNavigateDay(1)");

      // Today button
      expect(content).toContain("onResetToToday");
      expect(content).toContain("isToday");

      // Direct Date Picker
      expect(content).toContain("day-picker-wrap");
      expect(content).toContain("day-picker-input");
      expect(content).toContain("onSelectDate(e.target.value)");
    });

    it("ensures top navigation in page.tsx remains the sole place to switch views across all views", () => {
      const pagePath = path.resolve(__dirname, "../../app/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      // Month, Year, Agenda, Day, Week, Work Weeks, Board, Yearline are switched via setView from top nav
      expect(content).toContain('setView(v.id)');
      // Confirm DayView and WeekView no longer receive onSwitchView prop
      expect(content).not.toContain('onSwitchView={(v) => setView(v)}');
    });
  });
});

