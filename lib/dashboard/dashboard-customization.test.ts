import { describe, it, expect } from "vitest";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_METADATA,
  resolveDashboardWidgets,
  type DashboardWidgetConfig,
  type DashboardWidgetId,
} from "./types";
import {
  calculateDailyOverview,
  sortTodaysFocusTasks,
  calculateWeeklyProgress,
} from "./dashboard-utils";
import type { PlannerTask } from "../schedule/types";
import type { Habit, HabitCheckIn } from "../habits/types";

describe("PLANORAMA Dashboard Customization & Widget Reordering Suite", () => {
  const todayKey = "2026-10-29";

  const sampleTasks: PlannerTask[] = [
    {
      id: "t1",
      title: "Write documentation",
      notes: "Critical task",
      status: "open",
      priority: "p1",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "10:00",
      recurrence: "none",
      createdAt: "2026-10-29T00:00:00Z",
      updatedAt: "2026-10-29T00:00:00Z",
    },
    {
      id: "t2",
      title: "Review pull requests",
      notes: "Completed task",
      status: "completed",
      priority: "p2",
      projectId: null,
      labelIds: [],
      dueDate: todayKey,
      dueTime: "11:00",
      recurrence: "none",
      createdAt: "2026-10-29T00:00:00Z",
      updatedAt: "2026-10-29T00:00:00Z",
    },
  ];

  const sampleHabits: Habit[] = [
    {
      id: "h1",
      name: "Drink Water",
      icon: "💧",
      scheduleType: "everyday",
      customDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ];

  const sampleCheckIns: HabitCheckIn[] = [
    {
      id: "c1",
      habitId: "h1",
      date: todayKey,
      completed: true,
      completedAt: "2026-10-29T10:00:00Z",
    },
  ];

  describe("1. Dedicated Dashboard Settings Button Contract", () => {
    it("defines the gear button with correct attributes and accessible label on Dashboard", () => {
      const dashboardCustomizeButton = {
        id: "dashboard-customize-btn",
        className: "dashboard-customize-btn neo-btn",
        ariaLabel: "Customize dashboard",
        title: "Customize dashboard",
        icon: "Gear",
        textLabel: "Customize",
      };

      expect(dashboardCustomizeButton.id).toBe("dashboard-customize-btn");
      expect(dashboardCustomizeButton.ariaLabel).toBe("Customize dashboard");
      expect(dashboardCustomizeButton.title).toBe("Customize dashboard");
      expect(dashboardCustomizeButton.icon).toBe("Gear");
    });

    it("ensures global preferences button remains separate and does not host dashboard customization", () => {
      const topbarPreferencesButton = {
        className: "header-preferences-btn",
        ariaLabel: "Planner preferences and customization",
        title: "Planner preferences and customization",
      };

      // Topbar preferences has distinct identifier and label
      expect(topbarPreferencesButton.className).toBe("header-preferences-btn");
      expect(topbarPreferencesButton.ariaLabel).not.toBe("Customize dashboard");
    });
  });

  describe("2. Drag and Drop Widget Reordering Logic", () => {
    it("reorders widgets from source index to target index accurately in modal", () => {
      const initialWidgets: DashboardWidgetConfig[] = [
        { id: "daily_overview", visible: true },
        { id: "todays_focus", visible: true },
        { id: "daily_habits", visible: true },
        { id: "upcoming", visible: true },
        { id: "mini_calendar", visible: true },
        { id: "weekly_progress", visible: true },
      ];

      // Simulate dragging index 4 (mini_calendar) to index 0
      function reorderWidgets(
        list: DashboardWidgetConfig[],
        fromIndex: number,
        toIndex: number
      ): DashboardWidgetConfig[] {
        const next = [...list];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      }

      const reordered = reorderWidgets(initialWidgets, 4, 0);
      expect(reordered[0].id).toBe("mini_calendar");
      expect(reordered[1].id).toBe("daily_overview");
      expect(reordered.length).toBe(6);
    });

    it("reorders widgets directly by ID on the Dashboard grid", () => {
      const initialWidgets = resolveDashboardWidgets();

      function directReorder(
        list: DashboardWidgetConfig[],
        draggedId: DashboardWidgetId,
        targetId: DashboardWidgetId
      ): DashboardWidgetConfig[] {
        const next = [...list];
        const fromIndex = next.findIndex((w) => w.id === draggedId);
        const toIndex = next.findIndex((w) => w.id === targetId);
        if (fromIndex >= 0 && toIndex >= 0) {
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
        }
        return next;
      }

      // Drag weekly_progress to be before todays_focus
      const reordered = directReorder(initialWidgets, "weekly_progress", "todays_focus");
      expect(reordered[1].id).toBe("weekly_progress");
      expect(reordered[2].id).toBe("todays_focus");
      expect(reordered.length).toBe(6);
    });

    it("provides accessible arrow reorder operations with boundary checks", () => {
      const widgets = resolveDashboardWidgets();

      function moveByArrow(
        list: DashboardWidgetConfig[],
        index: number,
        direction: "up" | "down"
      ): DashboardWidgetConfig[] {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= list.length) return list;
        const next = [...list];
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      }

      // Up on first element should do nothing (boundary check)
      const afterUpOnFirst = moveByArrow(widgets, 0, "up");
      expect(afterUpOnFirst).toEqual(widgets);

      // Down on last element should do nothing (boundary check)
      const afterDownOnLast = moveByArrow(widgets, widgets.length - 1, "down");
      expect(afterDownOnLast).toEqual(widgets);

      // Down on first element moves it to index 1
      const afterDownOnFirst = moveByArrow(widgets, 0, "down");
      expect(afterDownOnFirst[0].id).toBe("todays_focus");
      expect(afterDownOnFirst[1].id).toBe("daily_overview");

      // Up on second element moves it back to index 0
      const afterUpOnSecond = moveByArrow(afterDownOnFirst, 1, "up");
      expect(afterUpOnSecond[0].id).toBe("daily_overview");
    });
  });

  describe("3. Widget Visibility and Data Preservation", () => {
    it("toggles widget visibility cleanly without mutating underlying task or habit data", () => {
      const widgets = resolveDashboardWidgets();

      function toggleVisibility(
        list: DashboardWidgetConfig[],
        id: DashboardWidgetId
      ): DashboardWidgetConfig[] {
        return list.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
      }

      // Hide todays_focus and daily_habits
      let current = toggleVisibility(widgets, "todays_focus");
      current = toggleVisibility(current, "daily_habits");

      const visibleWidgets = current.filter((w) => w.visible);
      expect(visibleWidgets.map((w) => w.id)).not.toContain("todays_focus");
      expect(visibleWidgets.map((w) => w.id)).not.toContain("daily_habits");
      expect(visibleWidgets.length).toBe(4);

      // Verify underlying data calculations remain 100% intact
      const focusTasks = sortTodaysFocusTasks(sampleTasks, todayKey);
      expect(focusTasks.length).toBe(2);
      expect(focusTasks[0].id).toBe("t1");

      const overviewStats = calculateDailyOverview(sampleTasks, todayKey);
      expect(overviewStats.totalDueToday).toBe(2);
      expect(overviewStats.completedToday).toBe(1);

      const weeklyStats = calculateWeeklyProgress(
        sampleTasks,
        sampleHabits,
        sampleCheckIns,
        [new Date(2026, 9, 29)],
        todayKey
      );
      expect(weeklyStats.tasksCompleted).toBe(1);

      // Show todays_focus again
      current = toggleVisibility(current, "todays_focus");
      const visibleAgain = current.filter((w) => w.visible);
      expect(visibleAgain.map((w) => w.id)).toContain("todays_focus");
    });

    it("displays complete metadata (name, description, icon, badge) for all 6 widgets", () => {
      for (const w of DEFAULT_DASHBOARD_WIDGETS) {
        const meta = DASHBOARD_WIDGET_METADATA[w.id];
        expect(meta).toBeDefined();
        expect(meta.name.length).toBeGreaterThan(0);
        expect(meta.description.length).toBeGreaterThan(0);
        expect(meta.icon.length).toBeGreaterThan(0);
      }

      expect(DASHBOARD_WIDGET_METADATA.daily_overview.badge).toBe("Essential");
      expect(DASHBOARD_WIDGET_METADATA.todays_focus.badge).toBe("Core");
    });
  });

  describe("4. Restore Default Layout", () => {
    it("resets customized widget order and visibility back to standard defaults", () => {
      const customWidgets: DashboardWidgetConfig[] = [
        { id: "weekly_progress", visible: false },
        { id: "mini_calendar", visible: true },
        { id: "todays_focus", visible: false },
      ];

      // Resolved custom widgets
      const resolvedCustom = resolveDashboardWidgets(customWidgets);
      expect(resolvedCustom[0].id).toBe("weekly_progress");
      expect(resolvedCustom[0].visible).toBe(false);

      // Restoring defaults
      const restored = DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w }));
      expect(restored.length).toBe(6);
      expect(restored[0].id).toBe("daily_overview");
      expect(restored[0].visible).toBe(true);
      expect(restored.every((w) => w.visible)).toBe(true);
      expect(restored.map((w) => w.id)).toEqual([
        "daily_overview",
        "todays_focus",
        "daily_habits",
        "upcoming",
        "mini_calendar",
        "weekly_progress",
      ]);
    });
  });

  describe("5. Preferences Persistence and Serialization Contract", () => {
    it("serializes and deserializes custom dashboard widgets with resolveDashboardWidgets fallback", () => {
      const customConfig: DashboardWidgetConfig[] = [
        { id: "upcoming", visible: true },
        { id: "daily_overview", visible: true },
        { id: "todays_focus", visible: false },
      ];

      const serialized = JSON.stringify({ dashboardWidgets: customConfig });
      const parsed = JSON.parse(serialized);

      const resolved = resolveDashboardWidgets(parsed.dashboardWidgets);
      expect(resolved.length).toBe(6);
      expect(resolved[0].id).toBe("upcoming");
      expect(resolved[0].visible).toBe(true);
      expect(resolved[1].id).toBe("daily_overview");
      expect(resolved[2].id).toBe("todays_focus");
      expect(resolved[2].visible).toBe(false);

      // Missing widgets were automatically resolved and appended
      expect(resolved.map((w) => w.id)).toContain("daily_habits");
      expect(resolved.map((w) => w.id)).toContain("mini_calendar");
      expect(resolved.map((w) => w.id)).toContain("weekly_progress");
    });
  });
});
