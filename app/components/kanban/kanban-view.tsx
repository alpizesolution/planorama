"use client";

import { useMemo, useState } from "react";
import { Plus, DotsSixVertical, CaretDown, CalendarBlank, Briefcase } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import {
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  type ItemStylesPreferences,
} from "@/lib/calendar/item-color";
import {
  filterKanbanTasks,
  groupKanbanTasksByStatus,
  type KanbanDateFilter,
  KANBAN_DATE_FILTER_LABELS,
} from "@/lib/calendar/kanban-utils";

export interface TaskProject {
  id: string;
  name: string;
}

export interface TaskLabel {
  id: string;
  name: string;
}

export interface KanbanViewProps {
  tasks: PlannerTask[];
  today: Date;
  todayKey: string;
  weekStartsOn?: 0 | 1 | 6;
  projects: TaskProject[];
  labels: TaskLabel[];
  onOpenTaskDetail: (task: PlannerTask) => void;
  onAddTask: (options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"]; projectId?: string | null }) => void;
  onMoveTaskStatus: (taskId: string, newStatus: PlannerTask["status"]) => void;
  priorityLabel: (p: PlannerTask["priority"]) => string;
  priorityEmoji: (p: PlannerTask["priority"]) => string;
  itemStyles?: ItemStylesPreferences;
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>;
  initialDateFilter?: KanbanDateFilter;
  initialProjectFilter?: string;
}

const KANBAN_COLUMNS: { key: PlannerTask["status"]; label: string }[] = [
  { key: "open", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Done" },
];

export function KanbanView({
  tasks,
  today,
  todayKey,
  weekStartsOn = 1,
  projects,
  labels,
  onOpenTaskDetail,
  onAddTask,
  onMoveTaskStatus,
  priorityLabel,
  priorityEmoji,
  itemStyles = DEFAULT_ITEM_STYLES,
  allCalendarConfigs = {},
  initialDateFilter = "all",
  initialProjectFilter = "",
}: KanbanViewProps) {
  const [dateFilter, setDateFilter] = useState<KanbanDateFilter>(initialDateFilter);
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectFilter);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [mobileColumn, setMobileColumn] = useState<PlannerTask["status"]>("open");
  const [mobileLayoutMode, setMobileLayoutMode] = useState<"tabs" | "stacked">("tabs");

  // 1. Strictly filter genuine tasks only, applying date and project filters
  const filteredTasks = useMemo(() => {
    return filterKanbanTasks({
      tasks,
      dateFilter,
      projectFilter,
      todayKey,
      today,
      weekStartsOn,
      allCalendarConfigs,
    });
  }, [tasks, dateFilter, projectFilter, todayKey, today, weekStartsOn, allCalendarConfigs]);

  // 2. Group filtered tasks by status
  const tasksByStatus = useMemo(() => {
    return groupKanbanTasksByStatus(filteredTasks);
  }, [filteredTasks]);

  const isTaskOverdue = (task: PlannerTask) => {
    return task.status !== "completed" && Boolean(task.dueDate && task.dueDate < todayKey);
  };

  const projectMap = useMemo(() => {
    const map = new Map<string, TaskProject>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const labelMap = useMemo(() => {
    const map = new Map<string, TaskLabel>();
    for (const l of labels) {
      map.set(l.id, l);
    }
    return map;
  }, [labels]);

  const dateFilterKeys: KanbanDateFilter[] = ["all", "today", "this_week", "this_month", "overdue", "completed"];

  return (
    <section className="kanban-board neo-card" id="kanban-view">
      {/* Header */}
      <div className="card-header kanban-card-header">
        <div>
          <span className="section-kicker">TASK BOARD · ACTIVE WORKSPACE</span>
          <h2>
            Kanban<span className="heading-period">.</span>
          </h2>
        </div>

        <div className="kanban-header-stats">
          <span className="kanban-stat-badge">
            <strong>{filteredTasks.length}</strong> {filteredTasks.length === 1 ? "Task" : "Tasks"}
          </span>
          <span className="kanban-stat-breakdown">
            <span className="kanban-stat-dot kanban-dot-open" /> {tasksByStatus.open.length} To Do
            <span className="kanban-stat-divider">·</span>
            <span className="kanban-stat-dot kanban-dot-in_progress" /> {tasksByStatus.in_progress.length} In Progress
            <span className="kanban-stat-divider">·</span>
            <span className="kanban-stat-dot kanban-dot-completed" /> {tasksByStatus.completed.length} Done
          </span>
        </div>
      </div>

      {/* Toolbar with Date Filters and Client/Project Management */}
      <div className="kanban-toolbar">
        {/* Date Filters */}
        <div className="kanban-toolbar-group kanban-date-filters" role="group" aria-label="Filter tasks by date">
          <span className="kanban-filter-label">
            <CalendarBlank size={13} weight="bold" /> Date:
          </span>
          <div className="kanban-filter-pills">
            {dateFilterKeys.map((key) => {
              const isActive = dateFilter === key;
              return (
                <button
                  type="button"
                  key={key}
                  className={`kanban-filter-pill ${isActive ? "active" : ""}`}
                  aria-pressed={isActive}
                  onClick={() => setDateFilter(key)}
                  id={`kanban-filter-${key}`}
                >
                  {KANBAN_DATE_FILTER_LABELS[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Client / Project Filter */}
        <div className="kanban-toolbar-group kanban-project-filters">
          <label className="kanban-filter-label" htmlFor="kanban-project-select">
            <Briefcase size={13} weight="bold" /> Client / Project:
          </label>
          <div className="kanban-select-wrapper">
            <select
              id="kanban-project-select"
              className="kanban-project-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">All Clients & Projects</option>
              <option value="__unassigned">Unassigned Tasks</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <CaretDown size={12} className="kanban-select-caret" />
          </div>

          {(dateFilter !== "all" || projectFilter !== "") && (
            <button
              type="button"
              className="kanban-reset-filters-btn"
              onClick={() => {
                setDateFilter("all");
                setProjectFilter("");
              }}
              title="Reset all filters to All Tasks"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Mobile Column Selector Tab Strip (< 768px) */}
      <div className="kanban-mobile-column-selector" role="tablist" aria-label="Select board column">
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.key];
          const isSelected = mobileColumn === col.key;

          return (
            <button
              key={col.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`kanban-mobile-col-pill kanban-mobile-pill-${col.key} ${isSelected ? "is-selected" : ""}`}
              onClick={() => setMobileColumn(col.key)}
            >
              <span className={`kanban-status-dot kanban-dot-${col.key}`} />
              <span className="mobile-col-label">{col.label}</span>
              <span className="mobile-col-count">{colTasks.length}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="kanban-mobile-mode-btn"
          onClick={() => setMobileLayoutMode((m) => (m === "tabs" ? "stacked" : "tabs"))}
          title={mobileLayoutMode === "tabs" ? "View all columns stacked" : "View single column tabs"}
        >
          {mobileLayoutMode === "tabs" ? "Stacked ☰" : "Tabs ⊡"}
        </button>
      </div>

      {/* Columns */}
      <div className={`kanban-columns ${mobileLayoutMode === "tabs" ? "is-mobile-tabs" : "is-mobile-stacked"}`}>
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.key];
          const isMobileActive = mobileColumn === col.key;
          return (
            <div
              className={`kanban-col kanban-col-${col.key} ${isMobileActive ? "is-mobile-active-col" : "is-mobile-hidden-col"}`}
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
                if (taskId) {
                  onMoveTaskStatus(taskId, col.key);
                }
                setDragTaskId(null);
              }}
            >
              {/* Column Header */}
              <div className="kanban-col-header">
                <div className="kanban-col-header-left">
                  <span className={`kanban-status-dot kanban-dot-${col.key}`} />
                  <span className="kanban-col-title">{col.label}</span>
                </div>
                <div className="kanban-col-header-actions">
                  <span className="kanban-col-count" id={`kanban-col-count-${col.key}`}>
                    {colTasks.length}
                  </span>
                  <button
                    type="button"
                    className="kanban-col-add-btn"
                    aria-label={`Add task to ${col.label}`}
                    title={`Add task to ${col.label}`}
                    onClick={() =>
                      onAddTask({
                        date: todayKey,
                        status: col.key,
                        projectId: projectFilter && projectFilter !== "__unassigned" ? projectFilter : null,
                      })
                    }
                  >
                    <Plus size={13} weight="bold" />
                  </button>
                </div>
              </div>

              {/* Column Body */}
              <div className="kanban-col-body">
                {colTasks.length === 0 && (
                  <div className="kanban-empty">
                    {col.key === "open"
                      ? "Add a task to get started"
                      : col.key === "in_progress"
                      ? "Drag tasks here when you start working"
                      : "Completed tasks show up here"}
                  </div>
                )}

                {colTasks.map((task) => {
                  const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                  const isOverdue = isTaskOverdue(task);
                  const project = task.projectId ? projectMap.get(task.projectId) : undefined;

                  return (
                    <div
                      className={`kanban-tile ${tileStyle.className} priority-accent-${task.priority} ${
                        task.isPinned ? "is-pinned" : ""
                      } ${task.status === "completed" ? "is-done" : ""}`}
                      key={task.id}
                      style={{ ...tileStyle.style }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", task.id);
                        setDragTaskId(task.id);
                      }}
                      onDragEnd={() => setDragTaskId(null)}
                    >
                      <div className="kanban-tile-top">
                        <span className="kanban-drag-handle" aria-hidden="true" title="Drag to reorder">
                          <DotsSixVertical size={14} />
                        </span>
                        {task.isPinned && (
                          <span className="kanban-pin-badge" title="Pinned task">
                            📌
                          </span>
                        )}
                        <button
                          type="button"
                          className="kanban-tile-title"
                          onClick={() => onOpenTaskDetail(task)}
                          title={task.title}
                        >
                          {task.title}
                        </button>
                      </div>

                      <div className="kanban-tile-meta">
                        <div className="kanban-badges-group">
                          {/* Client / Project Badge */}
                          {project && (
                            <span className="kanban-project-chip" title={`Client/Project: ${project.name}`}>
                              📁 {project.name}
                            </span>
                          )}

                          {/* Personal Category Badge */}
                          {task.isPersonal && (
                            <span className="badge-chip badge-personal" title="Personal task">
                              🌿 Personal
                            </span>
                          )}

                          {/* Whenever Timing Preference */}
                          {task.timingPreference === "whenever" && (
                            <span className="badge-chip badge-whenever" title="Whenever: No strict deadline">
                              🟢 Whenever
                            </span>
                          )}

                          {/* Labels */}
                          {task.labelIds &&
                            task.labelIds.length > 0 &&
                            task.labelIds.map((id) => {
                              const labelObj = labelMap.get(id);
                              return labelObj ? (
                                <span key={id} className="task-label-chip">
                                  🏷️ {labelObj.name}
                                </span>
                              ) : null;
                            })}

                          {/* Priority */}
                          <span className={`priority-badge-sm priority-${task.priority}`}>
                            {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                          </span>
                        </div>

                        {/* Due Date Indicator */}
                        {task.dueDate && (
                          <span className={`kanban-due ${isOverdue ? "overdue" : ""}`}>
                            {isOverdue ? "Overdue · " : ""}
                            {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>

                      {/* Touch-friendly Mobile Status Selector */}
                      <div className="kanban-tile-touch-move">
                        <label className="kanban-move-label" aria-label={`Move status for ${task.title}`}>
                          <CaretDown size={12} />
                          <select
                            value={task.status}
                            onChange={(e) =>
                              onMoveTaskStatus(task.id, e.target.value as PlannerTask["status"])
                            }
                          >
                            <option value="open">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Done</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Add Task Button */}
                <button
                  type="button"
                  className="kanban-col-add-bottom-btn"
                  onClick={() =>
                    onAddTask({
                      date: todayKey,
                      status: col.key,
                      projectId: projectFilter && projectFilter !== "__unassigned" ? projectFilter : null,
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
    </section>
  );
}
