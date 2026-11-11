import type { PlannerTask } from "@/lib/schedule/types";
import { HOLIDAY_CATEGORY_LABELS } from "@/lib/calendar/holiday-utils";
import {
  PH_DATASET_VERSION,
  PH_OFFICIAL_YEARS,
  PH_STATUTORY_FIRST_YEAR,
  PH_STATUTORY_LAST_YEAR,
  PH_TIME_ZONE,
  phStatutoryHolidays,
} from "./ph-data";
import {
  DEFAULT_LOCAL_HOLIDAY_PREFERENCES,
  LOCAL_HOLIDAY_ID_PREFIX,
  type HolidayDataset,
  type LocalHolidayEntry,
  type LocalHolidayPreferences,
} from "./types";

/** Dedicated colour for the "Holidays" calendar source. */
export const LOCAL_HOLIDAYS_COLOR = "#e63946";
export const LOCAL_HOLIDAYS_TEXT_COLOR = "#ffffff";
export const LOCAL_HOLIDAYS_CALENDAR_NAME = "Holidays";

const CACHE_PREFIX = "planorama:local-holidays:v1:";
const memoryCache = new Map<string, HolidayDataset>();

/* ------------------------------------------------------------------ */
/* Countries                                                            */
/* ------------------------------------------------------------------ */

interface CountryProvider {
  code: string;
  name: string;
  calendarName: string;
  timeZone: string;
  version: number;
  build: (year: number, regionCode: string | null) => HolidayDataset;
}

function sortEntries(list: LocalHolidayEntry[]): LocalHolidayEntry[] {
  return list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function buildPhilippines(year: number, regionCode: string | null): HolidayDataset {
  const base = {
    countryCode: "PH",
    countryName: "Philippines",
    regionCode,
    calendarName: "Philippine National Holidays",
    timeZone: PH_TIME_ZONE,
    year,
  };

  const official = PH_OFFICIAL_YEARS[year];
  if (official) {
    return {
      ...base,
      status: "official",
      sourceLabel: official.proclamation,
      sourceUrl: official.url,
      pendingProclamations: official.pendingProclamations,
      note:
        official.pendingProclamations.length > 0
          ? `${official.pendingProclamations.join(" and ")} ${official.pendingProclamations.length > 1 ? "are" : "is"} not listed until officially proclaimed; estimated dates are never shown as holidays.`
          : undefined,
      holidays: sortEntries(official.holidays),
    };
  }

  if (year >= PH_STATUTORY_FIRST_YEAR && year <= PH_STATUTORY_LAST_YEAR) {
    return {
      ...base,
      status: "statutory",
      sourceLabel: "Holidays fixed by law (RA 9492, as amended by RA 10966)",
      pendingProclamations: ["Additional special non-working days", "Special working days", "Eid'l Fitr", "Eid'l Adha"],
      note: `The official ${year} proclamation has not been added yet. Only holidays fixed by law are shown; additional special days, special working days, Eid'l Fitr and Eid'l Adha will appear once officially proclaimed.`,
      holidays: phStatutoryHolidays(year),
    };
  }

  return {
    ...base,
    status: "unavailable",
    sourceLabel: "No dataset",
    pendingProclamations: [],
    note: `No Philippine holiday data is available for ${year}.`,
    holidays: [],
  };
}

const PROVIDERS: Record<string, CountryProvider> = {
  PH: {
    code: "PH",
    name: "Philippines",
    calendarName: "Philippine National Holidays",
    timeZone: PH_TIME_ZONE,
    version: PH_DATASET_VERSION,
    build: buildPhilippines,
  },
};

export function listSupportedCountries(): Array<{ code: string; name: string }> {
  return Object.values(PROVIDERS).map((p) => ({ code: p.code, name: p.name }));
}

export function resolveLocalHolidayPreferences(raw: unknown): LocalHolidayPreferences {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as Partial<LocalHolidayPreferences>;
  return {
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_LOCAL_HOLIDAY_PREFERENCES.enabled,
    countryCode:
      typeof parsed.countryCode === "string" && parsed.countryCode.trim()
        ? parsed.countryCode.trim().toUpperCase()
        : DEFAULT_LOCAL_HOLIDAY_PREFERENCES.countryCode,
    regionCode: typeof parsed.regionCode === "string" && parsed.regionCode.trim() ? parsed.regionCode.trim() : null,
    lastRefreshedAt: typeof parsed.lastRefreshedAt === "string" ? parsed.lastRefreshedAt : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Datasets + cache                                                     */
/* ------------------------------------------------------------------ */

function cacheKey(countryCode: string, regionCode: string | null, year: number): string {
  return `${countryCode}:${regionCode ?? "-"}:${year}`;
}

function readStoredDataset(key: string, version: number): HolidayDataset | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; dataset?: HolidayDataset };
    if (parsed.version !== version || !parsed.dataset || !Array.isArray(parsed.dataset.holidays)) return null;
    return parsed.dataset;
  } catch {
    return null;
  }
}

