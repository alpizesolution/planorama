import type { PlannerTask } from "../schedule/types";

export type PlannerItemType = "event" | "task" | "appointment";

export type TileStylePreset =
  | "vibrant_solid"
  | "soft_pastel"
  | "color_pop"
  | "outline"
  | "minimal";

export interface TileStyleMetadata {
  id: TileStylePreset;
  name: string;
  label: string;
  badge: string;
  description: string;
  icon: string;
}

export const TILE_STYLE_PRESETS: TileStyleMetadata[] = [
  {
    id: "vibrant_solid",
    name: "Vibrant Solid",
    label: "Vibrant Solid",
    badge: "Bold & Pop",
    description: "Bold, saturated background with crisp high-contrast text and solid borders.",
    icon: "⬛",
  },
  {
    id: "soft_pastel",
    name: "Soft Pastel",
    label: "Soft Pastel",
    badge: "Soft Tint",
    description: "Gentle pastel background tint with vibrant accent borders and dark readable text.",
    icon: "🟨",
  },
  {
    id: "color_pop",
    name: "Color Pop",
    label: "Color Pop",
    badge: "Gradient",
    description: "Eye-catching dual-tone gradient background with high-energy colorful accents.",
    icon: "🌈",
  },
  {
    id: "outline",
    name: "Outline",
    label: "Outline",
    badge: "Prominent Border",
    description: "Crisp neutral canvas with a prominent, colorful signature border and typography.",
    icon: "🔲",
  },
  {
    id: "minimal",
    name: "Minimal",
    label: "Minimal",
    badge: "Understated",
    description: "Understated background with clean typography and a focused signature color bar.",
    icon: "▫️",
  },
];

export interface CategoryTileStyle {
  style?: TileStylePreset;
  color?: string;
  preset?: TileStylePreset;
  primaryColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  indicatorColor?: string;
}

export interface ItemStylesPreferences {
  globalStyle?: TileStylePreset;
  preset?: TileStylePreset;
  style?: TileStylePreset;
  event: CategoryTileStyle;
  task: CategoryTileStyle;
  schedule: CategoryTileStyle;
}

export const DEFAULT_ITEM_STYLES: ItemStylesPreferences = {
  globalStyle: "vibrant_solid",
  preset: "vibrant_solid",
  style: "vibrant_solid",
  event: {
    style: "vibrant_solid",
    preset: "vibrant_solid",
    color: "#0284c7", // Sky Blue
    primaryColor: "#0284c7",
    textColor: "#ffffff",
  },
  task: {
    style: "vibrant_solid",
    preset: "vibrant_solid",
    color: "#10b981", // Emerald Green
    primaryColor: "#10b981",
    textColor: "#ffffff",
  },
  schedule: {
    style: "vibrant_solid",
    preset: "vibrant_solid",
    color: "#f59e0b", // Amber Gold
    primaryColor: "#f59e0b",
    textColor: "#ffffff",
  },
};

export interface ItemColorPreferences {
  eventColor: string;
  taskColor: string;
  scheduleColor: string;
  eventTextColor?: string;
  taskTextColor?: string;
  scheduleTextColor?: string;
  eventBorderColor?: string;
  taskBorderColor?: string;
  scheduleBorderColor?: string;
}

export const DEFAULT_ITEM_COLORS: ItemColorPreferences = {
  eventColor: DEFAULT_ITEM_STYLES.event.color || "#0284c7",
  taskColor: DEFAULT_ITEM_STYLES.task.color || "#10b981",
  scheduleColor: DEFAULT_ITEM_STYLES.schedule.color || "#f59e0b",
  eventTextColor: DEFAULT_ITEM_STYLES.event.textColor || "#ffffff",
  taskTextColor: DEFAULT_ITEM_STYLES.task.textColor || "#ffffff",
  scheduleTextColor: DEFAULT_ITEM_STYLES.schedule.textColor || "#ffffff",
};

export interface ColorPresetOption {
  hex: string;
  label: string;
}

export const TEXT_COLOR_PRESETS: ColorPresetOption[] = [
  { hex: "#ffffff", label: "Pure White" },
  { hex: "#111827", label: "Deep Charcoal" },
  { hex: "#1e293b", label: "Slate Navy" },
  { hex: "#fef08a", label: "Soft Yellow" },
  { hex: "#bae6fd", label: "Soft Sky" },
  { hex: "#bbf7d0", label: "Mint Green" },
  { hex: "#fbcfe8", label: "Pastel Pink" },
  { hex: "#fed7aa", label: "Warm Peach" },
];

