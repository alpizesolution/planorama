/**
 * Local Holidays: a built-in, offline holiday system that is completely
 * independent of Google Calendar. Dates are plain `YYYY-MM-DD` calendar-day
 * strings (never `Date`/ISO timestamps) so they can never shift across time
 * zones.
 */

export type HolidayClassification = "regular" | "special_non_working" | "special_working";

export interface LocalHolidayEntry {
  /** Calendar day, `YYYY-MM-DD` (Asia/Manila calendar day for the Philippines). */
  date: string;
  name: string;
  classification: HolidayClassification;
  /** True for days declared in addition to the statutory list (e.g. "Additional Special Non-Working Day"). */
  additional?: boolean;
}

/**
 * - `official`: taken from a signed proclamation for that year.
 * - `statutory`: only the days fixed by law; the year's proclamation has not been loaded yet.
 * - `unavailable`: no dataset exists (unsupported country/year) or loading failed.
 */
export type HolidayDatasetStatus = "official" | "statutory" | "unavailable";

export interface HolidayDataset {
  countryCode: string;
  countryName: string;
  regionCode: string | null;
  calendarName: string;
  timeZone: string;
  year: number;
  status: HolidayDatasetStatus;
  /** Human readable source, e.g. "Proclamation No. 1006, s. 2025". */
  sourceLabel: string;
  sourceUrl?: string;
  /** Short explanation shown to the user (limitations, pending proclamations, errors). */
  note?: string;
  /** Holidays that exist by law but whose dates are not yet officially proclaimed. */
  pendingProclamations: string[];
  holidays: LocalHolidayEntry[];
}

export interface LocalHolidayPreferences {
  /** Show the Holidays calendar in Dashboard/Day/Week/Month/Year/Yearline/Agenda. */
  enabled: boolean;
  countryCode: string;
  regionCode: string | null;
  /** Custom colour (`#rrggbb`) for holiday tiles; the default red is used when unset. */
  color?: string;
  /** ISO timestamp of the last manual refresh (informational). */
  lastRefreshedAt?: string;
}

export const DEFAULT_LOCAL_HOLIDAY_PREFERENCES: LocalHolidayPreferences = {
  enabled: true,
  countryCode: "PH",
  regionCode: null,
};

export const LOCAL_HOLIDAY_ID_PREFIX = "local-holiday:";
