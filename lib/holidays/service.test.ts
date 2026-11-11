import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlannerTask } from "@/lib/schedule/types";
import { isHolidayItem } from "@/lib/calendar/item-classifier";
import { extractHolidays, inferHolidayCategory } from "@/lib/calendar/holiday-utils";
import { DEFAULT_LOCAL_HOLIDAY_PREFERENCES, type LocalHolidayPreferences } from "./types";
import { phStatutoryHolidays, PH_OFFICIAL_YEARS } from "./ph-data";
import {
  buildLocalHolidayTasks,
  daysBetween,
  findNextHoliday,
  getHolidayDataset,
  getTodayKey,
  holidayNamesMatch,
  holidayYearsAround,
  isLocalHolidayTask,
  mergeLocalHolidays,
  refreshHolidayCache,
  resolveHolidayColor,
  resolveLocalHolidayPreferences,
} from "./service";

const prefs: LocalHolidayPreferences = { ...DEFAULT_LOCAL_HOLIDAY_PREFERENCES };

function googleEvent(overrides: Partial<PlannerTask>): PlannerTask {
  return {
    id: "g1",
    title: "Team sync",
    notes: "",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-03-10",
    dueTime: "09:00",
    recurrence: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isGoogleEvent: true,
    googleCalendarId: "primary",
    source: "google",
    ...overrides,
  };
}

beforeEach(() => {
  refreshHolidayCache();
});

describe("Philippine 2026 dataset (Proclamation No. 1006)", () => {
  const dataset = getHolidayDataset("PH", 2026);

  it("is marked official and cites the proclamation", () => {
    expect(dataset.status).toBe("official");
    expect(dataset.sourceLabel).toContain("Proclamation No. 1006");
    expect(dataset.timeZone).toBe("Asia/Manila");
  });

  it("contains every regular holiday", () => {
    const regular = dataset.holidays.filter((h) => h.classification === "regular").map((h) => `${h.date} ${h.name}`);
    expect(regular).toEqual([
      "2026-01-01 New Year's Day",
      "2026-04-02 Maundy Thursday",
      "2026-04-03 Good Friday",
      "2026-04-09 Araw ng Kagitingan",
      "2026-05-01 Labor Day",
      "2026-06-12 Independence Day",
      "2026-08-31 National Heroes Day",
      "2026-11-30 Bonifacio Day",
      "2026-12-25 Christmas Day",
      "2026-12-30 Rizal Day",
    ]);
  });

  it("contains special non-working days, additional special days and the special working day", () => {
    const snw = dataset.holidays.filter((h) => h.classification === "special_non_working");
    expect(snw.map((h) => h.date)).toEqual([
      "2026-02-17",
      "2026-04-04",
      "2026-08-21",
      "2026-11-01",
      "2026-11-02",
      "2026-12-08",
      "2026-12-24",
      "2026-12-31",
    ]);
    expect(snw.filter((h) => h.additional).map((h) => h.name)).toEqual([
      "Chinese New Year",
      "Black Saturday",
      "All Souls' Day",
      "Christmas Eve",
    ]);
    const working = dataset.holidays.filter((h) => h.classification === "special_working");
    expect(working).toEqual([
      { date: "2026-02-25", name: "EDSA People Power Revolution Anniversary", classification: "special_working" },
    ]);
  });

  it("does not list Eid'l Fitr / Eid'l Adha until they are officially proclaimed", () => {
    expect(dataset.holidays.some((h) => /eid/i.test(h.name))).toBe(false);
    expect(dataset.pendingProclamations).toEqual(["Eid'l Fitr", "Eid'l Adha"]);
    expect(dataset.note).toMatch(/not listed until officially proclaimed/i);
  });

  it("has unique dates + names, sorted chronologically", () => {
    const ids = dataset.holidays.map((h) => `${h.date}|${h.name}`);
    expect(new Set(ids).size).toBe(ids.length);
    const dates = dataset.holidays.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d.startsWith("2026-"))).toBe(true);
  });

  it("agrees with the statutory calculation for the days fixed by law", () => {
    const official = new Set(dataset.holidays.map((h) => `${h.date}|${h.classification}`));
    for (const h of phStatutoryHolidays(2026)) {
      expect(official.has(`${h.date}|${h.classification}`)).toBe(true);
    }
  });
});

