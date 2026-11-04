export type DashboardWidgetId =
  | "daily_overview"
  | "todays_focus"
  | "daily_habits"
  | "upcoming"
  | "mini_calendar"
  | "weekly_progress";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  visible: boolean;
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig[] = [
  { id: "daily_overview", visible: true },
  { id: "todays_focus", visible: true },
  { id: "daily_habits", visible: true },
  { id: "upcoming", visible: true },
  { id: "mini_calendar", visible: true },
  { id: "weekly_progress", visible: true },
];

export interface DashboardWidgetMeta {
  name: string;
  description: string;
  icon: string;
  badge?: string;
}

export const DASHBOARD_WIDGET_METADATA: Record<DashboardWidgetId, DashboardWidgetMeta> = {
  daily_overview: {
    name: "Daily Overview",
    description: "Today's summary stats, completion progress, and quick add.",
    icon: "☀️",
    badge: "Essential",
  },
  todays_focus: {
    name: "Today's Focus",
    description: "Prioritized list of today's tasks with quick completion and editing.",
    icon: "🎯",
    badge: "Core",
  },
  daily_habits: {
    name: "Daily Habits",
    description: "Dedicated habit tracker with daily checklist, streaks, and progress.",
    icon: "💧",
  },
  upcoming: {
    name: "Upcoming",
    description: "Tasks and events scheduled for the next 7 days, grouped by date.",
    icon: "📅",
  },
  mini_calendar: {
    name: "Mini Calendar",
    description: "Compact monthly calendar with theme styling, task indicators, and date selection.",
    icon: "🗓️",
  },
  weekly_progress: {
    name: "Weekly Progress",
    description: "Current week statistics, daily completion breakdown, and habit stats.",
    icon: "📊",
  },
};

/**
 * Validates and normalizes widget configurations.
 * Preserves user order and visibility for recognized widgets, and appends any missing
 * standard widgets at the end with their default visibility.
 */
export function resolveDashboardWidgets(
  configured?: unknown
): DashboardWidgetConfig[] {
  if (!Array.isArray(configured) || configured.length === 0) {
    return DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w }));
  }

  const validIds = new Set<DashboardWidgetId>([
    "daily_overview",
    "todays_focus",
    "daily_habits",
    "upcoming",
    "mini_calendar",
    "weekly_progress",
  ]);

  const seen = new Set<DashboardWidgetId>();
  const resolved: DashboardWidgetConfig[] = [];

  for (const item of configured) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      validIds.has(item.id as DashboardWidgetId) &&
      !seen.has(item.id as DashboardWidgetId)
    ) {
      const id = item.id as DashboardWidgetId;
      seen.add(id);
      resolved.push({
        id,
        visible: typeof item.visible === "boolean" ? item.visible : true,
      });
    }
  }

  // Append any missing standard widgets
  for (const standard of DEFAULT_DASHBOARD_WIDGETS) {
    if (!seen.has(standard.id)) {
      resolved.push({ ...standard });
    }
  }

  return resolved;
}
