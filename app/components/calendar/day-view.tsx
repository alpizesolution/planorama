"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HolidayBanner } from "./holiday-banner";
import {
  Plus,
  Lock,
  CalendarBlank,
  Clock,
  MapPin,
  Calendar,
  CheckSquare,
  CheckCircle,
  WarningCircle,
  Prohibit,
} from "@phosphor-icons/react";
import { CalendarWorkspaceHeader } from "./calendar-workspace-header";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import { computeDailyProgress, getDayItemState, type DayItemState } from "@/lib/calendar/daily-progress";
import { DailyProgressPanel } from "./daily-progress-panel";
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
  formatDayTitle,
  formatTimeRange,
  type PositionedDayEvent,
} from "@/lib/calendar/day-layout";

export type DayAppView = "dashboard" | "day" | "month" | "year" | "yearline" | "agenda" | "week" | "workWeek" | "kanban" | "holidays" | "settings";

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
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onToggleMobileSidebar?: () => void;
  activeCalendarCount?: number;
  currentView?: DayAppView;
  onSwitchView?: (view: DayAppView) => void;
  /** Habit definitions and their daily check-in records, used for the Habits tracker. */
  habits?: Habit[];
  habitCheckIns?: HabitCheckIn[];
}

const HOUR_HEIGHT = 60; // 60px per hour -> 1px per minute

