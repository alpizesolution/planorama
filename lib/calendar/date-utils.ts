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
  return [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => index + 1)];
}
