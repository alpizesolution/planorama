import type { HolidayClassification, LocalHolidayEntry } from "./types";

/**
 * Philippine national holiday data.
 *
 * Bump DATASET_VERSION whenever any data in this file changes so cached copies
 * are discarded.
 */
export const PH_DATASET_VERSION = 2;

export const PH_TIME_ZONE = "Asia/Manila";

const reg = (date: string, name: string): LocalHolidayEntry => ({ date, name, classification: "regular" });
const snw = (date: string, name: string, additional = false): LocalHolidayEntry => ({
  date,
  name,
  classification: "special_non_working",
  ...(additional ? { additional: true } : {}),
});
const swd = (date: string, name: string): LocalHolidayEntry => ({ date, name, classification: "special_working" });

export interface PhOfficialYear {
  year: number;
  proclamation: string;
  /** Later proclamations that add to (or amend) the main one, e.g. Eid'l Fitr / Eid'l Adha. */
  supplements?: string[];
  url?: string;
  holidays: LocalHolidayEntry[];
  /**
   * Holidays the proclamation leaves to a later proclamation. They are NOT
   * listed as holidays until officially declared, and are never estimated.
   */
  pendingProclamations: string[];
}

/**
 * Official proclamations. To add a year (or an Eid'l Fitr / Eid'l Adha
 * proclamation once issued), add an entry here (or append to `holidays`);
 * nothing else needs to change.
 */
export const PH_OFFICIAL_YEARS: Record<number, PhOfficialYear> = {
  2026: {
    year: 2026,
    proclamation: "Proclamation No. 1006, s. 2025",
    supplements: ["Proclamation No. 1189, s. 2026 (Eid'l Fitr)", "Proclamation No. 1264, s. 2026 (Eid'l Adha)"],
    url: "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/7/99678",
    // Both were declared later (Nos. 1189 and 1264), so nothing is pending for 2026.
    pendingProclamations: [],
    holidays: [
      reg("2026-01-01", "New Year's Day"),
      snw("2026-02-17", "Chinese New Year", true),
      swd("2026-02-25", "EDSA People Power Revolution Anniversary"),
      // Proclamation No. 1189, s. 2026 (signed 12 March 2026): Eid'l Fitr, regular holiday.
      reg("2026-03-20", "Eid'l Fitr"),
      reg("2026-04-02", "Maundy Thursday"),
      reg("2026-04-03", "Good Friday"),
      snw("2026-04-04", "Black Saturday", true),
      reg("2026-04-09", "Araw ng Kagitingan"),
      reg("2026-05-01", "Labor Day"),
      // Proclamation No. 1264, s. 2026 (signed 21 May 2026): Eid'l Adha, regular holiday.
      reg("2026-05-27", "Eid'l Adha"),
      reg("2026-06-12", "Independence Day"),
      snw("2026-08-21", "Ninoy Aquino Day"),
      reg("2026-08-31", "National Heroes Day"),
      snw("2026-11-01", "All Saints' Day"),
      snw("2026-11-02", "All Souls' Day", true),
      reg("2026-11-30", "Bonifacio Day"),
      snw("2026-12-08", "Feast of the Immaculate Conception of Mary"),
      snw("2026-12-24", "Christmas Eve", true),
      reg("2026-12-25", "Christmas Day"),
      reg("2026-12-30", "Rizal Day"),
      snw("2026-12-31", "Last Day of the Year"),
    ],
  },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function key(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm). Returns [month, day]. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function shiftDays(year: number, month: number, day: number, delta: number): string {
  // UTC arithmetic on a pure calendar date: no local time zone involved.
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function lastMondayOfAugust(year: number): string {
  const lastDay = new Date(Date.UTC(year, 8, 0)).getUTCDate(); // Aug 31
  const dow = new Date(Date.UTC(year, 7, lastDay)).getUTCDay(); // 0 = Sunday
  const offset = (dow + 6) % 7; // days since Monday
  return key(year, 8, lastDay - offset);
}

/** First year covered by the statutory baseline (RA 10966 added Dec 8 and Dec 31 from 2018). */
export const PH_STATUTORY_FIRST_YEAR = 2018;
export const PH_STATUTORY_LAST_YEAR = 2100;

/**
 * Days fixed by law (RA 9492 as amended by RA 10966): used for years whose
 * proclamation has not been added to PH_OFFICIAL_YEARS. It deliberately does
 * NOT include days that exist only by proclamation (additional special
 * non-working days, special working days, Eid'l Fitr, Eid'l Adha).
 */
export function phStatutoryHolidays(year: number): LocalHolidayEntry[] {
  const easter = easterSunday(year);
  const maundy = shiftDays(year, easter.month, easter.day, -3);
  const goodFriday = shiftDays(year, easter.month, easter.day, -2);
  const blackSaturday = shiftDays(year, easter.month, easter.day, -1);

  const list: LocalHolidayEntry[] = [
    reg(key(year, 1, 1), "New Year's Day"),
    reg(maundy, "Maundy Thursday"),
    reg(goodFriday, "Good Friday"),
    snw(blackSaturday, "Black Saturday"),
    reg(key(year, 4, 9), "Araw ng Kagitingan"),
    reg(key(year, 5, 1), "Labor Day"),
    reg(key(year, 6, 12), "Independence Day"),
    snw(key(year, 8, 21), "Ninoy Aquino Day"),
    reg(lastMondayOfAugust(year), "National Heroes Day"),
    snw(key(year, 11, 1), "All Saints' Day"),
    reg(key(year, 11, 30), "Bonifacio Day"),
    snw(key(year, 12, 8), "Feast of the Immaculate Conception of Mary"),
    reg(key(year, 12, 25), "Christmas Day"),
    reg(key(year, 12, 30), "Rizal Day"),
    snw(key(year, 12, 31), "Last Day of the Year"),
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export const HOLIDAY_CLASSIFICATION_ORDER: HolidayClassification[] = [
  "regular",
  "special_non_working",
  "special_working",
];
