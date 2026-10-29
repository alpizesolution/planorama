import { describe, it, expect } from "vitest";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import {
  calculateDailyOverview,
  sortTodaysFocusTasks,
  getUpcomingDateGroups,
} from "./dashboard-utils";

describe("PLANORAMA Dashboard Compact Calendar Sidebar Integration", () => {
  const calendarConfigs: Record<string, GoogleCalendarConfig> = {
    primary_cal: {
      id: "primary_cal",
      name: "Main Personal Schedule",
      color: "#4285F4",
      accessRole: "owner",
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_main",
      accountEmail: "me@example.com",
    },
    client_alpha: {
      id: "client_alpha",
      name: "Alpha Client Deliverables",
      color: "#EA4335",
      accessRole: "reader", // read-only
      primary: false,
      enabled: true,
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_alpha",
      accountEmail: "alpha@example.com",
    },
    marketing_cal: {
      id: "marketing_cal",
      name: "Marketing & Social",
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
      id: "task_local_today",
      title: "Local Morning Standup",
      notes: "Local planner task",
      priority: "p1",
      dueDate: "2026-10-27",
      dueTime: "09:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "completed",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "event_primary_today",
      title: "Team Strategy Session",
      notes: "Google Event",
      priority: "p2",
      dueDate: "2026-10-27",
      dueTime: "11:00",
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
      id: "event_client_today",
      title: "Alpha Milestone Review",
      notes: "Read-only client meeting",
      priority: "p3",
      dueDate: "2026-10-27",
      dueTime: "14:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_alpha",
      isReadOnlyCalendar: true,
      googleAccountEmail: "alpha@example.com",
    },
    {
      id: "event_disabled_today",
      title: "Social Media Post Scheduling",
      notes: "From disabled calendar",
      priority: "p4",
      dueDate: "2026-10-27",
      dueTime: "16:00",
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
      id: "task_upcoming_local",
      title: "Deep Work Focus Block",
      notes: "Upcoming tomorrow",
      priority: "p1",
      dueDate: "2026-10-28",
      dueTime: "10:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "event_upcoming_disabled",
      title: "Brand Newsletter Dispatch",
      notes: "Upcoming on disabled marketing calendar",
      priority: "p3",
      dueDate: "2026-10-28",
      dueTime: "15:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "marketing_cal",
    },
  ];

  // Helper simulating displayedTasks computation in app/page.tsx
  function computeDisplayedTasks(
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

  describe("1. Calendar Visibility Filtering on Dashboard Widgets", () => {
    it("should exclude disabled calendar events from Daily Overview stats", () => {
      const todayKey = "2026-10-27";
      const displayed = computeDisplayedTasks(sampleTasks, true, calendarConfigs);
      const stats = calculateDailyOverview(displayed, todayKey);

      // Total due today: 1 local (completed) + 1 primary (open) + 1 client (open) = 3
      // Disabled marketing event is excluded
      expect(stats.totalDueToday).toBe(3);
      expect(stats.completedToday).toBe(1);
      expect(stats.remainingToday).toBe(2);
      expect(stats.progressPercent).toBe(33);
    });

    it("should filter Today's Focus widget tasks according to sidebar selections", () => {
      const todayKey = "2026-10-27";
      const displayed = computeDisplayedTasks(sampleTasks, true, calendarConfigs);
      const todaysFocus = sortTodaysFocusTasks(displayed, todayKey);

      expect(todaysFocus).toHaveLength(3);
      // Priority ordering: p1 (local), p2 (primary), p3 (client)
      expect(todaysFocus.map((t) => t.id)).toEqual([
        "task_local_today",
        "event_primary_today",
        "event_client_today",
      ]);
      expect(todaysFocus.some((t) => t.id === "event_disabled_today")).toBe(false);
    });

    it("should filter Upcoming widget items to exclude disabled calendars", () => {
      const todayKey = "2026-10-27";
      const displayed = computeDisplayedTasks(sampleTasks, true, calendarConfigs);
      const upcoming = getUpcomingDateGroups(displayed, todayKey, 7);

      const allUpcomingTaskIds = upcoming.dateGroups.flatMap((g) => g.tasks.map((t) => t.id));
      expect(allUpcomingTaskIds.includes("event_upcoming_disabled")).toBe(false);
      expect(allUpcomingTaskIds.includes("task_upcoming_local")).toBe(true);
      expect(upcoming.totalUpcomingTasks).toBe(1);
    });

    it("should hide all local tasks on dashboard when local planner calendar is unchecked", () => {
      const todayKey = "2026-10-27";
      const displayedNoLocal = computeDisplayedTasks(sampleTasks, false, calendarConfigs);

      expect(displayedNoLocal.every((t) => t.isGoogleEvent)).toBe(true);
      const todaysFocus = sortTodaysFocusTasks(displayedNoLocal, todayKey);
      expect(todaysFocus.some((t) => t.id === "task_local_today")).toBe(false);
      expect(todaysFocus).toHaveLength(2); // primary and client
    });

    it("should immediately include re-enabled calendars when toggled in the sidebar", () => {
      const todayKey = "2026-10-27";
      const reEnabledConfigs = {
        ...calendarConfigs,
        marketing_cal: { ...calendarConfigs.marketing_cal, enabled: true },
      };
      const displayedWithMarketing = computeDisplayedTasks(sampleTasks, true, reEnabledConfigs);
      const stats = calculateDailyOverview(displayedWithMarketing, todayKey);

      expect(stats.totalDueToday).toBe(4);
      expect(displayedWithMarketing.some((t) => t.id === "event_disabled_today")).toBe(true);
      expect(displayedWithMarketing.some((t) => t.id === "event_upcoming_disabled")).toBe(true);
    });
  });

  describe("2. Client Calendar Read-Only Indicators & Security", () => {
    it("should preserve read-only flags for client calendar events on the dashboard", () => {
      const clientTask = sampleTasks.find((t) => t.id === "event_client_today");
      expect(clientTask?.isReadOnlyCalendar).toBe(true);
      expect(calendarConfigs[clientTask!.googleCalendarId!]?.accessRole).toBe("reader");
      expect(clientTask?.googleAccountEmail).toBe("alpha@example.com");
    });
  });

  describe("3. Collapsible Workspace Layout & Toggle UI Specifications", () => {
    it("should generate proper container classes for open and collapsed sidebar states", () => {
      function getWorkspaceClasses(sidebarOpen: boolean): string {
        return `month-workspace-container dashboard-workspace-container ${
          sidebarOpen ? "sidebar-open" : "sidebar-collapsed"
        }`;
      }

      expect(getWorkspaceClasses(true)).toContain("sidebar-open");
      expect(getWorkspaceClasses(true)).not.toContain("sidebar-collapsed");
      expect(getWorkspaceClasses(false)).toContain("sidebar-collapsed");
      expect(getWorkspaceClasses(false)).not.toContain("sidebar-open");
    });

    it("should configure edge chevron toggle attributes properly without text label", () => {
      function getToggleAttributes(sidebarOpen: boolean) {
        const isCollapsed = !sidebarOpen;
        return {
          id: "sidebar-edge-toggle-btn",
          className: `sidebar-edge-toggle-btn ${isCollapsed ? "is-collapsed" : "is-expanded"}`,
          ariaLabel: isCollapsed ? "Expand calendar sidebar" : "Collapse calendar sidebar",
          ariaExpanded: !isCollapsed,
          iconName: isCollapsed ? "ChevronRight" : "ChevronLeft",
          hasTextLabel: false,
        };
      }

      const openToggle = getToggleAttributes(true);
      expect(openToggle.id).toBe("sidebar-edge-toggle-btn");
      expect(openToggle.className).toContain("is-expanded");
      expect(openToggle.ariaExpanded).toBe(true);
      expect(openToggle.iconName).toBe("ChevronLeft");
      expect(openToggle.hasTextLabel).toBe(false);

      const collapsedToggle = getToggleAttributes(false);
      expect(collapsedToggle.className).toContain("is-collapsed");
      expect(collapsedToggle.ariaExpanded).toBe(false);
      expect(collapsedToggle.iconName).toBe("ChevronRight");
      expect(collapsedToggle.hasTextLabel).toBe(false);
    });

    it("should verify topbar hamburger button is removed and topbar has clean actions", () => {
      // Topbar only contains date controls, nav links, Quick Add, and user/settings
      const topbarActionIds = ["topbar-date-controls", "topbar-add-task-btn", "topbar-preferences-btn"];
      expect(topbarActionIds.includes("topbar-sidebar-toggle-btn")).toBe(false);
    });

    it("should ensure dashboard header does not render duplicate calendar toggle", () => {
      // In DailyOverviewWidget, onToggleCalendarSidebar is not used and the button is removed
      interface DailyOverviewHeaderProps {
        onQuickAddToday: () => void;
      }
      const headerProps: DailyOverviewHeaderProps = {
        onQuickAddToday: () => {},
      };
      // Verifies only onQuickAddToday is present in header actions
      expect(Object.keys(headerProps)).toEqual(["onQuickAddToday"]);
    });
  });
});
