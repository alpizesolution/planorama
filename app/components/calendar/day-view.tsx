"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  Plus,
  Lock,
  SidebarSimple,
  CalendarBlank,
  Clock,
  MapPin,
  Calendar,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { type ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";

import {
  layoutDayEvents,
  isAllDayItem,
  formatDayTitle,
  formatTimeRange,
  type PositionedDayEvent,
} from "@/lib/calendar/day-layout";

export type DayAppView = "dashboard" | "day" | "month" | "year" | "yearline" | "agenda" | "week" | "kanban";

export interface DayViewProps {
  currentDate: Date;
  currentDateKey: string; // "YYYY-MM-DD"
  today: Date;
  todayKey: string;
  onNavigateDay: (offset: number) => void;
  onResetToToday: () => void;
  onSelectDate: (dateKey: string) => void;
  resolvedTheme: ResolvedCalendarTheme;
  tasks: PlannerTask[]; // filtered by active calendars
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onToggleMobileSidebar: () => void;
  activeCalendarCount: number;
  currentView?: DayAppView;
  onSwitchView?: (view: DayAppView) => void;
}

const HOUR_HEIGHT = 60; // 60px per hour -> 1px per minute

export function DayView({
  currentDate,
  currentDateKey,
  todayKey,
  onNavigateDay,
  onResetToToday,
  onSelectDate,
  tasks,
  allCalendarConfigs,
  onAddTask,
  onOpenTaskDetail,
  onToggleMobileSidebar,
  activeCalendarCount,
  currentView = "day",
  onSwitchView,
}: DayViewProps) {
  const isToday = currentDateKey === todayKey;

  // Track live current time for today's red indicator line
  const [currentMinutesNow, setCurrentMinutesNow] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setCurrentMinutesNow(n.getHours() * 60 + n.getMinutes());
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Filter tasks belonging to current date
  const dayTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === currentDateKey);
  }, [tasks, currentDateKey]);

  // Separate all-day items from timed timeline items
  const allDayItems = useMemo(() => {
    return dayTasks.filter(isAllDayItem);
  }, [dayTasks]);

  // Greedy interval layout positioning for timed events
  const positionedItems = useMemo<PositionedDayEvent[]>(() => {
    return layoutDayEvents(tasks, currentDateKey);
  }, [tasks, currentDateKey]);

  // Auto-scroll timeline to a useful time range on mount or day change
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!timelineScrollContainerRef.current) return;
    let targetMinutes = 8 * 60; // default 8:00 AM

    if (isToday) {
      // If viewing today, center slightly above current time
      targetMinutes = Math.max(0, currentMinutesNow - 60);
    } else if (positionedItems.length > 0) {
      // If viewing another date with events, scroll to the earliest event
      const earliest = Math.min(...positionedItems.map((p) => p.startMinutes));
      targetMinutes = Math.max(0, earliest - 30);
    }

    const targetScrollTop = (targetMinutes / 60) * HOUR_HEIGHT;
    timelineScrollContainerRef.current.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateKey, isToday]); // run when active date changes

  // Click on empty space in timeline to quick add event at that time
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if clicked directly on an event card or interactive element
    const target = e.target as HTMLElement;
    if (target.closest(".day-timeline-event") || target.closest("button") || target.closest("a")) {
      return;
    }

    if (!timelineGridRef.current) return;
    const rect = timelineGridRef.current.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    const totalMinutes = Math.max(0, Math.min(23 * 60 + 30, (offsetY / HOUR_HEIGHT) * 60));
    // Snap to nearest 30 minutes
    const snappedMinutes = Math.floor(totalMinutes / 30) * 30;
    const hh = String(Math.floor(snappedMinutes / 60)).padStart(2, "0");
    const mm = String(snappedMinutes % 60).padStart(2, "0");

    onAddTask({
      date: currentDateKey,
      time: `${hh}:${mm}`,
      status: "open",
    });
  };

  // Format header title: e.g. "Monday, October 26, 2026"
  const formattedDayTitle = useMemo(() => {
    return formatDayTitle(currentDate);
  }, [currentDate]);

  return (
    <div className="day-view-workspace neo-card">
      {/* 1. Header with date navigation, picker, and actions */}
      <header className="day-view-header">
        <div className="day-header-left">
          <button
            type="button"
            className="mobile-sidebar-toggle-btn day-mobile-sidebar-btn"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle calendar sidebar"
          >
            <SidebarSimple size={18} weight="bold" />
            <span>Calendars</span>
          </button>

          <div className="day-title-group">
            <span className="section-kicker">DAILY WORKSPACE</span>
            <div className="day-title-row">
              <h2 className="day-main-heading">{formattedDayTitle}</h2>
              {isToday && <span className="day-today-tag">Today</span>}
            </div>
          </div>
        </div>

        <div className="day-header-right">
          {/* Quick Date Navigation Arrows + Today */}
          <div className="day-nav-controls">
            <button
              type="button"
              className="icon-button"
              onClick={() => onNavigateDay(-1)}
              aria-label="Previous day"
              title="Previous day"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              className={`icon-button today-btn ${isToday ? "is-active-today" : ""}`}
              onClick={onResetToToday}
            >
              Today
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => onNavigateDay(1)}
              aria-label="Next day"
              title="Next day"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>

          {/* Direct Date Picker */}
          <div className="day-picker-wrap" title="Jump to specific date">
            <input
              type="date"
              className="day-picker-input"
              value={currentDateKey}
              onChange={(e) => {
                if (e.target.value) {
                  onSelectDate(e.target.value);
                }
              }}
              aria-label="Jump to date"
            />
            <span className="day-picker-icon" aria-hidden="true">
              <CalendarBlank size={14} weight="bold" />
            </span>
          </div>

          {/* View switcher for Day, Week, Month */}
          {onSwitchView && (
            <div className="day-header-view-switcher" role="tablist" aria-label="Switch view">
              <button
                type="button"
                className={`day-view-tab-btn ${currentView === "day" ? "is-active" : ""}`}
                onClick={() => onSwitchView("day")}
                role="tab"
                aria-selected={currentView === "day"}
              >
                Day
              </button>
              <button
                type="button"
                className={`day-view-tab-btn ${currentView === "week" ? "is-active" : ""}`}
                onClick={() => onSwitchView("week")}
                role="tab"
                aria-selected={currentView === "week"}
              >
                Week
              </button>
              <button
                type="button"
                className={`day-view-tab-btn ${currentView === "month" ? "is-active" : ""}`}
                onClick={() => onSwitchView("month")}
                role="tab"
                aria-selected={currentView === "month"}
              >
                Month
              </button>
            </div>
          )}

          {/* Quick Add Event & Add Task Actions */}
          <div className="day-header-actions-group">
            <button
              type="button"
              className="day-add-event-btn"
              onClick={() => onAddTask({ date: currentDateKey, time: "09:00", status: "open" })}
              title="Add scheduled event with prefilled time"
            >
              <Plus size={15} weight="bold" />
              <span>Add Event</span>
            </button>
            <button
              type="button"
              className="day-add-task-btn"
              onClick={() => onAddTask({ date: currentDateKey, status: "open" })}
              title="Add daily task"
            >
              <Plus size={15} weight="bold" />
              <span>Add Task</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. All-Day Events & Daily Tasks Section */}
      <div className="day-allday-container">
        <div className="day-allday-label-col">
          <span className="allday-label-text">All Day</span>
          <span className="allday-count-badge">{allDayItems.length}</span>
        </div>
        <div className="day-allday-content-col">
          {allDayItems.length === 0 ? (
            <button
              type="button"
              className="allday-empty-placeholder"
              onClick={() => onAddTask({ date: currentDateKey, status: "open" })}
            >
              <Plus size={12} weight="bold" />
              <span>Add all-day event or daily task</span>
            </button>
          ) : (
            <div className="day-allday-items-grid">
              {allDayItems.map((item) => {
                const calConfig = item.googleCalendarId ? allCalendarConfigs[item.googleCalendarId] : undefined;
                const calColor = item.googleCalendarColor || calConfig?.color || (item.isGoogleEvent ? "#4285F4" : "#10b981");
                const isReadOnly = Boolean(item.isReadOnlyCalendar || calConfig?.accessRole === "reader" || calConfig?.accessRole === "freeBusyReader");

                return (
                  <div
                    key={item.id}
                    className={`day-allday-pill ${item.status === "completed" ? "is-completed" : ""}`}
                    style={{
                      borderLeftColor: calColor,
                      backgroundColor: `${calColor}14`,
                    }}
                    onClick={() => onOpenTaskDetail(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenTaskDetail(item);
                      }
                    }}
                  >
                    <span
                      className="allday-pill-dot"
                      style={{ backgroundColor: calColor }}
                    />
                    <span className="allday-pill-title">{item.title}</span>
                    {item.isGoogleEvent ? (
                      <span className="allday-pill-source-badge">
                        <Calendar size={10} weight="fill" />
                        <span>{item.googleCalendarName || "Google"}</span>
                        {isReadOnly && <Lock size={10} weight="bold" className="allday-lock-icon" />}
                      </span>
                    ) : (
                      <span className="allday-pill-local-badge">Task</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Vertically Scrollable Hourly Timeline Canvas */}
      <div className="day-timeline-scroll-container" ref={timelineScrollContainerRef}>
        <div className="day-timeline-layout">
          {/* Left Time Axis Labels (12 AM - 11 PM) */}
          <div className="day-time-axis">
            {Array.from({ length: 24 }).map((_, hour) => {
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

          {/* Right Hourly Grid with Overlapping Events & Red Current Time Line */}
          <div
            className="day-timeline-canvas"
            ref={timelineGridRef}
            onClick={handleTimelineClick}
            style={{ height: `${24 * HOUR_HEIGHT}px` }}
          >
            {/* Horizontal hour and half-hour separator lines */}
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={hour}
                className="day-timeline-hour-row"
                style={{
                  top: `${hour * HOUR_HEIGHT}px`,
                  height: `${HOUR_HEIGHT}px`,
                }}
              >
                <div className="day-timeline-half-hour" />
              </div>
            ))}

            {/* Red Current Time Line (Visible when viewing today) */}
            {isToday && (
              <div
                className="day-current-time-line"
                style={{ top: `${(currentMinutesNow / 60) * HOUR_HEIGHT}px` }}
                title={`Current time: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
              >
                <span className="current-time-dot" />
                <span className="current-time-badge">
                  {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            )}

            {/* Positioned Event and Task Cards */}
            {positionedItems.map(({ task, startMinutes, durationMinutes, column, totalColumns, endMinutes }) => {
              const calConfig = task.googleCalendarId ? allCalendarConfigs[task.googleCalendarId] : undefined;
              const calColor = task.googleCalendarColor || calConfig?.color || (task.isGoogleEvent ? "#0284c7" : "#10b981");
              const isReadOnly = Boolean(task.isReadOnlyCalendar || calConfig?.accessRole === "reader" || calConfig?.accessRole === "freeBusyReader");

              const topPx = (startMinutes / 60) * HOUR_HEIGHT;
              const heightPx = Math.max(30, (durationMinutes / 60) * HOUR_HEIGHT - 2);
              const widthPercent = 100 / totalColumns;
              const leftPercent = column * widthPercent;

              return (
                <div
                  key={task.id}
                  className={`day-timeline-event ${task.status === "completed" ? "is-completed" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    left: `calc(${leftPercent}% + 2px)`,
                    width: `calc(${widthPercent}% - 4px)`,
                    borderLeftColor: calColor,
                    backgroundColor: `${calColor}14`,
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
                  <div className="timeline-event-header">
                    <div className="timeline-event-title-wrap">
                      {task.isPinned && <span className="event-pin" title="Pinned">📌</span>}
                      <span className="timeline-event-title">{task.title}</span>
                    </div>
                    {isReadOnly && (
                      <span className="timeline-event-lock" title="Read-only calendar">
                        <Lock size={11} weight="bold" />
                      </span>
                    )}
                  </div>

                  <div className="timeline-event-meta">
                    <span className="timeline-event-time">
                      <Clock size={10} weight="bold" />
                      <span>{formatTimeRange(startMinutes, endMinutes)}</span>
                    </span>

                    {task.isGoogleEvent ? (
                      <span className="timeline-event-source" style={{ color: calColor }}>
                        {task.googleCalendarName || "Google"}
                      </span>
                    ) : (
                      <span className="timeline-event-local-chip">Task</span>
                    )}

                    {task.location && (
                      <span className="timeline-event-location" title={task.location}>
                        <MapPin size={10} weight="fill" />
                        <span>{task.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Footer Summary */}
      <footer className="day-view-footer">
        <div className="day-footer-legend">
          <span className="legend-chip">
            <span className="legend-chip-box today-chip" /> Today
          </span>
          <span className="legend-chip">
            <span className="legend-chip-box active-count-chip" /> {activeCalendarCount} Active Calendar(s)
          </span>
          <span className="legend-chip">
            <span className="legend-chip-box items-chip" /> {dayTasks.length} Scheduled Item(s)
          </span>
        </div>
        <span className="day-footer-hint">Click any empty time slot on the grid to create an event ✳</span>
      </footer>
    </div>
  );
}
