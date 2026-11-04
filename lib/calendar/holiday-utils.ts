import type { PlannerTask } from "@/lib/schedule/types";
import { isHolidayItem } from "./item-classifier";

export type HolidayCategory =
  | "regular"
  | "special_non_working"
  | "special_working"
  | "religious"
  | "international"
  | "other";

export const HOLIDAY_CATEGORY_LABELS: Record<HolidayCategory, string> = {
  regular: "Regular Holiday",
  special_non_working: "Special Non-Working Day",
  special_working: "Special Working Day",
  religious: "Religious Holiday",
  international: "International Holiday",
  other: "Holiday",
};

export const HOLIDAY_CATEGORY_COLORS: Record<HolidayCategory, string> = {
  regular: "#e63946",
  special_non_working: "#f4a261",
  special_working: "#2a9d8f",
  religious: "#7b2d8b",
  international: "#457b9d",
  other: "#6b7280",
};

// Keywords to detect holiday categories from title/description
const RELIGIOUS_KEYWORDS = [
  "christmas", "holy week", "good friday", "maundy thursday",
  "black saturday", "easter", "all saints", "all souls", "feast",
  "immaculate conception", "eid", "ramadan", "diwali", "wesak",
];

const SPECIAL_NON_WORKING_KEYWORDS = [
  "special non-working", "special non working", "special holiday",
  "additional special", "proclamation",
];

const SPECIAL_WORKING_KEYWORDS = [
  "special working", "working holiday",
];

const INTERNATIONAL_KEYWORDS = [
  "international", "world ", "un ", "united nations",
];

export function inferHolidayCategory(item: PlannerTask): HolidayCategory {
  const text = `${item.title} ${item.notes || ""}`.toLowerCase();

  for (const kw of SPECIAL_NON_WORKING_KEYWORDS) {
    if (text.includes(kw)) return "special_non_working";
  }
  for (const kw of SPECIAL_WORKING_KEYWORDS) {
    if (text.includes(kw)) return "special_working";
  }
  for (const kw of RELIGIOUS_KEYWORDS) {
    if (text.includes(kw)) return "religious";
  }
  for (const kw of INTERNATIONAL_KEYWORDS) {
    if (text.includes(kw)) return "international";
  }
  return "regular";
}

export interface HolidayItem extends PlannerTask {
  category: HolidayCategory;
}

export function extractHolidays(tasks: PlannerTask[]): HolidayItem[] {
  return tasks
    .filter((t) => isHolidayItem(t) && t.dueDate)
    .map((t) => ({ ...t, category: inferHolidayCategory(t) }));
}

export function groupHolidaysByMonth(
  holidays: HolidayItem[],
  year: number
): Array<{ month: number; monthName: string; items: HolidayItem[] }> {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const yearHolidays = holidays.filter((h) => h.dueDate?.startsWith(`${year}-`));
  const byMonth = new Map<number, HolidayItem[]>();

  for (const h of yearHolidays) {
    if (!h.dueDate) continue;
    const month = parseInt(h.dueDate.split("-")[1], 10) - 1;
    const list = byMonth.get(month) ?? [];
    list.push(h);
    byMonth.set(month, list);
  }

  const result: Array<{ month: number; monthName: string; items: HolidayItem[] }> = [];
  for (let m = 0; m < 12; m++) {
    const items = byMonth.get(m);
    if (items && items.length > 0) {
      result.push({
        month: m,
        monthName: MONTHS[m],
        items: items.slice().sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
      });
    }
  }
  return result;
}
