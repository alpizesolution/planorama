"use client";

import { useMemo } from "react";
import { Plus, Lock, CalendarBlank, CheckCircle, Circle, Clock, CheckSquare } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import {
  getItemType,
  type ItemColorPreferences,
  DEFAULT_ITEM_COLORS,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";

export interface TaskLabel {
  id: string;
  name: string;
}

export interface AgendaViewProps {
  today: Date;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  tasks: PlannerTask[]; // filtered by active calendars (displayedTasks)
  allTasksCount: number;
  allCalendarConfigs: Record<string, GoogleCalendarConfig>;
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  labels: TaskLabel[];
  resolvedTheme: ResolvedCalendarTheme;
  priorityLabel: (p: PlannerTask["priority"]) => string;
  priorityEmoji: (p: PlannerTask["priority"]) => string;
  onOpenTaskDetail: (task: PlannerTask) => void;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => void;
  onToggleTask?: (task: PlannerTask) => void;
  onToggleMobileSidebar?: () => void;
  activeCalendarCount?: number;
}

export function AgendaView({
  todayKey,
  selectedDate,
  onSelectDate,
  tasks,
  allTasksCount,
  allCalendarConfigs,
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  labels,
  resolvedTheme,
  priorityLabel,
  priorityEmoji,
  onOpenTaskDetail,
  onAddTask,
  onToggleTask,
}: AgendaViewProps) {
  // Filter by selected date if one is selected in the mini-calendar
  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => t.dueDate);
    if (selectedDate) {
      list = list.filter((t) => t.dueDate === selectedDate);
    }
    // Sort chronologically: date asc -> time asc (nulls/all-day first) -> pinned first
    return list.slice().sort((a, b) => {
      const aDate = a.dueDate ?? "";
      const bDate = b.dueDate ?? "";
      if (aDate !== bDate) return aDate.localeCompare(bDate);

      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aTime = a.dueTime ?? "00:00-allday";
      const bTime = b.dueTime ?? "00:00-allday";
      return aTime.localeCompare(bTime);
    });
  }, [tasks, selectedDate]);

  // Group filtered tasks by date for readable agenda sections
  const groupedByDate = useMemo(() => {
    const groups: Array<{ dateKey: string; items: PlannerTask[] }> = [];
    const map = new Map<string, PlannerTask[]>();

    for (const t of filteredTasks) {
      if (!t.dueDate) continue;
      const current = map.get(t.dueDate) || [];
      current.push(t);
      map.set(t.dueDate, current);
    }

    for (const [dateKey, items] of map.entries()) {
      groups.push({ dateKey, items });
    }

    return groups;
  }, [filteredTasks]);

  // Format date headers (e.g., "Today · Tuesday, Oct 27, 2026")
  const formatDateHeader = (dateKey: string): { title: string; isToday: boolean; isTomorrow: boolean } => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const isToday = dateKey === todayKey;

    // Check tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const isTomorrow = dateKey === tomorrowKey;

    const weekday = date.toLocaleDateString("en", { weekday: "short" });
    const formatted = date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

    let title = `${weekday}, ${formatted}`;
    if (isToday) title = `Today · ${title}`;
    else if (isTomorrow) title = `Tomorrow · ${title}`;

    return { title, isToday, isTomorrow };
  };

  const formatItemTime = (timeStr?: string | null): string => {
    if (!timeStr) return "All day";
    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr, 10);
    if (isNaN(h)) return "All day";
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mStr} ${suffix}`;
  };

  const formatFilterTitle = (dateKey: string): string => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  };

  return (
    <section
      className="calendar-card neo-card agenda-workspace-card"
      id="agenda-view"
      style={{ backgroundColor: resolvedTheme.calendarBg }}
    >
      {/* 1. Agenda Header Toolbar */}
      <div className="card-header agenda-view-header">
        <div className="agenda-header-left">
          <div className="agenda-title-group">
            <span className="section-kicker">CHRONOLOGICAL SCHEDULE</span>
            <div className="agenda-title-row">
              <h2 className="agenda-main-heading">Agenda</h2>
              {selectedDate && (
                <div className="agenda-date-filter-chip">
                  <span>Filtered: {formatFilterTitle(selectedDate)}</span>
                  <button
                    type="button"
                    onClick={() => onSelectDate(null)}
                    aria-label="Clear date filter"
                    title="Clear date filter to view all upcoming events"
                    className="agenda-clear-filter-btn"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Chronological Agenda List */}
      <div className="agenda-list agenda-workspace-list">
        {groupedByDate.map(({ dateKey, items }) => {
          const { title, isToday } = formatDateHeader(dateKey);

          return (
            <div key={dateKey} className="agenda-date-group">
              <div className={`agenda-date-header ${isToday ? "is-today" : ""}`}>
                <span className="agenda-date-header-title">{title}</span>
                <span className="agenda-date-header-count">
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="agenda-group-items">
                {items.map((task) => {
                  const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                  const itemColor = tileStyle.primaryColor;
                  const isDone = task.status === "completed";
                  const isReadOnly = Boolean(task.isReadOnlyCalendar);
                  const calConfig = task.googleCalendarId ? allCalendarConfigs[task.googleCalendarId] : undefined;
                  const calendarName = task.googleCalendarName || calConfig?.name;

                  const itemType = getItemType(task);
                  const isAppointment = itemType === "appointment";

                  return (
                    <div
                      key={task.id}
                      className={`agenda-item-card ${tileStyle.className} ${isDone ? "is-done" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                      style={{
                        ...tileStyle.style,
                        backgroundColor: isDone ? "#fafaf9" : tileStyle.style.backgroundColor,
                      }}
                      onClick={() => onOpenTaskDetail(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenTaskDetail(task);
                        }
                      }}
                    >
                      {/* Checkbox toggle */}
                      {onToggleTask && (
                        <button
                          type="button"
                          className="agenda-item-toggle-btn"
                          aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTask(task);
                          }}
                        >
                          {isDone ? (
                            <CheckCircle size={18} weight="fill" color="#15803d" />
                          ) : (
                            <Circle size={18} color="#78716c" />
                          )}
                        </button>
                      )}

                      {/* Time Indicator */}
                      <span className="agenda-item-time">
                        {formatItemTime(task.dueTime)}
                      </span>

                      {/* Task / Event Title & Meta */}
                      <div className="agenda-item-content">
                        <span className="agenda-task-name">
                          {task.isPinned && (
                            <span className="task-row-pin" title="Pinned">
                              📌
                            </span>
                          )}
                          {task.title}
                        </span>

                        <div className="agenda-badges">
                          {/* Google Calendar distinction */}
                          {task.isGoogleEvent ? (
                            <span
                              className="agenda-calendar-tag"
                              style={{
                                backgroundColor: `${itemColor}18`,
                                borderColor: itemColor,
                                color: "var(--ink)",
                              }}
                              title={`Google Calendar: ${calendarName || "Event"}${task.googleAccountEmail ? ` (${task.googleAccountEmail})` : ""}`}
                            >
                              <CalendarBlank size={12} weight="bold" color={itemColor} />
                              <span>{calendarName || "Google"}</span>
                            </span>
                          ) : isAppointment ? (
                            <span
                              className="agenda-local-tag"
                              style={{
                                backgroundColor: `${itemColor}22`,
                                borderColor: itemColor,
                                color: "var(--ink)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Clock size={12} weight="bold" color={itemColor} />
                              <span>Schedule</span>
                            </span>
                          ) : itemType === "event" ? (
                            <span
                              className="agenda-local-tag"
                              style={{
                                backgroundColor: `${itemColor}22`,
                                borderColor: itemColor,
                                color: "var(--ink)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <CalendarBlank size={12} weight="bold" color={itemColor} />
                              <span>Event</span>
                            </span>
                          ) : (
                            <span
                              className="agenda-local-tag"
                              style={{
                                backgroundColor: `${itemColor}22`,
                                borderColor: itemColor,
                                color: "var(--ink)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <CheckSquare size={12} weight="bold" color={itemColor} />
                              <span>Task</span>
                            </span>
                          )}

                          {isReadOnly && (
                            <span className="badge-chip badge-readonly" title="Read-only event">
                              <Lock size={12} weight="bold" /> Read-only
                            </span>
                          )}

                          {task.isPersonal && (
                            <span className="badge-chip badge-personal" title="Personal task">
                              🌿 Personal
                            </span>
                          )}

                          {task.timingPreference === "whenever" && (
                            <span className="badge-chip badge-whenever" title="Whenever: Flexible timing">
                              🟢 Whenever
                            </span>
                          )}

                          {task.labelIds?.map((id) => {
                            const lbl = labels.find((l) => l.id === id);
                            return lbl ? (
                              <span key={id} className="task-label-chip">
                                🏷️ {lbl.name}
                              </span>
                            ) : null;
                          })}

                          <span className={`priority-badge priority-${task.priority}`}>
                            {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* 3. Empty States */}
        {filteredTasks.length === 0 && (
          <div className="agenda-empty-state neo-card">
            {selectedDate ? (
              <>
                <p className="empty-tasks">
                  No events or tasks scheduled for <strong>{formatFilterTitle(selectedDate)}</strong>.
                </p>
                <div className="agenda-empty-actions">
                  <button
                    type="button"
                    className="agenda-add-task-header-btn"
                    onClick={() => onAddTask({ date: selectedDate, status: "open" })}
                  >
                    <Plus size={14} weight="bold" />
                    <span>Add Task for {formatFilterTitle(selectedDate)}</span>
                  </button>
                  <button
                    type="button"
                    className="clear-date-button"
                    onClick={() => onSelectDate(null)}
                  >
                    Show all upcoming
                  </button>
                </div>
              </>
            ) : tasks.length === 0 && allTasksCount > 0 ? (
              <>
                <p className="empty-tasks">
                  No events or tasks match the currently enabled calendars.
                </p>
                <p className="agenda-empty-subtext">
                  Check calendar visibility checkboxes in the sidebar to display items.
                </p>
              </>
            ) : (
              <>
                <p className="empty-tasks">No upcoming tasks or events scheduled.</p>
                <button
                  type="button"
                  className="agenda-add-task-header-btn"
                  onClick={() => onAddTask({ date: todayKey, status: "open" })}
                >
                  <Plus size={14} weight="bold" />
                  <span>Add First Task</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 4. Calendar Footer */}
      <div className="calendar-footer agenda-footer">
        <span className="legend">
          <i className="day-dot pink" /> Scheduled items
        </span>
        <button
          type="button"
          className="clear-date-button"
          onClick={() => onSelectDate(null)}
          disabled={!selectedDate}
        >
          Clear date filter
        </button>
        <span className="footer-hint">
          {selectedDate
            ? "Filtered by mini-calendar selection · Click 'Clear date filter' to view all"
            : "Click any date in the mini-calendar to filter the Agenda list ✳"}
        </span>
      </div>
    </section>
  );
}
