"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Eye,
  EyeSlash,
  WarningCircle,
  ArrowRight,
  CheckCircle,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { getUpcomingDateGroups } from "@/lib/dashboard/dashboard-utils";
import { isHolidayItem } from "@/lib/calendar/item-classifier";
import {
  type ItemColorPreferences,
  DEFAULT_ITEM_COLORS,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";

interface UpcomingWidgetProps {
  tasks: PlannerTask[];
  todayKey: string;
  labels: { id: string; name: string }[];
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>;
  onToggleTask: (task: PlannerTask) => void;
  onEditTask: (task: PlannerTask) => void;
  onQuickAdd: (dateKey: string) => void;
  onViewCalendar: () => void;
  onRescheduleToToday?: (taskId: string) => void;
  priorityLabel: (p: PlannerTask["priority"]) => string;
  priorityEmoji: (p: PlannerTask["priority"]) => string;
}

export function UpcomingWidget({
  tasks,
  todayKey,
  labels,
  itemColors: _itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  allCalendarConfigs = {},
  onToggleTask,
  onEditTask,
  onQuickAdd,
  onViewCalendar,
  onRescheduleToToday,
  priorityLabel,
  priorityEmoji,
}: UpcomingWidgetProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const upcomingSummary = useMemo(
    () => getUpcomingDateGroups(tasks, todayKey, 7),
    [tasks, todayKey]
  );

  // Filter completed items if showCompleted is false; overdueGroup is already strictly genuine tasks
  const overdueTasks = useMemo(() => {
    if (!upcomingSummary.overdueGroup) return [];
    return showCompleted
      ? upcomingSummary.overdueGroup.tasks
      : upcomingSummary.overdueGroup.tasks.filter((t) => t.status !== "completed");
  }, [upcomingSummary.overdueGroup, showCompleted]);

  const dateGroups = useMemo(() => {
    return upcomingSummary.dateGroups.map((g) => ({
      ...g,
      tasks: showCompleted
        ? g.tasks
        : g.tasks.filter((t) => t.status !== "completed"),
      events: g.events,
    }));
  }, [upcomingSummary.dateGroups, showCompleted]);

  const totalVisibleUpcomingTasks = dateGroups.reduce((acc, g) => acc + g.tasks.length, 0);
  const totalVisibleUpcomingEvents = dateGroups.reduce((acc, g) => acc + (g.events ? g.events.length : 0), 0);
  const totalItemsFound = overdueTasks.length + totalVisibleUpcomingTasks + totalVisibleUpcomingEvents;

  return (
    <section className="dashboard-widget upcoming-card neo-card" aria-label="Upcoming Schedule">
      <div className="card-header dashboard-widget-header">
        <div>
          <span className="section-kicker">NEXT 7 DAYS</span>
          <h2 className="dashboard-widget-title">
            <span>Upcoming</span>
            <span className="dashboard-count-badge">
              {totalVisibleUpcomingTasks} task{totalVisibleUpcomingTasks !== 1 ? "s" : ""}
              {totalVisibleUpcomingEvents > 0 ? ` · ${totalVisibleUpcomingEvents} event${totalVisibleUpcomingEvents !== 1 ? "s" : ""}` : ""}
            </span>
          </h2>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="dashboard-toggle-completed-btn"
            onClick={() => setShowCompleted((v) => !v)}
            aria-label={showCompleted ? "Hide completed items" : "Show completed items"}
          >
            {showCompleted ? <EyeSlash size={14} /> : <Eye size={14} />}
            <span>{showCompleted ? "Hide done" : "Show done"}</span>
          </button>
          <button
            type="button"
            className="dashboard-view-calendar-btn"
            onClick={onViewCalendar}
            title="Open Full Calendar"
          >
            <span>Calendar</span>
            <ArrowRight size={13} weight="bold" />
          </button>
        </div>
      </div>

      <div className="upcoming-content-scroll">
        {/* Overdue Alert Section - ONLY actual incomplete tasks */}
        {overdueTasks.length > 0 && (
          <div className="upcoming-overdue-box">
            <div className="upcoming-overdue-header">
              <span className="upcoming-overdue-title">
                <WarningCircle size={16} weight="fill" />
                <span>Overdue Tasks ({overdueTasks.length})</span>
              </span>
            </div>
            <div className="upcoming-tasks-list">
              {overdueTasks.map((task) => {
                const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                return (
                  <div
                    key={task.id}
                    className={`upcoming-task-row ${tileStyle.className} is-overdue ${task.status === "completed" ? "is-done" : ""}`}
                    style={{
                      ...tileStyle.style,
                      backgroundColor: task.status === "completed" ? "#fafaf9" : tileStyle.style.backgroundColor,
                    }}
                    onClick={() => onEditTask(task)}
                  >
                    <button
                      type="button"
                      className="upcoming-task-check-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(task);
                      }}
                      aria-label={`Complete ${task.title}`}
                    >
                      <span className={`task-check sm ${task.status === "completed" ? "checked" : ""}`}>
                        {task.status === "completed" && <CheckCircle size={15} weight="fill" />}
                      </span>
                    </button>
                    <div className="upcoming-task-main">
                      <span className="upcoming-task-title">{task.title}</span>
                      <span className="upcoming-task-date-chip is-late">
                        Due {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {task.labelIds && task.labelIds.length > 0 && (
                        <div className="upcoming-labels-inline">
                          {task.labelIds.map((id) => {
                            const l = labels.find((lbl) => lbl.id === id);
                            return l ? <span key={id} className="task-label-chip">🏷️ {l.name}</span> : null;
                          })}
                        </div>
                      )}
                    </div>
                    <div className="upcoming-overdue-actions">
                      <span className={`priority-badge-sm priority-${task.priority}`}>
                        {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                      </span>
                      {onRescheduleToToday && task.status !== "completed" && (
                        <button
                          type="button"
                          className="upcoming-reschedule-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRescheduleToToday(task.id);
                          }}
                          title="Reschedule to Today"
                        >
                          <ArrowRight size={11} weight="bold" />
                          <span>Today</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 7 Days Groups */}
        {totalItemsFound === 0 ? (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-icon" aria-hidden="true">🎈</span>
            <p className="dashboard-empty-title">All clear for the next 7 days!</p>
            <p className="dashboard-empty-desc">
              No tasks or events are scheduled for the coming week. Plan ahead by adding upcoming goals.
            </p>
            <button
              type="button"
              className="dashboard-empty-add-btn"
              onClick={() => onQuickAdd(todayKey)}
            >
              <Plus size={14} weight="bold" />
              <span>Schedule an upcoming task</span>
            </button>
          </div>
        ) : (
          <div className="upcoming-days-list">
            {dateGroups.map((group) => {
              const hasTasks = group.tasks.length > 0;
              const hasEvents = Boolean(group.events && group.events.length > 0);
              const hasItems = hasTasks || hasEvents;

              return (
                <div
                  key={group.dateKey}
                  className={`upcoming-day-group ${group.isWeekend ? "is-weekend" : ""} ${hasItems ? "has-tasks" : "is-empty"}`}
                >
                  <div className="upcoming-day-group-header">
                    <span className="upcoming-day-group-title">
                      {group.title}
                      {group.isWeekend && <span className="upcoming-weekend-chip">Weekend</span>}
                    </span>
                    <button
                      type="button"
                      className="upcoming-day-add-btn"
                      onClick={() => onQuickAdd(group.dateKey)}
                      aria-label={`Add task for ${group.title}`}
                      title={`Add task for ${group.title}`}
                    >
                      <Plus size={12} weight="bold" />
                    </button>
                  </div>

                  {/* Dedicated Calendar Events & Public Holidays Section */}
                  {hasEvents && (
                    <div className="upcoming-day-events-list">
                      {group.events.map((event) => {
                        const tileStyle = getItemTileStyle(event, itemStyles, allCalendarConfigs);
                        const isHoliday = event.isHoliday || isHolidayItem(event);
                        return (
                          <div
                            key={event.id}
                            className={`upcoming-event-pill ${tileStyle.className} ${isHoliday ? "is-holiday" : ""}`}
                            style={tileStyle.style}
                            onClick={() => onEditTask(event)}
                            title={isHoliday ? `Public Holiday: ${event.title}` : `Calendar Event: ${event.title}`}
                          >
                            <div className="upcoming-event-pill-content">
                              <span className="upcoming-event-icon" aria-hidden="true">
                                {isHoliday ? "🎉" : "📅"}
                              </span>
                              <span className="upcoming-event-title">{event.title}</span>
                              {event.dueTime ? (
                                <span className="upcoming-event-pill-time">
                                  {new Date(`2000-01-01T${event.dueTime}`).toLocaleTimeString("en", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              ) : (
                                <span className="upcoming-event-pill-time">All-day</span>
                              )}
                              {isHoliday ? (
                                <span className="upcoming-holiday-tag">Holiday</span>
                              ) : (
                                <span className="upcoming-event-calendar-tag">
                                  {event.googleCalendarName || "Calendar"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tasks Section for this day */}
                  {hasTasks ? (
                    <div className="upcoming-tasks-list">
                      {group.tasks.map((task) => {
                        const isDone = task.status === "completed";
                        const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                        return (
                          <div
                            key={task.id}
                            className={`upcoming-task-row ${tileStyle.className} priority-accent-${task.priority} ${isDone ? "is-done" : ""}`}
                            style={{
                              ...tileStyle.style,
                              backgroundColor: isDone ? "#fafaf9" : tileStyle.style.backgroundColor,
                            }}
                            onClick={() => onEditTask(task)}
                          >
                            <button
                              type="button"
                              className="upcoming-task-check-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTask(task);
                              }}
                              aria-label={isDone ? `Mark "${task.title}" open` : `Complete "${task.title}"`}
                            >
                              <span className={`task-check sm ${isDone ? "checked" : ""}`}>
                                {isDone && <CheckCircle size={15} weight="fill" />}
                              </span>
                            </button>
                            <div className="upcoming-task-main">
                              <span className="upcoming-task-title">{task.title}</span>
                              {task.dueTime && (
                                <span className="upcoming-task-time">
                                  {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                              {task.labelIds && task.labelIds.length > 0 && (
                                <div className="upcoming-labels-inline">
                                  {task.labelIds.map((id) => {
                                    const l = labels.find((lbl) => lbl.id === id);
                                    return l ? <span key={id} className="task-label-chip">🏷️ {l.name}</span> : null;
                                  })}
                                </div>
                              )}
                            </div>
                            <span className={`priority-badge-sm priority-${task.priority}`}>
                              {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : !hasEvents ? (
                    <div className="upcoming-day-empty-row">
                      <span>No tasks scheduled</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
