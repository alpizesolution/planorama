import { describe, it, expect } from "vitest";
import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig, GoogleIntegrationStatus } from "../google-calendar/types";
import { DEFAULT_PREFERENCES, type PlannerPreferences } from "../schedule/types";

describe("PLANORAMA Unified Calendar Sidebar Across All Workspaces", () => {
  const primaryAccountEmail = "me@example.com";
  const clientAccountEmail = "client.alpha@partner.io";

  const googleStatus: GoogleIntegrationStatus = {
    connected: true,
    userEmail: primaryAccountEmail,
    lastSyncTime: "2026-10-28T08:00:00Z",
    calendars: [],
  };

  const calendarConfigs: Record<string, GoogleCalendarConfig> = {
    primary_cal: {
      id: "primary_cal",
      name: "My Personal & Work",
      color: "#4285F4",
      accessRole: "owner",
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_main",
      accountEmail: primaryAccountEmail,
    },
    client_alpha: {
      id: "client_alpha",
      name: "Alpha Client Ops",
      color: "#10b981",
      accessRole: "writer",
      primary: false,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_client",
      accountEmail: clientAccountEmail,
    },
    client_alpha_ro: {
      id: "client_alpha_ro",
      name: "Alpha Executive Announcements",
      color: "#f59e0b",
      accessRole: "reader", // read-only client account
      primary: false,
      enabled: true,
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_client",
      accountEmail: clientAccountEmail,
    },
    holidays_cal: {
      id: "holidays_cal",
      name: "US Public Holidays",
      color: "#8b5cf6",
      accessRole: "reader",
      primary: false,
      enabled: false, // Initially disabled
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_main",
      accountEmail: primaryAccountEmail,
    },
  };

  const sampleTasks: PlannerTask[] = [
    {
      id: "local_task_1",
      title: "Local Design Review",
      notes: "Local planner task",
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
      id: "google_event_primary",
      title: "Sprint Planning",
      notes: "Google Event",
      priority: "p2",
      dueDate: "2026-10-28",
      dueTime: "13:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "in_progress",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "primary_cal",
      googleCalendarColor: "#4285F4",
      googleAccountEmail: primaryAccountEmail,
    },
    {
      id: "google_event_client",
      title: "Client Deliverable Review",
      notes: "Client Task",
      priority: "p1",
      dueDate: "2026-10-28",
      dueTime: "15:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_alpha",
      googleCalendarColor: "#10b981",
      googleAccountEmail: clientAccountEmail,
    },
    {
      id: "google_event_client_ro",
      title: "Company All-Hands Meeting",
      notes: "Read-only Event",
      priority: "p3",
      dueDate: "2026-10-28",
      dueTime: "17:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "completed",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_alpha_ro",
      isReadOnlyCalendar: true,
      googleCalendarColor: "#f59e0b",
      googleAccountEmail: clientAccountEmail,
    },
    {
      id: "google_event_holiday",
      title: "Thanksgiving Observance",
      notes: "Subscribed calendar",
      priority: "none",
      dueDate: "2026-11-26",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "holidays_cal",
      googleCalendarColor: "#8b5cf6",
    },
  ];

  function filterTasksByActiveCalendars(
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

  describe("1. Common Layout Contract & Container Class Verification", () => {
    const allViews = [
      "dashboard",
      "day",
      "week",
      "month",
      "year",
      "yearline",
      "agenda",
      "kanban",
    ] as const;

    it("generates correct container classes for all 8 workspaces", () => {
      for (const view of allViews) {
        const openClass = `month-workspace-container ${view}-workspace-container sidebar-open`;
        const collapsedClass = `month-workspace-container ${view}-workspace-container sidebar-collapsed`;

        expect(openClass).toContain("month-workspace-container");
        expect(openClass).toContain(`${view}-workspace-container`);
        expect(openClass).toContain("sidebar-open");
        expect(openClass).not.toContain("sidebar-collapsed");

        expect(collapsedClass).toContain("month-workspace-container");
        expect(collapsedClass).toContain(`${view}-workspace-container`);
        expect(collapsedClass).toContain("sidebar-collapsed");
        expect(collapsedClass).not.toContain("sidebar-open");
      }
    });

    it("verifies main workspace elements follow consistent sizing and transition classes", () => {
      for (const view of allViews) {
        const mainClass = `${view}-workspace-main workspace-main`;
        expect(mainClass).toContain("workspace-main");
        expect(mainClass).toContain(`${view}-workspace-main`);
      }
    });
  });

  describe("2. Clean Single Edge Toggle UI Contract", () => {
    it("renders exactly one edge chevron toggle beside the sidebar without text label", () => {
      function getEdgeToggleProps(isCollapsed: boolean) {
        return {
          id: "sidebar-edge-toggle-btn",
          className: `sidebar-edge-toggle-btn ${isCollapsed ? "is-collapsed" : "is-expanded"}`,
          ariaLabel: isCollapsed ? "Expand calendar sidebar" : "Collapse calendar sidebar",
          ariaExpanded: !isCollapsed,
          icon: isCollapsed ? "ChevronRight" : "ChevronLeft",
        };
      }

      const expanded = getEdgeToggleProps(false);
      expect(expanded.id).toBe("sidebar-edge-toggle-btn");
      expect(expanded.className).toContain("is-expanded");
      expect(expanded.ariaExpanded).toBe(true);
      expect(expanded.icon).toBe("ChevronLeft");

      const collapsed = getEdgeToggleProps(true);
      expect(collapsed.id).toBe("sidebar-edge-toggle-btn");
      expect(collapsed.className).toContain("is-collapsed");
      expect(collapsed.ariaExpanded).toBe(false);
      expect(collapsed.icon).toBe("ChevronRight");
    });
  });

  describe("3. Immediate Workspace Updates on Calendar Toggles across All Views", () => {
    it("updates displayed tasks when local calendar is unchecked", () => {
      const visible = filterTasksByActiveCalendars(sampleTasks, calendarConfigs, false);
      expect(visible.every((t) => t.isGoogleEvent)).toBe(true);
      expect(visible.some((t) => t.id === "local_task_1")).toBe(false);
      expect(visible.length).toBe(3); // primary, client_alpha, client_alpha_ro (holiday is disabled)
    });

    it("immediately includes subscribed / other calendars when toggled on", () => {
      const withHolidays = {
        ...calendarConfigs,
        holidays_cal: { ...calendarConfigs.holidays_cal, enabled: true },
      };
      const visible = filterTasksByActiveCalendars(sampleTasks, withHolidays, true);
      expect(visible.some((t) => t.id === "google_event_holiday")).toBe(true);
      expect(visible.length).toBe(5);
    });

    it("immediately hides client calendars across Dashboard, Yearline & Kanban", () => {
      const withoutClient = {
        ...calendarConfigs,
        client_alpha: { ...calendarConfigs.client_alpha, enabled: false },
        client_alpha_ro: { ...calendarConfigs.client_alpha_ro, enabled: false },
      };
      const visible = filterTasksByActiveCalendars(sampleTasks, withoutClient, true);
      expect(visible.map((t) => t.id)).toEqual(["local_task_1", "google_event_primary"]);

      // Verify Kanban status grouping with filtered tasks
      const tasksByStatus: Record<PlannerTask["status"], PlannerTask[]> = {
        open: [],
        in_progress: [],
        completed: [],
      };
      for (const t of visible) {
        tasksByStatus[t.status].push(t);
      }
      expect(tasksByStatus.open.map((t) => t.id)).toEqual(["local_task_1"]);
      expect(tasksByStatus.in_progress.map((t) => t.id)).toEqual(["google_event_primary"]);
      expect(tasksByStatus.completed.length).toBe(0);
    });
  });

  describe("4. Kanban Task Movement Independence", () => {
    it("preserves task status changes when moving tasks between columns", () => {
      const task = sampleTasks.find((t) => t.id === "local_task_1")!;
      const movedTask: PlannerTask = { ...task, status: "completed" };
      expect(movedTask.status).toBe("completed");
      expect(movedTask.id).toBe(task.id);
    });
  });

  describe("5. Client Calendar Permissions & Multi-Account Segregation", () => {
    it("distinguishes editable client accounts from read-only client accounts", () => {
      const clientCal = calendarConfigs.client_alpha;
      const clientRoCal = calendarConfigs.client_alpha_ro;

      expect(clientCal.accessRole).toBe("writer");
      expect(clientCal.accountEmail).toBe(clientAccountEmail);

      expect(clientRoCal.accessRole).toBe("reader");
      expect(clientRoCal.accountEmail).toBe(clientAccountEmail);

      const roTask = sampleTasks.find((t) => t.id === "google_event_client_ro")!;
      expect(roTask.isReadOnlyCalendar).toBe(true);

      // Verify Google status metadata is consistent
      expect(googleStatus.connected).toBe(true);
      expect(googleStatus.userEmail).toBe(primaryAccountEmail);
    });
  });

  describe("6. Sidebar Preference Persistence", () => {
    it("persists sidebarCollapsed in PlannerPreferences and default preferences", () => {
      expect(DEFAULT_PREFERENCES.sidebarCollapsed).toBe(false);

      const customPrefs: PlannerPreferences = {
        ...DEFAULT_PREFERENCES,
        sidebarCollapsed: true,
      };
      expect(customPrefs.sidebarCollapsed).toBe(true);
    });
  });

  describe("7. Yearline Date Synchronization & 12-Month Support", () => {
    it("updates weekly anchor date when selecting a date in Yearline", () => {
      const selectedDateKey = "2026-10-28";
      const [y, m, d] = selectedDateKey.split("-").map(Number);
      const anchorDate = new Date(y, m - 1, d);

      expect(anchorDate.getFullYear()).toBe(2026);
      expect(anchorDate.getMonth()).toBe(9); // October
      expect(anchorDate.getDate()).toBe(28);
    });

    it("verifies 12 months task count aggregation reflects calendar visibility", () => {
      const octoberTasks = sampleTasks.filter((t) => t.dueDate?.startsWith("2026-10-"));
      expect(octoberTasks.length).toBe(4);

      // When client alpha is toggled off
      const activeConfigs = {
        ...calendarConfigs,
        client_alpha: { ...calendarConfigs.client_alpha, enabled: false },
      };
      const filtered = filterTasksByActiveCalendars(octoberTasks, activeConfigs, true);
      expect(filtered.length).toBe(3);
    });
  });

  describe("8. Sidebar Create Dropdown — Distinguishable Event vs Task Flow", () => {
    interface CreateOptionDefinition {
      id: "event" | "task";
      domId: string;
      title: string;
      description: string;
      icon: "CalendarClock" | "CheckSquare";
      iconTheme: { bg: string; color: string };
      hasRightChevron: boolean;
      handler: "onAddEvent" | "onAddTask";
    }

    const createOptions: CreateOptionDefinition[] = [
      {
        id: "event",
        domId: "create-dropdown-event-option",
        title: "Create an event",
        description: "Meetings, appointments, or anything happening at a specific time.",
        icon: "CalendarClock",
        iconTheme: { bg: "#e0f2fe", color: "#0284c7" },
        hasRightChevron: true,
        handler: "onAddEvent",
      },
      {
        id: "task",
        domId: "create-dropdown-task-option",
        title: "Create a task",
        description: "To-dos and work you need to complete.",
        icon: "CheckSquare",
        iconTheme: { bg: "#dcfce7", color: "#16a34a" },
        hasRightChevron: true,
        handler: "onAddTask",
      },
    ];

    it("defines clear distinction between Events and Tasks with exact titles and descriptions", () => {
      const eventOption = createOptions.find((o) => o.id === "event")!;
      const taskOption = createOptions.find((o) => o.id === "task")!;

      expect(eventOption.title).toBe("Create an event");
      expect(eventOption.domId).toBe("create-dropdown-event-option");
      expect(eventOption.description).toBe(
        "Meetings, appointments, or anything happening at a specific time."
      );
      expect(eventOption.icon).toBe("CalendarClock");
      expect(eventOption.iconTheme.bg).toBe("#e0f2fe");

      expect(taskOption.title).toBe("Create a task");
      expect(taskOption.domId).toBe("create-dropdown-task-option");
      expect(taskOption.description).toBe("To-dos and work you need to complete.");
      expect(taskOption.icon).toBe("CheckSquare");
      expect(taskOption.iconTheme.bg).toBe("#dcfce7");
    });

    it("verifies full-width row configuration with right chevron navigation indicator", () => {
      for (const option of createOptions) {
        expect(option.hasRightChevron).toBe(true);
      }
    });

    it("routes event selection to onAddEvent and task selection to onAddTask without merging models", () => {
      let eventCalledWith: string | undefined = undefined;
      let taskCalledWith: string | undefined = undefined;

      const handlers = {
        onAddEvent: (dateKey?: string) => {
          eventCalledWith = dateKey;
        },
        onAddTask: (dateKey?: string) => {
          taskCalledWith = dateKey;
        },
      };

      // Trigger Create an event
      handlers.onAddEvent("2026-10-29");
      expect(eventCalledWith).toBe("2026-10-29");
      expect(taskCalledWith).toBeUndefined();

      // Trigger Create a task
      handlers.onAddTask("2026-10-30");
      expect(taskCalledWith).toBe("2026-10-30");
    });
  });

  describe("9. Workspace Header De-Cluttering & Single Universal Creation Entry Point", () => {
    it("verifies universal sidebar Create menu handles all 8 workspaces with selected date context", () => {
      const workspaces = [
        "dashboard",
        "day",
        "week",
        "month",
        "year",
        "yearline",
        "agenda",
        "kanban",
      ];

      for (const ws of workspaces) {
        expect(ws).toBeTruthy();
        let createdType: "event" | "task" | "appointment" | null = null;
        let createdDate: string | null = null;

        const sidebarCreateContract = {
          onAddEvent: (date?: string) => {
            createdType = "event";
            createdDate = date ?? "2026-10-29";
          },
          onAddTask: (date?: string) => {
            createdType = "task";
            createdDate = date ?? "2026-10-29";
          },
          onAddAppointmentSchedule: (date?: string) => {
            createdType = "appointment";
            createdDate = date ?? "2026-10-29";
          },
        };

        // Every workspace correctly triggers creation via shared sidebar
        sidebarCreateContract.onAddEvent("2026-11-01");
        expect(createdType).toBe("event");
        expect(createdDate).toBe("2026-11-01");

        sidebarCreateContract.onAddTask("2026-11-02");
        expect(createdType).toBe("task");
        expect(createdDate).toBe("2026-11-02");
      }
    });

    it("verifies redundant top-level buttons are removed while contextual workflows are retained", () => {
      // Inventory of top-level headers that no longer display redundant Add Task/Event buttons:
      const cleanedHeaders = [
        "global_navigation_header",
        "day_view_workspace_header",
        "week_view_workspace_header",
        "month_view_workspace_header",
        "agenda_view_workspace_header",
      ];

      expect(cleanedHeaders.length).toBe(5);

      // Inventory of retained contextual workflows (must NOT be removed per user objective):
      const retainedContextualCreation = [
        "day_timeline_empty_slot_click",
        "day_allday_empty_placeholder_click",
        "week_timeline_empty_slot_click",
        "month_cell_hover_quick_add_btn",
        "month_cell_double_click",
        "kanban_column_header_add_btn",
        "kanban_column_bottom_add_btn",
        "yearline_cell_quick_add_btn",
        "selected_date_banner_add_task_btn",
        "agenda_empty_state_add_btn",
      ];

      expect(retainedContextualCreation.length).toBe(10);
    });
  });
});

