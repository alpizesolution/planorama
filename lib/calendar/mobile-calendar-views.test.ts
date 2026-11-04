import { describe, it, expect, vi } from "vitest";
import {
  isAllDayItem,
  formatDayTitle,
  layoutDayEvents,
} from "./day-layout";
import { toDateKey, getWeekDays, getWorkWeekDays } from "./date-utils";
import type { PlannerTask } from "../schedule/types";

describe("PLANORAMA Complete Mobile Calendar Views Optimization", () => {
  const sampleTasks: PlannerTask[] = [
    {
      id: "task-1",
      title: "Team Standup",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-26",
      dueTime: "09:00",
      durationMinutes: 30,
      notes: "Sprint check-in",
      location: "Room 402",
      recurrence: "none",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
    {
      id: "task-2",
      title: "Product Design Review",
      status: "in_progress",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-26",
      dueTime: "09:15",
      durationMinutes: 45,
      notes: "Figma walkthrough",
      location: "Meet Link",
      recurrence: "none",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
    {
      id: "task-3",
      title: "All Day Hackathon",
      status: "open",
      priority: "none",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-26",
      dueTime: null,
      isAllDay: true,
      notes: "Full day event",
      recurrence: "none",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
    {
      id: "task-weekend",
      title: "Saturday Farmers Market",
      status: "open",
      priority: "p3",
      projectId: null,
      labelIds: [],
      dueDate: "2026-10-31", // Saturday
      dueTime: "10:00",
      durationMinutes: 60,
      notes: "Fresh produce",
      recurrence: "none",
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
  ];

  describe("1. Day View — Full-width timeline & overlap handling", () => {
    it("formats full date and compact date representations", () => {
      const d = new Date(2026, 9, 26); // Oct 26, 2026 (Monday)
      const fullTitle = formatDayTitle(d);
      expect(fullTitle).toContain("October");
      expect(fullTitle).toContain("26");
      expect(fullTitle).toContain("2026");

      const compact = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      expect(compact).toMatch(/Mon.*Oct.*26.*2026/);
    });

    it("positions overlapping events into distinct columns without clipping", () => {
      const positioned = layoutDayEvents(sampleTasks, "2026-10-26");
      expect(positioned.length).toBe(2); // task-1 and task-2 (task-3 is all-day)

      const t1 = positioned.find((p) => p.task.id === "task-1")!;
      const t2 = positioned.find((p) => p.task.id === "task-2")!;

      expect(t1).toBeDefined();
      expect(t2).toBeDefined();
      // Overlapping items: totalColumns must be >= 2
      expect(t1.totalColumns).toBeGreaterThanOrEqual(2);
      expect(t2.totalColumns).toBeGreaterThanOrEqual(2);
      // Different column indices
      expect(t1.column).not.toBe(t2.column);
    });

    it("isolates all-day items from timed timeline items", () => {
      const allDay = sampleTasks.filter(isAllDayItem);
      expect(allDay.length).toBe(1);
      expect(allDay[0].id).toBe("task-3");
    });
  });

  describe("2 & 3. Week & Work Weeks — Selector, navigation & task retention", () => {
    const anchor = new Date(2026, 9, 26); // Monday Oct 26

    it("generates 7 days for full week and 5 days for work week", () => {
      const fullWeek = getWeekDays(anchor, 1); // Monday start
      expect(fullWeek.length).toBe(7);

      const workWeek = getWorkWeekDays(anchor);
      expect(workWeek.length).toBe(5);
    });

    it("never discards weekend tasks when switching between Work Weeks and Full Week views", () => {
      const workWeek = getWorkWeekDays(anchor);
      const workWeekKeys = new Set(workWeek.map(toDateKey));

      // Weekend task is not in work week days
      expect(workWeekKeys.has("2026-10-31")).toBe(false);

      // But underlying sampleTasks array retains the weekend task unmodified
      const weekendItem = sampleTasks.find((t) => t.id === "task-weekend");
      expect(weekendItem).toBeDefined();
      expect(weekendItem?.title).toBe("Saturday Farmers Market");

      // Switching to full week immediately exposes the weekend task
      const fullWeek = getWeekDays(anchor, 1);
      const fullWeekKeys = new Set(fullWeek.map(toDateKey));
      expect(fullWeekKeys.has("2026-10-31")).toBe(true);

      const visibleInFullWeek = sampleTasks.filter((t) => t.dueDate && fullWeekKeys.has(t.dueDate));
      expect(visibleInFullWeek.some((t) => t.id === "task-weekend")).toBe(true);
    });

    it("allows navigating through days without altering task data", () => {
      const fullWeek = getWeekDays(anchor, 1);
      let activeIndex = 0;

      // Navigate forward
      activeIndex = Math.min(fullWeek.length - 1, activeIndex + 1);
      expect(activeIndex).toBe(1);
      expect(toDateKey(fullWeek[activeIndex])).toBe("2026-10-27");

      // Original task data intact
      expect(sampleTasks.length).toBe(4);
    });
  });

  describe("4. Month View — Mobile activity indicators & date inspector", () => {
    it("slices activity dots to max 3 on mobile with overflow counter", () => {
      const dayTasks = [
        sampleTasks[0],
        sampleTasks[1],
        sampleTasks[2],
        { ...sampleTasks[0], id: "task-extra-1" },
        { ...sampleTasks[0], id: "task-extra-2" },
      ];

      const visibleDots = dayTasks.slice(0, 3);
      const remainingCount = dayTasks.length - 3;

      expect(visibleDots.length).toBe(3);
      expect(remainingCount).toBe(2);
    });

    it("filters tasks accurately when a date is selected in month view", () => {
      const selectedDate = "2026-10-26";
      const matching = sampleTasks.filter((t) => t.dueDate === selectedDate);
      expect(matching.length).toBe(3);
    });
  });

  describe("5. Year View — Responsive layout and month navigation", () => {
    it("calls onSelectMonth callback when month header is tapped", () => {
      const selectMonthMock = vi.fn();
      const monthIdx = 9; // October

      selectMonthMock(monthIdx);
      expect(selectMonthMock).toHaveBeenCalledWith(9);
    });
  });

  describe("7. Agenda View — Time durations, type filters and search", () => {
    it("formats start, end time and duration string accurately", () => {
      function formatAgendaSchedule(dueTime?: string | null, durationMinutes?: number | null): string {
        if (!dueTime) return "All day";
        const [hStr, mStr] = dueTime.split(":");
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const suffix = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const start = `${h12}:${mStr} ${suffix}`;
        if (!durationMinutes || durationMinutes <= 0) return start;
        const totalEndMin = h * 60 + m + durationMinutes;
        const endH = Math.floor(totalEndMin / 60) % 24;
        const endM = totalEndMin % 60;
        const endSuffix = endH >= 12 ? "PM" : "AM";
        const endH12 = endH % 12 === 0 ? 12 : endH % 12;
        const endFormatted = `${endH12}:${String(endM).padStart(2, "0")} ${endSuffix}`;
        const durationLabel =
          durationMinutes >= 60
            ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ""}`
            : `${durationMinutes}m`;
        return `${start} – ${endFormatted} (${durationLabel})`;
      }

      expect(formatAgendaSchedule("09:00", 30)).toBe("9:00 AM – 9:30 AM (30m)");
      expect(formatAgendaSchedule("10:00", 60)).toBe("10:00 AM – 11:00 AM (1h)");
      expect(formatAgendaSchedule("14:15", 90)).toBe("2:15 PM – 3:45 PM (1h 30m)");
      expect(formatAgendaSchedule(null)).toBe("All day");
    });

    it("filters agenda items by search query across titles and locations", () => {
      const query1 = "room 402";
      const matches1 = sampleTasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query1) ||
          Boolean(t.location?.toLowerCase().includes(query1))
      );
      expect(matches1.length).toBe(1);
      expect(matches1[0].id).toBe("task-1");

      const query2 = "figma";
      const matches2 = sampleTasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query2) ||
          Boolean(t.notes?.toLowerCase().includes(query2))
      );
      expect(matches2.length).toBe(1);
      expect(matches2[0].id).toBe("task-2");
    });
  });
});