describe("year-specific datasets", () => {
  it("2027 uses statutory days only and says the proclamation is pending", () => {
    const d = getHolidayDataset("PH", 2027);
    expect(d.status).toBe("statutory");
    expect(d.note).toMatch(/2027 proclamation has not been added/i);
    const byName = Object.fromEntries(d.holidays.map((h) => [h.name, h.date]));
    expect(byName["Maundy Thursday"]).toBe("2027-03-25");
    expect(byName["Good Friday"]).toBe("2027-03-26");
    expect(byName["Black Saturday"]).toBe("2027-03-27");
    expect(byName["National Heroes Day"]).toBe("2027-08-30");
    expect(d.holidays.every((h) => h.date.startsWith("2027-"))).toBe(true);
    expect(d.holidays.some((h) => h.classification === "special_working")).toBe(false);
  });

  it("switching 2026 -> 2027 -> 2026 loads the right data each time", () => {
    const a = buildLocalHolidayTasks(prefs, [2026]);
    const b = buildLocalHolidayTasks(prefs, [2027]);
    expect(a.every((t) => t.dueDate?.startsWith("2026-"))).toBe(true);
    expect(b.every((t) => t.dueDate?.startsWith("2027-"))).toBe(true);
    expect(a.length).toBe(PH_OFFICIAL_YEARS[2026].holidays.length);
    expect(buildLocalHolidayTasks(prefs, [2026]).map((t) => t.id)).toEqual(a.map((t) => t.id));
  });

  it("computes Holy Week from Easter for several years", () => {
    const check = (year: number, maundy: string, goodFriday: string) => {
      const list = phStatutoryHolidays(year);
      expect(list.find((h) => h.name === "Maundy Thursday")?.date).toBe(maundy);
      expect(list.find((h) => h.name === "Good Friday")?.date).toBe(goodFriday);
    };
    check(2025, "2025-04-17", "2025-04-18");
    check(2028, "2028-04-13", "2028-04-14");
    check(2030, "2030-04-18", "2030-04-19");
  });
});

describe("independence from Google Calendar", () => {
  it("a new user with no Google data still gets Philippine holidays", () => {
    const merged = mergeLocalHolidays([], prefs, [2026]);
    expect(merged.length).toBeGreaterThan(15);
    expect(merged.every((t) => t.isHoliday && t.isAllDay)).toBe(true);
    expect(merged.some((t) => t.title === "Christmas Day" && t.dueDate === "2026-12-25")).toBe(true);
  });

  it("an existing Google-connected user keeps their events and also sees holidays", () => {
    const events = [googleEvent({ id: "g1" }), googleEvent({ id: "g2", title: "Dentist", dueDate: "2026-06-01" })];
    const merged = mergeLocalHolidays(events, prefs, [2026]);
    expect(merged.filter((t) => t.isGoogleEvent).map((t) => t.id)).toEqual(["g1", "g2"]);
    expect(merged.some((t) => t.holidaySource === "local")).toBe(true);
  });

  it("holiday items are classified as holidays/events, never tasks, and are read-only", () => {
    const [first] = buildLocalHolidayTasks(prefs, [2026]);
    expect(isHolidayItem(first)).toBe(true);
    expect(first.isReadOnlyCalendar).toBe(true);
    expect(first.itemType).toBe("event");
    expect(first.dueTime).toBeNull();
    expect(isLocalHolidayTask(first)).toBe(true);
    expect(isLocalHolidayTask({ id: "abc" })).toBe(false);
  });

  it("uses its own colour, distinct from personal tasks and Google events", () => {
    const [first] = buildLocalHolidayTasks(prefs, [2026]);
    expect(first.color).toBe("#e63946");
    expect(first.googleCalendarId).toBeUndefined();
  });

  it("disabling the Holidays calendar removes only holidays", () => {
    const events = [googleEvent({ id: "g1" })];
    const merged = mergeLocalHolidays(events, { ...prefs, enabled: false }, [2026]);
    expect(merged).toEqual(events);
  });
});

