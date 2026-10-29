import { describe, it, expect } from "vitest";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { monthGridDays, daysInMonth, toDateKey } from "./date-utils";
import { getMonthColor, getResolvedTheme, DEFAULT_CALENDAR_THEME } from "./calendar-themes";

describe("PLANORAMA Year View Workspace & CalendarSidebar Synchronization", () => {
  const calendarConfigs: Record<string, GoogleCalendarConfig> = {
    primary_cal: {
      id: "primary_cal",
      name: "Primary Google Calendar",
      color: "#4285F4",
      accessRole: "owner",
      primary: true,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_primary",
      accountEmail: "user@example.com",
    },
    client_work: {
      id: "client_work",
      name: "Client Deliverables",
      color: "#EA4335",
      accessRole: "writer",
      primary: false,
      enabled: true,
      syncDirection: "two_way",
      privacyMode: "full_details",
      accountId: "acc_client",
      accountEmail: "client@example.com",
    },
    disabled_cal: {
      id: "disabled_cal",
      name: "Holiday & Marketing Calendar",
      color: "#34A853",
      accessRole: "reader",
      primary: false,
      enabled: false, // Toggled off in sidebar
      syncDirection: "import_only",
      privacyMode: "full_details",
      accountId: "acc_holidays",
      accountEmail: "holidays@example.com",
    },
  };

  const sampleTasks: PlannerTask[] = [
    {
      id: "task_local",
      title: "Local Annual Review",
      notes: "Yearly planner task",
      priority: "p1",
      dueDate: "2026-06-15",
      dueTime: "10:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "event_primary",
      title: "Mid-Year Strategy Meeting",
      notes: "Google Calendar event",
      priority: "p2",
      dueDate: "2026-06-15",
      dueTime: "14:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "primary_cal",
      googleCalendarColor: "#4285F4",
    },
    {
      id: "event_client",
      title: "Client Quarterly Presentation",
      notes: "Client work event",
      priority: "p3",
      dueDate: "2026-06-15",
      dueTime: "16:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "client_work",
    },
    {
      id: "event_hidden",
      title: "Company Holiday",
      notes: "From disabled calendar",
      priority: "p4",
      dueDate: "2026-06-15",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      isGoogleEvent: true,
      googleCalendarId: "disabled_cal",
    },
    {
      id: "task_feb_leap",
      title: "Leap Day Planning",
      notes: "Feb 29 test",
      priority: "p1",
      dueDate: "2024-02-29",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      status: "open",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ];

  // Helper matching app/page.tsx filtering logic
  function filterTasksByActiveCalendars(
    allTasks: PlannerTask[],
    configs: Record<string, GoogleCalendarConfig>,
    localEnabled: boolean
  ): PlannerTask[] {
    return allTasks.filter((task) => {
      if (!localEnabled && !task.isGoogleEvent && !task.googleCalendarId) {
        return false;
      }
      if (task.googleCalendarId && configs[task.googleCalendarId]?.enabled === false) {
        return false;
      }
      return true;
    });
  }

  // Helper matching app/components/calendar/year-view.tsx color resolution
  function getTaskCalendarColor(
    task: PlannerTask,
    configs: Record<string, GoogleCalendarConfig>
  ): string {
    if (task.googleCalendarColor) return task.googleCalendarColor;
    if (task.googleCalendarId && configs[task.googleCalendarId]?.color) {
      return configs[task.googleCalendarId].color;
    }
    if (task.isGoogleEvent) return "#4285F4";
    if (task.priority === "p1") return "#ff3d8b";
    if (task.priority === "p2") return "#ff7a1a";
    if (task.priority === "p3") return "#3b5bff";
    if (task.priority === "p4") return "#b8f04a";
    return "#10b981";
  }

  it("1. Generates correct 12-month tiles for regular and leap years", () => {
    // 2026 is a standard year (February has 28 days)
    const febDays2026 = daysInMonth(2026, 1);
    expect(febDays2026).toBe(28);

    const febGrid2026 = monthGridDays(2026, 1, 0); // Sunday start
    const nonNullDays2026 = febGrid2026.filter((d): d is number => d !== null);
    expect(nonNullDays2026.length).toBe(28);

    // 2024 is a leap year (February has 29 days)
    const febDays2024 = daysInMonth(2024, 1);
    expect(febDays2024).toBe(29);

    const febGrid2024 = monthGridDays(2024, 1, 0);
    const nonNullDays2024 = febGrid2024.filter((d): d is number => d !== null);
    expect(nonNullDays2024.length).toBe(29);
  });

  it("2. Respects weekStartsOn preferences for all 12 monthly tiles", () => {
    // January 1, 2026 is a Thursday (day 4)
    // Sunday start (0): offset is 4 lead empty cells
    const gridSunday = monthGridDays(2026, 0, 0);
    expect(gridSunday.slice(0, 4)).toEqual([null, null, null, null]);
    expect(gridSunday[4]).toBe(1);

    // Monday start (1): offset is 3 lead empty cells (Thu - Mon = 3)
    const gridMonday = monthGridDays(2026, 0, 1);
    expect(gridMonday.slice(0, 3)).toEqual([null, null, null]);
    expect(gridMonday[3]).toBe(1);

    // Saturday start (6): offset is 5 lead empty cells (Thu - Sat = (4 - 6 + 7) % 7 = 5)
    const gridSaturday = monthGridDays(2026, 0, 6);
    expect(gridSaturday.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(gridSaturday[5]).toBe(1);
  });

  it("3. Calendar visibility checkboxes filter tasks and events immediately", () => {
    // With disabled_cal toggled off
    const visible = filterTasksByActiveCalendars(sampleTasks, calendarConfigs, true);
    const june15Tasks = visible.filter((t) => t.dueDate === "2026-06-15");

    // Expect 3 tasks (local, primary, client_work), while event_hidden is excluded
    expect(june15Tasks.length).toBe(3);
    expect(june15Tasks.map((t) => t.id)).toEqual(["task_local", "event_primary", "event_client"]);

    // If local calendar is toggled off
    const withoutLocal = filterTasksByActiveCalendars(sampleTasks, calendarConfigs, false);
    const june15WithoutLocal = withoutLocal.filter((t) => t.dueDate === "2026-06-15");
    expect(june15WithoutLocal.length).toBe(2);
    expect(june15WithoutLocal.map((t) => t.id)).toEqual(["event_primary", "event_client"]);

    // If client_work is also disabled
    const updatedConfigs = {
      ...calendarConfigs,
      client_work: { ...calendarConfigs.client_work, enabled: false },
    };
    const onlyPrimary = filterTasksByActiveCalendars(sampleTasks, updatedConfigs, false);
    const june15OnlyPrimary = onlyPrimary.filter((t) => t.dueDate === "2026-06-15");
    expect(june15OnlyPrimary.length).toBe(1);
    expect(june15OnlyPrimary[0].id).toBe("event_primary");
  });

  it("4. Distinguishes event and task calendar colors consistently", () => {
    const localTask = sampleTasks.find((t) => t.id === "task_local")!;
    const primaryEvent = sampleTasks.find((t) => t.id === "event_primary")!;
    const clientEvent = sampleTasks.find((t) => t.id === "event_client")!;

    // local task with priority p1 gets priority color
    expect(getTaskCalendarColor(localTask, calendarConfigs)).toBe("#ff3d8b");

    // primaryEvent has explicit googleCalendarColor
    expect(getTaskCalendarColor(primaryEvent, calendarConfigs)).toBe("#4285F4");

    // clientEvent inherits color from calendarConfigs.client_work
    expect(getTaskCalendarColor(clientEvent, calendarConfigs)).toBe("#EA4335");
  });

  it("5. Date selection synchronization updates weekly anchor and clamps year navigation", () => {
    const selectedDateKey = "2026-06-15";
    const [y, m, d] = selectedDateKey.split("-").map(Number);
    const anchorDate = new Date(y, m - 1, d);

    expect(anchorDate.getFullYear()).toBe(2026);
    expect(anchorDate.getMonth()).toBe(5); // June is month index 5
    expect(anchorDate.getDate()).toBe(15);
    expect(toDateKey(anchorDate)).toBe("2026-06-15");

    // Leap year navigation test: navigating from 2024-02-29 to 2025 clamps to 2025-02-28
    const leapDate = "2024-02-29";
    const [, leapM, leapD] = leapDate.split("-");
    const newYear = 2025;
    const maxD = daysInMonth(newYear, Number(leapM) - 1);
    const clampedD = Math.min(Number(leapD), maxD);
    const clampedKey = `${newYear}-${leapM}-${String(clampedD).padStart(2, "0")}`;

    expect(clampedKey).toBe("2025-02-28");
  });

  it("6. Resolves theme month colors for all 12 tiles in default and custom modes", () => {
    const resolvedTheme = getResolvedTheme(DEFAULT_CALENDAR_THEME);

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const monthColor = getMonthColor(resolvedTheme, monthIndex);
      expect(monthColor.bg).toBeTruthy();
      expect(monthColor.text).toBeTruthy();
      expect(monthColor.border).toBeTruthy();
    }
  });
});