export const BORDER_COLOR_PRESETS: ColorPresetOption[] = [
  { hex: "#0284c7", label: "Sky Blue" },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#f59e0b", label: "Amber Gold" },
  { hex: "#ef4444", label: "Crimson Red" },
  { hex: "#8b5cf6", label: "Purple" },
  { hex: "#0f172a", label: "Dark Slate" },
  { hex: "#cbd5e1", label: "Light Border" },
  { hex: "#ffffff", label: "White" },
];

export const EVENT_COLOR_PRESETS: ColorPresetOption[] = [
  { hex: "#0284c7", label: "Sky Blue (Default)" },
  { hex: "#3b82f6", label: "Royal Blue" },
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#8b5cf6", label: "Purple" },
  { hex: "#ec4899", label: "Planorama Pink" },
  { hex: "#06b6d4", label: "Cyan" },
  { hex: "#0f766e", label: "Deep Teal" },
  { hex: "#334155", label: "Slate Navy" },
];

export const TASK_COLOR_PRESETS: ColorPresetOption[] = [
  { hex: "#10b981", label: "Emerald (Default)" },
  { hex: "#16a34a", label: "Forest Green" },
  { hex: "#84cc16", label: "Lime" },
  { hex: "#14b8a6", label: "Mint Teal" },
  { hex: "#0ea5e9", label: "Electric Blue" },
  { hex: "#f97316", label: "Vibrant Orange" },
  { hex: "#e11d48", label: "Rose Red" },
  { hex: "#64748b", label: "Slate Grey" },
];

export const SCHEDULE_COLOR_PRESETS: ColorPresetOption[] = [
  { hex: "#f59e0b", label: "Amber Gold (Default)" },
  { hex: "#d97706", label: "Warm Ochre" },
  { hex: "#ea580c", label: "Sunset Orange" },
  { hex: "#eab308", label: "Sun Yellow" },
  { hex: "#8b5cf6", label: "Violet" },
  { hex: "#06b6d4", label: "Turquoise" },
  { hex: "#ec4899", label: "Hot Rose" },
  { hex: "#475569", label: "Charcoal" },
];

/**
 * Validates whether a given string is a valid 3-char or 6-char hex color code.
 */
export function isValidHexColor(color: unknown): boolean {
  if (typeof color !== "string") return false;
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color.trim());
}

/**
 * Normalizes a hex color string (adds '#' if missing, trims, verifies validity).
 * Returns fallback if invalid.
 */
export function normalizeHexColor(color: unknown, fallback: string): string {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return isValidHexColor(withHash) ? withHash : fallback;
}

/**
 * Converts a valid hex color string to RGB object.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidHexColor(hex)) return null;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Converts RGB numbers to 6-digit hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts a hex color to rgba(...) string with given alpha opacity (0..1).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampedAlpha})`;
}

/**
 * Calculates WCAG relative luminance of a hex color.
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Returns white (#ffffff) or dark charcoal (#111827) based on background luminance.
 */
export function getContrastingTextColor(hex: string): string {
  return getLuminance(hex) > 0.42 ? "#111827" : "#ffffff";
}

/**
 * Calculates WCAG 2.1 relative luminance contrast ratio between two hex colors (1..21).
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Number(ratio.toFixed(2));
}

/**
 * Checks whether the contrast ratio between text and background is below the recommended threshold (default 4.5 for WCAG AA).
 */
export function isLowContrast(textColor: string, bgColor: string, threshold = 4.5): boolean {
  return getContrastRatio(textColor, bgColor) < threshold;
}

/**
 * Returns suggested accessible text color (#ffffff or #111827) that provides higher contrast against the given background.
 */
export function getSuggestedTextColor(backgroundHex: string): string {
  const ratioWhite = getContrastRatio("#ffffff", backgroundHex);
  const ratioDark = getContrastRatio("#111827", backgroundHex);
  return ratioWhite >= ratioDark ? "#ffffff" : "#111827";
}

/**
 * Determines the effective background hex color for a given tile style preset and primary color.
 */