describe("no duplicates when Google Calendar syncs", () => {
  const googleNewYear = googleEvent({
    id: "gh1",
    title: "New Year's Day",
    dueDate: "2026-01-01",
    isHoliday: true,
    isAllDay: true,
    eventType: "holiday",
    googleCalendarId: "en.philippines#holiday@group.v.calendar.google.com",
  });
  const googleLabour = googleEvent({
    id: "gh2",
    title: "Labour Day",
    dueDate: "2026-05-01",
    isHoliday: true,
    googleCalendarId: "en.philippines#holiday@group.v.calendar.google.com",
  });
  const googleObservance = googleEvent({
    id: "gh3",
    title: "Valentine's Day",
    dueDate: "2026-02-14",
    isHoliday: true,
    googleCalendarId: "en.philippines#holiday@group.v.calendar.google.com",
  });

  it("hides a synced Google holiday that is the same as a local one (same date + name)", () => {
    const merged = mergeLocalHolidays([googleNewYear, googleLabour, googleObservance], prefs, [2026]);
    const onNewYear = merged.filter((t) => t.dueDate === "2026-01-01");
    expect(onNewYear).toHaveLength(1);
    expect(onNewYear[0].holidaySource).toBe("local");
    expect(merged.filter((t) => t.dueDate === "2026-05-01")).toHaveLength(1); // Labour/Labor spelling
    // A Google-only observance with no local equivalent stays visible.
    expect(merged.some((t) => t.id === "gh3")).toBe(true);
  });

  it("keeps Google holidays when the local Holidays calendar is turned off", () => {
    const merged = mergeLocalHolidays([googleNewYear], { ...prefs, enabled: false }, [2026]);
    expect(merged).toEqual([googleNewYear]);
  });

  it("is idempotent: merging an already merged list never adds copies", () => {
    const once = mergeLocalHolidays([googleNewYear], prefs, [2026]);
    const twice = mergeLocalHolidays(once, prefs, [2026]);
    expect(twice.map((t) => t.id)).toEqual(once.map((t) => t.id));
    const ids = twice.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holiday ids are deterministic (safe upsert) across refreshes", () => {
    const before = buildLocalHolidayTasks(prefs, [2026]).map((t) => t.id);
    refreshHolidayCache();
    const after = buildLocalHolidayTasks(prefs, [2026]).map((t) => t.id);
    expect(after).toEqual(before);
  });

  it("name matching", () => {
    expect(holidayNamesMatch("National Heroes' Day", "National Heroes Day")).toBe(true);
    expect(holidayNamesMatch("Labour Day", "Labor Day")).toBe(true);
    expect(holidayNamesMatch("Valentine's Day", "Christmas Day")).toBe(false);
  });
});