const STATE_LABELS: Record<DayItemState, string> = {
  completed: "Done",
  in_progress: "Now",
  upcoming: "Upcoming",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function StateBadge({ state }: { state: DayItemState }) {
  if (state === "upcoming") return null;
  const icon =
    state === "completed" ? (
      <CheckCircle size={10} weight="fill" />
    ) : state === "overdue" ? (
      <WarningCircle size={10} weight="fill" />
    ) : state === "cancelled" ? (
      <Prohibit size={10} weight="bold" />
    ) : (
      <span className="state-badge-pulse" />
    );
  return (
    <span className={`day-item-state-badge state-${state}`}>
      {icon}
      <span>{STATE_LABELS[state]}</span>
    </span>
  );
}

export function DayView({
  currentDate,
  currentDateKey,
  todayKey,
  onNavigateDay,
  onResetToToday,
  onSelectDate,
  tasks,
  allCalendarConfigs,
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  onAddTask,
  onOpenTaskDetail,
  activeCalendarCount = 0,
  habits = [],
  habitCheckIns = [],
}: DayViewProps) {
  const isToday = currentDateKey === todayKey;

  // Live clock: drives the current-time line and time-based item states (overdue / in progress)
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();
  const currentTimeLabel = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Daily progress for the selected date only (recomputed on every date change)
  const dailyProgress = useMemo(
    () =>
      computeDailyProgress({
        tasks,
        habits,
        checkIns: habitCheckIns,
        dateKey: currentDateKey,
        now,
      }),
    [tasks, habits, habitCheckIns, currentDateKey, now]
  );

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

  const formattedDayTitleCompact = useMemo(() => {
    return currentDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [currentDate]);

  // Touch swipe support for swiping between days on mobile
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
    // Require horizontal swipe of at least 50px and predominantly horizontal
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        onNavigateDay(-1); // swipe right -> previous day
      } else {
        onNavigateDay(1); // swipe left -> next day
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  return (
    <div className="day-view-workspace neo-card">
      {/* 1. Header with date navigation, picker, and actions */}
      {/* Preserves: day-picker-wrap day-picker-input onSelectDate(e.target.value) */}
      <CalendarWorkspaceHeader
        kicker="DAILY WORKSPACE"
        title={formattedDayTitle}
        compactTitle={formattedDayTitleCompact}
        isToday={isToday}
        todayTagLabel="Today"
        onPrevious={() => onNavigateDay(-1)}
        previousLabel="Previous day"
        onToday={onResetToToday}
        onNext={() => onNavigateDay(1)}
        nextLabel="Next day"
        datePickerValue={currentDateKey}
        onDatePickerChange={(date) => onSelectDate(date)}
        datePickerAriaLabel="Jump to date"
      />

      <HolidayBanner tasks={tasks} dateKey={currentDateKey} todayKey={todayKey} />

      {/* 1b. Daily progress trackers, overall completion and summary for the selected date */}
      <DailyProgressPanel progress={dailyProgress} />

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
              <span className="allday-add-compact">+ All-day item</span>
              <span className="allday-add-full">Add all-day event or daily task</span>
            </button>
          ) : (
            <div className="day-allday-items-grid">
              {allDayItems.map((item) => {
                const calConfig = item.googleCalendarId ? allCalendarConfigs[item.googleCalendarId] : undefined;
                const tileStyle = getItemTileStyle(item, itemStyles, allCalendarConfigs);
                const calColor = tileStyle.primaryColor;
                const itemType = getItemType(item);
                const isAppointment = itemType === "appointment";
                const isReadOnly = Boolean(item.isReadOnlyCalendar || calConfig?.accessRole === "reader" || calConfig?.accessRole === "freeBusyReader");
                const itemState = getDayItemState(item, currentDateKey, now);

                return (
                  <div
                    key={item.id}
                    className={`day-allday-pill ${tileStyle.className} state-${itemState} ${itemState === "completed" ? "is-completed" : ""}`}
                    style={{
                      ...tileStyle.style,
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
                      style={{ backgroundColor: tileStyle.indicatorColor }}
                    />
                    <span className="allday-pill-title">{item.title}</span>
                    {(itemState === "overdue" || itemState === "cancelled" || item.status === "completed") && (
                      <StateBadge state={itemState} />
                    )}
                    {item.isGoogleEvent ? (
                      <span className="allday-pill-source-badge">
                        <Calendar size={10} weight="fill" />
                        <span>{item.googleCalendarName || "Google"}</span>
                        {isReadOnly && <Lock size={10} weight="bold" className="allday-lock-icon" />}
                      </span>
                    ) : isAppointment ? (
                      <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                        <Clock size={10} weight="bold" />
                        <span>Schedule</span>
                      </span>
                    ) : itemType === "event" ? (
                      <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                        <CalendarBlank size={10} weight="bold" />
                        <span>Event</span>
                      </span>
                    ) : (
                      <span className="allday-pill-local-badge" style={{ backgroundColor: `${calColor}24`, color: tileStyle.indicatorColor }}>
                        <CheckSquare size={10} weight="bold" />
                        <span>Task</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Vertically Scrollable Hourly Timeline Canvas */}
      <div
        className="day-timeline-scroll-container"
        ref={timelineScrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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

            {/* Elapsed-time shading + red current time line (visible when viewing today) */}
            {isToday && (
              <div
                className="day-elapsed-shade"
                style={{ height: `${(currentMinutesNow / 60) * HOUR_HEIGHT}px` }}
                aria-hidden="true"
              />
            )}
            {isToday && (
              <div
                className="day-current-time-line"
                style={{ top: `${(currentMinutesNow / 60) * HOUR_HEIGHT}px` }}
                title={`Current time: ${currentTimeLabel}`}
                role="img"
                aria-label={`Current time ${currentTimeLabel}`}
              >
                <span className="current-time-dot" />
                <span className="current-time-badge">
                  Now · {currentTimeLabel}
                </span>
              </div>
            )}

            {/* Positioned Event and Task Cards */}
            {positionedItems.map(({ task, startMinutes, durationMinutes, column, totalColumns, endMinutes }) => {
              const itemType = getItemType(task);
              const isAppointment = itemType === "appointment";
              const calConfig = task.googleCalendarId ? allCalendarConfigs[task.googleCalendarId] : undefined;
              const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
              const isReadOnly = Boolean(task.isReadOnlyCalendar || calConfig?.accessRole === "reader" || calConfig?.accessRole === "freeBusyReader");

              const topPx = (startMinutes / 60) * HOUR_HEIGHT;
              const heightPx = Math.max(30, (durationMinutes / 60) * HOUR_HEIGHT - 2);
              const widthPercent = 100 / totalColumns;
              const leftPercent = column * widthPercent;
              const itemState = getDayItemState(task, currentDateKey, now);
              // Short cards only show the title + state; crowded overlaps compact further on small screens (CSS)
              const isCompact = heightPx < 44;

              return (
                <div
                  key={task.id}
                  className={`day-timeline-event ${tileStyle.className} state-${itemState} ${itemState === "completed" ? "is-completed" : ""} ${task.isPinned ? "is-pinned" : ""} ${isCompact ? "is-compact" : ""} ${totalColumns > 1 ? "is-overlapping" : ""}`}
                  data-state={itemState}
                  data-columns={totalColumns > 2 ? "many" : totalColumns}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    left: `calc(${leftPercent}% + 2px)`,
                    width: `calc(${widthPercent}% - 4px)`,
                    zIndex: 10 + column,
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
                  title={`${task.title} (${formatTimeRange(startMinutes, endMinutes)})${task.googleCalendarName ? ` · ${task.googleCalendarName}` : ""} · ${STATE_LABELS[itemState]}`}
                  aria-label={`${task.title}, ${formatTimeRange(startMinutes, endMinutes)}, ${STATE_LABELS[itemState]}`}
                >
                  <div className="timeline-event-header">
                    <div className="timeline-event-title-wrap">
                      {task.isPinned && <span className="event-pin" title="Pinned">📌</span>}
                      {isAppointment ? (
                        <Clock size={12} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 3 }} />
                      ) : itemType === "event" ? (
                        <CalendarBlank size={12} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 3 }} />
                      ) : (
                        <CheckSquare size={12} weight="bold" style={{ color: tileStyle.indicatorColor, flexShrink: 0, marginRight: 3 }} />
                      )}
                      <span className="timeline-event-title">{task.title}</span>
                    </div>
                    <span className="timeline-event-header-right">
                      <StateBadge state={itemState} />
                      {isReadOnly && (
                        <span className="timeline-event-lock" title="Read-only calendar">
                          <Lock size={11} weight="bold" />
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="timeline-event-meta">
                    <span className="timeline-event-time">
                      <Clock size={10} weight="bold" />
                      <span>{formatTimeRange(startMinutes, endMinutes)}</span>
                    </span>

                    {task.isGoogleEvent ? (
                      <span className="timeline-event-source" style={{ color: tileStyle.indicatorColor }}>
                        {task.googleCalendarName || "Google"}
                      </span>
                    ) : isAppointment ? (
                      <span className="timeline-event-local-chip" style={{ color: tileStyle.indicatorColor }}>Schedule</span>
                    ) : itemType === "event" ? (
                      <span className="timeline-event-local-chip" style={{ color: tileStyle.indicatorColor }}>Event</span>
                    ) : (
                      <span className="timeline-event-local-chip" style={{ color: tileStyle.indicatorColor }}>Task</span>
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
          <span className="legend-chip day-state-legend" aria-label="Timeline status key">
            <span className="legend-state-swatch state-completed" /> Done
            <span className="legend-state-swatch state-in_progress" /> Now
            <span className="legend-state-swatch state-overdue" /> Overdue
            <span className="legend-state-swatch state-cancelled" /> Cancelled
          </span>
        </div>
        <span className="day-footer-hint">Click any empty time slot on the grid to create an event ✳</span>
      </footer>
    </div>
  );
}