export function getEffectiveTileBackground(preset: TileStylePreset, primaryColor: string): string {
  if (preset === "outline") return "#ffffff";
  if (preset === "minimal") return "#f8fafc";
  if (preset === "soft_pastel") {
    const rgb = hexToRgb(primaryColor);
    if (!rgb) return "#ffffff";
    const r = Math.round(rgb.r * 0.14 + 255 * 0.86);
    const g = Math.round(rgb.g * 0.14 + 255 * 0.86);
    const b = Math.round(rgb.b * 0.14 + 255 * 0.86);
    return rgbToHex(r, g, b);
  }
  return primaryColor;
}

/**
 * Darkens a hex color by a ratio (0..1) or percentage (0..100).
 */
export function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const ratio = amount > 1 ? amount / 100 : amount;
  const factor = 1 - Math.max(0, Math.min(1, ratio));
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

/**
 * Lightens a hex color by a ratio (0..1) or percentage (0..100).
 */
export function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const ratio = amount > 1 ? amount / 100 : amount;
  const factor = Math.max(0, Math.min(1, ratio));
  return rgbToHex(
    rgb.r + (255 - rgb.r) * factor,
    rgb.g + (255 - rgb.g) * factor,
    rgb.b + (255 - rgb.b) * factor
  );
}

/**
 * Shifts the hue of a hex color by given degrees (0..360).
 */
export function shiftHue(hex: string, degrees: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  let shiftedH = (h * 360 + degrees) % 360;
  if (shiftedH < 0) shiftedH += 360;
  const newH = shiftedH / 360;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(
    hue2rgb(p, q, newH + 1 / 3) * 255,
    hue2rgb(p, q, newH) * 255,
    hue2rgb(p, q, newH - 1 / 3) * 255
  );
}

const VALID_STYLE_PRESETS = new Set<TileStylePreset>([
  "vibrant_solid",
  "soft_pastel",
  "color_pop",
  "outline",
  "minimal",
]);

/**
 * Validates and resolves a single category's tile style.
 */
export function resolveCategoryTileStyle(
  raw?: Partial<CategoryTileStyle> | null,
  fallback: CategoryTileStyle = DEFAULT_ITEM_STYLES.event
): CategoryTileStyle {
  const rawStyle = raw?.preset || raw?.style;
  const fallbackStyle = fallback.preset || fallback.style || "vibrant_solid";
  const style = (rawStyle && VALID_STYLE_PRESETS.has(rawStyle) ? rawStyle : fallbackStyle) as TileStylePreset;
  const rawColor = raw?.primaryColor || raw?.color;
  const fallbackColor = fallback.primaryColor || fallback.color || "#0284c7";
  const color = normalizeHexColor(rawColor, fallbackColor);

  const rawTextColor = raw?.textColor;
  const fallbackTextColor = fallback.textColor;
  const textColor = rawTextColor && isValidHexColor(rawTextColor)
    ? normalizeHexColor(rawTextColor, "#ffffff")
    : fallbackTextColor && isValidHexColor(fallbackTextColor)
    ? normalizeHexColor(fallbackTextColor, "#ffffff")
    : undefined;

  const rawBorderColor = raw?.borderColor;
  const fallbackBorderColor = fallback.borderColor;
  const borderColor = rawBorderColor && isValidHexColor(rawBorderColor)
    ? normalizeHexColor(rawBorderColor, color)
    : fallbackBorderColor && isValidHexColor(fallbackBorderColor)
    ? normalizeHexColor(fallbackBorderColor, color)
    : undefined;

  return {
    style,
    color,
    preset: style,
    primaryColor: color,
    backgroundColor: raw?.backgroundColor && isValidHexColor(raw.backgroundColor) ? normalizeHexColor(raw.backgroundColor, "") : undefined,
    borderColor,
    textColor,
    indicatorColor: raw?.indicatorColor && isValidHexColor(raw.indicatorColor) ? normalizeHexColor(raw.indicatorColor, "") : undefined,
  };
}

/**
 * Resolves full user item styles preferences with fallback defaults and legacy itemColors bridge.
 */