describe("Asia/Manila dates", () => {
  it("holiday dates are plain calendar days that never shift", () => {
    const tasks = buildLocalHolidayTasks(prefs, [2026]);
    for (const t of tasks) {
      expect(t.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(tasks.find((t) => t.title === "Independence Day")?.dueDate).toBe("2026-06-12");
  });

  it("today's key uses the Manila calendar day, not UTC", () => {
    // 2026-12-31 17:00 UTC is already 2027-01-01 01:00 in Manila (UTC+8).
    const instant = new Date("2026-12-31T17:00:00.000Z");
    expect(getTodayKey("Asia/Manila", instant)).toBe("2027-01-01");
    expect(getTodayKey("UTC", instant)).toBe("2026-12-31");
    // 2026-06-11 16:30 UTC is 2026-06-12 00:30 in Manila: Independence Day has begun.
    expect(getTodayKey("Asia/Manila", new Date("2026-06-11T16:30:00.000Z"))).toBe("2026-06-12");
  });

  it("day arithmetic is time zone independent", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-02-01")).toBe(-28);
    expect(daysBetween("2026-06-12", "2026-06-12")).toBe(0);
  });

  it("finds the next upcoming holiday, including today", () => {
    const list = buildLocalHolidayTasks(prefs, [2026]);
    expect(findNextHoliday(list, "2026-11-11")?.dueDate).toBe("2026-11-30");
    expect(findNextHoliday(list, "2026-11-30")?.dueDate).toBe("2026-11-30");
    expect(findNextHoliday(list, "2027-01-01")).toBeNull();
  });

  it("covers a window of years around today", () => {
    expect(holidayYearsAround("2026-11-11")).toEqual([2024, 2025, 2026, 2027, 2028, 2029]);
  });
});

describe("missing or unavailable data", () => {
  it("never throws and explains an unsupported country", () => {
    const d = getHolidayDataset("ZZ", 2026);
    expect(d.status).toBe("unavailable");
    expect(d.holidays).toEqual([]);
    expect(d.note).toMatch(/not available/i);
  });

  it("explains an unsupported year", () => {
    const d = getHolidayDataset("PH", 1990);
    expect(d.status).toBe("unavailable");
    expect(d.note).toMatch(/1990/);
  });

  it("produces no calendar items (and no crash) for an unavailable country", () => {
    expect(buildLocalHolidayTasks({ ...prefs, countryCode: "ZZ" }, [2026])).toEqual([]);
    const events = [googleEvent({ id: "g1" })];
    expect(mergeLocalHolidays(events, { ...prefs, countryCode: "ZZ" }, [2026])).toEqual(events);
  });

  it("repairs invalid saved preferences", () => {
    expect(resolveLocalHolidayPreferences(undefined)).toEqual({ enabled: true, countryCode: "PH", regionCode: null, lastRefreshedAt: undefined });
    expect(resolveLocalHolidayPreferences({ enabled: false, countryCode: "ph" }).countryCode).toBe("PH");
    expect(resolveLocalHolidayPreferences({ enabled: "yes", countryCode: 5 }).enabled).toBe(true);
  });
});

describe("Holidays page data", () => {
  it("local holidays carry their official classification", () => {
    const tasks = buildLocalHolidayTasks(prefs, [2026]);
    expect(extractHolidays(tasks)).toHaveLength(tasks.length);
    const byTitle = (title: string) => tasks.find((t) => t.title === title)!;
    expect(inferHolidayCategory(byTitle("Christmas Day"))).toBe("regular");
    expect(inferHolidayCategory(byTitle("Christmas Eve"))).toBe("special_non_working");
    expect(inferHolidayCategory(byTitle("EDSA People Power Revolution Anniversary"))).toBe("special_working");
    // Keyword guessing would have called these "religious"; the official class wins.
    expect(inferHolidayCategory(byTitle("Good Friday"))).toBe("regular");
    expect(inferHolidayCategory(byTitle("All Saints' Day"))).toBe("special_non_working");
  });

  it("does not hardcode holiday data inside UI components", () => {
    const root = path.resolve(__dirname, "../..");
    for (const file of [
      "app/components/calendar/holidays-view.tsx",
      "app/components/calendar/agenda-view.tsx",
      "app/components/calendar/calendar-sidebar.tsx",
    ]) {
      const content = fs.readFileSync(path.join(root, file), "utf-8");
      expect(content).not.toMatch(/"20\d\d-\d\d-\d\d"/);
      expect(content).not.toMatch(/New Year's Day/);
    }
  });

  it("the Agenda lists holidays instead of filtering them out", () => {
    const root = path.resolve(__dirname, "../..");
    const content = fs.readFileSync(path.join(root, "app/components/calendar/agenda-view.tsx"), "utf-8");
    expect(content).not.toMatch(/filter\(\(t\) => t\.dueDate && !isHolidayItem/);
    expect(content).toMatch(/isHolidayItem\(t\) && \(t\.dueDate as string\) < todayKey/);
  });

  it("the page feeds every calendar view from the merged holiday list", () => {
    const root = path.resolve(__dirname, "../..");
    const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf-8");
    expect(page).toMatch(/mergeLocalHolidays\(/);
    expect((page.match(/tasks=\{calendarItems\}/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe("customisable holiday colour", () => {
  it("uses the user's colour for every holiday tile, with readable text", () => {
    const dark = buildLocalHolidayTasks({ ...prefs, color: "#1d4ed8" }, [2026]);
    expect(dark.every((t) => t.color === "#1d4ed8" && t.textColor === "#ffffff")).toBe(true);
    const light = buildLocalHolidayTasks({ ...prefs, color: "#fde047" }, [2026]);
    expect(light.every((t) => t.color === "#fde047" && t.textColor !== "#ffffff")).toBe(true);
  });

  it("falls back to the default red when the colour is missing or invalid", () => {
    expect(resolveHolidayColor(undefined)).toBe("#e63946");
    expect(resolveHolidayColor("red")).toBe("#e63946");
    expect(resolveHolidayColor("#ABCDEF")).toBe("#abcdef");
    expect(buildLocalHolidayTasks({ ...prefs, color: "nope" }, [2026])[0].color).toBe("#e63946");
  });

  it("keeps a valid saved colour and drops an invalid one", () => {
    expect(resolveLocalHolidayPreferences({ color: "#16A34A" }).color).toBe("#16a34a");
    expect(resolveLocalHolidayPreferences({ color: "<script>" }).color).toBeUndefined();
  });

  it("a colour change does not change ids (no duplicates, just a recolour)", () => {
    const a = buildLocalHolidayTasks(prefs, [2026]).map((t) => t.id);
    const b = buildLocalHolidayTasks({ ...prefs, color: "#16a34a" }, [2026]).map((t) => t.id);
    expect(b).toEqual(a);
  });
});

describe("Year and Yearline views", () => {
  const root = path.resolve(__dirname, "../..");
  it("the Year view marks holiday days in the holiday colour", () => {
    const year = fs.readFileSync(path.join(root, "app/components/calendar/year-view.tsx"), "utf-8");
    expect(year).toMatch(/isHoliday/);
    expect(year).toMatch(/has-holiday/);
  });

  it("the Yearline renders from the merged list (holidays included) but counts only real tasks", () => {
    const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf-8");
    expect(page).toMatch(/for \(const t of calendarItems\)/);
    expect(page).toMatch(/yearline-holiday-item/);
    expect(page).toMatch(/const dayTasks = dayItems\.filter\(\(t\) => !t\.isHoliday\)/);
  });
});
