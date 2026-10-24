import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_THEME,
  THEME_PALETTES,
  THEME_PRESET_METADATA,
  getMonthColor,
  getResolvedTheme,
  resetToThemeDefault,
  restorePlanoramaDefaults,
} from "./calendar-themes";

describe("Calendar Themes & Customization", () => {
  it("provides 4 built-in theme presets with 12 months each", () => {
    const presets = ["colorful", "bold_pop", "soft_pastel", "minimal"] as const;
    for (const preset of presets) {
      expect(THEME_PRESET_METADATA[preset]).toBeDefined();
      expect(THEME_PRESET_METADATA[preset].name).toBeTruthy();
      expect(THEME_PRESET_METADATA[preset].previewColors.length).toBeGreaterThanOrEqual(4);

      const palette = THEME_PALETTES[preset];
      expect(palette).toBeDefined();
      expect(palette.months).toHaveLength(12);
      expect(palette.calendarBg).toMatch(/^#/);
      expect(palette.weekendBg).toMatch(/^#/);
      expect(palette.todayBg).toMatch(/^#/);
      expect(palette.selectedBg).toMatch(/^#/);
      expect(palette.taskDotColor).toMatch(/^#/);

      for (let m = 0; m < 12; m++) {
        const month = palette.months[m];
        expect(month.bg).toMatch(/^#/);
        expect(month.border).toMatch(/^#/);
        expect(month.text).toMatch(/^#/);
        expect(month.tileBg).toMatch(/^#/);
      }
    }
  });

  it("resolves default Colorful theme when settings are undefined or empty", () => {
    const theme = getResolvedTheme();
    expect(theme.preset).toBe("colorful");
    expect(theme.mode).toBe("headers");
    expect(theme.months).toHaveLength(12);
    expect(theme.calendarBg).toBe("#fffdfa");
    expect(theme.todayBg).toBe("#ffe14d");
    expect(theme.selectedBg).toBe("#ff4d94");
  });

  it("resolves Bold Pop theme with vibrant accents", () => {
    const theme = getResolvedTheme({ preset: "bold_pop" });
    expect(theme.preset).toBe("bold_pop");
    expect(theme.selectedBg).toBe("#ff1e75");
    expect(theme.months[0].bg).toBe("#bae6fd"); // Jan Cyan Pop
  });

  it("resolves Soft Pastel theme with gentle shades", () => {
    const theme = getResolvedTheme({ preset: "soft_pastel" });
    expect(theme.preset).toBe("soft_pastel");
    expect(theme.selectedBg).toBe("#f27299");
    expect(theme.months[1].bg).toBe("#faf0f4"); // Feb Pale Rose
  });

  it("resolves Minimal theme with neutral stone and slate colors", () => {
    const theme = getResolvedTheme({ preset: "minimal" });
    expect(theme.preset).toBe("minimal");
    expect(theme.selectedBg).toBe("#1c1917");
    expect(theme.months[0].text).toBe("#44403c");
  });

  it("supports mode switching between 'headers' and 'tiles'", () => {
    const headersTheme = getResolvedTheme({ mode: "headers" });
    expect(headersTheme.mode).toBe("headers");

    const tilesTheme = getResolvedTheme({ mode: "tiles" });
    expect(tilesTheme.mode).toBe("tiles");
  });

  it("supports custom month color overrides without altering other months", () => {
    const customJan = {
      bg: "#123456",
      border: "#abcdef",
      text: "#ffffff",
      tileBg: "#f0f4f8",
    };
    const theme = getResolvedTheme({
      preset: "colorful",
      customMonthColors: { 0: customJan },
    });

    // Month 0 (January) is overridden
    expect(getMonthColor(theme, 0)).toEqual(customJan);

    // Month 1 (February) retains preset Colorful color
    expect(getMonthColor(theme, 1)).toEqual(THEME_PALETTES.colorful.months[1]);
  });

  it("supports global color customizations (calendarBg, weekendBg, todayBg, selectedBg, taskDotColor)", () => {
    const theme = getResolvedTheme({
      preset: "colorful",
      calendarBg: "#111111",
      weekendBg: "#222222",
      todayBg: "#333333",
      selectedBg: "#444444",
      taskDotColor: "#555555",
    });

    expect(theme.calendarBg).toBe("#111111");
    expect(theme.weekendBg).toBe("#222222");
    expect(theme.todayBg).toBe("#333333");
    expect(theme.selectedBg).toBe("#444444");
    expect(theme.taskDotColor).toBe("#555555");
  });

  it("resets custom overrides to theme default preserving active preset and mode", () => {
    const reset = resetToThemeDefault("bold_pop", "tiles");
    expect(reset).toEqual({
      preset: "bold_pop",
      mode: "tiles",
    });
    const resolved = getResolvedTheme(reset);
    expect(resolved.preset).toBe("bold_pop");
    expect(resolved.mode).toBe("tiles");
    expect(resolved.calendarBg).toBe(THEME_PALETTES.bold_pop.calendarBg);
  });

  it("restores Planorama Colorful defaults", () => {
    const defaults = restorePlanoramaDefaults();
    expect(defaults).toEqual(DEFAULT_CALENDAR_THEME);
    const resolved = getResolvedTheme(defaults);
    expect(resolved.preset).toBe("colorful");
    expect(resolved.mode).toBe("headers");
  });
});