export function resolveItemStylesPreferences(
  rawStyles?: Partial<ItemStylesPreferences> | null,
  rawColors?: Partial<ItemColorPreferences> | null
): ItemStylesPreferences {
  // If legacy itemColors are provided without rawStyles, map colors over defaults
  const eventFallbackColor = rawColors?.eventColor && isValidHexColor(rawColors.eventColor)
    ? rawColors.eventColor
    : DEFAULT_ITEM_STYLES.event.color;
  const taskFallbackColor = rawColors?.taskColor && isValidHexColor(rawColors.taskColor)
    ? rawColors.taskColor
    : DEFAULT_ITEM_STYLES.task.color;
  const scheduleFallbackColor = rawColors?.scheduleColor && isValidHexColor(rawColors.scheduleColor)
    ? rawColors.scheduleColor
    : DEFAULT_ITEM_STYLES.schedule.color;

  const eventFallbackTextColor = rawColors?.eventTextColor && isValidHexColor(rawColors.eventTextColor)
    ? rawColors.eventTextColor
    : DEFAULT_ITEM_STYLES.event.textColor;
  const taskFallbackTextColor = rawColors?.taskTextColor && isValidHexColor(rawColors.taskTextColor)
    ? rawColors.taskTextColor
    : DEFAULT_ITEM_STYLES.task.textColor;
  const scheduleFallbackTextColor = rawColors?.scheduleTextColor && isValidHexColor(rawColors.scheduleTextColor)
    ? rawColors.scheduleTextColor
    : DEFAULT_ITEM_STYLES.schedule.textColor;

  const eventFallbackBorderColor = rawColors?.eventBorderColor && isValidHexColor(rawColors.eventBorderColor)
    ? rawColors.eventBorderColor
    : undefined;
  const taskFallbackBorderColor = rawColors?.taskBorderColor && isValidHexColor(rawColors.taskBorderColor)
    ? rawColors.taskBorderColor
    : undefined;
  const scheduleFallbackBorderColor = rawColors?.scheduleBorderColor && isValidHexColor(rawColors.scheduleBorderColor)
    ? rawColors.scheduleBorderColor
    : undefined;

  // Resolve global style preset (defaults to vibrant_solid)
  const rawGlobalStyle =
    rawStyles?.globalStyle ||
    rawStyles?.preset ||
    rawStyles?.style ||
    rawStyles?.event?.preset ||
    rawStyles?.event?.style;

  const globalStyle: TileStylePreset =
    rawGlobalStyle && VALID_STYLE_PRESETS.has(rawGlobalStyle)
      ? rawGlobalStyle
      : (DEFAULT_ITEM_STYLES.globalStyle || "vibrant_solid");

  const resolvedEvent = resolveCategoryTileStyle(rawStyles?.event, {
    ...DEFAULT_ITEM_STYLES.event,
    style: globalStyle,
    preset: globalStyle,
    color: eventFallbackColor,
    primaryColor: eventFallbackColor,
    textColor: eventFallbackTextColor,
    borderColor: eventFallbackBorderColor,
  });

  const resolvedTask = resolveCategoryTileStyle(rawStyles?.task, {
    ...DEFAULT_ITEM_STYLES.task,
    style: globalStyle,
    preset: globalStyle,
    color: taskFallbackColor,
    primaryColor: taskFallbackColor,
    textColor: taskFallbackTextColor,
    borderColor: taskFallbackBorderColor,
  });

  const resolvedSchedule = resolveCategoryTileStyle(rawStyles?.schedule, {
    ...DEFAULT_ITEM_STYLES.schedule,
    style: globalStyle,
    preset: globalStyle,
    color: scheduleFallbackColor,
    primaryColor: scheduleFallbackColor,
    textColor: scheduleFallbackTextColor,
    borderColor: scheduleFallbackBorderColor,
  });

  // Enforce global style preset across all three categories (Events, Tasks, Schedules)
  resolvedEvent.style = globalStyle;
  resolvedEvent.preset = globalStyle;
  resolvedTask.style = globalStyle;
  resolvedTask.preset = globalStyle;
  resolvedSchedule.style = globalStyle;
  resolvedSchedule.preset = globalStyle;

  return {
    globalStyle,
    preset: globalStyle,
    style: globalStyle,
    event: resolvedEvent,
    task: resolvedTask,
    schedule: resolvedSchedule,
  };
}

/**
 * Resolves user color preferences with safe fallback defaults.
 */
