"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Plus, Eye, EyeSlash, Trash, PencilSimple } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import { sortTodaysFocusTasks } from "@/lib/dashboard/dashboard-utils";

interface TodaysFocusWidgetProps {
  tasks: PlannerTask[];
  todayKey: string;
  labels: { id: string; name: string }[];
  onToggleTask: (task: PlannerTask) => void;
  onEditTask: (task: PlannerTask) => void;
  onDeleteTask: (task: PlannerTask) => void;
  onQuickAdd: (dateKey: string) => void;
  priorityLabel: (p: PlannerTask["priority"]) => string;
  priorityEmoji: (p: PlannerTask["priority"]) => string;
}

export function TodaysFocusWidget({
  tasks,
  todayKey,
  labels,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onQuickAdd,
  priorityLabel,
  priorityEmoji,
}: TodaysFocusWidgetProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const todaysTasks = useMemo(
    () => sortTodaysFocusTasks(tasks, todayKey),
    [tasks, todayKey]
  );

  const activeTasks = useMemo(
    () => todaysTasks.filter((t) => t.status !== "completed"),
    [todaysTasks]
  );

  const completedTasks = useMemo(
    () => todaysTasks.filter((t) => t.status === "completed"),
    [todaysTasks]
  );

  const displayedTasks = showCompleted ? todaysTasks : activeTasks;

  return (
    <section className="dashboard-widget todays-focus-card neo-card" aria-label="Today's Focus">
      <div className="card-header dashboard-widget-header">
        <div>
          <span className="section-kicker">PRIORITIZED FOR TODAY</span>
          <h2 className="dashboard-widget-title">
            <span>Today&apos;s Focus</span>
            <span className="dashboard-count-badge">
              {activeTasks.length} active
            </span>
          </h2>
        </div>
        <div className="dashboard-header-actions">
          {completedTasks.length > 0 && (
            <button
              type="button"
              className="dashboard-toggle-completed-btn"
              onClick={() => setShowCompleted((v) => !v)}
              aria-label={showCompleted ? "Hide completed tasks" : "Show completed tasks"}
              title={showCompleted ? "Hide completed tasks" : "Show completed tasks"}
            >
              {showCompleted ? <EyeSlash size={14} /> : <Eye size={14} />}
              <span>{showCompleted ? "Hide done" : `Done (${completedTasks.length})`}</span>
            </button>
          )}
          <button
            type="button"
            className="dashboard-mini-add-btn"
            onClick={() => onQuickAdd(todayKey)}
            aria-label="Add task for today"
            title="Add task for today"
          >
            <Plus size={14} weight="bold" />
            <span>Add</span>
          </button>
        </div>
      </div>

      <div className="todays-focus-list">
        {displayedTasks.length === 0 ? (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-icon" aria-hidden="true">🎉</span>
            <p className="dashboard-empty-title">
              {completedTasks.length > 0 && !showCompleted
                ? "All tasks for today are completed!"
                : "No tasks scheduled for today."}
            </p>
            <p className="dashboard-empty-desc">
              {completedTasks.length > 0 && !showCompleted
                ? `You finished all ${completedTasks.length} task${completedTasks.length === 1 ? "" : "s"} scheduled for today!`
                : "Enjoy your free time or add a little win to get things rolling."}
            </p>
            <button
              type="button"
              className="dashboard-empty-add-btn"
              onClick={() => onQuickAdd(todayKey)}
            >
              <Plus size={14} weight="bold" />
              <span>Add task for today</span>
            </button>
          </div>
        ) : (
          displayedTasks.map((task) => {
            const isDone = task.status === "completed";
            return (
              <div
                key={task.id}
                className={`dashboard-task-item priority-accent-${task.priority} ${isDone ? "is-done" : ""} ${task.isPinned ? "is-pinned" : ""}`}
              >
                <button
                  type="button"
                  className="dashboard-task-toggle"
                  onClick={() => onToggleTask(task)}
                  aria-label={isDone ? `Mark "${task.title}" as open` : `Complete "${task.title}"`}
                >
                  <span className={`task-check ${isDone ? "checked" : ""}`}>
                    {isDone && <CheckCircle size={18} weight="fill" />}
                  </span>
                </button>

                <div
                  className="dashboard-task-content"
                  role="button"
                  tabIndex={0}
                  onClick={() => onEditTask(task)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEditTask(task);
                    }
                  }}
                >
                  <div className="dashboard-task-title-row">
                    {task.isPinned && (
                      <span className="dashboard-task-pin" title="Pinned task">📌</span>
                    )}
                    <span className="dashboard-task-title">{task.title}</span>
                  </div>

                  <div className="dashboard-task-meta-row">
                    {task.isGoogleEvent && (
                      <span
                        className="task-calendar-source-chip"
                        style={{
                          backgroundColor: `${task.googleCalendarColor || "#4285F4"}20`,
                          borderColor: task.googleCalendarColor || "#4285F4",
                          color: task.googleCalendarColor || "#1a73e8",
                        }}
                        title={`Google Calendar: ${task.googleCalendarName || "Event"}${task.isReadOnlyCalendar ? " (Read-only)" : ""}`}
                      >
                        📅 {task.googleCalendarName || "Google"}
                        {task.isReadOnlyCalendar && " 🔒"}
                      </span>
                    )}
                    <span className={`priority-badge-sm priority-${task.priority}`}>
                      {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                    </span>

                    {task.dueTime && (
                      <span className="dashboard-task-time">
                        {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}

                    {task.isPersonal && (
                      <span className="badge-chip badge-personal" title="Personal task">🌿 Personal</span>
                    )}

                    {task.timingPreference === "whenever" && (
                      <span className="badge-chip badge-whenever" title="Whenever: No deadline">🟢 Whenever</span>
                    )}

                    {task.labelIds && task.labelIds.length > 0 && (
                      <div className="dashboard-task-labels">
                        {task.labelIds.map((id) => {
                          const lbl = labels.find((l) => l.id === id);
                          return lbl ? (
                            <span key={id} className="task-label-chip">
                              🏷️ {lbl.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard-task-actions">
                  <button
                    type="button"
                    className="dashboard-task-action-btn"
                    onClick={() => onEditTask(task)}
                    aria-label={`Edit ${task.title}`}
                    title="Edit task"
                  >
                    <PencilSimple size={14} />
                  </button>
                  <button
                    type="button"
                    className="dashboard-task-action-btn delete"
                    onClick={() => onDeleteTask(task)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete task"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
