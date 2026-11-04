"use client";

import { useMemo } from "react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import {
  getMonthColor,
  type ResolvedCalendarTheme,
} from "@/lib/calendar/calendar-themes";
import { monthGridDays } from "@/lib/calendar/date-utils";
import {
  type ItemColorPreferences,
  DEFAULT_ITEM_COLORS,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";
import { CalendarWorkspaceHeader } from "./calendar-workspace-header";

export interface YearViewProps {
  shownYear: number;
  today: Date;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onSelectMonth?: (monthIndex: number) => void;
  onClearSelectedDate: () => void;
  onYearChange: (deltaOrTarget: number | "current") => void;
  weekStartsOn: 0 | 1 | 6;
  resolvedTheme: ResolvedCalendarTheme;
  tasks: PlannerTask[]; // filtered by active/enabled calendars
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  onToggleMobileSidebar?: () => void;
  activeCalendarCount?: number;
}

export function YearView({
  shownYear,
  today,
  todayKey,
  selectedDate,
  onSelectDate,
  onSelectMonth,
  onClearSelectedDate,
  onYearChange,
  weekStartsOn,
  resolvedTheme,
  tasks,
  allCalendarConfigs,
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
}: YearViewProps) {
  // Ordered day-of-week abbreviations based on start day preference
  const orderedMiniDayNames = useMemo(() => {
    const days = ["S", "M", "T", "W", "T", "F", "S"];
    return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)];
  }, [weekStartsOn]);

  // Index tasks by date key for instant cell lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, PlannerTask[]>();
    for (const t of tasks) {
      if (t.dueDate) {
        const list = map.get(t.dueDate) || [];
        list.push(t);
        map.set(t.dueDate, list);
      }
    }
    return map;
  }, [tasks]);

  // Helper to determine the theme/calendar color for a task or Google event
  const getTaskCalendarColor = (task: PlannerTask): string => {
    return getItemTileStyle(task, itemStyles, allCalendarConfigs).indicatorColor;
  };

  const isTileMode = resolvedTheme.mode === "tiles";

  return (
    <section
      className="year-planner-card neo-card"
      id="year-view"
      style={{ backgroundColor: resolvedTheme.calendarBg }}
    >
      {/* 1. Header Toolbar */}
      <CalendarWorkspaceHeader
        kicker="FULL YEAR CALENDAR"
        title={`${shownYear} Yearly Planner`}
        compactTitle={`${shownYear}`}
        isToday={shownYear === today.getFullYear()}
        todayTagLabel="This Year"
        todayButtonLabel="This Year"
        onPrevious={() => onYearChange(-1)}
        previousLabel="Previous year"
        onToday={() => onYearChange("current")}
        onNext={() => onYearChange(1)}
        nextLabel="Next year"
      />

      {/* 2. Twelve Monthly Calendar Tiles */}
      <div className="year-planner-grid">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const monthDate = new Date(shownYear, monthIndex, 1);
          const monthTitle = monthDate.toLocaleDateString("en", { month: "long" });
          const gridDays = monthGridDays(shownYear, monthIndex, weekStartsOn);
          const monthColor = getMonthColor(resolvedTheme, monthIndex);

          return (
            <div
              className={`year-month-card ${isTileMode ? "is-tile-tinted" : ""}`}
              key={monthIndex}
              style={
                isTileMode
                  ? { backgroundColor: monthColor.tileBg, borderColor: monthColor.border }
                  : undefined
              }
            >
              <div
                className="year-month-header"
                style={{
                  backgroundColor: monthColor.bg,
                  borderColor: monthColor.border,
                  color: monthColor.text,
                  cursor: onSelectMonth ? "pointer" : "default",
                }}
                onClick={() => onSelectMonth?.(monthIndex)}
                role={onSelectMonth ? "button" : undefined}
                tabIndex={onSelectMonth ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onSelectMonth && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectMonth(monthIndex);
                  }
                }}
                title={onSelectMonth ? `Open ${monthTitle} in Month View` : undefined}
              >
                <span className="year-month-title" style={{ color: monthColor.text }}>
                  {monthTitle}
                </span>
                <span className="year-month-num" style={{ color: monthColor.text }}>
                  {String(monthIndex + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="year-mini-weekdays">
                {orderedMiniDayNames.map((w, idx) => {
                  const isWeekendDay = w === "S";
                  return (
                    <span
                      key={idx}
                      className={`year-mini-weekday ${isWeekendDay ? "is-weekend" : ""}`}
                    >
                      {w}
                    </span>
                  );
                })}
              </div>

              <div className="year-mini-grid">
                {gridDays.map((dayNum, cellIndex) => {
                  if (!dayNum) {
                    return <div key={`empty-${cellIndex}`} className="year-mini-day empty" />;
                  }

                  const dateKey = `${shownYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const dayDate = new Date(shownYear, monthIndex, dayNum);
                  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDate;
                  const dueTasks = tasksByDate.get(dateKey) || [];
                  const hasTasks = dueTasks.length > 0;
                  const openCount = dueTasks.filter((t) => t.status !== "completed").length;

                  // Compute dynamic inline styles for today/selected/weekend
                  const cellStyle: React.CSSProperties = {};
                  if (isToday && isSelected) {
                    cellStyle.backgroundColor = resolvedTheme.todayBg;
                    cellStyle.boxShadow = `0 0 0 2px ${resolvedTheme.selectedBg || "var(--pink)"}, 2px 2px 0 var(--shadow)`;
                  } else if (isToday) {
                    cellStyle.backgroundColor = resolvedTheme.todayBg;
                  } else if (isSelected) {
                    cellStyle.backgroundColor = resolvedTheme.selectedBg;
                  } else if (isWeekend) {
                    cellStyle.backgroundColor = resolvedTheme.weekendBg;
                  }

                  return (
                    <button
                      type="button"
                      key={dateKey}
                      className={`year-mini-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${isWeekend ? "is-weekend" : ""} ${hasTasks ? "has-tasks" : ""}`}
                      style={cellStyle}
                      onClick={() => onSelectDate(dateKey)}
                      title={`${monthTitle} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` · ${dueTasks.length} item(s) (${openCount} open)` : ""}`}
                      aria-label={`${monthTitle} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` (${dueTasks.length} items)` : ""}`}
                      aria-pressed={isSelected}
                    >
                      <span className="year-mini-day-num">{dayNum}</span>
                      {hasTasks && (
                        <span className="year-mini-dot-wrapper">
                          {dueTasks.length === 1 ? (
                            <span
                              className="year-mini-dot"
                              style={{
                                backgroundColor: getTaskCalendarColor(dueTasks[0]),
                                borderColor: isSelected && !isToday ? "#ffffff" : resolvedTheme.taskDotColor,
                              }}
                            />
                          ) : dueTasks.length <= 3 ? (
                            <span className="year-mini-dots-row">
                              {dueTasks.slice(0, 3).map((task) => (
                                <span
                                  key={task.id}
                                  className="year-mini-dot"
                                  style={{
                                    backgroundColor: getTaskCalendarColor(task),
                                    borderColor: isSelected && !isToday ? "#ffffff" : resolvedTheme.taskDotColor,
                                  }}
                                />
                              ))}
                            </span>
                          ) : (
                            <span
                              className="year-mini-badge"
                              style={{
                                backgroundColor: isSelected && !isToday ? "#ffffff" : getTaskCalendarColor(dueTasks[0]),
                                color: isSelected && !isToday ? (resolvedTheme.selectedBg || "var(--pink)") : "#ffffff",
                                borderColor: resolvedTheme.taskDotColor,
                              }}
                            >
                              {dueTasks.length > 9 ? "9+" : dueTasks.length}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Year Legend Bar */}
      <div className="year-legend-bar">
        <span className="year-legend-item">
          <span
            className="year-legend-swatch today"
            style={{ backgroundColor: resolvedTheme.todayBg }}
          />{" "}
          Today
        </span>
        <span className="year-legend-item">
          <span
            className="year-legend-swatch selected"
            style={{ backgroundColor: resolvedTheme.selectedBg }}
          />{" "}
          Selected
        </span>
        <span className="year-legend-item">
          <span
            className="year-legend-swatch tasks"
            style={{ backgroundColor: resolvedTheme.taskDotColor }}
          />{" "}
          Has Tasks/Events
        </span>
        <button
          type="button"
          className="clear-date-button"
          onClick={onClearSelectedDate}
          disabled={!selectedDate}
        >
          Clear selection
        </button>
        <span className="year-legend-hint">Click any date to open its week below ✳</span>
      </div>
    </section>
  );
}