export function resolveItemColorPreferences(raw?: Partial<ItemColorPreferences> | null): ItemColorPreferences {
  return {
    eventColor: normalizeHexColor(raw?.eventColor, DEFAULT_ITEM_COLORS.eventColor),
    taskColor: normalizeHexColor(raw?.taskColor, DEFAULT_ITEM_COLORS.taskColor),
    scheduleColor: normalizeHexColor(raw?.scheduleColor, DEFAULT_ITEM_COLORS.scheduleColor),
    eventTextColor: raw?.eventTextColor && isValidHexColor(raw.eventTextColor)
      ? normalizeHexColor(raw.eventTextColor, DEFAULT_ITEM_COLORS.eventTextColor || "#ffffff")
      : DEFAULT_ITEM_COLORS.eventTextColor,
    taskTextColor: raw?.taskTextColor && isValidHexColor(raw.taskTextColor)
      ? normalizeHexColor(raw.taskTextColor, DEFAULT_ITEM_COLORS.taskTextColor || "#ffffff")
      : DEFAULT_ITEM_COLORS.taskTextColor,
    scheduleTextColor: raw?.scheduleTextColor && isValidHexColor(raw.scheduleTextColor)
      ? normalizeHexColor(raw.scheduleTextColor, DEFAULT_ITEM_COLORS.scheduleTextColor || "#ffffff")
      : DEFAULT_ITEM_COLORS.scheduleTextColor,
    eventBorderColor: raw?.eventBorderColor && isValidHexColor(raw.eventBorderColor)
      ? normalizeHexColor(raw.eventBorderColor, "")
      : undefined,
    taskBorderColor: raw?.taskBorderColor && isValidHexColor(raw.taskBorderColor)
      ? normalizeHexColor(raw.taskBorderColor, "")
      : undefined,
    scheduleBorderColor: raw?.scheduleBorderColor && isValidHexColor(raw.scheduleBorderColor)
      ? normalizeHexColor(raw.scheduleBorderColor, "")
      : undefined,
  };
}

/**
 * Determines whether a PlannerTask is an Event, Task, or Appointment Schedule.
 */
export function getItemType(task: Partial<PlannerTask>): PlannerItemType {
  if (task.itemType) {
    return task.itemType;
  }
  if ((task as { scheduleId?: string }).scheduleId) {
    return "appointment";
  }
  if (task.isGoogleEvent || task.googleEventId) {
    return "event";
  }
  // If created as an event (has duration or all-day with no project/priority)
  if (
    task.durationMinutes &&
    task.priority === "none" &&
    !task.projectId &&
    (!task.labelIds || task.labelIds.length === 0)
  ) {
    return "event";
  }
  return "task";
}

export interface ComputedTileStyle {
  preset: TileStylePreset;
  primaryColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  indicatorColor: string;
  backgroundImage?: string;
  className: string;
  style: React.CSSProperties;
}

/**
 * Computes exact CSS style tokens, colors, and classnames for a given category style.
 */
