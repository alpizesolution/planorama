export type DashboardWidgetId =
  | "daily_overview"
  | "todays_focus"
  | "daily_habits"
  | "upcoming"
  | "mini_calendar"
  | "weekly_progress";

export type DashboardWidgetWidth = "small" | "medium" | "large" | "full";
export type DashboardWidgetHeight = "compact" | "standard" | "tall";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  visible: boolean;
  colSpan?: number; // 4..12 columns on desktop 12-column grid
  width?: DashboardWidgetWidth;
  height?: DashboardWidgetHeight;
  mobileVisible?: boolean;
  mobileHeight?: DashboardWidgetHeight;
}

export const WIDGET_WIDTH_LABELS: Record<
  DashboardWidgetWidth,
  { label: string; units: number; desc: string; short: string }
> = {
  small: { label: "Small", units: 1, desc: "1 grid unit", short: "1x" },
  medium: { label: "Medium", units: 2, desc: "2 grid units", short: "2x" },
  large: { label: "Large", units: 3, desc: "3 grid units", short: "3x" },
  full: { label: "Full Width", units: 4, desc: "Entire available row", short: "Full" },
};

export const WIDGET_HEIGHT_LABELS: Record<
  DashboardWidgetHeight,
  { label: string; desc: string; short: string }
> = {
  compact: { label: "Compact", desc: "Minimal height", short: "Sm" },
  standard: { label: "Standard", desc: "Default height", short: "Md" },
  tall: { label: "Tall", desc: "Expanded height", short: "Lg" },
};

export interface DashboardWidgetMeta {
  name: string;
  description: string;
  icon: string;
  badge?: string;
  minCols: number;          // Strictly enforced minimum 12-column width on desktop
  recommendedCols: number;  // Recommended balanced width (e.g. 7/5 arrangement)
  maxCols: number;          // Maximum 12-column width (12)
  allowedCols: number[];    // Valid column spans
  defaultWidth: DashboardWidgetWidth;
  defaultHeight: DashboardWidgetHeight;
  allowedWidths: DashboardWidgetWidth[];
  allowedHeights: DashboardWidgetHeight[];
  minWidth: DashboardWidgetWidth;
}

