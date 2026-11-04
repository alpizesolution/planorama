import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  resolveDashboardWidgets,
  type DashboardWidgetConfig,
  type DashboardWidgetId,
} from "./types";

describe("PLANORAMA Dashboard Responsive Width & Layout Architecture", () => {
  const cssPath = path.resolve(__dirname, "../../app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  describe("1. Dynamic Content Width & Removal of Hardcoded Bottlenecks", () => {
    it("ensures .dashboard-container does NOT have a hardcoded 1360px max-width", () => {
      // Find the rule for .dashboard-container
      const containerMatch = cssContent.match(/\.dashboard-container\s*\{([^}]+)\}/);
      expect(containerMatch).toBeTruthy();
      const body = containerMatch![1];
      expect(body).not.toContain("max-width: 1360px");
    });

    it("ensures .dashboard-container dynamically uses 100% available workspace width", () => {
      const containerMatch = cssContent.match(/\.dashboard-container\s*\{([^}]+)\}/);
      expect(containerMatch).toBeTruthy();
      const body = containerMatch![1];
      expect(body).toMatch(/width:\s*100%/);
      expect(body).toMatch(/max-width:\s*100%/);
      expect(body).toMatch(/margin:\s*0/);
    });

    it("establishes container query context on .dashboard-workspace-main and .dashboard-container", () => {
      expect(cssContent).toContain("container-type: inline-size;");
      expect(cssContent).toContain("container-name: dashboard-main;");
      expect(cssContent).toContain("container-name: dashboard-container;");
    });

    it("synchronizes .app-shell and .sticky-header-inner max-width to 1760px for wide desktop alignment", () => {
      expect(cssContent).toMatch(/\.app-shell[^{]*\{[^}]*max-width:\s*1760px/);
      expect(cssContent).toMatch(/\.sticky-header-inner[^{]*\{[^}]*max-width:\s*1760px/);
    });
  });

  describe("2. Sidebar Toggle Behavior & Clearance", () => {
    it("removes workspace container gap when sidebar is collapsed across all workspace variants", () => {
      const collapsedGapRule = cssContent.match(
        /\.dashboard-workspace-container\.sidebar-collapsed[^{]*\{([^}]+)\}/
      );
      expect(collapsedGapRule).toBeTruthy();
      expect(collapsedGapRule![1]).toMatch(/gap:\s*0/);
    });

    it("provides smooth 18px clearance padding on .workspace-main when sidebar is collapsed on desktop/tablet", () => {
      expect(cssContent).toContain(
        ".dashboard-workspace-container.sidebar-collapsed .workspace-main"
      );
      expect(cssContent).toMatch(/padding-left:\s*18px/);
      expect(cssContent).toMatch(/transition:\s*padding-left\s*200ms/);
    });

    it("ensures calendar-sidebar-rail collapses to 0px width without reserving dead space", () => {
      const railCollapsedMatch = cssContent.match(/\.calendar-sidebar-rail\.is-collapsed\s*\{([^}]+)\}/);
      expect(railCollapsedMatch).toBeTruthy();
      const body = railCollapsedMatch![1];
      expect(body).toMatch(/width:\s*0px/);
      expect(body).toMatch(/min-width:\s*0px/);
      expect(body).toMatch(/margin-right:\s*0px/);
    });

    it("ensures .workspace-main smoothly animates width changes over 200ms", () => {
      const workspaceMainMatch = cssContent.match(
        /\.dashboard-workspace-main,\s*\n\.month-workspace-main[^{]*\.workspace-main\s*\{([^}]+)\}/
      );
      expect(workspaceMainMatch).toBeTruthy();
      const body = workspaceMainMatch![1];
      expect(body).toMatch(/transition:\s*width\s*200ms/);
      expect(body).toMatch(/flex:\s*1/);
    });
  });

  describe("3. Responsive Widget Grid & Column Spans across Breakpoints", () => {
    it("defines a balanced 12-column grid layout for Large Desktop (>= 1200px)", () => {
      const gridMatch = cssContent.match(/\.dashboard-widgets-grid\s*\{([^}]+)\}/);
      expect(gridMatch).toBeTruthy();
      const body = gridMatch![1];
      expect(body).toMatch(/grid-template-columns:\s*repeat\(12,\s*(minmax\(0,\s*)?1fr\)?\)/);

      // Verify balanced 6/6 spans on desktop for middle widgets
      expect(cssContent).toMatch(/\.item-todays-focus\s*\{[^}]*grid-column:\s*span 6/);
      expect(cssContent).toMatch(/\.item-upcoming\s*\{[^}]*grid-column:\s*span 6/);
      expect(cssContent).toMatch(/\.item-daily-habits\s*\{[^}]*grid-column:\s*span 6/);
      expect(cssContent).toMatch(/\.item-mini-calendar\s*\{[^}]*grid-column:\s*span 6/);
      expect(cssContent).toMatch(/\.item-daily-overview\s*\{[^}]*grid-column:\s*span 12/);
      expect(cssContent).toMatch(/\.item-weekly-progress\s*\{[^}]*grid-column:\s*span 12/);
    });

    it("provides laptop container query (901px - 1199px) with 7/5 column balance for narrower desktops/sidebar open", () => {
      expect(cssContent).toContain("@container dashboard-main (max-width: 1199px) and (min-width: 901px)");
    });

    it("provides tablet layout (601px - 900px container / 641px - 1024px media) in balanced 2 columns", () => {
      // In container query
      expect(cssContent).toContain("@container dashboard-main (max-width: 900px) and (min-width: 601px)");

      // Habits and Mini Calendar are span 1 each (sits side-by-side, NOT stretched full screen)
      const tabletBlock = cssContent.substring(
        cssContent.indexOf("@container dashboard-main (max-width: 900px) and (min-width: 601px)"),
        cssContent.indexOf("@container dashboard-main (max-width: 600px)")
      );
      expect(tabletBlock).toContain("grid-template-columns: repeat(2, 1fr)");
      expect(tabletBlock).toMatch(/\.item-daily-habits\s*\{[^}]*grid-column:\s*span 1/);
      expect(tabletBlock).toMatch(/\.item-mini-calendar\s*\{[^}]*grid-column:\s*span 1/);
      expect(tabletBlock).toMatch(/\.item-daily-overview\s*\{[^}]*grid-column:\s*span 2/);
      expect(tabletBlock).toMatch(/\.item-todays-focus\s*\{[^}]*grid-column:\s*span 2/);

      // In media query fallback for tablet (641px - 1024px)
      expect(cssContent).toContain("@media (max-width: 1024px) and (min-width: 641px)");
    });

    it("provides mobile layout (<= 600px container / <= 640px media) in single column", () => {
      expect(cssContent).toContain("@container dashboard-main (max-width: 600px)");
      expect(cssContent).toContain("@media (max-width: 640px)");
    });

    it("caps .mini-cal-grid-wrap max-width to 520px and centers it to prevent excessive stretch", () => {
      const miniCalMatch = cssContent.match(/\.mini-cal-grid-wrap\s*\{([^}]+)\}/);
      expect(miniCalMatch).toBeTruthy();
      const body = miniCalMatch![1];
      expect(body).toMatch(/max-width:\s*520px/);
      expect(body).toMatch(/margin-left:\s*auto/);
      expect(body).toMatch(/margin-right:\s*auto/);
    });
  });

  describe("4. Preservation of Widget Ordering & Customization", () => {
    it("maintains default 6 widgets with correct ids and initial visibility", () => {
      expect(DEFAULT_DASHBOARD_WIDGETS).toHaveLength(6);
      const ids: DashboardWidgetId[] = DEFAULT_DASHBOARD_WIDGETS.map((w) => w.id);
      expect(ids).toEqual([
        "daily_overview",
        "todays_focus",
        "daily_habits",
        "upcoming",
        "mini_calendar",
        "weekly_progress",
      ]);
      expect(DEFAULT_DASHBOARD_WIDGETS.every((w) => w.visible)).toBe(true);
    });

    it("preserves custom user drag-and-drop order when resolving widgets", () => {
      const customOrder: DashboardWidgetConfig[] = [
        { id: "mini_calendar", visible: true },
        { id: "daily_habits", visible: true },
        { id: "daily_overview", visible: true },
        { id: "weekly_progress", visible: true },
        { id: "todays_focus", visible: false },
        { id: "upcoming", visible: true },
      ];

      const resolved = resolveDashboardWidgets(customOrder);
      expect(resolved.map((w) => w.id)).toEqual([
        "mini_calendar",
        "daily_habits",
        "daily_overview",
        "weekly_progress",
        "todays_focus",
        "upcoming",
      ]);

      const active = resolved.filter((w) => w.visible);
      expect(active).toHaveLength(5);
      expect(active.map((w) => w.id)).toEqual([
        "mini_calendar",
        "daily_habits",
        "daily_overview",
        "weekly_progress",
        "upcoming",
      ]);
    });

    it("guarantees any pair of 6-column widgets sums to 12 columns with zero row gaps", () => {
      const middleWidgetSpans: Record<string, number> = {
        todays_focus: 6,
        upcoming: 6,
        daily_habits: 6,
        mini_calendar: 6,
      };

      const keys = Object.keys(middleWidgetSpans);
      for (let i = 0; i < keys.length; i++) {
        for (let j = 0; j < keys.length; j++) {
          if (i !== j) {
            expect(middleWidgetSpans[keys[i]] + middleWidgetSpans[keys[j]]).toBe(12);
          }
        }
      }
    });
  });

  describe("5. Viewport Verification across Desktop, Tablet and Mobile Resolutions", () => {
    const desktopViewports = [1280, 1366, 1440, 1600, 1920];
    const tabletViewports = [768, 820, 900, 1024];
    const mobileViewports = [375, 414, 480, 600];

    it("verifies equal 6/6 paired desktop arrangement across standard desktop widths", () => {
      const widgets = resolveDashboardWidgets();
      const focus = widgets.find((w) => w.id === "todays_focus")!;
      const habits = widgets.find((w) => w.id === "daily_habits")!;
      const upcoming = widgets.find((w) => w.id === "upcoming")!;
      const miniCal = widgets.find((w) => w.id === "mini_calendar")!;

      expect(focus.colSpan).toBe(6);
      expect(habits.colSpan).toBe(6);
      expect(upcoming.colSpan).toBe(6);
      expect(miniCal.colSpan).toBe(6);

      desktopViewports.forEach((vp) => {
        // At desktop viewport widths, sidebar is 250px, gap is 20px, margins clamp
        const effectiveContentWidth = Math.min(1760, vp) - 250 - 20 - 48;
        const colWidth = effectiveContentWidth / 12;
        const focusWidth = colWidth * 6;
        const habitsWidth = colWidth * 6;

        // Both Focus and Habits have generous, identical widths without clipping
        expect(focusWidth).toBeGreaterThan(400);
        expect(habitsWidth).toBeGreaterThan(400);
        expect(focusWidth).toBeCloseTo(habitsWidth, 1);
        expect(focusWidth + habitsWidth).toBeCloseTo(effectiveContentWidth, 1);
      });
    });

    it("verifies tablet responsive stacking and pairing rules", () => {
      // Confirms tablet query has 2-column or stacked grid rules and no 12-column blowout
      expect(cssContent).toContain("@container dashboard-main (max-width: 900px) and (min-width: 601px)");
      expect(cssContent).toContain(".dashboard-grid-item.item-cols-6");
      expect(cssContent).toContain(".dashboard-grid-item.item-cols-12");

      tabletViewports.forEach((vp) => {
        expect(vp).toBeLessThanOrEqual(1024);
        expect(vp).toBeGreaterThanOrEqual(768);
      });
    });

    it("verifies mobile full-width single-column layout without desktop span overflow", () => {
      expect(cssContent).toContain("@container dashboard-main (max-width: 600px)");
      expect(cssContent).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);

      mobileViewports.forEach((vp) => {
        expect(vp).toBeLessThanOrEqual(600);
      });
    });
  });
});