export function computeTileStyle(
  categoryStyle: Partial<CategoryTileStyle>,
  _isAppointment = false,
  isCompleted = false
): ComputedTileStyle {
  void _isAppointment;
  const preset: TileStylePreset = categoryStyle.preset || categoryStyle.style || "vibrant_solid";
  const primary: string =
    (categoryStyle.color && isValidHexColor(categoryStyle.color) ? categoryStyle.color : undefined) ||
    (categoryStyle.primaryColor && isValidHexColor(categoryStyle.primaryColor) ? categoryStyle.primaryColor : undefined) ||
    "#0284c7";

  let backgroundColor = "";
  let borderColor = "";
  let textColor = "";
  let indicatorColor = "";
  let backgroundImage: string | undefined = undefined;
  let borderLeftWidth = "4px";

  switch (preset) {
    case "vibrant_solid": {
      backgroundColor = categoryStyle.backgroundColor && isValidHexColor(categoryStyle.backgroundColor)
        ? categoryStyle.backgroundColor
        : primary;
      borderColor = categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor)
        ? categoryStyle.borderColor
        : primary;
      textColor = categoryStyle.textColor && isValidHexColor(categoryStyle.textColor)
        ? categoryStyle.textColor
        : getContrastingTextColor(backgroundColor);
      indicatorColor = categoryStyle.indicatorColor && isValidHexColor(categoryStyle.indicatorColor)
        ? categoryStyle.indicatorColor
        : textColor;
      borderLeftWidth = "4px";
      break;
    }

    case "soft_pastel": {
      backgroundColor = categoryStyle.backgroundColor && isValidHexColor(categoryStyle.backgroundColor)
        ? categoryStyle.backgroundColor
        : hexToRgba(primary, 0.14);
      borderColor = categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor)
        ? categoryStyle.borderColor
        : primary;
      textColor = categoryStyle.textColor && isValidHexColor(categoryStyle.textColor)
        ? categoryStyle.textColor
        : "#111827";
      indicatorColor = categoryStyle.indicatorColor && isValidHexColor(categoryStyle.indicatorColor)
        ? categoryStyle.indicatorColor
        : primary;
      borderLeftWidth = "4px";
      break;
    }

    case "color_pop": {
      const secondaryGradient = shiftHue(primary, 35);
      backgroundImage = `linear-gradient(135deg, ${primary} 0%, ${secondaryGradient} 100%)`;
      backgroundColor = categoryStyle.backgroundColor && isValidHexColor(categoryStyle.backgroundColor)
        ? categoryStyle.backgroundColor
        : primary;
      borderColor = categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor)
        ? categoryStyle.borderColor
        : darkenHex(primary, 25);
      textColor = categoryStyle.textColor && isValidHexColor(categoryStyle.textColor)
        ? categoryStyle.textColor
        : "#ffffff";
      indicatorColor = categoryStyle.indicatorColor && isValidHexColor(categoryStyle.indicatorColor)
        ? categoryStyle.indicatorColor
        : "#ffffff";
      borderLeftWidth = "4.5px";
      break;
    }

    case "outline": {
      backgroundColor = categoryStyle.backgroundColor && isValidHexColor(categoryStyle.backgroundColor)
        ? categoryStyle.backgroundColor
        : "#ffffff";
      borderColor = categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor)
        ? categoryStyle.borderColor
        : primary;
      textColor = categoryStyle.textColor && isValidHexColor(categoryStyle.textColor)
        ? categoryStyle.textColor
        : "#111827";
      indicatorColor = categoryStyle.indicatorColor && isValidHexColor(categoryStyle.indicatorColor)
        ? categoryStyle.indicatorColor
        : primary;
      borderLeftWidth = "4px";
      break;
    }

    case "minimal": {
      backgroundColor = categoryStyle.backgroundColor && isValidHexColor(categoryStyle.backgroundColor)
        ? categoryStyle.backgroundColor
        : "#f8fafc";
      borderColor = categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor)
        ? categoryStyle.borderColor
        : "#cbd5e1";
      textColor = categoryStyle.textColor && isValidHexColor(categoryStyle.textColor)
        ? categoryStyle.textColor
        : "#334155";
      indicatorColor = categoryStyle.indicatorColor && isValidHexColor(categoryStyle.indicatorColor)
        ? categoryStyle.indicatorColor
        : primary;
      borderLeftWidth = "3.5px";
      break;
    }
  }

  const className = [
    `tile-style-${preset.replace("_", "-")}`,
    isCompleted ? "is-tile-completed" : "",
  ].filter(Boolean).join(" ");

  const style: React.CSSProperties = {
    backgroundColor,
    backgroundImage,
    borderLeftColor: preset === "minimal" ? (categoryStyle.borderColor && isValidHexColor(categoryStyle.borderColor) ? categoryStyle.borderColor : primary) : borderColor,
    borderLeftWidth,
    color: textColor,
    ...(preset === "outline" ? { borderColor } : {}),
    ["--tile-text-color" as string]: textColor,
    ["--tile-bg-color" as string]: backgroundColor,
    ["--tile-border-color" as string]: borderColor,
    ["--tile-indicator-color" as string]: indicatorColor,
  };

  return {
    preset,
    primaryColor: primary,
    backgroundColor,
    borderColor,
    textColor,
    indicatorColor,
    backgroundImage,
    className,
    style,
  };
}

/**
 * Resolves the computed tile style for a PlannerTask:
 * - Identifies item type (event, task, appointment)
 * - Honors task custom color or native Google Calendar color
 * - Applies the user's customized tile style preset, colors, and background
 */
