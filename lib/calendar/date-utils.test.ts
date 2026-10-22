import { describe, expect, it } from "vitest";
import { daysInMonth, monthGridDays, toDateKey } from "./date-utils";

describe("calendar date helpers", () => {
  it("formats local calendar dates without UTC conversion", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("handles leap years and month boundaries", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
    expect(daysInMonth(2026, 0)).toBe(31);
  });
  it("supports different week start days", () => {
    expect(monthGridDays(2026, 0, 0).length % 7).toBe(0);
    expect(monthGridDays(2026, 0, 1)[0]).toBe(null);
    expect(monthGridDays(2026, 0, 6)[0]).toBe(null);
  });
});
