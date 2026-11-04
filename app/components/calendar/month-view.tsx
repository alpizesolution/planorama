"use client";

import { useMemo, useRef } from "react";
import {
  Plus,
  Lock,
  CalendarBlank,
  Clock,
  CheckSquare,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { getMonthColor, type ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import {
  getItemType,
  type ItemColorPreferences,
  DEFAULT_ITEM_COLORS,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";
import { toDateKey } from "@/lib/calendar/date-utils";
import { CalendarWorkspaceHeader } from "./calendar-workspace-header";

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
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onToggleMobileSidebar?: () => void;
  activeCalendarCount?: number;
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
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  onAddTask,
  onOpenTaskDetail,
  activeCalendarCount = 0,
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

  // Touch swipe support for month navigation
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        onNavigateMonth(-1); // swipe right -> previous month
      } else {
        onNavigateMonth(1); // swipe left -> next month
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

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
      <CalendarWorkspaceHeader
        kicker="MONTH WORKSPACE"
        title={
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
        }
        compactTitle={
          <span
            className="month-header-badge"
            style={{
              backgroundColor: monthThemeColor.bg,
              borderColor: monthThemeColor.border,
              color: monthThemeColor.text,
            }}
          >
            {monthName.slice(0, 3)} {yearName}
          </span>
        }
        isToday={shownDate.getMonth() === today.getMonth() && shownDate.getFullYear() === today.getFullYear()}
        todayTagLabel="This Month"
        badge={
          activeCalendarCount > 0 ? (
            <div className="active-calendars-pill" title={`${activeCalendarCount} calendars visible`}>
              <span className="indicator-dot" />
              <span>{activeCalendarCount} calendars</span>
            </div>
          ) : undefined
        }
        onPrevious={() => onNavigateMonth(-1)}
        previousLabel="Previous month"
        onToday={onResetToToday}
        todayButtonLabel="Today"
        onNext={() => onNavigateMonth(1)}
        nextLabel="Next month"
        datePickerValue={toDateKey(shownDate)}
        onDatePickerChange={(dateStr) => {
          const [y, m] = dateStr.split("-").map(Number);
          const monthDiff = (y - shownDate.getFullYear()) * 12 + (m - 1 - shownDate.getMonth());
          if (monthDiff !== 0) onNavigateMonth(monthDiff);
          onSelectDate(dateStr);
        }}
        datePickerAriaLabel="Jump to month"
      />

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
      <div
        className="month-grid-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
            item.dateKey === todayKey ||
            (item.day === today.getDate() &&
              shownDate.getMonth() === today.getMonth() &&
              shownDate.getFullYear() === today.getFullYear());
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
                {dayTasks.slice(0, 3).map((t) => {
                  const tileStyle = getItemTileStyle(t, itemStyles, allCalendarConfigs);
                  return (
                    <span
                      key={t.id}
                      className="mobile-event-dot"
                      style={{ backgroundColor: tileStyle.indicatorColor }}
                    />
                  );
                })}
                {taskCount > 3 && <span className="mobile-more-text">+{taskCount - 3}</span>}
              </div>

              {/* Desktop Event / Task Pills (>650px) */}
              <div className="day-cell-event-list">
                {visibleDayTasks.map((task) => {
                  const itemType = getItemType(task);
                  const isAppointment = itemType === "appointment";
                  const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                  const isDone = task.status === "completed";
                  const isReadOnly = task.isReadOnlyCalendar;
                  const timeLabel = formatTime(task.dueTime);

                  return (
                    <div
                      key={task.id}
                      className={`month-event-pill ${tileStyle.className} ${isDone ? "is-completed" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                      style={{
                        ...tileStyle.style,
                        backgroundColor: isDone ? "#f5f5f4" : tileStyle.style.backgroundColor,
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
                        style={{ backgroundColor: tileStyle.indicatorColor }}
                        aria-hidden="true"
                      />

                      {/* Type Icon */}
                      {isAppointment ? (
                        <Clock size={10} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0 }} aria-hidden="true" />
                      ) : itemType === "event" ? (
                        <CalendarBlank size={10} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0 }} aria-hidden="true" />
                      ) : (
                        <CheckSquare size={10} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0 }} aria-hidden="true" />
                      )}

                      {/* Timed Event Badge */}
                      {timeLabel && <span className="event-pill-time">{timeLabel}</span>}

                      {/* Client / Calendar Name Tag for VAs */}
                      {task.isGoogleEvent && task.googleCalendarName && (
                        <span className="event-pill-calendar-tag" style={{ color: tileStyle.indicatorColor }}>
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

      {/* 3B. Responsive Selected Date Details Section */}
      {selectedDate && (() => {
        const selectedTasks = tasksByDate.get(selectedDate) || [];
        const [sy, sm, sd] = selectedDate.split("-").map(Number);
        const selectedDateObj = new Date(sy, sm - 1, sd);
        const formattedDate = selectedDateObj.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        return (
          <div className="month-selected-date-panel neo-card" role="region" aria-label={`Details for ${formattedDate}`}>
            <div className="month-selected-date-header">
              <div className="month-selected-date-title-group">
                <span className="selected-date-kicker">SELECTED DATE DETAILS</span>
                <h3 className="month-selected-date-title">{formattedDate}</h3>
                <span className="month-selected-date-count">
                  {selectedTasks.length} {selectedTasks.length === 1 ? "item" : "items"} scheduled
                </span>
              </div>
              <div className="month-selected-date-actions">
                <button
                  type="button"
                  className="month-selected-add-btn"
                  onClick={() => onAddTask({ date: selectedDate, status: "open" })}
                >
                  <Plus size={14} weight="bold" />
                  <span>Add Item</span>
                </button>
                <button
                  type="button"
                  className="month-selected-close-btn"
                  onClick={() => onSelectDate(null)}
                  aria-label="Clear selected date"
                  title="Clear selection"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="month-selected-items-list">
              {selectedTasks.length === 0 ? (
                <div className="month-selected-empty">
                  <span>✨ No events or tasks scheduled for this day.</span>
                  <button
                    type="button"
                    className="month-empty-add-btn"
                    onClick={() => onAddTask({ date: selectedDate, status: "open" })}
                  >
                    + Add something to {selectedDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </button>
                </div>
              ) : (
                selectedTasks.map((t) => {
                  const itemType = getItemType(t);
                  const isAppointment = itemType === "appointment";
                  const isEvent = itemType === "event" || Boolean(t.isGoogleEvent || t.durationMinutes || t.isAllDay);
                  const tileStyle = getItemTileStyle(t, itemStyles, allCalendarConfigs);
                  const isDone = t.status === "completed";
                  const timeLabel = formatTime(t.dueTime);

                  return (
                    <div
                      key={t.id}
                      className={`month-selected-item-row ${tileStyle.className} ${isDone ? "is-completed" : ""}`}
                      onClick={() => onOpenTaskDetail(t)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenTaskDetail(t);
                        }
                      }}
                    >
                      <span
                        className="item-color-bar"
                        style={{ backgroundColor: tileStyle.indicatorColor }}
                      />
                      <div className="item-meta">
                        <span className="item-time">
                          {t.isAllDay ? "All Day" : timeLabel ? timeLabel : "Whenever"}
                        </span>
                        <strong className="item-title">{t.title}</strong>
                        {t.location && <span className="item-location">📍 {t.location}</span>}
                      </div>
                      <div className="item-type-badge-wrap">
                        <span
                          className="item-type-pill"
                          style={{
                            backgroundColor: `${tileStyle.primaryColor}22`,
                            color: tileStyle.indicatorColor,
                            borderColor: tileStyle.borderColor,
                          }}
                        >
                          {isAppointment ? "⏱️ Appt" : isEvent ? "📅 Event" : "☑️ Task"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

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
