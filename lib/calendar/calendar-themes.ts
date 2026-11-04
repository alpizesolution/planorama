export type CalendarThemePreset = "colorful" | "bold_pop" | "soft_pastel" | "minimal";
export type MonthColorMode = "headers" | "tiles";

export type MonthColorDefinition = {
  bg: string;       // Header background
  border: string;   // Accent border
  text: string;     // Text color on header
  tileBg?: string;  // Subtle tinted background for full tile mode
};

export type CalendarThemeSettings = {
  preset: CalendarThemePreset;
  mode: MonthColorMode;
  customMonthColors?: Record<number, MonthColorDefinition>; // 0 to 11
  calendarBg?: string;
  weekendBg?: string;
  todayBg?: string;
  selectedBg?: string;
  taskDotColor?: string;
};

export interface ResolvedCalendarTheme {
  preset: CalendarThemePreset;
  mode: MonthColorMode;
  months: MonthColorDefinition[];
  calendarBg: string;
  weekendBg: string;
  todayBg: string;
  selectedBg: string;
  taskDotColor: string;
}

export const THEME_PRESET_METADATA: Record<
  CalendarThemePreset,
  {
    id: CalendarThemePreset;
    name: string;
    description: string;
    badge?: string;
    previewColors: string[];
  }
> = {
  colorful: {
    id: "colorful",
    name: "Colorful",
    description: "Planorama's signature warm pastel palette with cheerful monthly hues.",
    badge: "Default",
    previewColors: ["#e0f2fe", "#fce7f3", "#dcfce7", "#f3e8ff", "#ffedd5"],
  },
  bold_pop: {
    id: "bold_pop",
    name: "Bold Pop",
    description: "Punchy, saturated neo-brutalist pop accents for high-energy planning.",
    previewColors: ["#38bdf8", "#f472b6", "#4ade80", "#c084fc", "#fb923c"],
  },
  soft_pastel: {
    id: "soft_pastel",
    name: "Soft Pastel",
    description: "Muted, calming watercolor shades designed for tranquil, gentle focus.",
    previewColors: ["#d8ebf2", "#f5dbe6", "#d5ebd9", "#e6dbf2", "#f2ded0"],
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Clean, restrained slate and stone neutrals with crisp contrast.",
    previewColors: ["#f5f5f4", "#e7e5e4", "#d6d3d1", "#a8a29e", "#57534e"],
  },
};

export const THEME_PALETTES: Record<
  CalendarThemePreset,
  {
    months: MonthColorDefinition[];
    calendarBg: string;
    weekendBg: string;
    todayBg: string;
    selectedBg: string;
    taskDotColor: string;
  }
