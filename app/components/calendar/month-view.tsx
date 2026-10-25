"use client";

import { useMemo } from "react";
import {
  CaretLeft,
  CaretRight,
  List,
  Plus,
  Lock,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { getMonthColor, type ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";

interface MonthViewProps {
  shownDate: Date;
  today: Date;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onNavigateMonth: (offset: number) => void;
  onResetToToday: () => void;
  weekStartsOn: 0 | 1 | 6;
  resolvedTheme: ResolvedCalendarTheme;
  tasks: PlannerTask[]; // filtered by active calendars
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onToggleMobileSidebar: () => void;
  activeCalendarCount: number;
}

export function MonthView({
  shownDate,
  today,
  todayKey,
  selectedDate,
  onSelectDate,
  onNavigateMonth,
  onResetToToday,
  weekStartsOn,
  resolvedTheme,
  tasks,
  allCalendarConfigs,
  onAddTask,
  onOpenTaskDetail,
  onToggleMobileSidebar,
  activeCalendarCount,
}: MonthViewProps) {
  // Calendar days grid calculation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(
      shownDate.getFullYear(),
      shownDate.getMonth(),
      1
    ).getDay();
    const offset = (firstDayIndex - weekStartsOn + 7) % 7;
    const daysInMonth = new Date(
      shownDate.getFullYear(),
      shownDate.getMonth() + 1,
      0
    ).getDate();

    const days: Array<{ day: number | null; dateKey: string }> = [];

    // Empty lead cells
    for (let i = 0; i < offset; i++) {
      days.push({ day: null, dateKey: "" });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const y = shownDate.getFullYear();
      const m = String(shownDate.getMonth() + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      days.push({ day: d, dateKey: `${y}-${m}-${dayStr}` });
    }

    return days;
  }, [shownDate, weekStartsOn]);

  // Tasks grouped by date key
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

  const orderedWeekdays = useMemo(() => {
    const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    return [...names.slice(weekStartsOn), ...names.slice(0, weekStartsOn)];
  }, [weekStartsOn]);

  const monthThemeColor = getMonthColor(resolvedTheme, shownDate.getMonth());
  const monthName = shownDate.toLocaleDateString("en", { month: "long" });
  const yearName = shownDate.getFullYear();

  // Helper to format 24h time to 12h time (e.g. "09:30" -> "9:30 AM")
  function formatTime(timeStr?: string | null): string {
    if (!timeStr) return "";
    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr, 10);
    if (isNaN(h)) return "";
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mStr} ${suffix}`;
  }

  return (
    <section
      className="month-calendar-expanded neo-card"
      id="calendar"
      style={{ backgroundColor: resolvedTheme.calendarBg }}
    >
      {/* 1. Month Header Toolbar */}
      <div className="month-toolbar">
        <div className="toolbar-left">
          {/* Mobile Sidebar Drawer Toggle Button */}
          <button
            type="button"
            className="mobile-sidebar-toggle-btn"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle calendar sidebar"
            title="Toggle calendar sidebar"
          >
            <List size={18} weight="bold" />
            <span className="sidebar-toggle-label">Calendars</span>
            {activeCalendarCount > 0 && (
              <span className="sidebar-toggle-badge">{activeCalendarCount}</span>
            )}
          </button>

          {/* Month & Year Badge */}
          <div className="month-heading-group">
            <span className="month-kicker">MONTH WORKSPACE</span>
            <div className="month-title-row">
              <span
                className="month-header-badge"
                style={{
                  backgroundColor: monthThemeColor.bg,
                  borderColor: monthThemeColor.border,
                  color: monthThemeColor.text,
                }}
              >
                {monthName} {yearName}
              </span>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="month-nav-controls">
            <button
              type="button"
              className="month-today-btn"
              onClick={onResetToToday}
              title="Jump to current date"
            >
              Today
            </button>
            <div className="month-arrow-btns">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous month"
                onClick={() => onNavigateMonth(-1)}
              >
                <CaretLeft size={16} weight="bold" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Next month"
                onClick={() => onNavigateMonth(1)}
              >
                <CaretRight size={16} weight="bold" />
              </button>
            </div>
          </div>
        </div>

        <div className="toolbar-right">
          <div className="active-calendars-pill" title={`${activeCalendarCount} calendars visible`}>
            <span className="indicator-dot" />
            <span>{activeCalendarCount} calendars</span>
          </div>

          <button
            type="button"
            className="month-add-event-btn"
            onClick={() => onAddTask({ date: selectedDate || todayKey, status: "open" })}
          >
            <Plus size={16} weight="bold" />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* 2. Weekday Header Row */}
      <div className="month-weekdays-row">
        {orderedWeekdays.map((dayName, idx) => {
          const isWeekend = dayName === "SAT" || dayName === "SUN";
          return (
            <div key={`${dayName}-${idx}`} className={`month-weekday-cell ${isWeekend ? "is-weekend" : ""}`}>
              <span className="weekday-text">{dayName}</span>
            </div>
          );
        })}
      </div>

      {/* 3. Expansive Month Days Grid */}
      <div className="month-grid-container">
        {calendarDays.map((item, index) => {
          if (!item.day) {
            return (
              <div
                key={`empty-${index}`}
                className="month-day-cell is-empty"
                aria-hidden="true"
              />
            );
          }

          const isToday =
            item.day === today.getDate() &&
            shownDate.getMonth() === today.getMonth() &&
            shownDate.getFullYear() === today.getFullYear();
          const isSelected = selectedDate === item.dateKey;
          const dayDate = new Date(shownDate.getFullYear(), shownDate.getMonth(), item.day);
          const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

          const dayTasks = tasksByDate.get(item.dateKey) || [];
          const taskCount = dayTasks.length;
          const openCount = dayTasks.filter((t) => t.status !== "completed").length;

          // Display first 3 tasks in cell; show +N more if additional
          const maxVisibleTasks = 3;
          const visibleDayTasks = dayTasks.slice(0, maxVisibleTasks);
          const remainingCount = taskCount - maxVisibleTasks;

          return (
            <div
              key={item.dateKey}
              className={`month-day-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${isWeekend ? "is-weekend" : ""} ${taskCount > 0 ? "has-events" : ""}`}
              style={{
                ...(isWeekend && !isSelected && !isToday
                  ? { backgroundColor: resolvedTheme.weekendBg }
                  : {}),
              }}
              onClick={() => {
                onSelectDate(item.dateKey);
              }}
              onDoubleClick={() => {
                onAddTask({ date: item.dateKey, status: "open" });
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDate(item.dateKey);
                }
              }}
              aria-pressed={isSelected}
              aria-label={`${item.dateKey}${isToday ? ", today" : ""}${taskCount ? `, ${taskCount} items due, ${openCount} open` : ", empty"}`}
            >
              {/* Day Number Header */}
              <div className="day-cell-top">
                <span className={`day-number-label ${isToday ? "today-badge" : ""}`}>
                  {item.day}
                </span>

                {/* Quick Add Button on Hover */}
                <button
                  type="button"
                  className="cell-quick-add-btn"
                  title={`Add event on ${item.dateKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTask({ date: item.dateKey, status: "open" });
                  }}
                  aria-label={`Add event on ${item.dateKey}`}
                >
                  <Plus size={12} weight="bold" />
                </button>

                {taskCount > 0 && (
                  <span className="cell-task-counter" aria-hidden="true">
                    {taskCount}
                  </span>
                )}
              </div>

              {/* Mobile Activity Dots (<=650px) */}
              <div className="day-cell-mobile-indicators" aria-hidden="true">
                {dayTasks.slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className="mobile-event-dot"
                    style={{ backgroundColor: t.googleCalendarColor || "#ff3d8b" }}
                  />
                ))}
                {taskCount > 3 && <span className="mobile-more-text">+{taskCount - 3}</span>}
              </div>

              {/* Desktop Event / Task Pills (>650px) */}
              <div className="day-cell-event-list">
                {visibleDayTasks.map((task) => {
                  const calConfig = task.googleCalendarId ? allCalendarConfigs[task.googleCalendarId] : undefined;
                  const calendarColor = task.googleCalendarColor || calConfig?.color || "#3b5bff";
                  const isDone = task.status === "completed";
                  const isReadOnly = task.isReadOnlyCalendar;
                  const timeLabel = formatTime(task.dueTime);

                  return (
                    <div
                      key={task.id}
                      className={`month-event-pill ${isDone ? "is-completed" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                      style={{
                        borderLeftColor: calendarColor,
                        backgroundColor: isDone ? "#f5f5f4" : `${calendarColor}14`,
                      }}
                      title={`${task.isGoogleEvent ? `[${task.googleCalendarName || "Google"}] ` : ""}${timeLabel ? `${timeLabel} · ` : ""}${task.title}${task.googleAccountEmail ? ` (${task.googleAccountEmail})` : ""}${isReadOnly ? " · Read-only" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTaskDetail(task);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          onOpenTaskDetail(task);
                        }
                      }}
                    >
                      {/* Calendar Color Swatch / Dot */}
                      <span
                        className="event-pill-color-dot"
                        style={{ backgroundColor: calendarColor }}
                        aria-hidden="true"
                      />

                      {/* Timed Event Badge */}
                      {timeLabel && <span className="event-pill-time">{timeLabel}</span>}

                      {/* Client / Calendar Name Tag for VAs */}
                      {task.isGoogleEvent && task.googleCalendarName && (
                        <span className="event-pill-calendar-tag" style={{ color: calendarColor }}>
                          {task.googleCalendarName.slice(0, 10)}
                        </span>
                      )}

                      {/* Pinned Icon */}
                      {task.isPinned && <span className="event-pill-icon">📌</span>}

                      {/* Read-Only Lock Icon */}
                      {isReadOnly && (
                        <span className="event-pill-icon readonly-lock" title="Read-only client calendar">
                          <Lock size={10} weight="bold" />
                        </span>
                      )}

                      {/* Title */}
                      <span className="event-pill-title">{task.title}</span>
                    </div>
                  );
                })}

                {/* Overflow "+N more" Button */}
                {remainingCount > 0 && (
                  <button
                    type="button"
                    className="cell-more-events-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate(item.dateKey);
                    }}
                    title={`View all ${taskCount} items for ${item.dateKey}`}
                  >
                    +{remainingCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Calendar Footer & Shortcuts */}
      <div className="month-calendar-footer">
        <div className="footer-legend">
          <span className="legend-item">
            <span className="legend-swatch today-swatch" /> Today
          </span>
          <span className="legend-item">
            <span className="legend-swatch weekend-swatch" /> Weekend
          </span>
        </div>

        {selectedDate && (
          <button
            type="button"
            className="footer-clear-date-btn"
            onClick={() => onSelectDate(null)}
          >
            Clear selected date ({selectedDate})
          </button>
        )}

        <span className="footer-keyboard-hint">
          Click any day to add an event · Click an event to view or edit ✳
        </span>
      </div>
    </section>
  );
}
