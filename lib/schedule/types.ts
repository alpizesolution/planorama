import type { CalendarThemeSettings } from "../calendar/calendar-themes";
import { DEFAULT_CALENDAR_THEME } from "../calendar/calendar-themes";
import type { DashboardWidgetConfig } from "../dashboard/types";
import { DEFAULT_DASHBOARD_WIDGETS } from "../dashboard/types";

export type Priority = "p1" | "p2" | "p3" | "p4" | "none";
export type TaskStatus = "open" | "in_progress" | "completed";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type TimingPreference = "scheduled" | "whenever";

export interface TaskAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export type PlannerTask = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  projectId: string | null;
  labelIds: string[];
  dueDate: string | null;
  dueTime: string | null;
  recurrence: Recurrence;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  isPersonal?: boolean;
  timingPreference?: TimingPreference;
  googleEventId?: string;
  googleCalendarId?: string;
  googleCalendarName?: string;
  googleCalendarColor?: string;
  googleHtmlLink?: string;
  isGoogleEvent?: boolean;
  isReadOnlyCalendar?: boolean;
  isPrivateAvailabilityOnly?: boolean;
  googleETag?: string;
  source?: "local" | "google";
  location?: string;
  attendees?: TaskAttendee[];
  googleAccountId?: string;
  googleAccountEmail?: string;
  lastSyncedAt?: string;
  syncStatus?: "synced" | "pending" | "conflict" | "error";
  recurringEventId?: string;
};

export type NewPlannerTask = Pick<PlannerTask, "title"> & Partial<Omit<PlannerTask, "id" | "title" | "createdAt" | "updatedAt">>;

export type PlannerPreferences = {
  theme?: "light" | "dark" | "system";
  weekStartsOn: 0 | 1 | 6;
  timeZone?: string;
  defaultSort: "due" | "priority" | "newest";
  defaultPriority: Priority;
  disabledOptions: string[];
  customLabels: Record<string, string>;
  customEmojis: Record<string, string>;
  calendarTheme?: CalendarThemeSettings;
  dashboardWidgets?: DashboardWidgetConfig[];
  googleCalendarSync?: import("../google-calendar/types").GoogleCalendarSyncSettings;
};

export const DEFAULT_PREFERENCES: PlannerPreferences = {
  theme: "system",
  weekStartsOn: 0,
  timeZone: "Asia/Manila",
  defaultSort: "due",
  defaultPriority: "none",
  disabledOptions: [],
  customLabels: {},
  customEmojis: {},
  calendarTheme: DEFAULT_CALENDAR_THEME,
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
};