> = {
  colorful: {
    calendarBg: "#fffdfa",
    weekendBg: "#f7f3ec",
    todayBg: "#ffe14d",
    selectedBg: "#ff4d94",
    taskDotColor: "#ff4d94",
    months: [
      { bg: "#e0f2fe", border: "#bae6fd", text: "#0369a1", tileBg: "#f0f9ff" }, // Jan: Sky Blue
      { bg: "#fce7f3", border: "#fbcfe8", text: "#be185d", tileBg: "#fdf2f8" }, // Feb: Rose Pink
      { bg: "#dcfce7", border: "#bbf7d0", text: "#15803d", tileBg: "#f0fdf4" }, // Mar: Mint Green
      { bg: "#f3e8ff", border: "#e9d5ff", text: "#7e22ce", tileBg: "#faf5ff" }, // Apr: Lavender
      { bg: "#ffedd5", border: "#fed7aa", text: "#c2410c", tileBg: "#fff7ed" }, // May: Warm Peach
      { bg: "#fef9c3", border: "#fef08a", text: "#a16207", tileBg: "#fefce8" }, // Jun: Sunshine
      { bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8", tileBg: "#eff6ff" }, // Jul: Soft Blue
      { bg: "#ffe4e6", border: "#fecdd3", text: "#be123c", tileBg: "#fff1f2" }, // Aug: Coral
      { bg: "#ccfbf1", border: "#99f6e4", text: "#0f766e", tileBg: "#f0fdfa" }, // Sep: Sage Teal
      { bg: "#fae8ff", border: "#f5d0fe", text: "#a21caf", tileBg: "#fdf4ff" }, // Oct: Orchid
      { bg: "#e0e7ff", border: "#c7d2fe", text: "#4338ca", tileBg: "#eef2ff" }, // Nov: Indigo
      { bg: "#f1f5f9", border: "#cbd5e1", text: "#334155", tileBg: "#f8fafc" }, // Dec: Slate
    ],
  },
  bold_pop: {
    calendarBg: "#fffef9",
    weekendBg: "#f2ece0",
    todayBg: "#ffd700",
    selectedBg: "#ff1e75",
    taskDotColor: "#ff1e75",
    months: [
      { bg: "#bae6fd", border: "#38bdf8", text: "#0284c7", tileBg: "#e0f2fe" }, // Jan: Cyan Pop
      { bg: "#fbcfe8", border: "#f472b6", text: "#db2777", tileBg: "#fce7f3" }, // Feb: Magenta Pop
      { bg: "#bbf7d0", border: "#4ade80", text: "#16a34a", tileBg: "#dcfce7" }, // Mar: Emerald Pop
      { bg: "#e9d5ff", border: "#c084fc", text: "#9333ea", tileBg: "#f3e8ff" }, // Apr: Violet Pop
      { bg: "#fed7aa", border: "#fb923c", text: "#ea580c", tileBg: "#ffedd5" }, // May: Tangerine Pop
      { bg: "#fef08a", border: "#facc15", text: "#ca8a04", tileBg: "#fef9c3" }, // Jun: Yellow Pop
      { bg: "#bfdbfe", border: "#60a5fa", text: "#2563eb", tileBg: "#dbeafe" }, // Jul: Blue Pop
      { bg: "#fecdd3", border: "#fb7185", text: "#e11d48", tileBg: "#ffe4e6" }, // Aug: Ruby Pop
      { bg: "#99f6e4", border: "#2dd4bf", text: "#0d9488", tileBg: "#ccfbf1" }, // Sep: Teal Pop
      { bg: "#f5d0fe", border: "#e879f9", text: "#c026d3", tileBg: "#fae8ff" }, // Oct: Orchid Pop
      { bg: "#c7d2fe", border: "#818cf8", text: "#4f46e5", tileBg: "#e0e7ff" }, // Nov: Indigo Pop
      { bg: "#cbd5e1", border: "#94a3b8", text: "#1e293b", tileBg: "#f1f5f9" }, // Dec: Slate Pop
    ],
  },
  soft_pastel: {
    calendarBg: "#faf8f4",
    weekendBg: "#f3eee5",
    todayBg: "#fae588",
    selectedBg: "#f27299",
    taskDotColor: "#e65c85",
    months: [
      { bg: "#f0f7fa", border: "#d8ebf2", text: "#3b6d80", tileBg: "#f7fafc" }, // Jan: Pale Ice
      { bg: "#faf0f4", border: "#f5dbe6", text: "#854460", tileBg: "#fdf8fa" }, // Feb: Pale Rose
      { bg: "#f0f8f3", border: "#d5ebd9", text: "#3d6b47", tileBg: "#f7fbf8" }, // Mar: Pale Mint
      { bg: "#f6f2fa", border: "#e6dbf2", text: "#614b78", tileBg: "#faf8fc" }, // Apr: Pale Lilac
      { bg: "#faf3ed", border: "#f2ded0", text: "#8a5839", tileBg: "#fdf9f5" }, // May: Pale Peach
      { bg: "#faf8eb", border: "#f2edcc", text: "#786b36", tileBg: "#fdfcf5" }, // Jun: Pale Sand
      { bg: "#f0f4fa", border: "#d6e2f5", text: "#3e5c8a", tileBg: "#f8fafe" }, // Jul: Pale Sky
      { bg: "#faf0f2", border: "#f5d8dd", text: "#8a424e", tileBg: "#fdf8f9" }, // Aug: Pale Coral
      { bg: "#edf8f7", border: "#cfedea", text: "#366e69", tileBg: "#f7fbfb" }, // Sep: Pale Sage
      { bg: "#f8f0fa", border: "#edd6f2", text: "#70407d", tileBg: "#fcf8fd" }, // Oct: Pale Lavender
      { bg: "#f2f3fa", border: "#d8daf2", text: "#474d7d", tileBg: "#f8f9fd" }, // Nov: Pale Periwinkle
      { bg: "#f3f4f6", border: "#dcdee3", text: "#474f5e", tileBg: "#f9fafb" }, // Dec: Pale Mist
    ],
  },
  minimal: {
    calendarBg: "#ffffff",
    weekendBg: "#f4f4f5",
    todayBg: "#e2e8f0",
    selectedBg: "#1c1917",
    taskDotColor: "#57534e",
    months: [
      { bg: "#f5f5f4", border: "#e7e5e4", text: "#44403c", tileBg: "#fafaf9" }, // Jan: Stone
      { bg: "#f4f4f5", border: "#e4e4e7", text: "#3f3f46", tileBg: "#fafafa" }, // Feb: Zinc
      { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151", tileBg: "#f9fafb" }, // Mar: Gray
      { bg: "#f1f5f9", border: "#e2e8f0", text: "#334155", tileBg: "#f8fafc" }, // Apr: Slate
      { bg: "#f5f5f4", border: "#e7e5e4", text: "#44403c", tileBg: "#fafaf9" }, // May: Warm Stone
      { bg: "#f4f4f5", border: "#e4e4e7", text: "#3f3f46", tileBg: "#fafafa" }, // Jun: Warm Zinc
      { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151", tileBg: "#f9fafb" }, // Jul: Warm Gray
      { bg: "#f1f5f9", border: "#e2e8f0", text: "#334155", tileBg: "#f8fafc" }, // Aug: Warm Slate
      { bg: "#f5f5f4", border: "#e7e5e4", text: "#44403c", tileBg: "#fafaf9" }, // Sep: Cool Stone
      { bg: "#f4f4f5", border: "#e4e4e7", text: "#3f3f46", tileBg: "#fafafa" }, // Oct: Cool Zinc
      { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151", tileBg: "#f9fafb" }, // Nov: Cool Gray
      { bg: "#f1f5f9", border: "#e2e8f0", text: "#334155", tileBg: "#f8fafc" }, // Dec: Cool Slate
    ],
  },
};

export const DEFAULT_CALENDAR_THEME: CalendarThemeSettings = {
  preset: "colorful",
  mode: "headers",
};

/**
 * Resolves full calendar theme with all presets, color mode, and custom overrides merged.
 */
export function getResolvedTheme(
  settings?: Partial<CalendarThemeSettings> | null
): ResolvedCalendarTheme {
  const preset: CalendarThemePreset =
    settings?.preset && settings.preset in THEME_PALETTES
      ? settings.preset
      : "colorful";

  const mode: MonthColorMode =
    settings?.mode === "tiles" ? "tiles" : "headers";

  const palette = THEME_PALETTES[preset];

  // Resolve 12 month colors, overlaying customMonthColors if defined
  const months: MonthColorDefinition[] = palette.months.map((baseMonth, idx) => {
    const custom = settings?.customMonthColors?.[idx];
    if (custom) {
      return {
        bg: custom.bg || baseMonth.bg,
        border: custom.border || baseMonth.border,
        text: custom.text || baseMonth.text,
        tileBg: custom.tileBg || baseMonth.tileBg,
      };
    }
    return { ...baseMonth };
  });

  return {
    preset,
    mode,
    months,
    calendarBg: settings?.calendarBg || palette.calendarBg,
    weekendBg: settings?.weekendBg || palette.weekendBg,
    todayBg: settings?.todayBg || palette.todayBg,
    selectedBg: settings?.selectedBg || palette.selectedBg,
    taskDotColor: settings?.taskDotColor || palette.taskDotColor,
  };
}

/**
 * Returns month color definition for a specific month index (0-11).
 */
export function getMonthColor(
  theme: ResolvedCalendarTheme,
  monthIndex: number
): MonthColorDefinition {
  const clamped = Math.max(0, Math.min(11, monthIndex));
  return theme.months[clamped];
}

/**
 * Resets custom overrides back to the active preset's default values.
 */
export function resetToThemeDefault(
  currentPreset: CalendarThemePreset,
  currentMode: MonthColorMode = "headers"
): CalendarThemeSettings {
  return {
    preset: currentPreset,
    mode: currentMode,
  };
}

/**
 * Restores Planorama's original Colorful theme defaults.
 */
export function restorePlanoramaDefaults(): CalendarThemeSettings {
  return {
    preset: "colorful",
    mode: "headers",
  };
}