export function getItemTileStyle(
  task: Partial<PlannerTask>,
  itemStyles: ItemStylesPreferences = DEFAULT_ITEM_STYLES,
  allCalendarConfigs?: Record<string, { color?: string }>
): ComputedTileStyle {
  const type = getItemType(task);
  const isAppointment = type === "appointment";
  const isCompleted = task.status === "completed";

  // Base category configuration
  const baseCategoryStyle =
    type === "event"
      ? itemStyles.event || DEFAULT_ITEM_STYLES.event
      : type === "appointment"
      ? itemStyles.schedule || DEFAULT_ITEM_STYLES.schedule
      : itemStyles.task || DEFAULT_ITEM_STYLES.task;

  // Global tile style setting: all three categories respect the same global tile style
  const effectiveGlobalPreset = itemStyles.globalStyle || itemStyles.preset || itemStyles.style;
  const effectivePreset = effectiveGlobalPreset || baseCategoryStyle.preset || baseCategoryStyle.style || "vibrant_solid";

  // Resolve item primary color (handling Google Calendar & task custom color precedence)
  let effectiveColor: string = baseCategoryStyle.color || baseCategoryStyle.primaryColor || "#0284c7";

  if (task.color && isValidHexColor(task.color)) {
    effectiveColor = task.color;
  } else if (task.googleCalendarColor && isValidHexColor(task.googleCalendarColor)) {
    effectiveColor = task.googleCalendarColor;
  } else if (task.googleCalendarId && allCalendarConfigs?.[task.googleCalendarId]?.color) {
    const calColor = allCalendarConfigs[task.googleCalendarId].color;
    if (calColor && isValidHexColor(calColor)) {
      effectiveColor = calColor;
    }
  }

  // Resolve item text color (handling task-level textColor or base category textColor)
  const taskTextColor = (task as { textColor?: string }).textColor;
  const effectiveTextColor =
    taskTextColor && isValidHexColor(taskTextColor)
      ? taskTextColor
      : baseCategoryStyle.textColor && isValidHexColor(baseCategoryStyle.textColor)
      ? baseCategoryStyle.textColor
      : undefined;

  const effectiveBorderColor =
    baseCategoryStyle.borderColor && isValidHexColor(baseCategoryStyle.borderColor)
      ? baseCategoryStyle.borderColor
      : undefined;

  const effectiveCategoryStyle: CategoryTileStyle = {
    ...baseCategoryStyle,
    style: effectivePreset,
    preset: effectivePreset,
    color: effectiveColor,
    primaryColor: effectiveColor,
    textColor: effectiveTextColor,
    borderColor: effectiveBorderColor,
  };

  return computeTileStyle(effectiveCategoryStyle, isAppointment, isCompleted);
}

/**
 * Resolves the display color for a PlannerTask (convenience method preserving backward compatibility):
 * 1. Explicit task-level custom color (if set)
 * 2. Synced Google Calendar event color (preserves native Google Calendar colors)
 * 3. User's configured Event, Task, or Schedule color from preferences
 */
export function getItemColor(
  task: Partial<PlannerTask>,
  itemColors: ItemColorPreferences = DEFAULT_ITEM_COLORS,
  allCalendarConfigs?: Record<string, { color?: string }>
): string {
  // 1. Explicit task custom color
  if (task.color && isValidHexColor(task.color)) {
    return task.color;
  }

  // 2. Google Calendar synced event color (preserves native Google Calendar color)
  if (task.googleCalendarColor && isValidHexColor(task.googleCalendarColor)) {
    return task.googleCalendarColor;
  }
  if (task.googleCalendarId && allCalendarConfigs?.[task.googleCalendarId]?.color) {
    const calColor = allCalendarConfigs[task.googleCalendarId].color;
    if (calColor && isValidHexColor(calColor)) {
      return calColor;
    }
  }

  // 3. Fallback based on item type and user's color customization
  const type = getItemType(task);
  if (type === "event") {
    return itemColors.eventColor || DEFAULT_ITEM_COLORS.eventColor;
  }
  if (type === "appointment") {
    return itemColors.scheduleColor || DEFAULT_ITEM_COLORS.scheduleColor;
  }
  return itemColors.taskColor || DEFAULT_ITEM_COLORS.taskColor;
}

/**
 * Resolves the display text color for a PlannerTask.
 */
export function getItemTextColor(
  task: Partial<PlannerTask>,
  itemStyles: ItemStylesPreferences = DEFAULT_ITEM_STYLES,
  allCalendarConfigs?: Record<string, { color?: string }>
): string {
  return getItemTileStyle(task, itemStyles, allCalendarConfigs).textColor;
}