function writeStoredDataset(key: string, version: number, dataset: HolidayDataset): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ version, dataset }));
  } catch {
    // Storage unavailable/full: the in-memory cache is enough.
  }
}

/**
 * Loads the holiday dataset for a country/region/year. Never throws: an
 * unsupported country or a loading failure yields a dataset with
 * `status: "unavailable"` and an explanatory `note` so the UI can show a
 * useful error state instead of a blank page.
 */
export function getHolidayDataset(countryCode: string, year: number, regionCode: string | null = null): HolidayDataset {
  const code = (countryCode || DEFAULT_LOCAL_HOLIDAY_PREFERENCES.countryCode).toUpperCase();
  const key = cacheKey(code, regionCode, year);

  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;

  const provider = PROVIDERS[code];
  if (!provider) {
    return {
      countryCode: code,
      countryName: code,
      regionCode,
      calendarName: `${code} Holidays`,
      timeZone: PH_TIME_ZONE,
      year,
      status: "unavailable",
      sourceLabel: "No dataset",
      pendingProclamations: [],
      note: `Holiday data for country "${code}" is not available yet.`,
      holidays: [],
    };
  }

  const stored = readStoredDataset(key, provider.version);
  if (stored) {
    memoryCache.set(key, stored);
    return stored;
  }

  try {
    const dataset = provider.build(year, regionCode);
    memoryCache.set(key, dataset);
    if (dataset.status !== "unavailable") writeStoredDataset(key, provider.version, dataset);
    return dataset;
  } catch (err) {
    return {
      countryCode: code,
      countryName: provider.name,
      regionCode,
      calendarName: provider.calendarName,
      timeZone: provider.timeZone,
      year,
      status: "unavailable",
      sourceLabel: "Error",
      pendingProclamations: [],
      note: `Holiday data could not be loaded: ${err instanceof Error ? err.message : "unknown error"}.`,
      holidays: [],
    };
  }
}

