"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  CaretDown,
  Plus,
  Lock,
  CalendarBlank,
  Clock,
  MapPin,
  Calendar,
  DotsSixVertical,
  CheckCircle,
  Circle,
  CheckSquare,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { type ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import {
  getItemType,
  type ItemColorPreferences,
  DEFAULT_ITEM_COLORS,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";
import {
  layoutDayEvents,
  isAllDayItem,
  formatTimeRange,
  parseMinutesFromTime,
  type PositionedDayEvent,
} from "@/lib/calendar/day-layout";
import { toDateKey, formatWeekRange } from "@/lib/calendar/date-utils";

export type DayAppView = "dashboard" | "day" | "month" | "year" | "yearline" | "agenda" | "week" | "workWeek" | "kanban" | "settings";

export interface WeekViewProps {
  weekDays: Date[];
  weeklyAnchorDate: Date;
  today: Date;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onNavigateWeek: (offset: number) => void;
  onResetToToday: () => void;
  weekStartsOn: 0 | 1 | 6;
  resolvedTheme: ResolvedCalendarTheme;
  tasks: PlannerTask[]; // filtered by active calendars / localCalendarEnabled
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onToggleMobileSidebar?: () => void;
  activeCalendarCount?: number;
  currentView?: DayAppView;
  onSwitchView?: (view: DayAppView) => void;

  weeklyViewMode: "timeline" | "kanban";
  onSwitchWeeklyMode: (mode: "timeline" | "kanban") => void;
  onToggleTask?: (task: PlannerTask) => Promise<void>;
  onMoveTaskStatus?: (taskId: string, status: PlannerTask["status"]) => Promise<void>;
  labels?: Array<{ id: string; name: string }>;
  saveError?: string;
  onClearSaveError?: () => void;
  isYearSection?: boolean;
  sectionRef?: React.Ref<HTMLElement>;
}

const DEFAULT_START_HOUR = 6; // 6:00 AM by default
const DEFAULT_END_HOUR = 22; // 10:00 PM by default
const HOUR_HEIGHT = 60; // 60px per hour -> 1px per minute

export function WeekView({
  weekDays,
  weeklyAnchorDate,
  todayKey,
  selectedDate,
  onSelectDate,
  onNavigateWeek,
  onResetToToday,
  resolvedTheme,
  tasks,
  allCalendarConfigs,
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  onAddTask,
  onOpenTaskDetail,
  activeCalendarCount = 0,
  currentView = "week",
  weeklyViewMode,
  onSwitchWeeklyMode,
  onToggleTask,
  onMoveTaskStatus,
  labels = [],
  saveError,
  onClearSaveError,
  isYearSection = false,
  sectionRef,
}: WeekViewProps) {
  const isWorkWeek = weekDays.length === 5 || currentView === "workWeek";

  const weekDateKeys = useMemo(() => new Set(weekDays.map(toDateKey)), [weekDays]);
  const hasTodayInWeek = useMemo(() => weekDateKeys.has(todayKey), [weekDateKeys, todayKey]);

  // Live minute of day for current-time indicator
  const [currentMinutesNow, setCurrentMinutesNow] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setCurrentMinutesNow(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute dynamic startHour and endHour (6:00 AM to 10:00 PM by default, auto-expanded if an event falls outside)
  const { startHour, endHour, hoursList } = useMemo(() => {
    let minHour = DEFAULT_START_HOUR;
    let maxHour = DEFAULT_END_HOUR;

    for (const day of weekDays) {
      const dKey = toDateKey(day);
      const timed = tasks.filter((t) => t.dueDate === dKey && !isAllDayItem(t));
      for (const t of timed) {
        const startMin = parseMinutesFromTime(t.dueTime);
        if (startMin !== null) {
          const dur = t.durationMinutes && t.durationMinutes > 0 ? t.durationMinutes : 60;
          const endMin = Math.min(1440, startMin + dur);
          minHour = Math.min(minHour, Math.floor(startMin / 60));
          maxHour = Math.max(maxHour, Math.ceil(endMin / 60));
        }
      }
    }

    const clampedStart = Math.max(0, Math.min(minHour, DEFAULT_START_HOUR));
    const clampedEnd = Math.min(23, Math.max(maxHour, DEFAULT_END_HOUR));
    const list: number[] = [];
    for (let h = clampedStart; h <= clampedEnd; h++) {
      list.push(h);
    }
    return { startHour: clampedStart, endHour: clampedEnd, hoursList: list };
  }, [weekDays, tasks]);

  // Group all-day tasks and timed items by dateKey for all 7 days
  const { allDayItemsByDate, positionedItemsByDate, totalWeekItemsCount } = useMemo(() => {
    const allDayMap: Record<string, PlannerTask[]> = {};
    const positionedMap: Record<string, PositionedDayEvent[]> = {};
    let count = 0;

    for (const day of weekDays) {
      const dKey = toDateKey(day);
      const dayTasks = tasks.filter((t) => t.dueDate === dKey);
      count += dayTasks.length;

      allDayMap[dKey] = dayTasks.filter(isAllDayItem);
      positionedMap[dKey] = layoutDayEvents(tasks, dKey);
    }

    return {
      allDayItemsByDate: allDayMap,
      positionedItemsByDate: positionedMap,
      totalWeekItemsCount: count,
    };
  }, [weekDays, tasks]);

  // Auto-scroll timeline to a useful time range on mount or week change
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!timelineScrollContainerRef.current) return;
    let targetMinutes = 8 * 60; // 8:00 AM default

    if (hasTodayInWeek) {
      targetMinutes = Math.max(startHour * 60, currentMinutesNow - 60);
    } else {
      const allTimedMins: number[] = [];
      for (const day of weekDays) {
        const dKey = toDateKey(day);
        const positioned = positionedItemsByDate[dKey] || [];
        for (const p of positioned) {
          allTimedMins.push(p.startMinutes);
        }
      }
      if (allTimedMins.length > 0) {
        targetMinutes = Math.max(startHour * 60, Math.min(...allTimedMins) - 30);
      }
    }

    const targetScrollTop = ((targetMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
    timelineScrollContainerRef.current.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }, [weeklyAnchorDate, hasTodayInWeek, startHour, positionedItemsByDate, currentMinutesNow, weekDays]);

  // Click on empty space in a day column to add a timed event
  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateKey: string) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(".week-timeline-event") ||
      target.closest("button") ||
      target.closest("a") ||
      target.closest(".week-allday-pill")
    ) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalMinutes = Math.max(0, Math.min(23 * 60 + 30, startHour * 60 + (offsetY / HOUR_HEIGHT) * 60));
    const snappedMinutes = Math.floor(totalMinutes / 30) * 30;
    const hh = String(Math.floor(snappedMinutes / 60)).padStart(2, "0");
    const mm = String(snappedMinutes % 60).padStart(2, "0");

    onAddTask({
      date: dateKey,
      time: `${hh}:${mm}`,
      status: "open",
    });
  };

  // Click on all-day row to create an all-day event / task
  const handleAllDaySlotClick = (e: React.MouseEvent<HTMLDivElement>, dateKey: string) => {
    const target = e.target as HTMLElement;
    if (target.closest(".week-allday-pill") || target.closest("button") || target.closest("a")) {
      return;
    }
    onAddTask({
      date: dateKey,
      time: null,
      status: "open",
    });
  };

  // Kanban mode tasks grouped by status
  const weekTasksByStatus = useMemo(() => {
    const map: Record<PlannerTask["status"], PlannerTask[]> = { open: [], in_progress: [], completed: [] };
    for (const task of tasks) {
      if (task.dueDate && weekDateKeys.has(task.dueDate)) {
        if (map[task.status]) map[task.status].push(task);
        else map.open.push(task);
      }
    }
    return map;
  }, [tasks, weekDateKeys]);

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const kanbanColumns: Array<{ key: PlannerTask["status"]; label: string }> = [
    { key: "open", label: "To Do" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Done" },
  ];

  const formattedWeekRangeStr = useMemo(() => formatWeekRange(weekDays), [weekDays]);

  const priorityLabel = (priority: PlannerTask["priority"]) => {
    switch (priority) {
      case "p1":
        return "P1 Urgent";
      case "p2":
        return "P2 High";
      case "p3":
        return "P3 Medium";
      case "p4":
        return "P4 Low";
      default:
        return "No Priority";
    }
  };

  return (
    <section
      className="week-view-workspace neo-card"
      id="week-view"
      ref={sectionRef}
      style={{
        "--calendar-theme-bg": resolvedTheme.calendarBg,
        "--calendar-weekend-bg": resolvedTheme.weekendBg,
        "--calendar-today-bg": resolvedTheme.todayBg,
        "--calendar-selected-bg": resolvedTheme.selectedBg,
        "--calendar-task-dot": resolvedTheme.taskDotColor,
      } as React.CSSProperties}
    >
      {/* 1. Weekly Header */}
      <header className="week-view-header">
        <div className="week-header-left">
          <div className="week-title-group">
            <span className="section-kicker">
              {isYearSection ? "WEEKLY PLANNER" : isWorkWeek ? "WORK WEEKS CALENDAR" : "WEEKLY WORKSPACE"}
            </span>
            <div className="week-title-row">
              <h2 className="week-main-heading">{formattedWeekRangeStr}</h2>
              {hasTodayInWeek && <span className="week-today-tag">This Week</span>}
            </div>
          </div>
        </div>

        <div className="week-header-right">
          {/* Previous / Today / Next week navigation */}
          <div className="week-nav-controls">
            <button
              type="button"
              className="icon-button"
              onClick={() => onNavigateWeek(-1)}
              aria-label={isWorkWeek ? "Previous work week" : "Previous week"}
              title={isWorkWeek ? "Previous work week" : "Previous week"}
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              className={`icon-button today-btn ${hasTodayInWeek ? "is-active-today" : ""}`}
              onClick={onResetToToday}
              title={isWorkWeek ? "Go to current work week" : "Go to current week"}
            >
              Today
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => onNavigateWeek(1)}
              aria-label={isWorkWeek ? "Next work week" : "Next week"}
              title={isWorkWeek ? "Next work week" : "Next week"}
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>

          {/* Direct Date Picker */}
          <div className="day-picker-wrap" title={isWorkWeek ? "Jump to date's work week" : "Jump to date's week"}>
            <input
              type="date"
              className="day-picker-input"
              value={selectedDate || toDateKey(weeklyAnchorDate)}
              onChange={(e) => {
                if (e.target.value) {
                  onSelectDate(e.target.value);
                }
              }}
              aria-label={isWorkWeek ? "Jump to work week" : "Jump to week"}
            />
            <span className="day-picker-icon" aria-hidden="true">
              <CalendarBlank size={14} weight="bold" />
            </span>
          </div>

          {/* Segmented layout switcher: Timeline vs Status Kanban */}
          <div className="segmented week-layout-segmented" aria-label="Weekly layout mode">
            <button
              type="button"
              className={weeklyViewMode === "timeline" ? "selected" : ""}
              onClick={() => onSwitchWeeklyMode("timeline")}
            >
              {isWorkWeek ? "5-Day Timeline" : "7-Day Timeline"}
            </button>
            <button
              type="button"
              className={weeklyViewMode === "kanban" ? "selected" : ""}
              onClick={() => onSwitchWeeklyMode("kanban")}
            >
              Status Kanban
            </button>
          </div>
        </div>
      </header>

      {/* Save Error Banner if present */}
      {saveError && (
        <div className="week-save-error-banner" role="status">
          <p className="save-error" style={{ margin: 0 }}>
            {saveError}
          </p>
          {onClearSaveError && (
            <button
              type="button"
              className="week-error-dismiss-btn"
              onClick={onClearSaveError}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* 2. MAIN WEEK CONTENT */}
      {weeklyViewMode === "timeline" ? (
        <div className="week-hourly-calendar-wrapper">
          {/* 2A. Sticky Header Row & All-Day Section */}
          <div className={`week-sticky-top-panel ${isWorkWeek ? "cols-5" : ""}`}>
            {/* Day Header Columns */}
            <div className="week-day-headers-row">
              <div className="week-corner-cell" title="Timezone: Local">
                <span className="week-corner-label">TIME</span>
              </div>
              <div
                className={`week-headers-grid ${isWorkWeek ? "cols-5" : ""}`}
                style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
              >
                {weekDays.map((day) => {
                  const dateKey = toDateKey(day);
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDate;
                  const dayOfWeek = day.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const dayShort = day.toLocaleDateString("en-US", { weekday: "short" });
                  const dayFull = day.toLocaleDateString("en-US", { weekday: "long" });

                  return (
                    <div
                      key={dateKey}
                      className={`week-day-header-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${isWeekend ? "is-weekend" : ""}`}
                      onClick={() => onSelectDate(dateKey)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectDate(dateKey);
                        }
                      }}
                      title={`${dayFull}, ${day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    >
                      <span className="week-header-name">{dayShort}</span>
                      <span className={`week-header-date-badge ${isToday ? "today-badge" : ""} ${isSelected ? "selected-badge" : ""}`}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* All-Day Section Row */}
            <div className="week-allday-row">
              <div className="week-allday-label-cell">
                <span className="allday-label-text">All Day</span>
                <span className="allday-count-badge">
                  {Object.values(allDayItemsByDate).reduce((sum, list) => sum + list.length, 0)}
                </span>
              </div>
              <div
                className={`week-allday-grid ${isWorkWeek ? "cols-5" : ""}`}
                style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
              >
                {weekDays.map((day) => {
                  const dateKey = toDateKey(day);
                  const items = allDayItemsByDate[dateKey] || [];
                  const isToday = dateKey === todayKey;

                  return (
                    <div
                      key={dateKey}
                      className={`week-allday-col ${isToday ? "is-today-col" : ""}`}
                      onClick={(e) => handleAllDaySlotClick(e, dateKey)}
                    >
                      {items.length === 0 ? (
                        <button
                          type="button"
                          className="week-allday-empty-hint"
                          onClick={() => onAddTask({ date: dateKey, time: null, status: "open" })}
                          title={`Add all-day item for ${dateKey}`}
                        >
                          <Plus size={11} weight="bold" />
                          <span>All-day</span>
                        </button>
                      ) : (
                        <div className="week-allday-items-stack">
                          {items.map((item) => {
                            const calConfig = item.googleCalendarId ? allCalendarConfigs[item.googleCalendarId] : undefined;
                            const tileStyle = getItemTileStyle(item, itemStyles, allCalendarConfigs);
                            const calColor = tileStyle.primaryColor;
                            const itemType = getItemType(item);
                            const isAppointment = itemType === "appointment";
                            const isReadOnly = Boolean(
                              item.isReadOnlyCalendar ||
                                calConfig?.accessRole === "reader" ||
                                calConfig?.accessRole === "freeBusyReader"
                            );

                            return (
                              <div
                                key={item.id}
                                className={`week-allday-pill ${tileStyle.className} ${item.status === "completed" ? "is-completed" : ""}`}
                                style={{
                                  ...tileStyle.style,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenTaskDetail(item);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onOpenTaskDetail(item);
                                  }
                                }}
                                title={`${item.title}${item.googleCalendarName ? ` (${item.googleCalendarName})` : ""}`}
                              >
                                <span className="allday-pill-dot" style={{ backgroundColor: tileStyle.indicatorColor }} />
                                <span className="allday-pill-title">{item.title}</span>
                                {item.isGoogleEvent ? (
                                  <span className="allday-pill-source-badge">
                                    <Calendar size={9} weight="fill" />
                                    <span>{item.googleCalendarName || "Google"}</span>
                                    {isReadOnly && <Lock size={9} weight="bold" className="allday-lock-icon" />}
                                  </span>
                                ) : isAppointment ? (
                                  <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                                    <Clock size={9} weight="bold" />
                                    <span>Schedule</span>
                                  </span>
                                ) : itemType === "event" ? (
                                  <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                                    <CalendarBlank size={9} weight="bold" />
                                    <span>Event</span>
                                  </span>
                                ) : (
                                  <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                                    <CheckSquare size={9} weight="bold" />
                                    <span>Task</span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2B. Vertically Scrollable Hourly Timeline */}
          <div
            className={`week-timeline-scroll-container ${isWorkWeek ? "cols-5" : ""}`}
            ref={timelineScrollContainerRef}
          >
            <div
              className="week-timeline-layout"
              style={{ height: `${hoursList.length * HOUR_HEIGHT}px` }}
            >
              {/* Left Time Axis Labels (startHour..endHour) */}
              <div className="week-time-axis">
                {hoursList.map((hour) => {
                  const period = hour >= 12 ? "PM" : "AM";
                  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                  return (
                    <div key={hour} className="time-axis-cell" style={{ height: `${HOUR_HEIGHT}px` }}>
                      <span className="time-axis-label">
                        {displayHour} {period}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Day Columns Timeline Grid */}
              <div
                className={`week-columns-grid ${isWorkWeek ? "cols-5" : ""}`}
                style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
              >
                {/* Horizontal Hour & Half-Hour Grid Lines across entire width */}
                <div className="week-grid-lines-layer" aria-hidden="true">
                  {hoursList.map((hour, idx) => (
                    <div
                      key={hour}
                      className="week-hour-row-line"
                      style={{
                        top: `${idx * HOUR_HEIGHT}px`,
                        height: `${HOUR_HEIGHT}px`,
                      }}
                    >
                      <div className="week-half-hour-line" />
                    </div>
                  ))}
                </div>

                {/* 7 Day Vertical Columns */}
                {weekDays.map((day) => {
                  const dateKey = toDateKey(day);
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDate;
                  const positionedEvents = positionedItemsByDate[dateKey] || [];

                  return (
                    <div
                      key={dateKey}
                      className={`week-day-column ${isToday ? "is-today-column" : ""} ${isSelected ? "is-selected-column" : ""}`}
                      onClick={(e) => handleColumnClick(e, dateKey)}
                    >
                      {/* Red Current Time Line Indicator (only in today's column) */}
                      {isToday &&
                        currentMinutesNow >= startHour * 60 &&
                        currentMinutesNow <= (endHour + 1) * 60 && (
                          <div
                            className="week-current-time-line"
                            style={{
                              top: `${((currentMinutesNow - startHour * 60) / 60) * HOUR_HEIGHT}px`,
                            }}
                            title={`Current time: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                          >
                            <span className="current-time-dot" />
                          </div>
                        )}

                      {/* Overlapping Positioned Event Cards */}
                      {positionedEvents.map(
                        ({ task, startMinutes, endMinutes, durationMinutes, column, totalColumns }) => {
                          const itemType = getItemType(task);
                          const isAppointment = itemType === "appointment";
                          const calConfig = task.googleCalendarId
                            ? allCalendarConfigs[task.googleCalendarId]
                            : undefined;
                          const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                          const calColor = tileStyle.primaryColor;
                          const isReadOnly = Boolean(
                            task.isReadOnlyCalendar ||
                              calConfig?.accessRole === "reader" ||
                              calConfig?.accessRole === "freeBusyReader"
                          );

                          const topPx = ((startMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
                          const heightPx = Math.max(26, (durationMinutes / 60) * HOUR_HEIGHT - 2);
                          const widthPercent = 100 / totalColumns;
                          const leftPercent = column * widthPercent;

                          return (
                            <div
                              key={task.id}
                              className={`week-timeline-event ${tileStyle.className} ${task.status === "completed" ? "is-completed" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                              style={{
                                top: `${topPx}px`,
                                height: `${heightPx}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                                ...tileStyle.style,
                              }}
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
                              title={`${task.title} (${formatTimeRange(startMinutes, endMinutes)})${task.googleCalendarName ? ` · ${task.googleCalendarName}` : ""}`}
                            >
                              <div className="week-event-card-top">
                                <div className="week-event-title-wrap">
                                  {task.isPinned && <span className="event-pin" title="Pinned">📌</span>}
                                  {isAppointment ? (
                                    <Clock size={11} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 2 }} />
                                  ) : itemType === "event" ? (
                                    <CalendarBlank size={11} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 2 }} />
                                  ) : (
                                    <CheckSquare size={11} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 2 }} />
                                  )}
                                  <span className="week-event-title">{task.title}</span>
                                </div>
                                {isReadOnly && (
                                  <span className="week-event-lock" title="Read-only calendar">
                                    <Lock size={10} weight="bold" />
                                  </span>
                                )}
                              </div>

                              {heightPx >= 42 && (
                                <div className="week-event-card-meta">
                                  <span className="week-event-time">
                                    <Clock size={10} weight="bold" />
                                    <span>{formatTimeRange(startMinutes, endMinutes)}</span>
                                  </span>

                                  {task.isGoogleEvent ? (
                                    <span className="week-event-source-chip" style={{ color: calColor }}>
                                      {task.googleCalendarName || "Google"}
                                    </span>
                                  ) : isAppointment ? (
                                    <span className="week-event-local-chip" style={{ color: calColor }}>Schedule</span>
                                  ) : itemType === "event" ? (
                                    <span className="week-event-local-chip" style={{ color: calColor }}>Event</span>
                                  ) : (
                                    <span className="week-event-local-chip" style={{ color: calColor }}>Task</span>
                                  )}

                                  {task.location && heightPx >= 58 && (
                                    <span className="week-event-location" title={task.location}>
                                      <MapPin size={10} weight="fill" />
                                      <span>{task.location}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2C. Kanban Status Board Mode */
        <div className="weekly-kanban-board">
          <div className="weekly-kanban-cols">
            {kanbanColumns.map((col) => {
              const colTasks = weekTasksByStatus[col.key];
              return (
                <div
                  className={`weekly-kanban-col weekly-kanban-col-${col.key}`}
                  key={col.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("kanban-drag-over");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("kanban-drag-over");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("kanban-drag-over");
                    const taskId = e.dataTransfer.getData("text/plain") || dragTaskId;
                    if (taskId && onMoveTaskStatus) {
                      void onMoveTaskStatus(taskId, col.key);
                    }
                    setDragTaskId(null);
                  }}
                >
                  <div className="weekly-kanban-header">
                    <div className="weekly-kanban-header-left">
                      <span className={`kanban-status-dot kanban-dot-${col.key}`} />
                      <span className="weekly-kanban-title">{col.label}</span>
                    </div>
                    <div className="weekly-kanban-header-actions">
                      <span className="weekly-kanban-count">{colTasks.length}</span>
                      <button
                        type="button"
                        className="kanban-col-add-btn"
                        aria-label={`Add task to ${col.label}`}
                        title={`Add task to ${col.label}`}
                        onClick={() =>
                          onAddTask({
                            date: selectedDate || todayKey,
                            status: col.key,
                          })
                        }
                      >
                        <Plus size={13} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <div className="weekly-kanban-body">
                    {colTasks.length === 0 && (
                      <div className="weekly-kanban-empty">
                        {col.key === "open"
                          ? "No tasks to do this week"
                          : col.key === "in_progress"
                          ? "No tasks currently in progress"
                          : "No completed tasks this week"}
                      </div>
                    )}
                    {colTasks.map((task) => {
                      const isTaskDateSelected = Boolean(task.dueDate && task.dueDate === selectedDate);
                      const isTaskDateToday = Boolean(task.dueDate && task.dueDate === todayKey);
                      const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                      return (
                        <div
                          className={`weekly-kanban-tile ${tileStyle.className} priority-accent-${task.priority} ${task.status === "completed" ? "is-done" : ""}`}
                          style={{ ...tileStyle.style }}
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", task.id);
                            setDragTaskId(task.id);
                          }}
                          onDragEnd={() => setDragTaskId(null)}
                        >
                          <div className="weekly-kanban-tile-top">
                            {task.dueDate && (
                              <span
                                className={`kanban-day-chip ${isTaskDateSelected ? "is-selected-date" : isTaskDateToday ? "is-today-date" : ""}`}
                              >
                                {isTaskDateSelected && <span aria-hidden="true">★ </span>}
                                {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                            <span className="kanban-drag-handle" aria-hidden="true">
                              <DotsSixVertical size={14} />
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
                            {onToggleTask && (
                              <button
                                type="button"
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
                                aria-label={task.status === "completed" ? "Mark incomplete" : "Mark complete"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onToggleTask(task);
                                }}
                              >
                                {task.status === "completed" ? (
                                  <CheckCircle size={16} weight="fill" color="#15803d" />
                                ) : (
                                  <Circle size={16} color="#78716c" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="weekly-kanban-tile-title"
                              onClick={() => onOpenTaskDetail(task)}
                            >
                              {task.title}
                            </button>
                          </div>
                          {task.labelIds && task.labelIds.length > 0 && (
                            <div className="kanban-task-labels">
                              {task.labelIds.map((id) => {
                                const labelObj = labels.find((l) => l.id === id);
                                return labelObj ? (
                                  <span key={id} className="task-label-chip">
                                    🏷️ {labelObj.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                          <div className="weekly-kanban-tile-meta">
                            <span className={`priority-badge-sm priority-${task.priority}`}>
                              {priorityLabel(task.priority)}
                            </span>
                            {task.dueTime && (
                              <span className="week-task-time">
                                {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                            {onMoveTaskStatus && (
                              <div className="kanban-tile-touch-move" onClick={(e) => e.stopPropagation()}>
                                <label className="kanban-move-label" aria-label={`Move ${task.title}`}>
                                  <CaretDown size={11} />
                                  <select
                                    value={task.status}
                                    onChange={(e) =>
                                      void onMoveTaskStatus(task.id, e.target.value as PlannerTask["status"])
                                    }
                                  >
                                    <option value="open">To Do</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Done</option>
                                  </select>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="kanban-col-add-bottom-btn"
                      onClick={() =>
                        onAddTask({
                          date: selectedDate || todayKey,
                          status: col.key,
                        })
                      }
                    >
                      + Add task
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Footer Summary */}
      <footer className="week-view-footer">
        <div className="week-footer-legend">
          <span className="legend-chip">
            <span className="legend-chip-box today-chip" /> Today
          </span>
          <span className="legend-chip">
            <span className="legend-chip-box active-count-chip" /> {activeCalendarCount} Active Calendar(s)
          </span>
          <span className="legend-chip">
            <span className="legend-chip-box items-chip" /> {totalWeekItemsCount} Scheduled Item(s)
          </span>
        </div>
        <span className="week-footer-hint">
          {weeklyViewMode === "timeline"
            ? "Click any empty time slot on the grid to create an event ✳"
            : "Drag cards between columns to change status ✳"}
        </span>
      </footer>
    </section>
  );
}
