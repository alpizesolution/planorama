import { describe, it, expect } from "vitest";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";

describe("PLANORAMA Month Workspace & VA Calendar Integration", () => {
  // Test data fixtures
  const personalAccountEmail = "va-planner@example.com";
  const clientAlphaEmail = "client.alpha@acmecorp.com";
  const clientBetaEmail = "client.beta@ventures.io";

  const calendarConfigs: Record<string, GoogleCalendarConfig> = {
    primary_cal: {
      id: "primary_cal",
      name: "VA Personal / Primary",
      color: "#4285F4",
      accessRole: "owner",
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_va_personal",
      accountEmail: personalAccountEmail,
    },
    client_alpha_main: {
      id: "client_alpha_main",
      name: "Acme Corp Executive Schedule",
      color: "#EA4335",
      accessRole: "writer", // VA has write access
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_client_alpha",
      accountEmail: clientAlphaEmail,
    },
    client_alpha_read_only: {
      id: "client_alpha_read_only",
      name: "Acme Corp All-Hands (Read-Only)",
      color: "#FBBC05",
      accessRole: "reader", // VA has read-only access
      primary: false,
      enabled: true,
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_client_alpha",
      accountEmail: clientAlphaEmail,
    },
    client_beta_board: {
      id: "client_beta_board",
      name: "Beta Ventures Board Meetings",
      color: "#34A853",
      accessRole: "freeBusyReader", // VA has free/busy only
      primary: false,
      enabled: false, // Initially toggled off
      syncDirection: "import_only",
      privacyMode: "availability_only",
      accountId: "acc_client_beta",
      accountEmail: clientBetaEmail,
    },
  };

  const sampleTasks: PlannerTask[] = [
    {
      id: "local_task_1",
      title: "Review daily habit tracker",
      notes: "Local personal task",
      priority: "p2",
      dueDate: "2026-10-26",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-26T08:00:00Z",
      updatedAt: "2026-10-26T08:00:00Z",
      source: "local",
    },
    {
      id: "va_primary_event",
      title: "Planorama Team Sync",
      notes: "Internal sync",
      priority: "p1",
      dueDate: "2026-10-26",
      dueTime: "10:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-26T08:00:00Z",
      updatedAt: "2026-10-26T08:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "primary_cal",
      googleCalendarName: "VA Personal / Primary",
      googleCalendarColor: "#4285F4",
      googleAccountEmail: personalAccountEmail,
      source: "google",
    },
    {
      id: "client_alpha_meeting",
      title: "Quarterly Strategy Review with Acme CEO",
      notes: "VIP Client Meeting",
      priority: "p1",
      dueDate: "2026-10-26",
      dueTime: "14:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-26T08:00:00Z",
      updatedAt: "2026-10-26T08:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_alpha_main",
      googleCalendarName: "Acme Corp Executive Schedule",
      googleCalendarColor: "#EA4335",
      googleAccountEmail: clientAlphaEmail,
      source: "google",
    },
    {
      id: "client_alpha_ro_event",
      title: "Company-Wide Town Hall",
      notes: "Read-only broadcast",
      priority: "p3",
      dueDate: "2026-10-27",
      dueTime: "16:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-26T08:00:00Z",
      updatedAt: "2026-10-26T08:00:00Z",
      isGoogleEvent: true,
      isReadOnlyCalendar: true,
      googleCalendarId: "client_alpha_read_only",
      googleCalendarName: "Acme Corp All-Hands (Read-Only)",
      googleCalendarColor: "#FBBC05",
      googleAccountEmail: clientAlphaEmail,
      source: "google",
    },
    {
      id: "client_beta_board_event",
      title: "Beta Ventures Board Meeting",
      notes: "Confidential board meeting",
      priority: "p1",
      dueDate: "2026-10-28",
      dueTime: "09:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-26T08:00:00Z",
      updatedAt: "2026-10-26T08:00:00Z",
      isGoogleEvent: true,
      isReadOnlyCalendar: true,
      googleCalendarId: "client_beta_board",
      googleCalendarName: "Beta Ventures Board Meetings",
      googleCalendarColor: "#34A853",
      googleAccountEmail: clientBetaEmail,
      source: "google",
    },
  ];

  it("1. Separates My Calendars from Client Calendars and Other Calendars correctly", () => {
    const allConfigs = Object.values(calendarConfigs);

    // My Calendars: primary account or account where email matches personalAccountEmail
    const myCalendars = allConfigs.filter(
      (c) => c.primary || c.accountEmail === personalAccountEmail
    );
    expect(myCalendars.map((c) => c.id)).toContain("primary_cal");

    // Client Calendars: non-primary accounts belonging to connected clients
    const clientCalendars = allConfigs.filter(
      (c) => c.accountEmail && c.accountEmail !== personalAccountEmail
    );
    expect(clientCalendars.map((c) => c.id)).toEqual([
      "client_alpha_main",
      "client_alpha_read_only",
      "client_beta_board",
    ]);

    // Check account grouping
    const clientsByEmail = new Map<string, GoogleCalendarConfig[]>();
    for (const cal of clientCalendars) {
      const email = cal.accountEmail!;
      const list = clientsByEmail.get(email) || [];
      list.push(cal);
      clientsByEmail.set(email, list);
    }

    expect(clientsByEmail.size).toBe(2);
    expect(clientsByEmail.get(clientAlphaEmail)?.length).toBe(2);
    expect(clientsByEmail.get(clientBetaEmail)?.length).toBe(1);
  });

  it("2. Accurately identifies VA access roles (owner/writer vs read-only)", () => {
    // Owner / Writer = full editing permissions
    const editableCalendars = Object.values(calendarConfigs).filter(
      (c) => c.accessRole === "owner" || c.accessRole === "writer"
    );
    expect(editableCalendars.map((c) => c.id)).toEqual(["primary_cal", "client_alpha_main"]);

    // Reader / FreeBusyReader = read-only permission badges
    const readOnlyCalendars = Object.values(calendarConfigs).filter(
      (c) => c.accessRole === "reader" || c.accessRole === "freeBusyReader"
    );
    expect(readOnlyCalendars.map((c) => c.id)).toEqual([
      "client_alpha_read_only",
      "client_beta_board",
    ]);
  });

  it("3. Correctly filters tasks when calendars are toggled on/off", () => {
    // When all enabled calendars are active and local calendar is enabled:
    const filterTasks = (localEnabled: boolean, configs: Record<string, GoogleCalendarConfig>) => {
      return sampleTasks.filter((task) => {
        if (!localEnabled && !task.isGoogleEvent && !task.googleCalendarId) {
          return false;
        }
        if (task.googleCalendarId && configs[task.googleCalendarId]?.enabled === false) {
          return false;
        }
        return true;
      });
    };

    // State A: Local enabled, Beta Ventures disabled
    const visibleA = filterTasks(true, calendarConfigs);
    expect(visibleA.map((t) => t.id)).toEqual([
      "local_task_1",
      "va_primary_event",
      "client_alpha_meeting",
      "client_alpha_ro_event",
    ]);
    expect(visibleA.map((t) => t.id)).not.toContain("client_beta_board_event");

    // State B: Local disabled (VA only wants to see client schedules)
    const visibleB = filterTasks(false, calendarConfigs);
    expect(visibleB.map((t) => t.id)).toEqual([
      "va_primary_event",
      "client_alpha_meeting",
      "client_alpha_ro_event",
    ]);
    expect(visibleB.map((t) => t.id)).not.toContain("local_task_1");

    // State C: VA turns off Client Alpha Main calendar
    const configsC = {
      ...calendarConfigs,
      client_alpha_main: { ...calendarConfigs.client_alpha_main, enabled: false },
    };
    const visibleC = filterTasks(true, configsC);
    expect(visibleC.map((t) => t.id)).not.toContain("client_alpha_meeting");
    expect(visibleC.map((t) => t.id)).toContain("client_alpha_ro_event");
  });

  it("4. Consistently associates events with configured calendar colors and client metadata", () => {
    for (const task of sampleTasks) {
      if (task.googleCalendarId) {
        const config = calendarConfigs[task.googleCalendarId];
        expect(config).toBeDefined();
        // Task color matches calendar configured color
        expect(task.googleCalendarColor).toBe(config.color);
        // Task account email matches calendar account email
        expect(task.googleAccountEmail).toBe(config.accountEmail);
      }
    }
  });

  it("5. Groups tasks by date without data loss for expanded month grid", () => {
    const tasksByDate = new Map<string, PlannerTask[]>();
    for (const task of sampleTasks) {
      if (task.dueDate) {
        const list = tasksByDate.get(task.dueDate) || [];
        list.push(task);
        tasksByDate.set(task.dueDate, list);
      }
    }

    expect(tasksByDate.get("2026-10-26")?.length).toBe(3);
    expect(tasksByDate.get("2026-10-27")?.length).toBe(1);
    expect(tasksByDate.get("2026-10-28")?.length).toBe(1);
  });
});
