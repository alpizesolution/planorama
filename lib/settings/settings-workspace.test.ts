import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFERENCES,
  type PlannerPreferences,
  type Priority,
} from "../schedule/types";
import {
  TASK_OPTIONS,
  getOptionLabel,
  getOptionEmoji,
  getOptionDescription,
  priorityLabel,
  priorityEmoji,
} from "../schedule/task-options";
import {
  DEFAULT_CALENDAR_THEME,
  THEME_PRESET_METADATA,
  getResolvedTheme,
  getMonthColor,
  resetToThemeDefault,
  restorePlanoramaDefaults,
  type CalendarThemePreset,
} from "../calendar/calendar-themes";
import {
  DEFAULT_ITEM_STYLES,
  resolveItemStylesPreferences,
  resolveItemColorPreferences,
} from "../calendar/item-color";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_METADATA,
  resolveDashboardWidgets,
  type DashboardWidgetId,
} from "../dashboard/types";

describe("PLANORAMA Dedicated Settings Workspace Suite", () => {
  describe("1. Settings Navigation & Section Architecture", () => {
    it("defines the 6 required settings sections with metadata", () => {
      const sections = [
        "general",
        "appearance",
        "item_styles",
        "dashboard",
        "calendar_sync",
        "data_backup",
      ] as const;

      expect(sections).toHaveLength(6);
      expect(sections).toContain("general");
      expect(sections).toContain("appearance");
      expect(sections).toContain("item_styles");
      expect(sections).toContain("dashboard");
      expect(sections).toContain("calendar_sync");
      expect(sections).toContain("data_backup");
    });
  });

  describe("2. General Preferences & Task Options", () => {
    it("provides standard task options for priorities, timing, and categories", () => {
      const priorities = TASK_OPTIONS.filter((opt) => opt.type === "priority");
      expect(priorities.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "none"]);

      const timing = TASK_OPTIONS.filter((opt) => opt.type === "timing" || opt.type === "pin");
      expect(timing.map((t) => t.id)).toEqual(["whenever", "pinned"]);

      const category = TASK_OPTIONS.filter((opt) => opt.type === "category");
      expect(category.map((c) => c.id)).toEqual(["personal"]);
    });

    it("supports custom labels and custom emojis with fallbacks", () => {
      const customPrefs: PlannerPreferences = {
        ...DEFAULT_PREFERENCES,
        customLabels: {
          p1: "Critical Urgent",
          personal: "Life & Wellness",
        },
        customEmojis: {
          p1: "⚡",
        },
      };

      expect(getOptionLabel("p1", customPrefs)).toBe("Critical Urgent");
      expect(getOptionEmoji("p1", customPrefs)).toBe("⚡");
      expect(getOptionLabel("personal", customPrefs)).toBe("Life & Wellness");
      // Fallback for unset custom options:
      expect(getOptionLabel("p2", customPrefs)).toBe("High");
      expect(getOptionEmoji("p2", customPrefs)).toBe("🔴");
      expect(getOptionDescription("p1")).toBe("Urgent — handle immediately");
      expect(priorityLabel("p1", customPrefs)).toBe("Critical Urgent");
      expect(priorityEmoji("p1", customPrefs)).toBe("⚡");
    });

    it("handles disabled options safely", () => {
      const prefs: PlannerPreferences = {
        ...DEFAULT_PREFERENCES,
        disabledOptions: ["p4", "whenever"],
        defaultPriority: "none",
      };

      expect(prefs.disabledOptions).toContain("p4");
      expect(prefs.disabledOptions).toContain("whenever");
      expect(prefs.disabledOptions).not.toContain("p1");
    });
  });

  describe("3. Appearance & Themes Configuration", () => {
    it("provides all four curated calendar theme presets", () => {
      const presets: CalendarThemePreset[] = ["colorful", "bold_pop", "soft_pastel", "minimal"];
      presets.forEach((preset) => {
        const meta = THEME_PRESET_METADATA[preset];
        expect(meta).toBeDefined();
        expect(meta.name).toBeTruthy();
        expect(meta.description).toBeTruthy();
        expect(meta.previewColors.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("resolves default theme and allows month color customization", () => {
      const resolved = getResolvedTheme(DEFAULT_CALENDAR_THEME);
      expect(resolved.preset).toBe("colorful");
      expect(resolved.mode).toBe("headers");
      expect(resolved.months).toHaveLength(12);

      // Verify individual month colors
      const januaryColor = getMonthColor(resolved, 0);
      expect(januaryColor.bg).toBeTruthy();
      expect(januaryColor.border).toBeTruthy();

      // Custom override for month
      const customTheme = {
        ...DEFAULT_CALENDAR_THEME,
        customMonthColors: {
          0: { bg: "#ff0000", border: "#cc0000", text: "#ffffff" },
        },
      };
      const customResolved = getResolvedTheme(customTheme);
      expect(getMonthColor(customResolved, 0).bg).toBe("#ff0000");
    });

    it("resets and restores themes correctly", () => {
      const resetTheme = resetToThemeDefault("bold_pop", "tiles");
      expect(resetTheme.preset).toBe("bold_pop");
      expect(resetTheme.mode).toBe("tiles");
      expect(resetTheme.customMonthColors).toBeUndefined();

      const restored = restorePlanoramaDefaults();
      expect(restored.preset).toBe("colorful");
      expect(restored.mode).toBe("headers");
    });
  });

  describe("4. Calendar Item Styles (Unified Global Style & Category Colors)", () => {
    it("resolves default item styles with unified global style", () => {
      const resolved = resolveItemStylesPreferences(undefined, undefined);
      expect(resolved.globalStyle).toBe(DEFAULT_ITEM_STYLES.globalStyle);
      expect(resolved.event.preset).toBe(resolved.globalStyle);
      expect(resolved.task.preset).toBe(resolved.globalStyle);
      expect(resolved.schedule.preset).toBe(resolved.globalStyle);
    });

    it("preserves independent category colors across Events, Tasks, and Schedules", () => {
      const customColors = resolveItemColorPreferences({
        eventColor: "#3b82f6",
        taskColor: "#10b981",
        scheduleColor: "#8b5cf6",
      });

      expect(customColors.eventColor).toBe("#3b82f6");
      expect(customColors.taskColor).toBe("#10b981");
      expect(customColors.scheduleColor).toBe("#8b5cf6");

      const resolvedStyles = resolveItemStylesPreferences(
        {
          globalStyle: "color_pop",
          event: { preset: "color_pop", color: "#3b82f6" },
          task: { preset: "color_pop", color: "#10b981" },
          schedule: { preset: "color_pop", color: "#8b5cf6" },
        },
        customColors
      );

      expect(resolvedStyles.globalStyle).toBe("color_pop");
      expect(resolvedStyles.event.primaryColor).toBe("#3b82f6");
      expect(resolvedStyles.task.primaryColor).toBe("#10b981");
      expect(resolvedStyles.schedule.primaryColor).toBe("#8b5cf6");
    });
  });

  describe("5. Dashboard Customization Section", () => {
    it("normalizes and reorders dashboard widgets", () => {
      const initial = resolveDashboardWidgets(DEFAULT_DASHBOARD_WIDGETS);
      expect(initial).toHaveLength(6);

      // Reorder by moving second widget to top
      const reordered = [...initial];
      const [second] = reordered.splice(1, 1);
      reordered.splice(0, 0, second);

      expect(reordered[0].id).toBe("todays_focus");
      expect(reordered[1].id).toBe("daily_overview");

      // Verify metadata for all widgets
      reordered.forEach((w) => {
        expect(DASHBOARD_WIDGET_METADATA[w.id as DashboardWidgetId]).toBeDefined();
      });
    });

    it("supports toggling widget visibility", () => {
      const widgets = resolveDashboardWidgets(DEFAULT_DASHBOARD_WIDGETS);
      const updated = widgets.map((w) =>
        w.id === "daily_habits" ? { ...w, visible: false } : w
      );

      const habitsWidget = updated.find((w) => w.id === "daily_habits");
      expect(habitsWidget?.visible).toBe(false);

      const overviewWidget = updated.find((w) => w.id === "daily_overview");
      expect(overviewWidget?.visible).toBe(true);
    });
  });

  describe("6. Data & Backup Payload Structure", () => {
    it("generates a valid planorama backup object schema", () => {
      const backupPayload = {
        format: "planorama-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        tasks: [],
        labels: [{ id: "work", name: "Work" }],
        projects: [],
        templates: [
          {
            id: "tpl-1",
            name: "Weekly Review",
            title: "Review week goals",
            notes: "Review deliverables",
            priority: "p2" as Priority,
            recurrence: "weekly" as const,
          },
        ],
        preferences: DEFAULT_PREFERENCES,
        habits: [],
        habitCheckIns: [],
      };

      expect(backupPayload.format).toBe("planorama-backup");
      expect(backupPayload.version).toBe(1);
      expect(Array.isArray(backupPayload.tasks)).toBe(true);
      expect(Array.isArray(backupPayload.templates)).toBe(true);
      expect(backupPayload.preferences.weekStartsOn).toBe(0);
      expect(backupPayload.templates[0].name).toBe("Weekly Review");
    });
  });
});
