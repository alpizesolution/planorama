"use client";

import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  CalendarBlank,
  Sun,
  Warning,
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
  type HolidayItem,
} from "@/lib/calendar/holiday-utils";
import {
  daysBetween,
  findNextHoliday,
  getHolidayDataset,
  holidayNamesMatch,
  holidayEntryToTask,
  listSupportedCountries,
  HOLIDAY_COLOR_PRESETS,
  resolveHolidayColor,
} from "@/lib/holidays/service";
import type { LocalHolidayPreferences } from "@/lib/holidays/types";
import { CalendarWorkspaceHeader } from "./calendar-workspace-header";

export interface HolidaysViewProps {
  today: Date;
  /** Today's calendar day in the planner time zone (Asia/Manila by default). */
  todayKey: string;
  /** Built-in Local Holidays settings (independent of Google Calendar). */
  localHolidayPrefs: LocalHolidayPreferences;
  onChangeLocalHolidayPrefs: (patch: Partial<LocalHolidayPreferences>) => void;
  onRefreshLocalHolidays: () => void;
  /** Tasks/events from the calendars the user has enabled (holidays synced from Google are picked up from here). */
  tasks: PlannerTask[];
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  resolvedTheme: ResolvedCalendarTheme;
}

type HolidayFilter = "all" | "regular" | "special_non_working" | "special_working";

