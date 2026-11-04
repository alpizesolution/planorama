"use client";

import { useMemo, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  CalendarBlank,
  Sun,
  X,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import {
  extractHolidays,
  groupHolidaysByMonth,
  HOLIDAY_CATEGORY_LABELS,
  HOLIDAY_CATEGORY_COLORS,
  type HolidayCategory,
  type HolidayItem,
} from "@/lib/calendar/holiday-utils";
import { CalendarWorkspaceHeader } from "./calendar-workspace-header";

export interface HolidaysViewProps {
  today: Date;
  todayKey: string;
  tasks: PlannerTask[];
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  resolvedTheme: ResolvedCalendarTheme;
}

const ALL_CATEGORIES: HolidayCategory[] = [
  "regular",
  "special_non_working",
  "special_working",
  "religious",
  "international",
  "other",
];

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MiniMonthCalendar({
  year,
  month,
  holidayDates,
  todayKey,
}: {
  year: number;
  month: number;
  holidayDates: Set<string>;
  todayKey: string;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; dateKey: string | null }> = [];

  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateKey: null });
  for (let d = 1; d <= days; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateKey });
  }

  return (
    <div className="hol-mini-cal">
      <div className="hol-mini-cal-grid">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="hol-mini-cal-wday">{w}</span>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateKey) {
            return <span key={`empty-${idx}`} className="hol-mini-cal-day hol-mini-cal-empty" />;
          }
          const isHoliday = holidayDates.has(cell.dateKey);
          const isToday = cell.dateKey === todayKey;
          return (
            <span
              key={cell.dateKey}
              className={`hol-mini-cal-day${isHoliday ? " is-holiday" : ""}${isToday ? " is-today" : ""}`}
              title={isHoliday ? "Holiday" : undefined}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function HolidaysView({
  today,
  todayKey,
  tasks,
  allCalendarConfigs,
  resolvedTheme,
}: HolidaysViewProps) {
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<HolidayCategory>>(new Set());
  const [selectedHoliday, setSelectedHoliday] = useState<HolidayItem | null>(null);

  const allHolidays = useMemo(() => extractHolidays(tasks), [tasks]);
  const yearHolidays = useMemo(
    () => allHolidays.filter((h) => h.dueDate?.startsWith(`${year}-`)),
    [allHolidays, year]
  );

  const filteredHolidays = useMemo(() => {
    let list = yearHolidays;
    if (activeCategories.size > 0) {
      list = list.filter((h) => activeCategories.has(h.category));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          h.notes?.toLowerCase().includes(q) ||
          h.googleCalendarName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [yearHolidays, activeCategories, search]);

  const groups = useMemo(
    () => groupHolidaysByMonth(filteredHolidays as Parameters<typeof groupHolidaysByMonth>[0], year),
    [filteredHolidays, year]
  );

  const holidayDateSet = useMemo(
    () => new Set(filteredHolidays.map((h) => h.dueDate!)),
    [filteredHolidays]
  );

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<HolidayCategory, number>> = {};
    for (const h of yearHolidays) {
      counts[h.category] = (counts[h.category] ?? 0) + 1;
    }
    return counts;
  }, [yearHolidays]);

  const toggleCategory = (cat: HolidayCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const formatHolidayDate = (dateKey: string): string => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };

  const formatShortDate = (dateKey: string): string => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  };

  const usedCategories = useMemo(
    () => ALL_CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0),
    [categoryCounts]
  );

  const sourceCalendars = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string; color: string }> = [];
    for (const h of yearHolidays) {
      const key = h.googleCalendarId ?? h.googleCalendarName ?? "";
      if (key && !seen.has(key)) {
        seen.add(key);
        const cfg = h.googleCalendarId ? allCalendarConfigs[h.googleCalendarId] : undefined;
        result.push({
          id: key,
          name: cfg?.name ?? h.googleCalendarName ?? "Holiday Calendar",
          color: cfg?.color ?? h.googleCalendarColor ?? "#e63946",
        });
      }
    }
    return result;
  }, [yearHolidays, allCalendarConfigs]);

  const hasActiveFilters = activeCategories.size > 0 || search.trim() !== "";

  return (
    <section
      className="calendar-card neo-card holidays-workspace-card"
      id="holidays-view"
      style={{ backgroundColor: resolvedTheme.calendarBg }}
    >
      <CalendarWorkspaceHeader
        kicker="PUBLIC & SPECIAL DAYS"
        title="Holidays"
        compactTitle="Holidays"
      />

      {/* Year navigator + summary */}
      <div className="hol-year-nav">
        <button
          type="button"
          className="hol-year-btn"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Previous year"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <div className="hol-year-info">
          <span className="hol-year-label">{year}</span>
          <span className="hol-year-count">
            {yearHolidays.length} holiday{yearHolidays.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          className="hol-year-btn"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Next year"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      {/* Source calendars */}
      {sourceCalendars.length > 0 && (
        <div className="hol-sources">
          {sourceCalendars.map((cal) => (
            <span
              key={cal.id}
              className="hol-source-chip"
              style={{ borderColor: cal.color, backgroundColor: `${cal.color}18` }}
            >
              <CalendarBlank size={11} weight="bold" color={cal.color} />
              {cal.name}
            </span>
          ))}
        </div>
      )}

      {/* Search + category filters */}
      <div className="hol-filter-bar">
        <div className="hol-search-box">
          <MagnifyingGlass size={13} weight="bold" className="hol-search-icon" />
          <input
            type="text"
            className="hol-search-input"
            placeholder="Search holidays…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search holidays"
          />
          {search && (
            <button
              type="button"
              className="hol-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        <div className="hol-category-filters" role="group" aria-label="Filter by category">
          {usedCategories.map((cat) => {
            const isActive = activeCategories.has(cat);
            const color = HOLIDAY_CATEGORY_COLORS[cat];
            return (
              <button
                key={cat}
                type="button"
                className={`hol-cat-chip${isActive ? " is-active" : ""}`}
                style={isActive ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color }}
                onClick={() => toggleCategory(cat)}
                aria-pressed={isActive}
              >
                {HOLIDAY_CATEGORY_LABELS[cat]}
                {(categoryCounts[cat] ?? 0) > 0 && (
                  <span className="hol-cat-count">{categoryCounts[cat]}</span>
                )}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              type="button"
              className="hol-clear-filters-btn"
              onClick={() => { setActiveCategories(new Set()); setSearch(""); }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="hol-body">
        {/* Monthly mini-calendars row */}
        <div className="hol-mini-cal-row">
          {Array.from({ length: 12 }, (_, m) => {
            const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthHolidays = new Set(
              filteredHolidays
                .filter((h) => h.dueDate?.startsWith(`${year}-${String(m + 1).padStart(2, "0")}-`))
                .map((h) => h.dueDate!)
            );
            const hasHolidays = monthHolidays.size > 0;
            return (
              <div key={m} className={`hol-mini-cal-wrap${hasHolidays ? "" : " hol-mini-cal-wrap--empty"}`}>
                <div className="hol-mini-cal-month-label">{MONTHS[m]}</div>
                <MiniMonthCalendar
                  year={year}
                  month={m}
                  holidayDates={monthHolidays}
                  todayKey={todayKey}
                />
              </div>
            );
          })}
        </div>

        {/* Chronological holiday list by month */}
        <div className="hol-list">
          {groups.length === 0 ? (
            <div className="hol-empty-state">
              <Sun size={36} weight="light" className="hol-empty-icon" />
              {yearHolidays.length === 0 ? (
                <>
                  <p className="hol-empty-title">No holidays found for {year}</p>
                  <p className="hol-empty-sub">
                    Connect a Google Calendar holiday calendar in the sidebar to import public holidays.
                  </p>
                </>
              ) : (
                <>
                  <p className="hol-empty-title">No holidays match your filters</p>
                  <button
                    type="button"
                    className="hol-clear-filters-btn"
                    onClick={() => { setActiveCategories(new Set()); setSearch(""); }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            groups.map(({ month, monthName, items }) => (
              <div key={month} className="hol-month-group">
                <div className="hol-month-header">
                  <span className="hol-month-name">{monthName} {year}</span>
                  <span className="hol-month-count">{items.length}</span>
                </div>
                <div className="hol-month-items">
                  {items.map((holiday) => {
                    const isSelected = selectedHoliday?.id === holiday.id;
                    const catColor = HOLIDAY_CATEGORY_COLORS[holiday.category];
                    const calCfg = holiday.googleCalendarId
                      ? allCalendarConfigs[holiday.googleCalendarId]
                      : undefined;
                    const calName = calCfg?.name ?? holiday.googleCalendarName;
                    return (
                      <div
                        key={holiday.id}
                        className={`hol-item${isSelected ? " is-selected" : ""}`}
                        onClick={() => setSelectedHoliday(isSelected ? null : holiday)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedHoliday(isSelected ? null : holiday);
                          }
                        }}
                        aria-expanded={isSelected}
                      >
                        <span
                          className="hol-item-dot"
                          style={{ background: catColor }}
                          aria-hidden="true"
                        />
                        <div className="hol-item-main">
                          <span className="hol-item-title">{holiday.title}</span>
                          <span className="hol-item-date">{formatShortDate(holiday.dueDate!)}</span>
                          <span
                            className="hol-item-cat"
                            style={{ color: catColor, borderColor: `${catColor}44`, backgroundColor: `${catColor}12` }}
                          >
                            {HOLIDAY_CATEGORY_LABELS[holiday.category]}
                          </span>
                        </div>

                        {/* Expanded detail panel */}
                        {isSelected && (
                          <div className="hol-item-detail" role="region" aria-label="Holiday details">
                            <dl className="hol-detail-list">
                              <div>
                                <dt>Date</dt>
                                <dd>{formatHolidayDate(holiday.dueDate!)}</dd>
                              </div>
                              <div>
                                <dt>Category</dt>
                                <dd style={{ color: catColor }}>{HOLIDAY_CATEGORY_LABELS[holiday.category]}</dd>
                              </div>
                              {holiday.notes && (
                                <div>
                                  <dt>Description</dt>
                                  <dd>{holiday.notes}</dd>
                                </div>
                              )}
                              {calName && (
                                <div>
                                  <dt>Source calendar</dt>
                                  <dd>
                                    <span className="hol-detail-cal">
                                      <CalendarBlank
                                        size={12}
                                        weight="bold"
                                        color={calCfg?.color ?? holiday.googleCalendarColor ?? catColor}
                                      />
                                      {calName}
                                    </span>
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="calendar-footer hol-footer">
        <span className="legend">
          <i className="day-dot pink" /> Public &amp; special holidays
        </span>
        <span className="footer-hint">
          Holiday data is imported from connected Google Calendar holiday calendars · Read-only
        </span>
      </div>
    </section>
  );
}
