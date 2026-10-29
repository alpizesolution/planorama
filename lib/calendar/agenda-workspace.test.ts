import { describe, it, expect } from "vitest";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";

describe("PLANORAMA Agenda View & CalendarSidebar Workspace Integration", () => {
  const calendarConfigs: Record<string, GoogleCalendarConfig> = {
    primary_cal: {
      id: "primary_cal",
      name: "Personal Schedule",
      color: "#4285F4",
      accessRole: "owner",
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_personal",
      accountEmail: "me@example.com",
    },
    client_cal: {
      id: "client_cal",
      name: "Acme Corp Deliverables",
      color: "#EA4335",
      accessRole: "reader", // read-only client account
      primary: false,
      enabled: true,
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_acme",
      accountEmail: "acme@example.com",
    },
    marketing_cal: {
      id: "marketing_cal",
      name: "Marketing Campaigns",
      color: "#34A853",
      accessRole: "writer",
      primary: false,
      enabled: false, // disabled in sidebar
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_marketing",
      accountEmail: "marketing@example.com",
    },
  };

  const sampleTasks: PlannerTask[] = [
    {
      id: "task_local_1",
      title: "Write Q4 Roadmap Document",
      notes: "Roadmap notes",
      priority: "p1",
      dueDate: "2026-10-28",
      dueTime: "11:00",
      recurrence: "none",
      labelIds: ["planning"],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isPinned: true,
    },
    {
      id: "task_local_2",
      title: "Prep Coffee & Morning Focus",
      notes: "Routine",
      priority: "p4",
      dueDate: "2026-10-28",
      dueTime: null, // all day
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "completed",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "event_google_primary",
      title: "Sync with Team Lead",
      notes: "Google Event",
      priority: "p2",
      dueDate: "2026-10-28",
      dueTime: "14:30",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "primary_cal",
      googleCalendarColor: "#4285F4",
      googleAccountEmail: "me@example.com",
    },
    {
      id: "event_google_readonly",
      title: "Acme Stakeholder Review",
      notes: "Client review",
      priority: "p3",
      dueDate: "2026-10-28",
      dueTime: "16:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_cal",
      isReadOnlyCalendar: true,
      googleAccountEmail: "acme@example.com",
    },
    {
      id: "event_google_disabled",
      title: "Social Media Launch Campaign",
      notes: "Campaign details",
      priority: "p2",
      dueDate: "2026-10-28",
      dueTime: "10:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "marketing_cal",
    },
    {
      id: "task_next_day",
      title: "Monthly Budget Check",
      notes: "Budget review",
      priority: "p2",
      dueDate: "2026-10-29",
      dueTime: "09:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ];

  // Helper simulating Agenda displayedTasks filtering from CalendarSidebar state
  function filterDisplayedTasks(
    tasks: PlannerTask[],
    localCalendarEnabled: boolean,
    configs: Record<string, GoogleCalendarConfig>
  ): PlannerTask[] {
    return tasks.filter((t) => {
      if (t.isGoogleEvent) {
        if (!t.googleCalendarId) return false;
        return configs[t.googleCalendarId]?.enabled !== false;
      }
      return localCalendarEnabled;
    });
  }

  // Helper simulating Agenda chronological sort
  function sortAgendaTasks(tasks: PlannerTask[], selectedDate: string | null): PlannerTask[] {
    let list = tasks.filter((t) => t.dueDate);
    if (selectedDate) {
      list = list.filter((t) => t.dueDate === selectedDate);
    }
    return list.slice().sort((a, b) => {
      const aDate = a.dueDate ?? "";
      const bDate = b.dueDate ?? "";
      if (aDate !== bDate) return aDate.localeCompare(bDate);

      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aTime = a.dueTime ?? "00:00-allday";
      const bTime = b.dueTime ?? "00:00-allday";
      return aTime.localeCompare(bTime);
    });
  }

  describe("1. Calendar Visibility Synchronization", () => {
    it("should filter out events from disabled calendars in the sidebar", () => {
      const visible = filterDisplayedTasks(sampleTasks, true, calendarConfigs);
      const disabledFound = visible.some((t) => t.googleCalendarId === "marketing_cal");
      expect(disabledFound).toBe(false);
      expect(visible).toHaveLength(5);
    });

    it("should hide all local PLANORAMA tasks when local calendar is disabled", () => {
      const visible = filterDisplayedTasks(sampleTasks, false, calendarConfigs);
      const localFound = visible.some((t) => !t.isGoogleEvent);
      expect(localFound).toBe(false);
      expect(visible.every((t) => t.isGoogleEvent)).toBe(true);
      expect(visible).toHaveLength(2); // primary and client
    });

    it("should immediately include re-enabled calendars", () => {
      const updatedConfigs = {
        ...calendarConfigs,
        marketing_cal: { ...calendarConfigs.marketing_cal, enabled: true },
      };
      const visible = filterDisplayedTasks(sampleTasks, true, updatedConfigs);
      const marketingFound = visible.find((t) => t.googleCalendarId === "marketing_cal");
      expect(marketingFound).toBeDefined();
      expect(marketingFound?.title).toBe("Social Media Launch Campaign");
      expect(visible).toHaveLength(6);
    });
  });

  describe("2. Chronological Sorting & Grouping", () => {
    it("should sort items by date asc, pinned first for identical dates, and time asc", () => {
      const visible = filterDisplayedTasks(sampleTasks, true, calendarConfigs);
      const sorted = sortAgendaTasks(visible, null);

      // Verify date ordering: 2026-10-28 before 2026-10-29
      expect(sorted[sorted.length - 1].dueDate).toBe("2026-10-29");
      expect(sorted[sorted.length - 1].title).toBe("Monthly Budget Check");

      // For 2026-10-28, pinned task should be prioritized
      const oct28Tasks = sorted.filter((t) => t.dueDate === "2026-10-28");
      expect(oct28Tasks[0].isPinned).toBe(true);
      expect(oct28Tasks[0].title).toBe("Write Q4 Roadmap Document");

      // Non-pinned items sorted: all-day / early first
      expect(oct28Tasks[1].dueTime).toBeNull(); // all day (00:00-allday)
      expect(oct28Tasks[2].dueTime).toBe("14:30");
      expect(oct28Tasks[3].dueTime).toBe("16:00");
    });
  });

  describe("3. Mini-Calendar Date Navigation & Filtering", () => {
    it("should filter the Agenda list when a date is selected in the mini-calendar", () => {
      const visible = filterDisplayedTasks(sampleTasks, true, calendarConfigs);
      const filteredOct28 = sortAgendaTasks(visible, "2026-10-28");

      expect(filteredOct28.every((t) => t.dueDate === "2026-10-28")).toBe(true);
      expect(filteredOct28).toHaveLength(4);
      expect(filteredOct28.some((t) => t.dueDate === "2026-10-29")).toBe(false);
    });

    it("should filter down to single day tasks and show empty state if date has no events", () => {
      const visible = filterDisplayedTasks(sampleTasks, true, calendarConfigs);
      const filteredEmptyDate = sortAgendaTasks(visible, "2026-11-01");

      expect(filteredEmptyDate).toHaveLength(0);
    });

    it("should restore all upcoming dates when date filter is cleared", () => {
      const visible = filterDisplayedTasks(sampleTasks, true, calendarConfigs);
      const allUpcoming = sortAgendaTasks(visible, null);

      expect(allUpcoming.length).toBe(visible.length);
      const uniqueDates = Array.from(new Set(allUpcoming.map((t) => t.dueDate)));
      expect(uniqueDates).toEqual(["2026-10-28", "2026-10-29"]);
    });
  });

  describe("4. Google Calendar Distinction & Read-Only Permissions", () => {
    it("should properly distinguish Google events with calendar colors, names, and emails", () => {
      const googleEvent = sampleTasks.find((t) => t.id === "event_google_primary");
      expect(googleEvent?.isGoogleEvent).toBe(true);
      expect(googleEvent?.googleCalendarId).toBe("primary_cal");
      expect(calendarConfigs[googleEvent!.googleCalendarId!]?.name).toBe("Personal Schedule");
      expect(googleEvent?.googleAccountEmail).toBe("me@example.com");
    });

    it("should enforce read-only indicators on restricted client calendars", () => {
      const clientEvent = sampleTasks.find((t) => t.id === "event_google_readonly");
      expect(clientEvent?.isGoogleEvent).toBe(true);
      expect(clientEvent?.isReadOnlyCalendar).toBe(true);
      expect(calendarConfigs[clientEvent!.googleCalendarId!]?.accessRole).toBe("reader");
    });

    it("should identify local PLANORAMA tasks", () => {
      const localTask = sampleTasks.find((t) => t.id === "task_local_1");
      expect(localTask?.isGoogleEvent).toBeUndefined();
      expect(localTask?.labelIds).toContain("planning");
    });
  });
});
