import { describe, it, expect } from "vitest";
import {
  DASHBOARD_WIDGET_METADATA,
  DEFAULT_DASHBOARD_WIDGETS,
  resolveDashboardWidgets,
  getWidgetColSpan,
  calculateSnappedColSpan,
  calculateSnappedWidgetHeight,
  balanceDashboardLayout,
} from "./types";
import type { DashboardWidgetConfig } from "./types";

describe("PLANORAMA — Dashboard Layout Balance & Widget Resizing Constraints", () => {
  describe("1. 12-Column Desktop Grid Sizing & Constraints Table", () => {
    it("Today's Overview strictly enforces 12 columns min & recommended", () => {
      const meta = DASHBOARD_WIDGET_METADATA.daily_overview;
      expect(meta.minCols).toBe(12);
      expect(meta.recommendedCols).toBe(12);
      expect(meta.maxCols).toBe(12);
      expect(meta.allowedCols).toEqual([12]);
    });

    it("Today's Focus enforces minimum 6 columns and recommended 6 columns", () => {
      const meta = DASHBOARD_WIDGET_METADATA.todays_focus;
      expect(meta.minCols).toBe(6); // MUST NEVER be smaller than 6 columns on desktop
      expect(meta.recommendedCols).toBe(6);
      expect(meta.allowedCols).toContain(6);
      expect(meta.allowedCols).toContain(7);
      expect(meta.allowedCols).not.toContain(5);
      expect(meta.allowedCols).not.toContain(4);
    });

    it("Daily Habits enforces minimum 5 columns and recommended 6 columns", () => {
      const meta = DASHBOARD_WIDGET_METADATA.daily_habits;
      expect(meta.minCols).toBe(5); // Prevent Daily Habits from shrinking below 5 columns
      expect(meta.recommendedCols).toBe(6);
      expect(meta.allowedCols).toContain(5);
      expect(meta.allowedCols).toContain(6);
      expect(meta.allowedCols).not.toContain(4);
      expect(meta.allowedCols).not.toContain(3);
    });

    it("Upcoming enforces minimum 6 columns and recommended 6 columns", () => {
      const meta = DASHBOARD_WIDGET_METADATA.upcoming;
      expect(meta.minCols).toBe(6);
      expect(meta.recommendedCols).toBe(6);
      expect(meta.allowedCols).toContain(6);
      expect(meta.allowedCols).toContain(7);
    });

    it("Calendar at a Glance enforces minimum 4 columns and recommended 6 columns", () => {
      const meta = DASHBOARD_WIDGET_METADATA.mini_calendar;
      expect(meta.minCols).toBe(4);
      expect(meta.recommendedCols).toBe(6);
      expect(meta.allowedCols).toContain(4);
      expect(meta.allowedCols).toContain(5);
      expect(meta.allowedCols).toContain(6);
      expect(meta.allowedCols).not.toContain(3);
    });
  });

  describe("2. Recommended Default Dashboard 6/6 Equal Balanced Arrangement", () => {
    it("Row 1: Today's Overview occupies full width (12 columns)", () => {
      const overview = DEFAULT_DASHBOARD_WIDGETS[0];
      expect(overview.id).toBe("daily_overview");
      expect(overview.colSpan).toBe(12);
    });

    it("Row 2: Today's Focus (6 cols) + Daily Habits (6 cols) = 12 columns balanced row", () => {
      const focus = DEFAULT_DASHBOARD_WIDGETS[1];
      const habits = DEFAULT_DASHBOARD_WIDGETS[2];
      expect(focus.id).toBe("todays_focus");
      expect(habits.id).toBe("daily_habits");
      expect(focus.colSpan).toBe(6);
      expect(habits.colSpan).toBe(6);
      expect(focus.colSpan! + habits.colSpan!).toBe(12);
    });

    it("Row 3: Upcoming (6 cols) + Calendar at a Glance (6 cols) = 12 columns balanced row", () => {
      const upcoming = DEFAULT_DASHBOARD_WIDGETS[3];
      const calendar = DEFAULT_DASHBOARD_WIDGETS[4];
      expect(upcoming.id).toBe("upcoming");
      expect(calendar.id).toBe("mini_calendar");
      expect(upcoming.colSpan).toBe(6);
      expect(calendar.colSpan).toBe(6);
      expect(upcoming.colSpan! + calendar.colSpan!).toBe(12);
    });

    it("Row 4: Weekly Progress occupies full width (12 columns)", () => {
      const progress = DEFAULT_DASHBOARD_WIDGETS[5];
      expect(progress.id).toBe("weekly_progress");
      expect(progress.colSpan).toBe(12);
    });
  });

  describe("3. Intelligent Drag-to-Resize Column Snapping & Strict Boundary Constraints", () => {
    const containerWidth = 1200; // 12 columns = 100px per column

    it("Today's Focus: stops resizing at the minimum 6-column boundary and expands up to 12", () => {
      const meta = DASHBOARD_WIDGET_METADATA.todays_focus;
      const initialWidthPx = 600; // 6 columns

      // Dragging inward by 400px (would reach 2 columns) -> clamped to 6 columns!
      expect(calculateSnappedColSpan(meta, initialWidthPx, -400, "right", containerWidth)).toBe(6);

      // Dragging inward by 100px -> clamped to 6 columns minimum
      expect(calculateSnappedColSpan(meta, initialWidthPx, -100, "right", containerWidth)).toBe(6);

      // Dragging outward by 100px -> snaps to 7 columns
      expect(calculateSnappedColSpan(meta, initialWidthPx, 100, "right", containerWidth)).toBe(7);

      // Dragging outward by 600px -> snaps to 12 columns (full width)
      expect(calculateSnappedColSpan(meta, initialWidthPx, 600, "right", containerWidth)).toBe(12);
    });

    it("Daily Habits: stops resizing at the minimum 5-column boundary", () => {
      const meta = DASHBOARD_WIDGET_METADATA.daily_habits;
      const initialWidthPx = 600; // 6 columns

      // Dragging inward by 300px -> clamped to 5 columns minimum
      expect(calculateSnappedColSpan(meta, initialWidthPx, -300, "right", containerWidth)).toBe(5);

      // Dragging outward by 100px -> snaps to 7 columns
      expect(calculateSnappedColSpan(meta, initialWidthPx, 100, "right", containerWidth)).toBe(7);
    });

    it("Calendar at a Glance: stops resizing at the minimum 4-column boundary", () => {
      const meta = DASHBOARD_WIDGET_METADATA.mini_calendar;
      const initialWidthPx = 500; // 5 columns

      // Inward drag clamps at 4
      expect(calculateSnappedColSpan(meta, initialWidthPx, -400, "right", containerWidth)).toBe(4);
    });

    it("Today's Overview: cannot be resized horizontally (strictly locked to 12 columns)", () => {
      const meta = DASHBOARD_WIDGET_METADATA.daily_overview;
      const initialWidthPx = 1200;

      expect(calculateSnappedColSpan(meta, initialWidthPx, -600, "right", containerWidth)).toBe(12);
      expect(calculateSnappedColSpan(meta, initialWidthPx, -600, "left", containerWidth)).toBe(12);
    });

    it("supports dragging left handle (inverting deltaX for natural grab-and-drag)", () => {
      const meta = DASHBOARD_WIDGET_METADATA.todays_focus;
      const initialWidthPx = 700; // 7 columns

      // Dragging left handle leftwards (negative deltaX) expands the widget
      expect(calculateSnappedColSpan(meta, initialWidthPx, -200, "left", containerWidth)).toBe(9);

      // Dragging left handle rightwards (positive deltaX) contracts, but stops at 6
      expect(calculateSnappedColSpan(meta, initialWidthPx, 300, "left", containerWidth)).toBe(6);
    });
  });

  describe("4. Balanced Layout Algorithm (Pair & Row Balancing)", () => {
    it("automatically balances row when an adjacent widget is resized within valid constraints", () => {
      const widgets: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true, colSpan: 7 }, // resized to 7
        { id: "daily_habits", visible: true, colSpan: 6 }, // 7 + 6 = 13 > 12
      ];

      const balanced = balanceDashboardLayout(widgets);
      // Habits smoothly adapts to 12 - 7 = 5 columns (which equals its minimum of 5!)
      expect(balanced[0].colSpan).toBe(7);
      expect(balanced[1].colSpan).toBe(5);
      expect(balanced[0].colSpan! + balanced[1].colSpan!).toBe(12);
    });

    it("reflows widgets naturally when resizing exceeds complementary minimums without violating constraints", () => {
      const widgets: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true, colSpan: 8 }, // resized to 8
        { id: "daily_habits", visible: true, colSpan: 5 }, // 12 - 8 = 4 < minCols (5)
      ];

      const balanced = balanceDashboardLayout(widgets);
      // Habits cannot shrink below 5, so it maintains its 5 cols and reflows naturally
      expect(balanced[0].colSpan).toBe(8);
      expect(balanced[1].colSpan).toBe(5);
    });

    it("balances 6 + 5 row into an equal 12-column row (6 + 6 = 12)", () => {
      const widgets: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true, colSpan: 6 },
        { id: "daily_habits", visible: true, colSpan: 5 }, // 6 + 5 = 11
      ];

      const balanced = balanceDashboardLayout(widgets);
      expect(balanced[0].colSpan).toBe(6);
      expect(balanced[1].colSpan).toBe(6); // Expanded to equal 6/6
      expect(balanced[0].colSpan! + balanced[1].colSpan!).toBe(12);
    });
  });

  describe("5. Vertical Resizing & Sensible Heights", () => {
    it("snaps height between compact, standard, and tall profiles", () => {
      const meta = DASHBOARD_WIDGET_METADATA.todays_focus;
      expect(calculateSnappedWidgetHeight(meta, 360, 150, "bottom")).toBe("tall");
      expect(calculateSnappedWidgetHeight(meta, 360, -150, "bottom")).toBe("compact");
    });

    it("restricts widgets to allowed height profiles (Overview cannot be tall)", () => {
      const meta = DASHBOARD_WIDGET_METADATA.daily_overview;
      expect(calculateSnappedWidgetHeight(meta, 350, 400, "bottom")).toBe("standard");
    });
  });

  describe("6. Backward Compatibility & Migration of Previous Layouts", () => {
    it("migrates legacy configs with missing colSpan into recommended 6/6 defaults without losing user settings", () => {
      const legacy: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true },
        { id: "daily_habits", visible: true },
      ];

      const resolved = resolveDashboardWidgets(legacy);
      const focus = resolved.find((w) => w.id === "todays_focus")!;
      const habits = resolved.find((w) => w.id === "daily_habits")!;

      expect(focus.colSpan).toBe(6);
      expect(habits.colSpan).toBe(6);
    });

    it("migrates previous 7/5 default arrangements to the new balanced 6/6 equal layout", () => {
      const oldDefaults: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true, colSpan: 7 },
        { id: "daily_habits", visible: true, colSpan: 5 },
        { id: "upcoming", visible: true, colSpan: 7 },
        { id: "mini_calendar", visible: true, colSpan: 5 },
      ];

      const resolved = resolveDashboardWidgets(oldDefaults);
      const focus = resolved.find((w) => w.id === "todays_focus")!;
      const habits = resolved.find((w) => w.id === "daily_habits")!;
      const upcoming = resolved.find((w) => w.id === "upcoming")!;
      const miniCal = resolved.find((w) => w.id === "mini_calendar")!;

      expect(focus.colSpan).toBe(6);
      expect(habits.colSpan).toBe(6);
      expect(upcoming.colSpan).toBe(6);
      expect(miniCal.colSpan).toBe(6);
    });

    it("clamps any legacy config violating minimum column constraints to the strict minimum", () => {
      // Individual helper checks
      expect(getWidgetColSpan({ id: "todays_focus", visible: true, colSpan: 3 })).toBe(6);
      expect(getWidgetColSpan({ id: "daily_habits", visible: true, colSpan: 2 })).toBe(5);

      const invalidLegacy: DashboardWidgetConfig[] = [
        { id: "todays_focus", visible: true, colSpan: 3 }, // < 6 -> clamped to 6
        { id: "daily_habits", visible: true, colSpan: 2 }, // < 5 -> clamped to 5 (then balanced to 6/6)
      ];

      const resolved = resolveDashboardWidgets(invalidLegacy);
      const focus = resolved.find((w) => w.id === "todays_focus")!;
      const habits = resolved.find((w) => w.id === "daily_habits")!;

      expect(focus.colSpan).toBe(6); // Clamped to minCols 6!
      expect(habits.colSpan).toBe(6); // Clamped to minCols 5 and balanced to 6!
    });
  });

  describe("7. Responsive Grid Spans & Helpers", () => {
    it("returns correct column spans from getWidgetColSpan helper", () => {
      expect(getWidgetColSpan({ id: "todays_focus", visible: true, colSpan: 7 })).toBe(7);
      expect(getWidgetColSpan({ id: "todays_focus", visible: true, colSpan: 3 })).toBe(6); // clamped to minCols 6
      expect(getWidgetColSpan({ id: "daily_habits", visible: true, colSpan: 2 })).toBe(5); // clamped to minCols 5
      expect(getWidgetColSpan({ id: "daily_overview", visible: true })).toBe(12);
    });
  });
});