const HOLIDAY_FILTERS: Array<{ id: HolidayFilter; label: string }> = [
  { id: "all", label: "All Holidays" },
  { id: "regular", label: "Regular Holidays" },
  { id: "special_non_working", label: "Special Non-Working" },
  { id: "special_working", label: "Special Working" },
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
  localHolidayPrefs,
  onChangeLocalHolidayPrefs,
  onRefreshLocalHolidays,
  tasks,
  allCalendarConfigs,
  resolvedTheme,
}: HolidaysViewProps) {
  const holidayColor = resolveHolidayColor(localHolidayPrefs.color);
  const currentYear = Number(todayKey.slice(0, 4)) || today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HolidayFilter>("all");
  const [selectedHoliday, setSelectedHoliday] = useState<HolidayItem | null>(null);

  // The Local Holidays dataset is read directly (not through Google sync), so this page is
  // populated for every user, whether or not Google Calendar is connected.
  const dataset = useMemo(
    () => getHolidayDataset(localHolidayPrefs.countryCode, year, localHolidayPrefs.regionCode),
    // lastRefreshedAt changes when the user refreshes the holiday data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localHolidayPrefs.countryCode, localHolidayPrefs.regionCode, localHolidayPrefs.lastRefreshedAt, year]
  );

  const localItems = useMemo<HolidayItem[]>(
    () => dataset.holidays.map((entry) => ({ ...holidayEntryToTask(dataset, entry), category: entry.classification })),
    [dataset]
  );

  // Holidays that came from a synced Google holiday calendar and are not already covered by the local list.
  const googleExtras = useMemo<HolidayItem[]>(
    () =>
      extractHolidays(tasks).filter(
        (h) =>
          h.holidaySource !== "local" &&
          h.dueDate?.startsWith(`${year}-`) &&
          !localItems.some((l) => l.dueDate === h.dueDate && holidayNamesMatch(h.title, l.title))
      ),
    [tasks, localItems, year]
  );

  const yearHolidays = useMemo(
    () =>
      [...localItems, ...googleExtras].sort(
        (a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.title.localeCompare(b.title)
      ),
    [localItems, googleExtras]
  );

  const filteredHolidays = useMemo(() => {
    let list = yearHolidays;
    if (filter !== "all") {
      list = list.filter((h) => h.category === filter);
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
  }, [yearHolidays, filter, search]);

  const groups = useMemo(
    () => groupHolidaysByMonth(filteredHolidays as Parameters<typeof groupHolidaysByMonth>[0], year),
    [filteredHolidays, year]
  );

  const filterCounts = useMemo(() => {
    const counts: Record<HolidayFilter, number> = { all: yearHolidays.length, regular: 0, special_non_working: 0, special_working: 0 };
    for (const h of yearHolidays) {
      if (h.category === "regular" || h.category === "special_non_working" || h.category === "special_working") {
        counts[h.category] += 1;
      }
    }
    return counts;
  }, [yearHolidays]);

  const nextHoliday = useMemo(
    () => (year === currentYear ? findNextHoliday(yearHolidays, todayKey) : null),
    [yearHolidays, todayKey, year, currentYear]
  );

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

  const upcomingLabel = (dateKey: string): string | null => {
    const diff = daysBetween(todayKey, dateKey);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff > 1 && diff <= 30) return `In ${diff} days`;
    return null;
  };

  const sourceCalendars = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string; color: string }> = [
      { id: "local-holidays", name: dataset.calendarName, color: holidayColor },
    ];
    for (const h of googleExtras) {
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
  }, [googleExtras, allCalendarConfigs, dataset.calendarName, holidayColor]);

  const hasActiveFilters = filter !== "all" || search.trim() !== "";
  const clearFilters = () => {
    setFilter("all");
    setSearch("");
  };
  const countries = listSupportedCountries();
  const regionLabel = localHolidayPrefs.regionCode ? `${dataset.countryName} · ${localHolidayPrefs.regionCode}` : dataset.countryName;

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
          <span className="hol-year-count" data-testid="holiday-total">
            {yearHolidays.length} holiday{yearHolidays.length !== 1 ? "s" : ""}
            {hasActiveFilters ? ` · ${filteredHolidays.length} shown` : ""}
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

      {/* Local Holidays calendar controls */}
      <div className="hol-controls">
        <label className="hol-control-toggle">
          <input
            type="checkbox"
            checked={localHolidayPrefs.enabled}
            onChange={() => onChangeLocalHolidayPrefs({ enabled: !localHolidayPrefs.enabled })}
          />
          <span>Show Holidays in calendar views</span>
        </label>
        {countries.length > 1 && (
          <label className="hol-control-select">
            <span>Country</span>
            <select
              value={localHolidayPrefs.countryCode}
              onChange={(e) => onChangeLocalHolidayPrefs({ countryCode: e.target.value, regionCode: null })}
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="hol-color-control" role="group" aria-label="Holiday tile colour">
          <span>Colour</span>
          <input
            type="color"
            className="hol-color-input"
            value={holidayColor}
            onChange={(e) => onChangeLocalHolidayPrefs({ color: e.target.value })}
            aria-label="Choose holiday colour"
          />
          {HOLIDAY_COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`hol-color-swatch${c === holidayColor ? " is-active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => onChangeLocalHolidayPrefs({ color: c })}
              aria-label={`Use colour ${c}`}
              aria-pressed={c === holidayColor}
            />
          ))}
          <button
            type="button"
            className="hol-color-reset"
            onClick={() => onChangeLocalHolidayPrefs({ color: undefined })}
            disabled={!localHolidayPrefs.color}
          >
            Reset
          </button>
        </div>
        <span className="hol-control-region">{regionLabel} · {dataset.timeZone}</span>
        <button type="button" className="hol-refresh-btn" onClick={onRefreshLocalHolidays}>
          <ArrowsClockwise size={13} weight="bold" /> Refresh
        </button>
      </div>

      {!localHolidayPrefs.enabled && (
        <p className="hol-notice" role="status">
          The Holidays calendar is hidden from the Dashboard, Day, Week, Month, Year and Agenda views. It is still listed here.
        </p>
      )}

      {dataset.status === "statutory" && dataset.note && (
        <p className="hol-notice" role="status">{dataset.note}</p>
      )}
      {dataset.status === "official" && dataset.note && (
        <p className="hol-notice" role="status">{dataset.note}</p>
      )}

      {/* Next holiday indicator */}
      {nextHoliday && nextHoliday.dueDate && (
        <div className="hol-next" role="status">
          <span className="hol-next-label">Next holiday</span>
          <strong>{nextHoliday.title}</strong>
          <span>
            {formatShortDate(nextHoliday.dueDate)}
            {upcomingLabel(nextHoliday.dueDate) ? ` · ${upcomingLabel(nextHoliday.dueDate)}` : ""}
          </span>
        </div>
      )}

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

      {/* Search + classification filters */}
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

        <div className="hol-category-filters" role="group" aria-label="Filter by classification">
          {HOLIDAY_FILTERS.map(({ id, label }) => {
            const isActive = filter === id;
            const color = id === "all" ? "#111111" : HOLIDAY_CATEGORY_COLORS[id];
            return (
              <button
                key={id}
                type="button"
                className={`hol-cat-chip${isActive ? " is-active" : ""}`}
                style={isActive ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color }}
                onClick={() => setFilter(id)}
                aria-pressed={isActive}
              >
                {label}
                <span className="hol-cat-count">{filterCounts[id]}</span>
              </button>
            );
          })}
          {hasActiveFilters && (
            <button type="button" className="hol-clear-filters-btn" onClick={clearFilters}>
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
            <div className="hol-empty-state" role={dataset.status === "unavailable" ? "alert" : undefined}>
              {yearHolidays.length === 0 && dataset.status === "unavailable" ? (
                <>
                  <Warning size={36} weight="light" className="hol-empty-icon" />
                  <p className="hol-empty-title">Holiday data is unavailable for {year}</p>
                  <p className="hol-empty-sub">{dataset.note ?? "The holiday dataset could not be loaded."}</p>
                  <button type="button" className="hol-clear-filters-btn" onClick={onRefreshLocalHolidays}>
                    Try again
                  </button>
                </>
              ) : yearHolidays.length === 0 ? (
                <>
                  <Sun size={36} weight="light" className="hol-empty-icon" />
                  <p className="hol-empty-title">No holidays found for {year}</p>
                  <p className="hol-empty-sub">There are no holidays on record for {regionLabel} in {year}.</p>
                </>
              ) : (
                <>
                  <Sun size={36} weight="light" className="hol-empty-icon" />
                  <p className="hol-empty-title">No holidays match your filters</p>
                  <button type="button" className="hol-clear-filters-btn" onClick={clearFilters}>
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
                    const isLocal = holiday.holidaySource === "local";
                    const calCfg = holiday.googleCalendarId
                      ? allCalendarConfigs[holiday.googleCalendarId]
                      : undefined;
                    const calName = isLocal ? dataset.calendarName : calCfg?.name ?? holiday.googleCalendarName;
                    const isNext = nextHoliday?.id === holiday.id;
                    const soon = holiday.dueDate && holiday.dueDate >= todayKey ? upcomingLabel(holiday.dueDate) : null;
                    return (
                      <div
                        key={holiday.id}
                        className={`hol-item${isSelected ? " is-selected" : ""}${isNext ? " is-next" : ""}`}
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
                            {holiday.holidayAdditional ? " · Additional" : ""}
                          </span>
                          <span className="hol-item-region">{isLocal ? regionLabel : calName ?? "Holiday"}</span>
                          {isNext ? (
                            <span className="hol-item-upcoming is-next">Next{soon ? ` · ${soon}` : ""}</span>
                          ) : soon ? (
                            <span className="hol-item-upcoming">{soon}</span>
                          ) : null}
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
                                <dt>Classification</dt>
                                <dd style={{ color: catColor }}>
                                  {HOLIDAY_CATEGORY_LABELS[holiday.category]}
                                  {holiday.holidayAdditional ? " (additional, by proclamation)" : ""}
                                </dd>
                              </div>
                              {isLocal && (
                                <div>
                                  <dt>Country / region</dt>
                                  <dd>{regionLabel}</dd>
                                </div>
                              )}
                              {isLocal && (
                                <div>
                                  <dt>Source</dt>
                                  <dd>{dataset.sourceLabel}</dd>
                                </div>
                              )}
                              {!isLocal && holiday.notes && (
                                <div>
                                  <dt>Description</dt>
                                  <dd>{holiday.notes}</dd>
                                </div>
                              )}
                              {calName && (
                                <div>
                                  <dt>Calendar</dt>
                                  <dd>
                                    <span className="hol-detail-cal">
                                      <CalendarBlank
                                        size={12}
                                        weight="bold"
                                        color={isLocal ? holidayColor : calCfg?.color ?? holiday.googleCalendarColor ?? catColor}
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
          <i className="day-dot pink" /> {dataset.calendarName}
        </span>
        <span className="footer-hint">
          {dataset.sourceLabel} · Read-only · Independent of Google Calendar
        </span>
      </div>
    </section>
  );
}
