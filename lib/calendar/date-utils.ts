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