/** Drops every cached holiday dataset (memory and storage) so the next read rebuilds it. */
export function refreshHolidayCache(): string {
  memoryCache.clear();
  try {
    if (typeof window !== "undefined") {
      const stale: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) stale.push(k);
      }
      stale.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {
    // ignore
  }
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Calendar integration                                                 */
/* ------------------------------------------------------------------ */

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function isLocalHolidayTask(task: Pick<PlannerTask, "id"> | null | undefined): boolean {
  return Boolean(task && typeof task.id === "string" && task.id.startsWith(LOCAL_HOLIDAY_ID_PREFIX));
}

function describe(dataset: HolidayDataset, entry: LocalHolidayEntry): string {
  const label = HOLIDAY_CATEGORY_LABELS[entry.classification];
  const kind = entry.additional ? `Additional ${label}` : label;
  return `${kind} · ${dataset.countryName} · ${dataset.sourceLabel}`;
}

/**
 * Converts one holiday into an all-day, read-only event. The id is derived from
 * country + date + name, so the same holiday always maps to the same record
 * (idempotent upsert): regenerating, refreshing or running a Google sync can
 * never create a second copy.
 */
export function holidayEntryToTask(dataset: HolidayDataset, entry: LocalHolidayEntry): PlannerTask {
  const stamp = `${dataset.year}-01-01T00:00:00.000Z`;
  return {
    id: `${LOCAL_HOLIDAY_ID_PREFIX}${dataset.countryCode}:${entry.date}:${slug(entry.name)}`,
    title: entry.name,
    notes: describe(dataset, entry),
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: entry.date,
    dueTime: null,
    recurrence: "none",
    createdAt: stamp,
    updatedAt: stamp,
    source: "local",
    isAllDay: true,
    isHoliday: true,
    eventType: "holiday",
    itemType: "event",
    isReadOnlyCalendar: true,
    color: LOCAL_HOLIDAYS_COLOR,
    textColor: LOCAL_HOLIDAYS_TEXT_COLOR,
    holidaySource: "local",
    holidayCategory: entry.classification,
    holidayCountry: dataset.countryCode,
    holidayAdditional: entry.additional === true,
  };
}

export function buildLocalHolidayTasks(prefs: LocalHolidayPreferences, years: number[]): PlannerTask[] {
  const out: PlannerTask[] = [];
  const seen = new Set<string>();
  for (const year of years) {
    const dataset = getHolidayDataset(prefs.countryCode, year, prefs.regionCode);
    for (const entry of dataset.holidays) {
      const task = holidayEntryToTask(dataset, entry);
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      out.push(task);
    }
  }
  return out;
}

const STOP_TOKENS = new Set(["day", "of", "the", "holiday", "ng", "and", "a"]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/labour/g, "labor")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

/** True when a Google holiday event is the same holiday as a local one on the same date. */
export function holidayNamesMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (ta.length === 0 || tb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return ta.some((t) => tb.has(t));
}

/**
 * Adds the Local Holidays calendar to an already filtered task list.
 *
 * - The holidays are derived on the fly and never written to task storage.
 * - When a Google holiday event is the same holiday on the same date, the
 *   Google copy is hidden in favour of the official local entry (not deleted),
 *   so enabling both sources never shows a holiday twice.
 */
export function mergeLocalHolidays(
  tasks: PlannerTask[],
  prefs: LocalHolidayPreferences,
  years: number[]
): PlannerTask[] {
  // Always drop previously merged local holidays first so merging is idempotent.
  const base = tasks.filter((t) => t.holidaySource !== "local");
  if (!prefs.enabled) return base;
  const local = buildLocalHolidayTasks(prefs, years);
  if (local.length === 0) return base;

  const localByDate = new Map<string, PlannerTask[]>();
  for (const h of local) {
    const list = localByDate.get(h.dueDate ?? "") ?? [];
    list.push(h);
    localByDate.set(h.dueDate ?? "", list);
  }

  const kept = base.filter((t) => {
    if (!t.isHoliday || !t.dueDate) return true;
    const sameDay = localByDate.get(t.dueDate);
    if (!sameDay) return true;
    return !sameDay.some((h) => holidayNamesMatch(t.title, h.title));
  });
  return [...kept, ...local];
}

/* ------------------------------------------------------------------ */
/* Dates (Asia/Manila safe)                                             */
/* ------------------------------------------------------------------ */

/** Today's calendar day (`YYYY-MM-DD`) in the given IANA time zone. */
export function getTodayKey(timeZone: string = PH_TIME_ZONE, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Whole days from dateA to dateB (both `YYYY-MM-DD`), independent of any time zone. */
export function daysBetween(dateA: string, dateB: string): number {
  const [ay, am, ad] = dateA.split("-").map(Number);
  const [by, bm, bd] = dateB.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The first holiday on or after `todayKey` (list need not be sorted). */
export function findNextHoliday<T extends { dueDate: string | null }>(holidays: T[], todayKey: string): T | null {
  let best: T | null = null;
  for (const h of holidays) {
    if (!h.dueDate || h.dueDate < todayKey) continue;
    if (!best || h.dueDate < (best.dueDate as string)) best = h;
  }
  return best;
}

/** Years the calendar views should be able to show. */
export function holidayYearsAround(todayKey: string, before = 2, after = 3): number[] {
  const year = Number(todayKey.slice(0, 4));
  const years: number[] = [];
  for (let y = year - before; y <= year + after; y++) years.push(y);
  return years;
}
