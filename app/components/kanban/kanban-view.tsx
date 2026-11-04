"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import {
  Plus,
  DotsSixVertical,
  CaretDown,
  CalendarBlank,
  Briefcase,
  MagnifyingGlass,
  SortAscending,
  Tag,
  ArrowsDownUp,
  Rows,
  SquaresFour,
  Warning,
  CaretRight,
  X,
} from "@phosphor-icons/react";
import type { PlannerTask, Priority } from "@/lib/schedule/types";
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
  type KanbanSortKey,
  KANBAN_DATE_FILTER_LABELS,
  PRIORITY_ORDER,
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

const PRIORITY_LABELS: Record<Priority, string> = {
  p1: "Urgent",
  p2: "High",
  p3: "Medium",
  p4: "Low",
  none: "No Priority",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  p1: "#ff3d8b",
  p2: "#ff7a1a",
  p3: "#3b5bff",
  p4: "#b8f04a",
  none: "#cbd5e1",
};

const SORT_LABELS: Record<KanbanSortKey, string> = {
  due: "Due Date",
  priority: "Priority",
  created: "Date Created",
};

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
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<KanbanSortKey>("due");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<PlannerTask["status"] | null>(null);
  const [mobileColumn, setMobileColumn] = useState<PlannerTask["status"]>("open");
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [wipLimit, setWipLimit] = useState<number>(0);
  const [showWipInput, setShowWipInput] = useState(false);
  const addInProgressRef = useRef<boolean>(false);

  const toggleCollapse = useCallback((colKey: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }, []);

  const filteredTasks = useMemo(() => {
    return filterKanbanTasks({
      tasks,
      dateFilter,
      projectFilter,
      priorityFilter: priorityFilter || undefined,
      labelFilter: labelFilter || undefined,
      search: search || undefined,
      sortBy,
      todayKey,
      today,
      weekStartsOn,
      allCalendarConfigs,
    });
  }, [tasks, dateFilter, projectFilter, priorityFilter, labelFilter, search, sortBy, todayKey, today, weekStartsOn, allCalendarConfigs]);

  const tasksByStatus = useMemo(() => groupKanbanTasksByStatus(filteredTasks), [filteredTasks]);

  const overdueCount = useMemo(() => {
    return filteredTasks.filter(
      (t) => t.status !== "completed" && t.dueDate && t.dueDate < todayKey
    ).length;
  }, [filteredTasks, todayKey]);

  const completionPct = useMemo(() => {
    const active = filteredTasks.filter((t) => t.status !== "completed").length;
    const done = tasksByStatus.completed.length;
    const total = active + done;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [filteredTasks, tasksByStatus]);

  const isTaskOverdue = (task: PlannerTask) =>
    task.status !== "completed" && Boolean(task.dueDate && task.dueDate < todayKey);

  const projectMap = useMemo(() => {
    const map = new Map<string, TaskProject>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const labelMap = useMemo(() => {
    const map = new Map<string, TaskLabel>();
    for (const l of labels) map.set(l.id, l);
    return map;
  }, [labels]);

  const hasFilters = dateFilter !== "all" || projectFilter !== "" || priorityFilter !== "" || labelFilter !== "" || search !== "";

  const resetFilters = () => {
    setDateFilter("all");
    setProjectFilter("");
    setPriorityFilter("");
    setLabelFilter("");
    setSearch("");
  };

  const handleAddTask = useCallback(
    (status: PlannerTask["status"]) => {
      if (addInProgressRef.current) return;
      addInProgressRef.current = true;
      onAddTask({
        date: todayKey,
        status,
        projectId: projectFilter && projectFilter !== "__unassigned" ? projectFilter : null,
      });
      setTimeout(() => { addInProgressRef.current = false; }, 600);
    },
    [onAddTask, todayKey, projectFilter]
  );

  const dateFilterKeys: KanbanDateFilter[] = ["all", "today", "this_week", "this_month", "overdue", "completed"];
  const priorityOptions: Priority[] = ["p1", "p2", "p3", "p4", "none"];

  return (
    <section className="kanban-board neo-card" id="kanban-view">

      {/* ── Board Header ── */}
      <div className="kanban-board-header">
        <div className="kanban-board-title-row">
          <div className="kanban-board-title-block">
            <span className="section-kicker">TASK BOARD</span>
            <h2 className="kanban-h2">Kanban<span className="heading-period">.</span></h2>
          </div>
          <div className="kanban-header-stats-compact">
            <span className="khs-item khs-total">
              <strong>{filteredTasks.length}</strong>
              <span>Tasks</span>
            </span>
            <span className="khs-divider" />
            <span className="khs-item">
              <span className="kanban-status-dot kanban-dot-open" />
              <strong>{tasksByStatus.open.length}</strong>
              <span className="khs-label">To Do</span>
            </span>
            <span className="khs-item">
              <span className="kanban-status-dot kanban-dot-in_progress" />
              <strong>{tasksByStatus.in_progress.length}</strong>
              <span className="khs-label">In Progress</span>
            </span>
            <span className="khs-item">
              <span className="kanban-status-dot kanban-dot-completed" />
              <strong>{tasksByStatus.completed.length}</strong>
              <span className="khs-label">Done</span>
            </span>
            {overdueCount > 0 && (
              <>
                <span className="khs-divider" />
                <span className="khs-item khs-overdue">
                  <Warning size={12} weight="fill" />
                  <strong>{overdueCount}</strong>
                  <span className="khs-label">Overdue</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="kanban-progress-row">
          <div className="kanban-progress-track">
            <div className="kanban-progress-fill" style={{ width: `${completionPct}%` }} />
          </div>
          <span className="kanban-progress-label">{completionPct}% complete</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="kanban-toolbar kanban-toolbar-v2">

        {/* Row 1: Date pills + project + view toggle */}
        <div className="kanban-toolbar-row kanban-toolbar-row-1">
          <div className="kanban-toolbar-group">
            <span className="kanban-filter-label"><CalendarBlank size={12} weight="bold" /> Date</span>
            <div className="kanban-filter-pills">
              {dateFilterKeys.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={`kanban-filter-pill${dateFilter === key ? " active" : ""}`}
                  aria-pressed={dateFilter === key}
                  onClick={() => setDateFilter(key)}
                >
                  {KANBAN_DATE_FILTER_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="kanban-toolbar-group kanban-toolbar-right">
            {/* View toggle */}
            <div className="kanban-view-toggle" role="group" aria-label="Board view mode">
              <button
                type="button"
                className={`kanban-view-btn${viewMode === "board" ? " is-active" : ""}`}
                onClick={() => setViewMode("board")}
                title="Board view"
                aria-pressed={viewMode === "board"}
              >
                <SquaresFour size={14} weight={viewMode === "board" ? "fill" : "regular"} />
              </button>
              <button
                type="button"
                className={`kanban-view-btn${viewMode === "list" ? " is-active" : ""}`}
                onClick={() => setViewMode("list")}
                title="List view"
                aria-pressed={viewMode === "list"}
              >
                <Rows size={14} weight={viewMode === "list" ? "fill" : "regular"} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Search + priority + label + project + sort + reset */}
        <div className="kanban-toolbar-row kanban-toolbar-row-2">
          {/* Search */}
          <div className="kanban-search-box">
            <MagnifyingGlass size={13} className="kanban-search-icon" />
            <input
              type="search"
              className="kanban-search-input"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
            />
            {search && (
              <button type="button" className="kanban-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Priority filter */}
          <div className="kanban-select-wrapper">
            <SortAscending size={12} className="kanban-select-icon" />
            <select
              className="kanban-filter-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
              aria-label="Filter by priority"
            >
              <option value="">All Priorities</option>
              {priorityOptions.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            <CaretDown size={11} className="kanban-select-caret" />
          </div>

          {/* Label filter */}
          {labels.length > 0 && (
            <div className="kanban-select-wrapper">
              <Tag size={12} className="kanban-select-icon" />
              <select
                className="kanban-filter-select"
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                aria-label="Filter by label"
              >
                <option value="">All Labels</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <CaretDown size={11} className="kanban-select-caret" />
            </div>
          )}

          {/* Project filter */}
          <div className="kanban-select-wrapper">
            <Briefcase size={12} className="kanban-select-icon" />
            <select
              className="kanban-filter-select kanban-project-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="">All Projects</option>
              <option value="__unassigned">Unassigned</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <CaretDown size={11} className="kanban-select-caret" />
          </div>

          {/* Sort */}
          <div className="kanban-select-wrapper">
            <ArrowsDownUp size={12} className="kanban-select-icon" />
            <select
              className="kanban-filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as KanbanSortKey)}
              aria-label="Sort tasks"
            >
              {(Object.keys(SORT_LABELS) as KanbanSortKey[]).map((k) => (
                <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>
              ))}
            </select>
            <CaretDown size={11} className="kanban-select-caret" />
          </div>

          {hasFilters && (
            <button type="button" className="kanban-reset-filters-btn" onClick={resetFilters}>
              <X size={10} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile column tab strip ── */}
      <div className="kanban-mobile-column-selector" role="tablist" aria-label="Select board column">
        {KANBAN_COLUMNS.map((col) => (
          <button
            key={col.key}
            type="button"
            role="tab"
            aria-selected={mobileColumn === col.key}
            className={`kanban-mobile-col-pill kanban-mobile-pill-${col.key}${mobileColumn === col.key ? " is-selected" : ""}`}
            onClick={() => setMobileColumn(col.key)}
          >
            <span className={`kanban-status-dot kanban-dot-${col.key}`} />
            <span className="mobile-col-label">{col.label}</span>
            <span className="mobile-col-count">{tasksByStatus[col.key].length}</span>
          </button>
        ))}
      </div>

      {/* ── List View ── */}
      {viewMode === "list" && (
        <div className="kanban-list-view">
          {filteredTasks.length === 0 ? (
            <div className="kanban-list-empty">
              <p>{hasFilters ? "No tasks match your filters." : "No tasks yet — add one to get started."}</p>
              {hasFilters && <button type="button" className="kanban-reset-filters-btn" onClick={resetFilters}><X size={10} /> Reset Filters</button>}
            </div>
          ) : (
            <table className="kanban-list-table" role="table">
              <thead>
                <tr>
                  <th className="klt-col-title">Task</th>
                  <th className="klt-col-status">Status</th>
                  <th className="klt-col-priority">Priority</th>
                  <th className="klt-col-due">Due</th>
                  <th className="klt-col-project">Project</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const isOverdue = isTaskOverdue(task);
                  const project = task.projectId ? projectMap.get(task.projectId) : undefined;
                  return (
                    <tr
                      key={task.id}
                      className={`klt-row${isOverdue ? " klt-overdue" : ""}${task.status === "completed" ? " klt-done" : ""}`}
                      onClick={() => onOpenTaskDetail(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenTaskDetail(task); }}
                    >
                      <td className="klt-cell klt-cell-title">
                        <span
                          className="klt-priority-bar"
                          style={{ background: PRIORITY_COLORS[task.priority] }}
                          aria-hidden
                        />
                        <span className="klt-title-text">{task.title}</span>
                        {task.labelIds?.length > 0 && (
                          <span className="klt-labels">
                            {task.labelIds.slice(0, 2).map((id) => {
                              const l = labelMap.get(id);
                              return l ? <span key={id} className="klt-label-chip">{l.name}</span> : null;
                            })}
                          </span>
                        )}
                      </td>
                      <td className="klt-cell">
                        <span className={`klt-status-chip klt-status-${task.status}`}>
                          <span className={`kanban-status-dot kanban-dot-${task.status}`} />
                          {task.status === "open" ? "To Do" : task.status === "in_progress" ? "In Progress" : "Done"}
                        </span>
                      </td>
                      <td className="klt-cell">
                        <span className={`klt-priority-chip priority-${task.priority}`} style={{ borderColor: PRIORITY_COLORS[task.priority] }}>
                          {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                        </span>
                      </td>
                      <td className="klt-cell klt-cell-due">
                        {task.dueDate ? (
                          <span className={isOverdue ? "klt-due-overdue" : ""}>
                            {isOverdue && <Warning size={11} weight="fill" />}
                            {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}
                          </span>
                        ) : (
                          <span className="klt-no-due">—</span>
                        )}
                      </td>
                      <td className="klt-cell">
                        {project ? (
                          <span className="kanban-project-chip">{project.name}</span>
                        ) : (
                          <span className="klt-no-due">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Board View ── */}
      {viewMode === "board" && (
        <div className="kanban-columns kanban-columns-v2">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasksByStatus[col.key];
            const isCollapsed = collapsedCols.has(col.key);
            const isMobileActive = mobileColumn === col.key;
            const isWipOver = col.key === "in_progress" && wipLimit > 0 && colTasks.length > wipLimit;

            return (
              <div
                key={col.key}
                className={`kanban-col kanban-col-v2 kanban-col-${col.key}${isMobileActive ? " is-mobile-active-col" : " is-mobile-hidden-col"}${isCollapsed ? " is-collapsed" : ""}${dragOverCol === col.key ? " kanban-drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const taskId = e.dataTransfer.getData("text/plain") || dragTaskId;
                  if (taskId) onMoveTaskStatus(taskId, col.key);
                  setDragTaskId(null);
                }}
              >
                {/* Column Header */}
                <div className="kanban-col-header kanban-col-header-v2">
                  <button
                    type="button"
                    className="kanban-col-collapse-btn"
                    onClick={() => toggleCollapse(col.key)}
                    aria-label={isCollapsed ? `Expand ${col.label}` : `Collapse ${col.label}`}
                    title={isCollapsed ? "Expand column" : "Collapse column"}
                  >
                    <CaretRight
                      size={12}
                      weight="bold"
                      className={`kanban-col-caret${isCollapsed ? "" : " is-open"}`}
                    />
                  </button>
                  <span className={`kanban-status-dot kanban-dot-${col.key}`} />
                  <span className="kanban-col-title">{col.label}</span>
                  <span className={`kanban-col-count${isWipOver ? " wip-over" : ""}`}>
                    {colTasks.length}{wipLimit > 0 && col.key === "in_progress" ? `/${wipLimit}` : ""}
                  </span>

                  {/* WIP limit control for In Progress */}
                  {col.key === "in_progress" && (
                    <div className="kanban-wip-control">
                      {showWipInput ? (
                        <div className="kanban-wip-input-row">
                          <span className="kanban-wip-label">WIP:</span>
                          <input
                            type="number"
                            className="kanban-wip-input"
                            value={wipLimit || ""}
                            min={0}
                            max={99}
                            placeholder="∞"
                            onChange={(e) => setWipLimit(Number(e.target.value) || 0)}
                            onBlur={() => setShowWipInput(false)}
                            aria-label="WIP limit"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="kanban-wip-btn"
                          onClick={() => setShowWipInput(true)}
                          title={wipLimit > 0 ? `WIP limit: ${wipLimit}` : "Set WIP limit"}
                        >
                          {wipLimit > 0 ? `WIP: ${wipLimit}` : "WIP"}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="kanban-col-header-actions">
                    <button
                      type="button"
                      className="kanban-col-add-btn"
                      aria-label={`Add task to ${col.label}`}
                      title={`Add task to ${col.label}`}
                      onClick={() => handleAddTask(col.key)}
                    >
                      <Plus size={13} weight="bold" />
                    </button>
                  </div>
                </div>

                {/* WIP warning */}
                {!isCollapsed && isWipOver && (
                  <div className="kanban-wip-warning" role="alert">
                    <Warning size={12} weight="fill" /> WIP limit exceeded ({colTasks.length}/{wipLimit})
                  </div>
                )}

                {/* Column Body */}
                {!isCollapsed && (
                  <div className="kanban-col-body kanban-col-body-v2">
                    {colTasks.length === 0 && (
                      <div className="kanban-empty kanban-empty-v2">
                        {col.key === "open" && (
                          <>
                            <span className="kanban-empty-icon">📋</span>
                            <p>Your to-do list is clear.</p>
                            <button
                              type="button"
                              className="kanban-empty-add-btn"
                              onClick={() => handleAddTask("open")}
                            >
                              <Plus size={12} weight="bold" /> Add a task
                            </button>
                          </>
                        )}
                        {col.key === "in_progress" && (
                          <>
                            <span className="kanban-empty-icon">⚡</span>
                            <p>Drag a task here when you start working on it.</p>
                          </>
                        )}
                        {col.key === "completed" && (
                          <>
                            <span className="kanban-empty-icon">✅</span>
                            <p>
                              {dateFilter === "completed"
                                ? "No completed tasks match your filters."
                                : "Completed tasks appear here."}
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {colTasks.map((task) => {
                      const tileStyle = getItemTileStyle(task, itemStyles, allCalendarConfigs);
                      const isOverdue = isTaskOverdue(task);
                      const project = task.projectId ? projectMap.get(task.projectId) : undefined;

                      return (
                        <div
                          key={task.id}
                          className={`kanban-tile kanban-tile-v2 ${tileStyle.className} priority-accent-${task.priority}${task.isPinned ? " is-pinned" : ""}${task.status === "completed" ? " is-done" : ""}${isOverdue ? " is-overdue-card" : ""}`}
                          style={{ ...tileStyle.style }}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", task.id);
                            setDragTaskId(task.id);
                          }}
                          onDragEnd={() => setDragTaskId(null)}
                        >
                          {/* Card top row */}
                          <div className="kanban-tile-top">
                            <span className="kanban-drag-handle" aria-hidden="true" title="Drag to move">
                              <DotsSixVertical size={14} />
                            </span>
                            <button
                              type="button"
                              className="kanban-tile-title"
                              onClick={() => onOpenTaskDetail(task)}
                              title={task.title}
                            >
                              {task.title}
                            </button>
                          </div>

                          {/* Card meta row */}
                          <div className="kanban-tile-meta-v2">
                            {/* Priority badge */}
                            <span
                              className={`ktm-priority priority-${task.priority}`}
                              style={{ borderColor: PRIORITY_COLORS[task.priority] }}
                            >
                              {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                            </span>

                            {/* Due date */}
                            {task.dueDate && (
                              <span className={`ktm-due${isOverdue ? " is-overdue" : ""}`}>
                                {isOverdue && <Warning size={10} weight="fill" />}
                                {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>

                          {/* Project & labels row */}
                          {(project || (task.labelIds && task.labelIds.length > 0)) && (
                            <div className="kanban-tile-chips">
                              {project && (
                                <span className="kanban-project-chip" title={`Project: ${project.name}`}>
                                  {project.name}
                                </span>
                              )}
                              {task.labelIds?.slice(0, 2).map((id) => {
                                const l = labelMap.get(id);
                                return l ? (
                                  <span key={id} className="ktm-label-chip">
                                    {l.name}
                                  </span>
                                ) : null;
                              })}
                              {(task.labelIds?.length ?? 0) > 2 && (
                                <span className="ktm-label-chip ktm-label-more">
                                  +{(task.labelIds?.length ?? 0) - 2}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Touch-friendly status selector */}
                          <div className="kanban-tile-touch-move">
                            <label className="kanban-move-label" aria-label={`Move: ${task.title}`}>
                              <CaretDown size={12} />
                              <select
                                value={task.status}
                                onChange={(e) => onMoveTaskStatus(task.id, e.target.value as PlannerTask["status"])}
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

                    {/* Bottom add button */}
                    <button
                      type="button"
                      className="kanban-col-add-bottom-btn kanban-col-add-bottom-v2"
                      onClick={() => handleAddTask(col.key)}
                    >
                      <Plus size={12} weight="bold" /> Add task
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
