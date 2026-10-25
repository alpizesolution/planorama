import { describe, it, expect } from "vitest";
import {
  parseMinutesFromTime,
  isAllDayItem,
  formatDayTitle,
  formatTimeRange,
  layoutDayEvents,
} from "./day-layout";
import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";

describe("PLANORAMA Day View Schedule & Calendar Integration", () => {
  describe("1. Time String Parsing & All-Day Separation", () => {
    it("parses valid 24h time strings to total minutes from midnight", () => {
      expect(parseMinutesFromTime("00:00")).toBe(0);
      expect(parseMinutesFromTime("09:00")).toBe(540);
      expect(parseMinutesFromTime("09:30")).toBe(570);
      expect(parseMinutesFromTime("13:15")).toBe(795);
      expect(parseMinutesFromTime("23:59")).toBe(1439);
    });

    it("returns null for all-day or invalid time inputs", () => {
      expect(parseMinutesFromTime(undefined)).toBeNull();
      expect(parseMinutesFromTime(null)).toBeNull();
      expect(parseMinutesFromTime("")).toBeNull();
      expect(parseMinutesFromTime("all_day")).toBeNull();
      expect(parseMinutesFromTime("allday")).toBeNull();
      expect(parseMinutesFromTime("25:00")).toBeNull();
      expect(parseMinutesFromTime("invalid")).toBeNull();
    });

    it("identifies all-day items vs timed events accurately", () => {
      const allDayTask1: PlannerTask = {
        id: "task-1",
        title: "All day review",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: "2026-10-26",
        dueTime: null,
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: "2026-10-26T00:00:00Z",
      };

      const allDayTask2: PlannerTask = {
        ...allDayTask1,
        id: "task-2",
        dueTime: "all_day",
      };

      const allDayTask3: PlannerTask = {
        ...allDayTask1,
        id: "task-3",
        isAllDay: true,
      };

      const timedTask: PlannerTask = {
        ...allDayTask1,
        id: "task-4",
        dueTime: "10:00",
      };

      expect(isAllDayItem(allDayTask1)).toBe(true);
      expect(isAllDayItem(allDayTask2)).toBe(true);
      expect(isAllDayItem(allDayTask3)).toBe(true);
      expect(isAllDayItem(timedTask)).toBe(false);
    });
  });

  describe("2. Header Title and Time Range Formatting", () => {
    it("formats day titles in standard long format", () => {
      const testDate = new Date(2026, 9, 26, 12, 0, 0); // Oct 26, 2026
      const title = formatDayTitle(testDate);
      expect(title).toContain("October 26, 2026");
      expect(title).toContain("Monday");
    });

    it("formats 12-hour time ranges cleanly", () => {
      expect(formatTimeRange(540, 630)).toBe("9:00 AM – 10:30 AM");
      expect(formatTimeRange(720, 780)).toBe("12:00 PM – 1:00 PM");
      expect(formatTimeRange(1020, 1080)).toBe("5:00 PM – 6:00 PM");
    });
  });

  describe("3. Overlapping Events Interval Partitioning Algorithm", () => {
    const targetDate = "2026-10-26";

    const baseTask: PlannerTask = {
      id: "base",
      title: "Sample Event",
      status: "open",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: targetDate,
      dueTime: "09:00",
      recurrence: "none",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    };

    it("assigns single column (col 0, total 1) to non-overlapping events", () => {
      const tasks: PlannerTask[] = [
        { ...baseTask, id: "event-1", title: "Morning Standup", dueTime: "09:00", durationMinutes: 30 },
        { ...baseTask, id: "event-2", title: "Lunch Break", dueTime: "12:00", durationMinutes: 60 },
        { ...baseTask, id: "event-3", title: "Client Wrapup", dueTime: "16:00", durationMinutes: 45 },
      ];

      const positioned = layoutDayEvents(tasks, targetDate);
      expect(positioned).toHaveLength(3);

      for (const item of positioned) {
        expect(item.column).toBe(0);
        expect(item.totalColumns).toBe(1);
      }
    });

    it("partitions two overlapping events into two parallel columns", () => {
      const tasks: PlannerTask[] = [
        // 10:00 - 11:00
        { ...baseTask, id: "ev-1", title: "Strategy Session", dueTime: "10:00", durationMinutes: 60 },
        // 10:30 - 11:30 (overlaps with ev-1)
        { ...baseTask, id: "ev-2", title: "Design Sync", dueTime: "10:30", durationMinutes: 60 },
      ];

      const positioned = layoutDayEvents(tasks, targetDate);
      expect(positioned).toHaveLength(2);

      const ev1 = positioned.find((p) => p.task.id === "ev-1")!;
      const ev2 = positioned.find((p) => p.task.id === "ev-2")!;

      expect(ev1.totalColumns).toBe(2);
      expect(ev2.totalColumns).toBe(2);
      expect(ev1.column).not.toBe(ev2.column);
      expect(new Set([ev1.column, ev2.column])).toEqual(new Set([0, 1]));
    });

    it("partitions three simultaneous overlapping events into three columns", () => {
      const tasks: PlannerTask[] = [
        { ...baseTask, id: "ev-1", title: "Client A", dueTime: "14:00", durationMinutes: 60 },
        { ...baseTask, id: "ev-2", title: "Client B", dueTime: "14:15", durationMinutes: 45 },
        { ...baseTask, id: "ev-3", title: "Client C", dueTime: "14:30", durationMinutes: 60 },
      ];

      const positioned = layoutDayEvents(tasks, targetDate);
      expect(positioned).toHaveLength(3);

      const cols = positioned.map((p) => p.column);
      expect(cols).toEqual([0, 1, 2]);
      for (const item of positioned) {
        expect(item.totalColumns).toBe(3);
      }
    });

    it("re-uses column 0 for a subsequent non-overlapping event after an overlap finishes", () => {
      const tasks: PlannerTask[] = [
        // 10:00 - 11:00 (col 0)
        { ...baseTask, id: "ev-1", dueTime: "10:00", durationMinutes: 60 },
        // 10:30 - 11:30 (col 1)
        { ...baseTask, id: "ev-2", dueTime: "10:30", durationMinutes: 60 },
        // 12:00 - 13:00 (starts after ev-2 finishes, should reset to col 0)
        { ...baseTask, id: "ev-3", dueTime: "12:00", durationMinutes: 60 },
      ];

      const positioned = layoutDayEvents(tasks, targetDate);
      expect(positioned).toHaveLength(3);

      const ev3 = positioned.find((p) => p.task.id === "ev-3")!;
      expect(ev3.column).toBe(0);
      expect(ev3.totalColumns).toBe(1);
    });

    it("filters out all-day events and events from other dates", () => {
      const tasks: PlannerTask[] = [
        { ...baseTask, id: "today-timed", dueTime: "09:00", durationMinutes: 60 },
        { ...baseTask, id: "today-allday", dueTime: null, isAllDay: true },
        { ...baseTask, id: "tomorrow-timed", dueDate: "2026-10-27", dueTime: "09:00" },
      ];

      const positioned = layoutDayEvents(tasks, targetDate);
      expect(positioned).toHaveLength(1);
      expect(positioned[0].task.id).toBe("today-timed");
    });
  });

  describe("4. Google Calendar Client Support, Isolation & Permissions", () => {
    const calendarConfigs: Record<string, GoogleCalendarConfig> = {
      "cal-personal": {
        id: "cal-personal",
        name: "Personal Calendar",
        color: "#4285F4",
        enabled: true,
        accessRole: "owner",
        syncDirection: "two_way",
        privacyMode: "full_details",
        accountEmail: "va@planorama.app",
      },
      "cal-client-exec": {
        id: "cal-client-exec",
        name: "Acme CEO Calendar",
        color: "#ea4335",
        enabled: true,
        accessRole: "writer",
        syncDirection: "two_way",
        privacyMode: "full_details",
        accountEmail: "client@acme.com",
      },
      "cal-client-readonly": {
        id: "cal-client-readonly",
        name: "Acme All-Hands (Read-Only)",
        color: "#fbbc05",
        enabled: true,
        accessRole: "reader",
        syncDirection: "import_only",
        privacyMode: "full_details",
        accountEmail: "client@acme.com",
      },
      "cal-client-hidden": {
        id: "cal-client-hidden",
        name: "Beta Ventures (Toggled Off)",
        color: "#34a853",
        enabled: false,
        accessRole: "writer",
        syncDirection: "two_way",
        privacyMode: "full_details",
        accountEmail: "beta@ventures.com",
      },
    };

    const targetDate = "2026-10-26";
    const sampleDayTasks: PlannerTask[] = [
      {
        id: "local-task-1",
        title: "Personal Daily Habit",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: targetDate,
        dueTime: null, // all day
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: "2026-10-26T00:00:00Z",
        source: "local",
      },
      {
        id: "gcal-exec-meet",
        title: "Acme Board Meeting",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: targetDate,
        dueTime: "10:00",
        durationMinutes: 60,
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: "2026-10-26T00:00:00Z",
        isGoogleEvent: true,
        googleCalendarId: "cal-client-exec",
        googleCalendarName: "Acme CEO Calendar",
        source: "google",
      },
      {
        id: "gcal-allhands",
        title: "Company All-Hands",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: targetDate,
        dueTime: "15:00",
        durationMinutes: 45,
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: "2026-10-26T00:00:00Z",
        isGoogleEvent: true,
        googleCalendarId: "cal-client-readonly",
        googleCalendarName: "Acme All-Hands (Read-Only)",
        isReadOnlyCalendar: true,
        source: "google",
      },
      {
        id: "gcal-hidden-event",
        title: "Beta Investor Pitch",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: targetDate,
        dueTime: "11:00",
        durationMinutes: 30,
        recurrence: "none",
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: "2026-10-26T00:00:00Z",
        isGoogleEvent: true,
        googleCalendarId: "cal-client-hidden",
        source: "google",
      },
    ];

    it("filters out events from disabled calendars while preserving local tasks", () => {
      // Simulates displayedTasks filtering rule in app/page.tsx
      const localCalendarEnabled = true;
      const displayedTasks = sampleDayTasks.filter((task) => {
        if (!localCalendarEnabled && !task.isGoogleEvent && !task.googleCalendarId) return false;
        if (task.googleCalendarId && calendarConfigs[task.googleCalendarId]?.enabled === false) return false;
        return true;
      });

      expect(displayedTasks).toHaveLength(3);
      expect(displayedTasks.map((t) => t.id)).toEqual([
        "local-task-1",
        "gcal-exec-meet",
        "gcal-allhands",
      ]);
      // Hidden calendar event must be excluded
      expect(displayedTasks.some((t) => t.id === "gcal-hidden-event")).toBe(false);
    });

    it("accurately identifies editable vs read-only Google Calendar events", () => {
      const execEvent = sampleDayTasks.find((t) => t.id === "gcal-exec-meet")!;
      const readonlyEvent = sampleDayTasks.find((t) => t.id === "gcal-allhands")!;

      const execConfig = calendarConfigs[execEvent.googleCalendarId!];
      const readonlyConfig = calendarConfigs[readonlyEvent.googleCalendarId!];

      expect(execConfig.accessRole).toBe("writer");
      expect(readonlyConfig.accessRole).toBe("reader");

      const isExecReadOnly = Boolean(execEvent.isReadOnlyCalendar || execConfig.accessRole === "reader" || execConfig.accessRole === "freeBusyReader");
      const isAllHandsReadOnly = Boolean(readonlyEvent.isReadOnlyCalendar || readonlyConfig.accessRole === "reader" || readonlyConfig.accessRole === "freeBusyReader");

      expect(isExecReadOnly).toBe(false);
      expect(isAllHandsReadOnly).toBe(true);
    });

    it("correctly separates all-day local tasks from timed Google Calendar events", () => {
      const allDay = sampleDayTasks.filter(isAllDayItem);
      const timed = sampleDayTasks.filter((t) => !isAllDayItem(t));

      expect(allDay).toHaveLength(1);
      expect(allDay[0].id).toBe("local-task-1");

      expect(timed).toHaveLength(3);
      expect(timed.map((t) => t.id)).toEqual([
        "gcal-exec-meet",
        "gcal-allhands",
        "gcal-hidden-event",
      ]);
    });
  });
});
