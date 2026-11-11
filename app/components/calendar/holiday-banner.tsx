"use client";

import { useMemo } from "react";
import type { PlannerTask } from "@/lib/schedule/types";
import { isHolidayItem } from "@/lib/calendar/item-classifier";
import { findHolidayNotices } from "@/lib/holidays/service";

interface HolidayBannerProps {
  tasks: PlannerTask[];
  /** The day being looked at. */
  dateKey: string;
  /** Also announce holidays up to this many days after `dateKey` (default 0). */
  lookaheadDays?: number;
  /** The real "today", used to word "Today" vs a date. */
  todayKey: string;
  /** Always show dates ("Mar 20 is") instead of Today/Tomorrow. Used for ranges. */
  absoluteDates?: boolean;
}

function label(daysAway: number, dueDate: string, isViewedToday: boolean, absolute: boolean): string {
  if (absolute) daysAway = 99;
  if (daysAway === 0) return isViewedToday ? "Today is" : "This day is";
  if (daysAway === 1) return "Tomorrow is";
  const [y, m, d] = dueDate.split("-").map(Number);
  const text = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${text} is`;
}

/** Thin banner announcing a holiday on (or just after) the viewed date. */
export function HolidayBanner({ tasks, dateKey, lookaheadDays = 0, todayKey, absoluteDates = false }: HolidayBannerProps) {
  const notices = useMemo(
    () => findHolidayNotices(tasks.filter((t) => isHolidayItem(t)), dateKey, lookaheadDays),
    [tasks, dateKey, lookaheadDays]
  );
  if (notices.length === 0) return null;
  return (
    <div className="holiday-banner" role="status" data-testid="holiday-banner">
      {notices.map((n) => (
        <span key={`${n.dueDate}-${n.title}`} className={`holiday-banner-item${n.daysAway === 0 && !absoluteDates ? " is-now" : ""}`}>
          {label(n.daysAway, n.dueDate, dateKey === todayKey, absoluteDates)} <strong>{n.title}</strong>
        </span>
      ))}
    </div>
  );
}
