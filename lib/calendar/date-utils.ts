export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthGridDays(year: number, monthIndex: number, weekStartsOn: 0 | 1 | 6 = 0): Array<number | null> {
  const offset = (new Date(year, monthIndex, 1).getDay() - weekStartsOn + 7) % 7;
  const cells: Array<number | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => index + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Return the start of the week containing `date` based on weekStartsOn (default: Monday = 1). */
export function getWeekStart(date: Date, weekStartsOn: 0 | 1 | 6 = 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/** Return an array of 7 Dates for the week containing `date`. */
export function getWeekDays(date: Date, weekStartsOn: 0 | 1 | 6 = 1): Date[] {
  const start = getWeekStart(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Formats an array of week Dates into a human-readable range string.
 * e.g. "Oct 26 – Nov 1, 2026", "Dec 28, 2026 – Jan 3, 2027", "May 4 – 10, 2026"
 */
export function formatWeekRange(days: Date[]): string {
  if (days.length === 0) return "";
  const start = days[0];
  const end = days[days.length - 1];
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

/**
 * Return an array of 5 Dates (Monday through Friday) for the workweek containing `date`.
 * If `date` falls on Saturday or Sunday, it returns the Monday–Friday of that week.
 */
export function getWorkWeekDays(date: Date): Date[] {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);

  return Array.from({ length: 5 }, (_, i) => {
    const dayDate = new Date(d);
    dayDate.setDate(d.getDate() + i);
    return dayDate;
  });
}