export const DASHBOARD_WIDGET_METADATA: Record<DashboardWidgetId, DashboardWidgetMeta> = {
  daily_overview: {
    name: "Daily Overview",
    description: "Today's summary stats, completion progress, and quick add.",
    icon: "☀️",
    badge: "Essential",
    minCols: 12,
    recommendedCols: 12,
    maxCols: 12,
    allowedCols: [12],
    defaultWidth: "full",
    defaultHeight: "standard",
    allowedWidths: ["full"],
    allowedHeights: ["compact", "standard"],
    minWidth: "full",
  },
  todays_focus: {
    name: "Today's Focus",
    description: "Prioritized list of today's tasks with quick completion and editing.",
    icon: "🎯",
    badge: "Core",
    minCols: 6, // Today's Focus MUST NEVER be smaller than 6 columns on desktop
    recommendedCols: 6,
    maxCols: 12,
    allowedCols: [6, 7, 8, 9, 10, 11, 12],
    defaultWidth: "medium",
    defaultHeight: "standard",
    allowedWidths: ["medium", "large", "full"],
    allowedHeights: ["compact", "standard", "tall"],
    minWidth: "medium",
  },
  daily_habits: {
    name: "Daily Habits",
    description: "Dedicated habit tracker with daily checklist, streaks, and progress.",
    icon: "💧",
    minCols: 5, // Prevent Daily Habits from shrinking below 5 columns
    recommendedCols: 6,
    maxCols: 12,
    allowedCols: [5, 6, 7, 8, 9, 10, 11, 12],
    defaultWidth: "medium",
    defaultHeight: "standard",
    allowedWidths: ["small", "medium", "large", "full"],
    allowedHeights: ["compact", "standard", "tall"],
    minWidth: "small",
  },
  upcoming: {
    name: "Upcoming",
    description: "Tasks and events scheduled for the next 7 days, grouped by date.",
    icon: "📅",
    minCols: 6,
    recommendedCols: 6,
    maxCols: 12,
    allowedCols: [6, 7, 8, 9, 10, 11, 12],
    defaultWidth: "medium",
    defaultHeight: "standard",
    allowedWidths: ["medium", "large", "full"],
    allowedHeights: ["compact", "standard", "tall"],
    minWidth: "medium",
  },
  mini_calendar: {
    name: "Mini Calendar",
    description: "Compact monthly calendar with theme styling, task indicators, and date selection.",
    icon: "🗓️",
    minCols: 4,
    recommendedCols: 6,
    maxCols: 12,
    allowedCols: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    defaultWidth: "medium",
    defaultHeight: "standard",
    allowedWidths: ["small", "medium", "large", "full"],
    allowedHeights: ["compact", "standard", "tall"],
    minWidth: "small",
  },
  weekly_progress: {
    name: "Weekly Progress",
    description: "Current week statistics, daily completion breakdown, and habit stats.",
    icon: "📊",
    minCols: 6,
    recommendedCols: 12,
    maxCols: 12,
    allowedCols: [6, 7, 8, 9, 10, 11, 12],
    defaultWidth: "full",
    defaultHeight: "standard",
    allowedWidths: ["medium", "large", "full"],
    allowedHeights: ["compact", "standard", "tall"],
    minWidth: "medium",
  },
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig[] = [
  {
    id: "daily_overview",
    visible: true,
    colSpan: 12,
    width: "full",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
  {
    id: "todays_focus",
    visible: true,
    colSpan: 6, // Row 2: 6 columns (equal 6/6 with Daily Habits)
    width: "medium",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
  {
    id: "daily_habits",
    visible: true,
    colSpan: 6, // Row 2: 6 columns (equal 6/6 with Today's Focus)
    width: "medium",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
  {
    id: "upcoming",
    visible: true,
    colSpan: 6, // Row 3: 6 columns (equal 6/6 with Mini Calendar)
    width: "medium",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
  {
    id: "mini_calendar",
    visible: true,
    colSpan: 6, // Row 3: 6 columns (equal 6/6 with Upcoming)
    width: "medium",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
  {
    id: "weekly_progress",
    visible: true,
    colSpan: 12, // Row 4: 12 columns full width
    width: "full",
    height: "standard",
    mobileVisible: true,
    mobileHeight: "standard",
  },
];

const VALID_WIDGET_IDS = new Set<DashboardWidgetId>([
  "daily_overview",
  "todays_focus",
  "daily_habits",
  "upcoming",
  "mini_calendar",
  "weekly_progress",
]);

const VALID_WIDTHS = new Set<DashboardWidgetWidth>(["small", "medium", "large", "full"]);
const VALID_HEIGHTS = new Set<DashboardWidgetHeight>(["compact", "standard", "tall"]);

/**
 * Validates and normalizes widget configurations.
 * Preserves user order, visibility, width, and height for recognized widgets.
 * Backfills missing properties with defaults and appends any missing standard widgets.
 */
export function resolveDashboardWidgets(
  configured?: unknown
): DashboardWidgetConfig[] {
  if (!Array.isArray(configured) || configured.length === 0) {
    return DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w }));
  }

  const seen = new Set<DashboardWidgetId>();
  const resolved: DashboardWidgetConfig[] = [];

  for (const item of configured) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      VALID_WIDGET_IDS.has((item as { id: string }).id as DashboardWidgetId) &&
      !seen.has((item as { id: DashboardWidgetId }).id)
    ) {
      const id = (item as { id: DashboardWidgetId }).id;
      seen.add(id);
      const meta = DASHBOARD_WIDGET_METADATA[id];

      // Validate width against allowed widths for this specific widget
      let width: DashboardWidgetWidth = meta.defaultWidth;
      const rawWidth = (item as { width?: unknown }).width;
      if (
        typeof rawWidth === "string" &&
        VALID_WIDTHS.has(rawWidth as DashboardWidgetWidth) &&
        meta.allowedWidths.includes(rawWidth as DashboardWidgetWidth)
      ) {
        width = rawWidth as DashboardWidgetWidth;
      }

      // Validate height against allowed heights for this specific widget
      let height: DashboardWidgetHeight = meta.defaultHeight;
      const rawHeight = (item as { height?: unknown }).height;
      if (
        typeof rawHeight === "string" &&
        VALID_HEIGHTS.has(rawHeight as DashboardWidgetHeight) &&
        meta.allowedHeights.includes(rawHeight as DashboardWidgetHeight)
      ) {
        height = rawHeight as DashboardWidgetHeight;
      }

      const visible =
        typeof (item as { visible?: unknown }).visible === "boolean"
          ? (item as { visible: boolean }).visible
          : true;

      const mobileVisible =
        typeof (item as { mobileVisible?: unknown }).mobileVisible === "boolean"
          ? (item as { mobileVisible: boolean }).mobileVisible
          : visible;

      let mobileHeight: DashboardWidgetHeight = height;
      const rawMobileHeight = (item as { mobileHeight?: unknown }).mobileHeight;
      if (
        typeof rawMobileHeight === "string" &&
        VALID_HEIGHTS.has(rawMobileHeight as DashboardWidgetHeight) &&
        meta.allowedHeights.includes(rawMobileHeight as DashboardWidgetHeight)
      ) {
        mobileHeight = rawMobileHeight as DashboardWidgetHeight;
      }

      // Strictly enforce minCols constraint on desktop
      let colSpan: number = meta.recommendedCols;
      const rawColSpan = (item as { colSpan?: unknown }).colSpan;
      if (typeof rawColSpan === "number" && !isNaN(rawColSpan)) {
        colSpan = Math.max(meta.minCols, Math.min(meta.maxCols, Math.round(rawColSpan)));
      } else if (width === "full") {
        colSpan = 12;
      } else if (width === "large") {
        colSpan = Math.max(meta.minCols, 9);
      } else if (width === "small") {
        colSpan = meta.minCols;
      } else {
        colSpan = meta.recommendedCols;
      }
      colSpan = Math.max(meta.minCols, Math.min(meta.maxCols, colSpan));

      resolved.push({
        id,
        visible,
        colSpan,
        width,
        height,
        mobileVisible,
        mobileHeight,
      });
    }
  }

  // Append any missing standard widgets
  for (const standard of DEFAULT_DASHBOARD_WIDGETS) {
    if (!seen.has(standard.id)) {
      resolved.push({ ...standard });
    }
  }

  // Migrate legacy 7/5 defaults to equal 6/6 layout
  const focus = resolved.find((w) => w.id === "todays_focus");
  const habits = resolved.find((w) => w.id === "daily_habits");
  if (focus && habits && focus.colSpan === 7 && habits.colSpan === 5) {
    focus.colSpan = 6;
    habits.colSpan = 6;
  }

  const upcoming = resolved.find((w) => w.id === "upcoming");
  const miniCal = resolved.find((w) => w.id === "mini_calendar");
  if (upcoming && miniCal && upcoming.colSpan === 7 && miniCal.colSpan === 5) {
    upcoming.colSpan = 6;
    miniCal.colSpan = 6;
  }

  return balanceDashboardLayout(resolved);
}

/**
 * Helper to cycle to the next allowed width for a widget.
 */
export function getNextWidgetWidth(
  id: DashboardWidgetId,
  currentWidth: DashboardWidgetWidth = "medium"
): DashboardWidgetWidth {
  const meta = DASHBOARD_WIDGET_METADATA[id];
  const allowed = meta.allowedWidths;
  const currentIndex = allowed.indexOf(currentWidth);
  if (currentIndex === -1 || currentIndex === allowed.length - 1) {
    return allowed[0];
  }
  return allowed[currentIndex + 1];
}

/**
 * Helper to cycle to the next allowed height for a widget.
 */
export function getNextWidgetHeight(
  id: DashboardWidgetId,
  currentHeight: DashboardWidgetHeight = "standard"
): DashboardWidgetHeight {
  const meta = DASHBOARD_WIDGET_METADATA[id];
  const allowed = meta.allowedHeights;
  const currentIndex = allowed.indexOf(currentHeight);
  if (currentIndex === -1 || currentIndex === allowed.length - 1) {
    return allowed[0];
  }
  return allowed[currentIndex + 1];
}

/**
 * Maps a widget width setting to its 12-column grid span.
 */
export const WIDGET_WIDTH_SPANS: Record<DashboardWidgetWidth, number> = {
  small: 3,
  medium: 6,
  large: 9,
  full: 12,
};

export function getWidgetColumnSpan(width: DashboardWidgetWidth = "medium"): number {
  return WIDGET_WIDTH_SPANS[width] ?? 6;
}

/**
 * Returns the effective 12-column span for a widget, enforcing strict minimum width constraints.
 */
export function getWidgetColSpan(widget: DashboardWidgetConfig, fallbackCols?: number): number {
  const meta = DASHBOARD_WIDGET_METADATA[widget.id];
  if (!meta) return 6;
  if (typeof widget.colSpan === "number" && !isNaN(widget.colSpan)) {
    return Math.max(meta.minCols, Math.min(meta.maxCols, widget.colSpan));
  }
  if (widget.width === "full") return 12;
  if (widget.width === "large") return Math.max(meta.minCols, 9);
  if (widget.width === "small") return meta.minCols;
  return fallbackCols ?? meta.recommendedCols;
}

/**
 * Automatically balances adjacent widgets in the dashboard grid to eliminate awkward whitespace,
 * maintain consistent row alignment, and prevent lopsided layouts while respecting widget minimums.
 */
export function balanceDashboardLayout(
  widgets: DashboardWidgetConfig[]
): DashboardWidgetConfig[] {
  if (!widgets || widgets.length <= 1) return widgets;

  const result = widgets.map((w) => ({ ...w }));
  const visible = result.filter((w) => w.visible);

  // Group into logical row pairs (e.g. Focus + Habits, Upcoming + Mini Calendar)
  for (let i = 0; i < visible.length - 1; i++) {
    const w1 = visible[i];
    const w2 = visible[i + 1];
    const meta1 = DASHBOARD_WIDGET_METADATA[w1.id];
    const meta2 = DASHBOARD_WIDGET_METADATA[w2.id];

    if (!meta1 || !meta2) continue;
    if (meta1.minCols === 12 || meta2.minCols === 12) continue;

    const span1 = getWidgetColSpan(w1);
    const span2 = getWidgetColSpan(w2);

    // If both are designed to fit on a 12-column row:
    // If they sum to > 12, but can fit if w2 adapts down to 12 - span1 (and >= meta2.minCols)
    if (span1 + span2 > 12 && 12 - span1 >= meta2.minCols && span1 <= 12 - meta2.minCols) {
      w2.colSpan = 12 - span1;
      continue;
    }

    // If they sum to 11 (e.g. 6 + 5), expand w2 to fill the full 12 columns if allowed
    if (span1 + span2 === 11 && span2 + 1 <= 6 && span2 + 1 <= meta2.maxCols) {
      w2.colSpan = span2 + 1;
      continue;
    }
  }

  return result;
}

export type ResizeDirection = "left" | "right" | "bottom" | "corner";

/**
 * Calculates snapped widget width from interactive drag offset.
 */
/**
 * Calculates snapped 12-column span from interactive drag offset, strictly enforcing minimum widths.
 */
export function calculateSnappedColSpan(
  meta: DashboardWidgetMeta,
  initialWidthPx: number,
  deltaX: number,
  direction: ResizeDirection,
  containerWidth: number
): number {
  if (direction === "bottom") {
    return meta.recommendedCols;
  }
  if (meta.minCols === meta.maxCols) {
    return meta.minCols; // Fixed full width widgets like daily_overview
  }

  const effectivePx = direction === "left" ? initialWidthPx - deltaX : initialWidthPx + deltaX;
  const colWidth = Math.max(containerWidth, 320) / 12;
  const rawCols = Math.round(effectivePx / colWidth);

  // Stop at the minimum boundary (e.g. Today's Focus cannot shrink below 6)
  return Math.max(meta.minCols, Math.min(meta.maxCols, rawCols));
}

export function calculateSnappedWidgetWidth(
  meta: DashboardWidgetMeta,
  initialWidthPx: number,
  deltaX: number,
  direction: ResizeDirection,
  containerWidth: number
): DashboardWidgetWidth {
  if (direction === "bottom") {
    return meta.defaultWidth;
  }

  const cols = calculateSnappedColSpan(meta, initialWidthPx, deltaX, direction, containerWidth);
  if (cols <= 4 && meta.allowedWidths.includes("small")) return "small";
  if (cols <= 7) return "medium";
  if (cols <= 10) return "large";
  return "full";
}

/**
 * Calculates snapped widget height from interactive drag offset.
 */
export function calculateSnappedWidgetHeight(
  meta: DashboardWidgetMeta,
  initialHeightPx: number,
  deltaY: number,
  direction: ResizeDirection
): DashboardWidgetHeight {
  if (direction === "left" || direction === "right") {
    return meta.defaultHeight;
  }

  const effectivePx = initialHeightPx + deltaY;

  let candidate: DashboardWidgetHeight = "standard";
  if (effectivePx < 280) {
    candidate = "compact";
  } else if (effectivePx > 450) {
    candidate = "tall";
  } else {
    candidate = "standard";
  }

  if (!meta.allowedHeights.includes(candidate)) {
    const heightOrder: DashboardWidgetHeight[] = ["compact", "standard", "tall"];
    const candidateIdx = heightOrder.indexOf(candidate);
    let closest = meta.allowedHeights[0];
    let minDiff = 999;
    for (const allowed of meta.allowedHeights) {
      const diff = Math.abs(heightOrder.indexOf(allowed) - candidateIdx);
      if (diff < minDiff) {
        minDiff = diff;
        closest = allowed;
      }
    }
    candidate = closest;
  }

  return candidate;
}
