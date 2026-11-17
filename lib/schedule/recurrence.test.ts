import { describe, expect, it } from "vitest";
import { nextOccurrenceDate } from "./recurrence";

describe("recurrence calculations", () => {
  it("advances daily and respects an end date", () => {
    expect(nextOccurrenceDate("2026-01-01", "daily")).toBe("2026-01-02");
    expect(nextOccurrenceDate("2026-01-31", "daily", { endDate: "2026-01-31" })).toBeNull();
  });
  it("supports selected weekly weekdays", () => {
    expect(nextOccurrenceDate("2026-01-05", "weekly", { weekdays: [1, 3] })).toBe("2026-01-07");
    expect(nextOccurrenceDate("2026-01-07", "weekly", { weekdays: [1, 3] })).toBe("2026-01-12");
  });
  it("clamps month-end dates", () => {
    expect(nextOccurrenceDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });
  it("supports interval and yearly recurrence", () => {
    expect(nextOccurrenceDate("2026-01-01", "daily", { interval: 3 })).toBe("2026-01-04");
    expect(nextOccurrenceDate("2026-02-28", "yearly")).toBe("2027-02-28");
  });
});
