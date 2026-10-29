import { describe, it, expect } from "vitest";
import {
  DEFAULT_ITEM_COLORS,
  isValidHexColor,
  normalizeHexColor,
  resolveItemColorPreferences,
  getItemType,
  getItemColor,
  EVENT_COLOR_PRESETS,
  TASK_COLOR_PRESETS,
  SCHEDULE_COLOR_PRESETS,
  TILE_STYLE_PRESETS,
  hexToRgb,
  rgbToHex,
  hexToRgba,
  getContrastingTextColor,
  darkenHex,
  lightenHex,
  shiftHue,
  resolveItemStylesPreferences,
  resolveCategoryTileStyle,
  DEFAULT_ITEM_STYLES,
  computeTileStyle,
  getItemTileStyle,
  getItemTextColor,
  getContrastRatio,
  isLowContrast,
  getSuggestedTextColor,
  getEffectiveTileBackground,
  TEXT_COLOR_PRESETS,
  BORDER_COLOR_PRESETS,
  type ItemStylesPreferences,
  type TileStylePreset,
} from "./item-color";
import type { PlannerTask } from "../schedule/types";

describe("PLANORAMA — Item Color Customization System", () => {
  describe("1. Hex Color Validation & Normalization", () => {
    it("validates valid 6-char and 3-char hex colors", () => {
      expect(isValidHexColor("#0284c7")).toBe(true);
      expect(isValidHexColor("#10B981")).toBe(true);
      expect(isValidHexColor("#fff")).toBe(true);
      expect(isValidHexColor("#A1C")).toBe(true);
    });

    it("rejects invalid hex strings", () => {
      expect(isValidHexColor("not-a-color")).toBe(false);
      expect(isValidHexColor("#12")).toBe(false);
      expect(isValidHexColor("#1234567")).toBe(false);
      expect(isValidHexColor("#GGG")).toBe(false);
      expect(isValidHexColor(null)).toBe(false);
      expect(isValidHexColor(undefined)).toBe(false);
    });

    it("normalizes hex colors by automatically prefixing hash and trimming", () => {
      expect(normalizeHexColor("0284c7", "#000000")).toBe("#0284c7");
      expect(normalizeHexColor("  #10b981  ", "#000000")).toBe("#10b981");
      expect(normalizeHexColor("invalid", "#fallback")).toBe("#fallback");
    });

    it("resolves user color preferences with safe default fallbacks", () => {
      const resolved = resolveItemColorPreferences({
        eventColor: "#3b82f6",
        taskColor: "invalid", // fallback
      });

      expect(resolved.eventColor).toBe("#3b82f6");
      expect(resolved.taskColor).toBe(DEFAULT_ITEM_COLORS.taskColor);
      expect(resolved.scheduleColor).toBe(DEFAULT_ITEM_COLORS.scheduleColor);
    });
  });

  describe("2. Item Type Resolution", () => {
    it("identifies explicit itemType", () => {
      expect(getItemType({ itemType: "event" })).toBe("event");
      expect(getItemType({ itemType: "task" })).toBe("task");
      expect(getItemType({ itemType: "appointment" })).toBe("appointment");
    });

    it("identifies Google Calendar items as events", () => {
      expect(getItemType({ isGoogleEvent: true })).toBe("event");
      expect(getItemType({ googleEventId: "google_123" })).toBe("event");
    });

    it("identifies appointment schedules", () => {
      expect(getItemType({ scheduleId: "sched_123" } as Partial<PlannerTask>)).toBe("appointment");
    });

    it("identifies default tasks", () => {
      expect(getItemType({ title: "Buy groceries", priority: "p2" })).toBe("task");
    });
  });

  describe("3. Item Color Resolution & Google Calendar Preservation", () => {
    const customPreferences = {
      eventColor: "#8b5cf6",    // Custom purple for events
      taskColor: "#f97316",     // Custom orange for tasks
      scheduleColor: "#06b6d4", // Custom turquoise for schedules
    };

    it("resolves custom event color for local events", () => {
      const localEvent: Partial<PlannerTask> = {
        id: "ev_1",
        title: "Sprint Planning",
        itemType: "event",
      };

      expect(getItemColor(localEvent, customPreferences)).toBe("#8b5cf6");
    });

    it("resolves custom task color for local tasks", () => {
      const localTask: Partial<PlannerTask> = {
        id: "task_1",
        title: "Fix bug in navbar",
        itemType: "task",
      };

      expect(getItemColor(localTask, customPreferences)).toBe("#f97316");
    });

    it("resolves custom schedule color for appointment schedules", () => {
      const apptItem: Partial<PlannerTask> = {
        id: "appt_1",
        title: "Office Hours Availability",
        itemType: "appointment",
      };

      expect(getItemColor(apptItem, customPreferences)).toBe("#06b6d4");
    });

    it("strictly preserves native Google Calendar color when syncing Google events", () => {
      const googleEvent: Partial<PlannerTask> = {
        id: "g_1",
        title: "Client Quarterly Review",
        isGoogleEvent: true,
        googleCalendarColor: "#EA4335", // Native Google Red
      };

      // Even with custom event color #8b5cf6, native Google event color must take precedence!
      expect(getItemColor(googleEvent, customPreferences)).toBe("#EA4335");
    });

    it("preserves Google Calendar config color when event does not have specific override", () => {
      const googleEvent: Partial<PlannerTask> = {
        id: "g_2",
        title: "Team Standup",
        isGoogleEvent: true,
        googleCalendarId: "cal_marketing",
      };

      const calendarConfigs = {
        cal_marketing: { color: "#34A853" }, // Google Green
      };

      expect(getItemColor(googleEvent, customPreferences, calendarConfigs)).toBe("#34A853");
    });

    it("honors explicit task color override if set", () => {
      const customColorTask: Partial<PlannerTask> = {
        id: "task_custom",
        title: "High Priority Launch",
        color: "#ff007f",
      };

      expect(getItemColor(customColorTask, customPreferences)).toBe("#ff007f");
    });
  });

  describe("4. Presets Palette Quality", () => {
    it("ensures all preset options have valid hex colors and human-readable labels", () => {
      for (const preset of [...EVENT_COLOR_PRESETS, ...TASK_COLOR_PRESETS, ...SCHEDULE_COLOR_PRESETS]) {
        expect(isValidHexColor(preset.hex)).toBe(true);
        expect(preset.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe("5. Tile Style Presets & Metadata", () => {
    it("exports all 5 required preset styles with metadata", () => {
      const ids = TILE_STYLE_PRESETS.map((p) => p.id);
      expect(ids).toContain("vibrant_solid");
      expect(ids).toContain("soft_pastel");
      expect(ids).toContain("color_pop");
      expect(ids).toContain("outline");
      expect(ids).toContain("minimal");
      expect(TILE_STYLE_PRESETS).toHaveLength(5);
    });

    it("has descriptive labels and descriptions for each preset", () => {
      for (const preset of TILE_STYLE_PRESETS) {
        expect(preset.label).toBeTruthy();
        expect(preset.description).toBeTruthy();
      }
    });
  });

  describe("6. Color Math & Contrast Helpers", () => {
    it("converts hex to RGB and back accurately", () => {
      const rgb = hexToRgb("#3b82f6");
      expect(rgb).toEqual({ r: 59, g: 130, b: 246 });
      expect(rgbToHex(59, 130, 246)).toBe("#3b82f6");
    });

    it("generates correct RGBA strings", () => {
      expect(hexToRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    });

    it("computes readable high-contrast text color based on luminance", () => {
      // Very light background -> dark text (#111827)
      expect(getContrastingTextColor("#ffffff")).toBe("#111827");
      expect(getContrastingTextColor("#fef08a")).toBe("#111827");

      // Very dark background -> white text (#ffffff)
      expect(getContrastingTextColor("#000000")).toBe("#ffffff");
      expect(getContrastingTextColor("#1e1e24")).toBe("#ffffff");
      expect(getContrastingTextColor("#1e3a8a")).toBe("#ffffff");
    });

    it("darkens and lightens hex colors correctly", () => {
      const darkened = darkenHex("#808080", 0.5);
      expect(darkened).toBe("#404040");

      const lightened = lightenHex("#000000", 0.5);
      expect(lightened).toBe("#808080");
    });

    it("shifts hue for vibrant color pop gradients", () => {
      const shifted = shiftHue("#ff0000", 60);
      expect(isValidHexColor(shifted)).toBe(true);
      expect(shifted).not.toBe("#ff0000");
    });
  });

  describe("7. Preferences Resolution & Migration", () => {
    it("resolves DEFAULT_ITEM_STYLES for empty preferences with unified global style", () => {
      const styles = resolveItemStylesPreferences();
      expect(styles.globalStyle).toBe("vibrant_solid");
      expect(styles.event.preset).toBe("vibrant_solid");
      expect(styles.task.preset).toBe("vibrant_solid");
      expect(styles.schedule.preset).toBe("vibrant_solid");
    });

    it("migrates legacy itemColors into category primary colors when itemStyles is absent", () => {
      const legacyColors = {
        eventColor: "#8b5cf6",
        taskColor: "#f97316",
        scheduleColor: "#06b6d4",
      };

      const resolved = resolveItemStylesPreferences(undefined, legacyColors);
      expect(resolved.event.primaryColor).toBe("#8b5cf6");
      expect(resolved.task.primaryColor).toBe("#f97316");
      expect(resolved.schedule.primaryColor).toBe("#06b6d4");
    });

    it("validates and falls back safely on invalid values", () => {
      const resolved = resolveCategoryTileStyle({
        preset: "invalid_preset" as unknown as TileStylePreset,
        primaryColor: "not_a_color",
        backgroundColor: "also_invalid",
      }, DEFAULT_ITEM_STYLES.event);

      expect(resolved.preset).toBe("vibrant_solid");
      expect(resolved.primaryColor).toBe(DEFAULT_ITEM_STYLES.event.primaryColor);
      expect(resolved.backgroundColor).toBeUndefined();
    });
  });

  describe("8. computeTileStyle & Presets Rendering", () => {
    it("computes Vibrant Solid style: saturated bg, high contrast text, solid border", () => {
      const style = computeTileStyle({
        preset: "vibrant_solid",
        primaryColor: "#0284c7",
      });

      expect(style.preset).toBe("vibrant_solid");
      expect(style.backgroundColor).toBe("#0284c7");
      expect(style.textColor).toBe("#ffffff");
      expect(style.borderColor).toBe("#0284c7");
      expect(style.className).toContain("tile-style-vibrant-solid");
    });

    it("computes Soft Pastel style: light pastel tint bg, colorful border, dark ink text", () => {
      const style = computeTileStyle({
        preset: "soft_pastel",
        primaryColor: "#0284c7",
      });

      expect(style.preset).toBe("soft_pastel");
      expect(style.backgroundColor).toContain("rgba(2, 132, 199");
      expect(style.borderColor).toBe("#0284c7");
      expect(style.textColor).toBe("#111827");
      expect(style.className).toContain("tile-style-soft-pastel");
    });

    it("computes Color Pop style: vibrant gradient, white text", () => {
      const style = computeTileStyle({
        preset: "color_pop",
        primaryColor: "#ec4899",
      });

      expect(style.preset).toBe("color_pop");
      expect(style.backgroundImage).toContain("linear-gradient");
      expect(style.textColor).toBe("#ffffff");
      expect(style.className).toContain("tile-style-color-pop");
    });

    it("computes Outline style: clean neutral background with prominent colored border", () => {
      const style = computeTileStyle({
        preset: "outline",
        primaryColor: "#10b981",
      });

      expect(style.preset).toBe("outline");
      expect(style.borderColor).toBe("#10b981");
      expect(style.style.borderLeftWidth).toBe("4px");
      expect(style.className).toContain("tile-style-outline");
    });

    it("computes Minimal style: subtle indicator bar, clean typography", () => {
      const style = computeTileStyle({
        preset: "minimal",
        primaryColor: "#f59e0b",
      });

      expect(style.preset).toBe("minimal");
      expect(style.className).toContain("tile-style-minimal");
      expect(style.indicatorColor).toBe("#f59e0b");
    });

    it("does not force appointment diagonal stripe pattern, but preserves completed styling", () => {
      const apptStyle = computeTileStyle(
        { preset: "soft_pastel", primaryColor: "#f59e0b" },
        true,  // isAppointment
        false  // isCompleted
      );
      // Appointment schedules must not have forced diagonal stripes or special pattern classes
      expect(apptStyle.backgroundImage).toBeUndefined();
      expect(apptStyle.className).not.toContain("is-appointment-pattern");

      const completedStyle = computeTileStyle(
        { preset: "vibrant_solid", primaryColor: "#0284c7" },
        false,
        true   // isCompleted
      );
      expect(completedStyle.className).toContain("is-tile-completed");
    });
  });

  describe("9. getItemTileStyle Integration & Global Tile Style", () => {
    it("respects the user's global Tile Style across Events, Tasks, and Schedules while preserving independent colors", () => {
      const customItemStyles: ItemStylesPreferences = {
        globalStyle: "outline",
        event: { primaryColor: "#2563eb" }, // Blue
        task: { primaryColor: "#10b981" },    // Green
        schedule: { primaryColor: "#f97316" }, // Orange
      };

      const eventTask: Partial<PlannerTask> = { itemType: "event", title: "Strategy Meeting" };
      const taskItem: Partial<PlannerTask> = { itemType: "task", title: "Review Contract" };
      const schedItem: Partial<PlannerTask> = { itemType: "appointment", title: "Office Hours" };

      const eventStyle = getItemTileStyle(eventTask, customItemStyles);
      const taskStyle = getItemTileStyle(taskItem, customItemStyles);
      const schedStyle = getItemTileStyle(schedItem, customItemStyles);

      // All three categories follow the same global style
      expect(eventStyle.preset).toBe("outline");
      expect(taskStyle.preset).toBe("outline");
      expect(schedStyle.preset).toBe("outline");

      // Each category retains its independently configured color
      expect(eventStyle.primaryColor).toBe("#2563eb");
      expect(taskStyle.primaryColor).toBe("#10b981");
      expect(schedStyle.primaryColor).toBe("#f97316");

      // Appointment schedules do NOT have forced diagonal stripes
      expect(schedStyle.backgroundImage).toBeUndefined();
      expect(schedStyle.className).not.toContain("is-appointment-pattern");
    });

    it("preserves native Google Calendar event color within the chosen preset style", () => {
      const itemStyles: ItemStylesPreferences = {
        globalStyle: "outline",
        event: { primaryColor: "#2563eb" },
        task: { primaryColor: "#10b981" },
        schedule: { primaryColor: "#f97316" },
      };

      const googleEvent: Partial<PlannerTask> = {
        itemType: "event",
        isGoogleEvent: true,
        googleCalendarColor: "#E67C73", // Native Google Flamingo
      };

      const style = getItemTileStyle(googleEvent, itemStyles);
      // Preset should follow the user's chosen outline style, but color must be Google's color!
      expect(style.preset).toBe("outline");
      expect(style.primaryColor).toBe("#E67C73");
      expect(style.borderColor).toBe("#E67C73");
    });
  });

  describe("10. Independent Text Color Customization & Resolution", () => {
    it("resolves independent text colors for Events, Tasks, and Appointment Schedules", () => {
      const customPreferences: ItemStylesPreferences = {
        globalStyle: "vibrant_solid",
        event: {
          color: "#0284c7",
          textColor: "#fef08a", // Custom yellow text for events
        },
        task: {
          color: "#10b981",
          textColor: "#111827", // Custom dark charcoal text for tasks
        },
        schedule: {
          color: "#f59e0b",
          textColor: "#ffffff", // Custom white text for schedules
        },
      };

      const resolved = resolveItemStylesPreferences(customPreferences);
      expect(resolved.event.textColor).toBe("#fef08a");
      expect(resolved.task.textColor).toBe("#111827");
      expect(resolved.schedule.textColor).toBe("#ffffff");

      const eventItem: Partial<PlannerTask> = { itemType: "event", title: "Keynote" };
      const taskItem: Partial<PlannerTask> = { itemType: "task", title: "Submit Taxes" };
      const schedItem: Partial<PlannerTask> = { itemType: "appointment", title: "Mentorship Window" };

      expect(getItemTextColor(eventItem, resolved)).toBe("#fef08a");
      expect(getItemTextColor(taskItem, resolved)).toBe("#111827");
      expect(getItemTextColor(schedItem, resolved)).toBe("#ffffff");
    });

    it("falls back gracefully when text color is invalid or missing", () => {
      const invalidTextPref = resolveCategoryTileStyle({
        textColor: "not-a-hex",
      }, DEFAULT_ITEM_STYLES.event);

      expect(invalidTextPref.textColor).toBe("#ffffff");
    });

    it("bridges legacy rawColors text colors when present", () => {
      const resolved = resolveItemStylesPreferences(undefined, {
        eventColor: "#0284c7",
        taskColor: "#10b981",
        scheduleColor: "#f59e0b",
        eventTextColor: "#fbcfe8",
        taskTextColor: "#1e293b",
      });

      expect(resolved.event.textColor).toBe("#fbcfe8");
      expect(resolved.task.textColor).toBe("#1e293b");
      expect(resolved.schedule.textColor).toBe(DEFAULT_ITEM_STYLES.schedule.textColor);
    });
  });

  describe("11. WCAG Contrast Ratio & Accessibility Calculations", () => {
    it("accurately calculates contrast ratio between colors", () => {
      // Pure black and pure white has contrast ratio 21:1
      const blackWhiteRatio = getContrastRatio("#ffffff", "#000000");
      expect(blackWhiteRatio).toBeGreaterThan(20);

      // Same color has contrast ratio 1:1
      const sameColorRatio = getContrastRatio("#ffffff", "#ffffff");
      expect(sameColorRatio).toBe(1);
    });

    it("flags low contrast combinations below WCAG AA threshold", () => {
      // Light yellow (#fef08a) on white (#ffffff) has very low contrast (< 2:1)
      expect(isLowContrast("#fef08a", "#ffffff", 4.5)).toBe(true);

      // Dark charcoal (#111827) on white (#ffffff) has high contrast (> 15:1)
      expect(isLowContrast("#111827", "#ffffff", 4.5)).toBe(false);
    });

    it("suggests the most readable text color for dark or light backgrounds", () => {
      // For very dark background (#0f172a), suggested text color must be White (#ffffff)
      expect(getSuggestedTextColor("#0f172a")).toBe("#ffffff");

      // For very light background (#f8fafc), suggested text color must be Dark (#111827)
      expect(getSuggestedTextColor("#f8fafc")).toBe("#111827");
    });

    it("computes effective tile background for different presets", () => {
      expect(getEffectiveTileBackground("outline", "#0284c7")).toBe("#ffffff");
      expect(getEffectiveTileBackground("minimal", "#0284c7")).toBe("#f8fafc");
      expect(getEffectiveTileBackground("vibrant_solid", "#0284c7")).toBe("#0284c7");
    });
  });

  describe("12. CSS Custom Property Variables Injection on Tiles", () => {
    it("injects --tile-text-color and --tile-bg-color in style object", () => {
      const computed = computeTileStyle({
        preset: "vibrant_solid",
        primaryColor: "#0284c7",
        textColor: "#fef08a",
        borderColor: "#0369a1",
      });

      expect(computed.textColor).toBe("#fef08a");
      expect((computed.style as Record<string, unknown>)["--tile-text-color"]).toBe("#fef08a");
      expect((computed.style as Record<string, unknown>)["--tile-bg-color"]).toBe("#0284c7");
      expect((computed.style as Record<string, unknown>)["--tile-border-color"]).toBe("#0369a1");
    });
  });

  describe("13. Task-level Custom Text Color Overrides", () => {
    it("allows a specific task to override category text color if set", () => {
      const styles: ItemStylesPreferences = {
        ...DEFAULT_ITEM_STYLES,
        event: {
          ...DEFAULT_ITEM_STYLES.event,
          textColor: "#ffffff",
        },
      };

      const taskWithCustomText: Partial<PlannerTask> = {
        itemType: "event",
        title: "VIP Executive Session",
        textColor: "#fed7aa",
      };

      const computed = getItemTileStyle(taskWithCustomText, styles);
      expect(computed.textColor).toBe("#fed7aa");
    });
  });

  describe("14. Curated Presets", () => {
    it("contains valid HEX codes for all text color presets", () => {
      expect(TEXT_COLOR_PRESETS.length).toBeGreaterThanOrEqual(6);
      for (const preset of TEXT_COLOR_PRESETS) {
        expect(isValidHexColor(preset.hex)).toBe(true);
      }
    });

    it("contains valid HEX codes for all border color presets", () => {
      expect(BORDER_COLOR_PRESETS.length).toBeGreaterThanOrEqual(6);
      for (const preset of BORDER_COLOR_PRESETS) {
        expect(isValidHexColor(preset.hex)).toBe(true);
      }
    });
  });
});

