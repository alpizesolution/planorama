"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarBlank,
  CheckCircle,
  Circle,
  Plus,
  X,
  DotsSixVertical,
  CaretDown,
  CaretUp,
  Gear,
  Palette,
  SquaresFour,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { createTask, getTasks, removeTask, updateTask } from "@/lib/schedule/task-service";
import type { PlannerTask, PlannerPreferences } from "@/lib/schedule/types";
import { validateTask } from "@/lib/schedule/validation";
import { getWeekDays, toDateKey, monthGridDays, daysInMonth } from "@/lib/calendar/date-utils";
import { generateId } from "@/lib/schedule/id";
import { DailyHabitsWidget } from "@/app/components/daily-habits-widget";
import { DashboardView } from "@/app/components/dashboard/dashboard-view";
import { getHabits, getCheckIns } from "@/lib/habits/habit-service";
import { writeHabitsToStorage, writeCheckInsToStorage } from "@/lib/habits/storage";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import type {
  CalendarThemePreset,
  CalendarThemeSettings,
  MonthColorMode,
} from "@/lib/calendar/calendar-themes";
import {
  DEFAULT_CALENDAR_THEME,
  THEME_PRESET_METADATA,
  getMonthColor,
  getResolvedTheme,
  resetToThemeDefault,
  restorePlanoramaDefaults,
} from "@/lib/calendar/calendar-themes";
import type {
  DashboardWidgetId,
} from "@/lib/dashboard/types";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_METADATA,
  resolveDashboardWidgets,
} from "@/lib/dashboard/types";
import { CalendarSidebar } from "@/app/components/calendar/calendar-sidebar";
import { MonthView } from "@/app/components/calendar/month-view";
import { GoogleCalendarSettings } from "@/app/components/google-calendar-settings";
import { UserProfileButton } from "@/app/components/auth/user-profile-button";
import {
  executeTwoWaySync,
  fetchGoogleIntegrationStatus,
} from "@/lib/google-calendar/sync-service";
import {
  enqueueSyncAction,
  recordDeletedGoogleEventId,
} from "@/lib/google-calendar/sync-queue";
import type {
  GoogleCalendarSyncSettings,
  GoogleIntegrationStatus,
} from "@/lib/google-calendar/types";
import { DEFAULT_GOOGLE_SYNC_SETTINGS } from "@/lib/google-calendar/types";

type TaskTemplate = { id: string; name: string; title: string; notes: string; priority: PlannerTask["priority"]; recurrence: PlannerTask["recurrence"] };
type TaskLabel = { id: string; name: string };
type TaskProject = { id: string; name: string };
type AppView = "dashboard" | "month" | "year" | "yearline" | "agenda" | "week" | "kanban";

const NAV_VIEWS: { id: AppView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "yearline", label: "Yearline" },
  { id: "agenda", label: "Agenda" },
  { id: "week", label: "Week" },
  { id: "kanban", label: "Board" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const EMOJIS = [
  "✅", "📝", "💡", "🎯", "🔥", "⚡", "💼", "📅", "📌", "🔔",
  "❤️", "⭐", "🌟", "🎉", "🎨", "🎵", "🏃", "💪", "🌈", "🦋",
  "🏠", "🍕", "📚", "🎮", "🌿", "🌸", "🌙", "✈️", "🎁", "💰",
  "😀", "😊", "😅", "🤔", "👍", "🙌", "🤝", "🧠", "👀", "🦄",
];

function insertEmoji(emoji: string, current: string): string {
  // Remove any existing leading emoji-like prefix then prepend new one
  const bare = current.replace(/^[^\p{L}\p{N}\s]+\s*/u, "");
  return `${emoji} ${bare}`.trimEnd();
}

const DEFAULT_LABELS: TaskLabel[] = [
  { id: "work", name: "Work" }, { id: "personal", name: "Personal" },
  { id: "study", name: "Study" }, { id: "errands", name: "Errands" },
];
const LABEL_STORAGE_KEY = "planorama-task-labels";
const PROJECT_STORAGE_KEY = "planorama-task-projects";

const TEMPLATE_STORAGE_KEY = "planorama-task-templates";
const PREFERENCES_STORAGE_KEY = "planorama-preferences";

const DEFAULT_PREFERENCES: PlannerPreferences = {
  weekStartsOn: 0,
  defaultSort: "due",
  defaultPriority: "none",
  disabledOptions: [],
  customLabels: {},
  customEmojis: {},
  calendarTheme: DEFAULT_CALENDAR_THEME,
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  googleCalendarSync: DEFAULT_GOOGLE_SYNC_SETTINGS,
};

type TaskOptionId =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "whenever"
  | "pinned"
  | "personal"
  | "none";

interface TaskOptionItem {
  id: TaskOptionId;
  emoji: string;
  label: string;
  description: string;
  type: "priority" | "timing" | "pin" | "category";
}

const TASK_OPTIONS: TaskOptionItem[] = [
  {
    id: "p1",
    emoji: "🔥",
    label: "Do This Now",
    description: "Urgent — handle immediately",
    type: "priority",
  },
  {
    id: "p2",
    emoji: "🔴",
    label: "High",
    description: "Important and time-sensitive",
    type: "priority",
  },
  {
    id: "p3",
    emoji: "🟠",
    label: "Medium",
    description: "Important, but not urgent",
    type: "priority",
  },
  {
    id: "p4",
    emoji: "🟡",
    label: "Low",
    description: "Can wait until later",
    type: "priority",
  },
  {
    id: "none",
    emoji: "⚪",
    label: "No Priority",
    description: "No priority assigned",
    type: "priority",
  },
  {
    id: "whenever",
    emoji: "🟢",
    label: "Whenever",
    description: "No specific deadline",
    type: "timing",
  },
  {
    id: "pinned",
    emoji: "📌",
    label: "Pinned",
    description: "Keep this task easy to find",
    type: "pin",
  },
  {
    id: "personal",
    emoji: "🌿",
    label: "Personal",
    description: "Optional category for life tasks",
    type: "category",
  },
];

let currentPlannerPreferences: PlannerPreferences = DEFAULT_PREFERENCES;

function getOptionLabel(id: string, prefs: PlannerPreferences = currentPlannerPreferences): string {
  const custom = prefs?.customLabels?.[id]?.trim();
  if (custom) return custom;
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.label : id;
}

function getOptionEmoji(id: string, prefs: PlannerPreferences = currentPlannerPreferences): string {
  const custom = prefs?.customEmojis?.[id]?.trim();
  if (custom) return custom;
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.emoji : "";
}

function getOptionDescription(id: string): string {
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.description : "";
}

function priorityLabel(priority: PlannerTask["priority"] | undefined, prefs: PlannerPreferences = currentPlannerPreferences): string {
  return getOptionLabel(priority ?? "none", prefs);
}

function priorityEmoji(priority: PlannerTask["priority"] | undefined, prefs: PlannerPreferences = currentPlannerPreferences): string {
  return getOptionEmoji(priority ?? "none", prefs);
}

interface TaskPriorityOrgControlProps {
  priority: PlannerTask["priority"];
  isPinned: boolean;
  isPersonal: boolean;
  timingPreference: "scheduled" | "whenever";
  preferences?: PlannerPreferences;
  onSelectPriority: (priority: PlannerTask["priority"]) => void;
  onTogglePinned: () => void;
  onTogglePersonal: () => void;
  onToggleTimingPreference: () => void;
}

function TaskPriorityOrgControl({
  priority,
  isPinned,
  isPersonal,
  timingPreference,
  preferences,
  onSelectPriority,
  onTogglePinned,
  onTogglePersonal,
  onToggleTimingPreference,
}: TaskPriorityOrgControlProps) {
  const [isOpen, setIsOpen] = useState(false);

  const disabled = preferences?.disabledOptions ?? [];
  const priorityList = TASK_OPTIONS.filter((opt) => opt.type === "priority");
  // Always include the current priority even if disabled so existing tasks are editable
  const visiblePriorities = priorityList.filter(
    (opt) => !disabled.includes(opt.id) || opt.id === priority
  );

  const isPinnedDisabled = disabled.includes("pinned") && !isPinned;
  const isWheneverDisabled = disabled.includes("whenever") && timingPreference !== "whenever";
  const isPersonalDisabled = disabled.includes("personal") && !isPersonal;

  const currentPriorityEmoji = priorityEmoji(priority, preferences);
  const currentPriorityLabel = priorityLabel(priority, preferences);

  return (
    <div className={`priority-org-container ${isOpen ? "is-open" : ""}`}>
      <div
        className="priority-org-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
      >
        <div className="priority-org-summary-group">
          <span className="priority-org-kicker">Priority & organization</span>
          <div className="priority-org-chips">
            <span
              className={`priority-org-chip priority-chip-${priority}`}
              title={`Priority: ${currentPriorityLabel}`}
            >
              {currentPriorityEmoji} {currentPriorityLabel}
            </span>
            {isPinned && (
              <span className="priority-org-chip is-pinned" title="Pinned task">
                {getOptionEmoji("pinned", preferences)} {getOptionLabel("pinned", preferences)}
              </span>
            )}
            {timingPreference === "whenever" && (
              <span className="priority-org-chip is-whenever" title="No specific deadline">
                {getOptionEmoji("whenever", preferences)} {getOptionLabel("whenever", preferences)}
              </span>
            )}
            {isPersonal && (
              <span className="priority-org-chip is-personal" title="Personal category">
                {getOptionEmoji("personal", preferences)} {getOptionLabel("personal", preferences)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="priority-org-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          aria-label={isOpen ? "Collapse priority and organization" : "Expand priority and organization"}
        >
          <span className="priority-org-toggle-text">{isOpen ? "Done" : "Change"}</span>
          <CaretDown size={14} className={`priority-org-caret ${isOpen ? "rotate-up" : ""}`} />
        </button>
      </div>

      {isOpen && (
        <div className="priority-org-panel">
          <div className="priority-org-field-row">
            <label className="priority-dropdown-label">
              <span className="priority-field-title">Priority level</span>
              <select
                className="priority-native-select"
                value={priority}
                onChange={(e) => onSelectPriority(e.target.value as PlannerTask["priority"])}
                aria-label="Select task priority"
              >
                {visiblePriorities.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {getOptionEmoji(opt.id, preferences)} {getOptionLabel(opt.id, preferences)}
                    {disabled.includes(opt.id) ? " (disabled in preferences)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="priority-org-pill-group">
            <span className="priority-field-title">Focus & category</span>
            <div className="priority-pills-row">
              {!isPinnedDisabled && (
                <button
                  type="button"
                  className={`priority-pill ${isPinned ? "is-selected pin-selected" : ""}`}
                  onClick={onTogglePinned}
                  aria-pressed={isPinned}
                  title={getOptionDescription("pinned")}
                >
                  <span className="priority-pill-icon">{getOptionEmoji("pinned", preferences)}</span>
                  <span>{getOptionLabel("pinned", preferences)}</span>
                </button>
              )}
              {!isWheneverDisabled && (
                <button
                  type="button"
                  className={`priority-pill ${timingPreference === "whenever" ? "is-selected whenever-selected" : ""}`}
                  onClick={onToggleTimingPreference}
                  aria-pressed={timingPreference === "whenever"}
                  title={getOptionDescription("whenever")}
                >
                  <span className="priority-pill-icon">{getOptionEmoji("whenever", preferences)}</span>
                  <span>{getOptionLabel("whenever", preferences)}</span>
                </button>
              )}
              {!isPersonalDisabled && (
                <button
                  type="button"
                  className={`priority-pill ${isPersonal ? "is-selected personal-selected" : ""}`}
                  onClick={onTogglePersonal}
                  aria-pressed={isPersonal}
                  title={getOptionDescription("personal")}
                >
                  <span className="priority-pill-icon">{getOptionEmoji("personal", preferences)}</span>
                  <span>{getOptionLabel("personal", preferences)}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: PlannerPreferences;
  onSavePreferences: (next: PlannerPreferences) => void;
  labels: TaskLabel[];
  onAddLabel: () => void;
  onDeleteLabel: (id: string) => void;
  onRestoreDefaults: () => void;
  onSyncGoogle: () => Promise<void>;
  isSyncingGoogle: boolean;
  showToast: (msg: string) => void;
  onError: (err: string) => void;
}

function PreferencesModal({
  isOpen,
  onClose,
  preferences,
  onSavePreferences,
  labels,
  onAddLabel,
  onDeleteLabel,
  onRestoreDefaults,
  onSyncGoogle,
  isSyncingGoogle,
  showToast,
  onError,
}: PreferencesModalProps) {
  const [showCustomThemeColors, setShowCustomThemeColors] = useState(false);
  const [draggedWidgetIndex, setDraggedWidgetIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDashboardWidgets = resolveDashboardWidgets(preferences.dashboardWidgets);

  function handleToggleWidgetVisibility(id: DashboardWidgetId) {
    const nextWidgets = currentDashboardWidgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    onSavePreferences({
      ...preferences,
      dashboardWidgets: nextWidgets,
    });
  }

  function handleMoveWidget(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentDashboardWidgets.length) return;
    const nextWidgets = [...currentDashboardWidgets];
    const [moved] = nextWidgets.splice(index, 1);
    nextWidgets.splice(targetIndex, 0, moved);
    onSavePreferences({
      ...preferences,
      dashboardWidgets: nextWidgets,
    });
  }

  function handleWidgetDragStart(index: number) {
    setDraggedWidgetIndex(index);
  }

  function handleWidgetDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleWidgetDrop(index: number) {
    if (draggedWidgetIndex === null || draggedWidgetIndex === index) {
      setDraggedWidgetIndex(null);
      return;
    }
    const nextWidgets = [...currentDashboardWidgets];
    const [moved] = nextWidgets.splice(draggedWidgetIndex, 1);
    nextWidgets.splice(index, 0, moved);
    setDraggedWidgetIndex(null);
    onSavePreferences({
      ...preferences,
      dashboardWidgets: nextWidgets,
    });
  }

  function handleRestoreDefaultWidgets() {
    onSavePreferences({
      ...preferences,
      dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w })),
    });
  }

  const disabled = preferences.disabledOptions ?? [];
  const customLabels = preferences.customLabels ?? {};

  function handleLabelChange(id: string, newLabel: string) {
    onSavePreferences({
      ...preferences,
      customLabels: {
        ...customLabels,
        [id]: newLabel,
      },
    });
  }

  function handleToggleDisabled(id: string) {
    const isCurrentlyDisabled = disabled.includes(id);
    let nextDisabled: string[];
    if (isCurrentlyDisabled) {
      nextDisabled = disabled.filter((item) => item !== id);
    } else {
      nextDisabled = [...disabled, id];
    }
    let nextDefaultPriority = preferences.defaultPriority ?? "none";
    if (id === nextDefaultPriority && !isCurrentlyDisabled) {
      nextDefaultPriority = "none";
    }
    onSavePreferences({
      ...preferences,
      disabledOptions: nextDisabled,
      defaultPriority: nextDefaultPriority,
    });
  }

  const priorityItems = TASK_OPTIONS.filter((opt) => opt.type === "priority");
  const focusItems = TASK_OPTIONS.filter((opt) => opt.type === "timing" || opt.type === "pin");
  const categoryItems = TASK_OPTIONS.filter((opt) => opt.type === "category");

  const currentCalendarTheme = preferences.calendarTheme ?? DEFAULT_CALENDAR_THEME;
  const resolvedModalTheme = getResolvedTheme(currentCalendarTheme);

  function handleSelectPreset(preset: CalendarThemePreset) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        preset,
      },
    });
  }

  function handleSelectMode(mode: MonthColorMode) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        mode,
      },
    });
  }

  function handleUpdateCustomThemeField(field: keyof CalendarThemeSettings, val: string) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        [field]: val,
      },
    });
  }

  function handleUpdateMonthColor(mIdx: number, newBg: string) {
    const currentMonth = getMonthColor(resolvedModalTheme, mIdx);
    const custom = { ...(currentCalendarTheme.customMonthColors ?? {}) };
    custom[mIdx] = {
      ...currentMonth,
      bg: newBg,
      tileBg: newBg,
      border: newBg,
    };
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        customMonthColors: custom,
      },
    });
  }

  function handleResetTheme() {
    onSavePreferences({
      ...preferences,
      calendarTheme: resetToThemeDefault(currentCalendarTheme.preset, currentCalendarTheme.mode),
    });
  }

  function handleRestoreDefaultsTheme() {
    onSavePreferences({
      ...preferences,
      calendarTheme: restorePlanoramaDefaults(),
    });
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="modal-card preferences-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Planner preferences and customization"
      >
        <div className="preferences-modal-header">
          <div className="preferences-modal-title-group">
            <h3>Preferences & Customization</h3>
            <p className="preferences-modal-subtitle">
              Manage priority levels, focus timing, categories, and planner defaults.
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close preferences">
            <X size={20} />
          </button>
        </div>

        {/* SECTION 1: GENERAL & DEFAULTS */}
        <section className="preferences-section">
          <div className="preferences-section-kicker">General & Defaults</div>
          <p className="preferences-section-desc">
            Set default behavior for new tasks, calendar start days, and sorting.
          </p>
          <div className="preference-fields" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
            <label>
              Default priority for new tasks
              <select
                aria-label="Default priority for new tasks"
                value={preferences.defaultPriority ?? "none"}
                onChange={(e) =>
                  onSavePreferences({
                    ...preferences,
                    defaultPriority: e.target.value as PlannerTask["priority"],
                  })
                }
              >
                {priorityItems.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {getOptionEmoji(opt.id, preferences)} {getOptionLabel(opt.id, preferences)}
                    {disabled.includes(opt.id) ? " (disabled)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Week starts on
              <select
                aria-label="Week starts on"
                value={preferences.weekStartsOn}
                onChange={(e) =>
                  onSavePreferences({
                    ...preferences,
                    weekStartsOn: Number(e.target.value) as PlannerPreferences["weekStartsOn"],
                  })
                }
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
            <label>
              Default task sorting
              <select
                aria-label="Default task sorting"
                value={preferences.defaultSort}
                onChange={(e) =>
                  onSavePreferences({
                    ...preferences,
                    defaultSort: e.target.value as PlannerPreferences["defaultSort"],
                  })
                }
              >
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
                <option value="newest">Newest first</option>
              </select>
            </label>
          </div>
        </section>

        {/* SECTION: DASHBOARD CUSTOMIZATION */}
        <section className="preferences-section dashboard-customization-section">
          <div className="preferences-section-kicker">
            <SquaresFour size={16} weight="bold" style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Dashboard Customization
          </div>
          <p className="preferences-section-desc">
            Show, hide, and reorder the widgets on your personal planning command center. Drag cards or use the arrows to reorder.
          </p>

          <div className="dashboard-widget-pref-list" role="list" aria-label="Dashboard Widgets">
            {currentDashboardWidgets.map((w, index) => {
              const meta = DASHBOARD_WIDGET_METADATA[w.id];
              const isFirst = index === 0;
              const isLast = index === currentDashboardWidgets.length - 1;

              return (
                <div
                  key={w.id}
                  className={`dashboard-widget-pref-row ${w.visible ? "is-visible" : "is-hidden"} ${draggedWidgetIndex === index ? "is-dragging" : ""}`}
                  draggable
                  onDragStart={() => handleWidgetDragStart(index)}
                  onDragOver={(e) => handleWidgetDragOver(e)}
                  onDrop={() => handleWidgetDrop(index)}
                >
                  <div className="dashboard-pref-left">
                    <span className="dashboard-pref-drag-handle" aria-hidden="true" title="Drag to reorder">
                      <DotsSixVertical size={16} />
                    </span>
                    <span className="dashboard-pref-icon" aria-hidden="true">{meta.icon}</span>
                    <div className="dashboard-pref-info">
                      <div className="dashboard-pref-name-row">
                        <strong className="dashboard-pref-name">{meta.name}</strong>
                        {meta.badge && <span className="dashboard-pref-badge">{meta.badge}</span>}
                      </div>
                      <span className="dashboard-pref-desc">{meta.description}</span>
                    </div>
                  </div>

                  <div className="dashboard-pref-actions">
                    <div className="dashboard-pref-order-btns">
                      <button
                        type="button"
                        className="pref-order-btn"
                        onClick={() => handleMoveWidget(index, "up")}
                        disabled={isFirst}
                        aria-label={`Move ${meta.name} up`}
                        title="Move up"
                      >
                        <CaretUp size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        className="pref-order-btn"
                        onClick={() => handleMoveWidget(index, "down")}
                        disabled={isLast}
                        aria-label={`Move ${meta.name} down`}
                        title="Move down"
                      >
                        <CaretDown size={14} weight="bold" />
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`preference-toggle-btn ${w.visible ? "is-active" : "is-disabled"}`}
                      onClick={() => handleToggleWidgetVisibility(w.id)}
                      aria-pressed={w.visible}
                      title={w.visible ? "Hide this widget" : "Show this widget"}
                    >
                      {w.visible ? "Visible" : "Hidden"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dashboard-pref-footer-actions">
            <button
              type="button"
              className="dashboard-pref-restore-btn"
              onClick={handleRestoreDefaultWidgets}
            >
              <ArrowClockwise size={13} weight="bold" style={{ marginRight: 5, verticalAlign: "-1px" }} />
              Restore Default Widget Layout
            </button>
          </div>
        </section>

        {/* SECTION: CALENDAR APPEARANCE & THEMES */}
        <section className="preferences-section calendar-theme-section">
          <div className="preferences-section-kicker">
            <Palette size={16} weight="bold" style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Calendar Appearance & Themes
          </div>
          <p className="preferences-section-desc">
            Customize calendar tiles, month headers, weekend highlights, and color themes across all calendar views.
          </p>

          <div className="calendar-theme-presets-grid">
            {(["colorful", "bold_pop", "soft_pastel", "minimal"] as CalendarThemePreset[]).map((presetId) => {
              const meta = THEME_PRESET_METADATA[presetId];
              const isSelected = currentCalendarTheme.preset === presetId;
              return (
                <button
                  key={presetId}
                  type="button"
                  className={`theme-preset-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelectPreset(presetId)}
                  aria-pressed={isSelected}
                >
                  <div className="theme-preset-card-top">
                    <span className="theme-preset-name">
                      {meta.name}
                      {meta.badge && <span className="theme-preset-badge">{meta.badge}</span>}
                    </span>
                    {isSelected && <span className="theme-preset-check">✓ Active</span>}
                  </div>
                  <p className="theme-preset-desc">{meta.description}</p>
                  <div className="theme-preset-palette-preview">
                    {meta.previewColors.map((color, i) => (
                      <span key={i} className="theme-preset-swatch" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="theme-mode-selector-wrap">
            <span className="theme-control-label">Month Tile Appearance</span>
            <div className="segmented theme-mode-segmented" role="radiogroup" aria-label="Month Tile Appearance">
              <button
                type="button"
                role="radio"
                aria-checked={currentCalendarTheme.mode === "headers"}
                className={currentCalendarTheme.mode === "headers" ? "selected" : ""}
                onClick={() => handleSelectMode("headers")}
              >
                🎨 Colorful Headers
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={currentCalendarTheme.mode === "tiles"}
                className={currentCalendarTheme.mode === "tiles" ? "selected" : ""}
                onClick={() => handleSelectMode("tiles")}
              >
                🌈 Colorful Tiles
              </button>
            </div>
            <span className="theme-mode-hint">
              {currentCalendarTheme.mode === "headers"
                ? "Each month has a distinct pastel header while calendar days stay neutral."
                : "Each month tile and header are subtly tinted with matching colors."}
            </span>
          </div>

          <div className="theme-customization-accordion">
            <button
              type="button"
              className="theme-customization-toggle"
              onClick={() => setShowCustomThemeColors((prev) => !prev)}
              aria-expanded={showCustomThemeColors}
            >
              <span>⚙ Customize Individual Theme Colors</span>
              <span>{showCustomThemeColors ? "▲ Hide" : "▼ Show"}</span>
            </button>

            {showCustomThemeColors && (
              <div className="theme-customization-panel">
                <div className="theme-custom-group">
                  <strong className="theme-custom-group-title">Global Calendar Accents</strong>
                  <div className="theme-custom-pickers-grid">
                    <label className="theme-color-picker-item">
                      <span>Calendar Background</span>
                      <div className="theme-picker-input-wrap">
                        <input
                          type="color"
                          value={resolvedModalTheme.calendarBg}
                          onChange={(e) => handleUpdateCustomThemeField("calendarBg", e.target.value)}
                        />
                        <code>{resolvedModalTheme.calendarBg}</code>
                      </div>
                    </label>
                    <label className="theme-color-picker-item">
                      <span>Weekend Highlight</span>
                      <div className="theme-picker-input-wrap">
                        <input
                          type="color"
                          value={resolvedModalTheme.weekendBg}
                          onChange={(e) => handleUpdateCustomThemeField("weekendBg", e.target.value)}
                        />
                        <code>{resolvedModalTheme.weekendBg}</code>
                      </div>
                    </label>
                    <label className="theme-color-picker-item">
                      <span>Today Highlight</span>
                      <div className="theme-picker-input-wrap">
                        <input
                          type="color"
                          value={resolvedModalTheme.todayBg}
                          onChange={(e) => handleUpdateCustomThemeField("todayBg", e.target.value)}
                        />
                        <code>{resolvedModalTheme.todayBg}</code>
                      </div>
                    </label>
                    <label className="theme-color-picker-item">
                      <span>Selected Date Highlight</span>
                      <div className="theme-picker-input-wrap">
                        <input
                          type="color"
                          value={resolvedModalTheme.selectedBg}
                          onChange={(e) => handleUpdateCustomThemeField("selectedBg", e.target.value)}
                        />
                        <code>{resolvedModalTheme.selectedBg}</code>
                      </div>
                    </label>
                    <label className="theme-color-picker-item">
                      <span>Task Activity Indicator</span>
                      <div className="theme-picker-input-wrap">
                        <input
                          type="color"
                          value={resolvedModalTheme.taskDotColor}
                          onChange={(e) => handleUpdateCustomThemeField("taskDotColor", e.target.value)}
                        />
                        <code>{resolvedModalTheme.taskDotColor}</code>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="theme-custom-group">
                  <strong className="theme-custom-group-title">12 Monthly Header Colors</strong>
                  <div className="theme-months-pickers-grid">
                    {MONTH_NAMES.map((name, mIdx) => {
                      const mColor = getMonthColor(resolvedModalTheme, mIdx);
                      return (
                        <div key={mIdx} className="theme-month-picker-cell" style={{ borderLeftColor: mColor.border }}>
                          <div className="theme-month-picker-header">
                            <span className="theme-month-picker-name">{name.slice(0, 3)}</span>
                            <span className="theme-month-picker-sample" style={{ backgroundColor: mColor.bg, color: mColor.text }}>
                              {String(mIdx + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="theme-picker-input-wrap">
                            <input
                              type="color"
                              aria-label={`${name} header color`}
                              value={mColor.bg}
                              onChange={(e) => handleUpdateMonthColor(mIdx, e.target.value)}
                            />
                            <code>{mColor.bg}</code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="theme-custom-actions">
                  <button
                    type="button"
                    className="theme-reset-btn"
                    onClick={handleResetTheme}
                  >
                    ↺ Reset to {THEME_PRESET_METADATA[resolvedModalTheme.preset].name} Defaults
                  </button>
                  <button
                    type="button"
                    className="theme-restore-defaults-btn"
                    onClick={handleRestoreDefaultsTheme}
                  >
                    ★ Restore Planorama Defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: PRIORITY LEVELS */}
        <section className="preferences-section">
          <div className="preferences-section-kicker">Priority Levels</div>
          <p className="preferences-section-desc">
            Customize labels or disable levels from task creation. Historical tasks keep their assigned priority.
          </p>
          <div className="preferences-list">
            {priorityItems.map((opt) => {
              const isDisabled = disabled.includes(opt.id);
              const labelValue = customLabels[opt.id] ?? opt.label;
              return (
                <div key={opt.id} className={`preference-item-row ${isDisabled ? "is-disabled" : ""}`}>
                  <div className="preference-row-main">
                    <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                    <div className="preference-info">
                      <input
                        type="text"
                        className="preference-label-input"
                        value={labelValue}
                        maxLength={30}
                        onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                        placeholder={opt.label}
                        aria-label={`Label for ${opt.label}`}
                      />
                      <span className="preference-desc-text">{opt.description}</span>
                    </div>
                  </div>
                  <div className="preference-row-actions">
                    <button
                      type="button"
                      className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                      onClick={() => handleToggleDisabled(opt.id)}
                      aria-pressed={!isDisabled}
                      title={isDisabled ? "Enable this priority" : "Disable this priority"}
                    >
                      {isDisabled ? "Disabled" : "Active"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 3: FOCUS OPTIONS */}
        <section className="preferences-section">
          <div className="preferences-section-kicker">Focus Options</div>
          <p className="preferences-section-desc">
            Timing preferences and persistent pin options that operate independently from priority.
          </p>
          <div className="preferences-list">
            {focusItems.map((opt) => {
              const isDisabled = disabled.includes(opt.id);
              const labelValue = customLabels[opt.id] ?? opt.label;
              return (
                <div key={opt.id} className={`preference-item-row ${isDisabled ? "is-disabled" : ""}`}>
                  <div className="preference-row-main">
                    <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                    <div className="preference-info">
                      <input
                        type="text"
                        className="preference-label-input"
                        value={labelValue}
                        maxLength={30}
                        onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                        placeholder={opt.label}
                        aria-label={`Label for ${opt.label}`}
                      />
                      <span className="preference-desc-text">{opt.description}</span>
                    </div>
                  </div>
                  <div className="preference-row-actions">
                    <button
                      type="button"
                      className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                      onClick={() => handleToggleDisabled(opt.id)}
                      aria-pressed={!isDisabled}
                      title={isDisabled ? "Enable this focus option" : "Disable this focus option"}
                    >
                      {isDisabled ? "Disabled" : "Active"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: CATEGORIES & LABELS */}
        <section className="preferences-section">
          <div className="preferences-section-kicker">Categories & Labels</div>
          <p className="preferences-section-desc">
            Organize personal life tasks and manage custom categories for your workspace.
          </p>
          <div className="preferences-list" style={{ marginBottom: "14px" }}>
            {categoryItems.map((opt) => {
              const isDisabled = disabled.includes(opt.id);
              const labelValue = customLabels[opt.id] ?? opt.label;
              return (
                <div key={opt.id} className={`preference-item-row ${isDisabled ? "is-disabled" : ""}`}>
                  <div className="preference-row-main">
                    <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                    <div className="preference-info">
                      <input
                        type="text"
                        className="preference-label-input"
                        value={labelValue}
                        maxLength={30}
                        onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                        placeholder={opt.label}
                        aria-label={`Label for ${opt.label}`}
                      />
                      <span className="preference-desc-text">{opt.description}</span>
                    </div>
                  </div>
                  <div className="preference-row-actions">
                    <button
                      type="button"
                      className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                      onClick={() => handleToggleDisabled(opt.id)}
                      aria-pressed={!isDisabled}
                      title={isDisabled ? "Enable this category" : "Disable this category"}
                    >
                      {isDisabled ? "Disabled" : "Active"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="label-manager-subgroup" style={{ background: "#fbf9f5", padding: "12px", borderRadius: "8px", border: "1px solid #ded6c7" }}>
            <div className="label-manager-heading" style={{ marginBottom: "8px" }}>
              <strong>Custom Project Labels</strong>
              <button type="button" className="task-action" onClick={onAddLabel}>
                + Add label
              </button>
            </div>
            {labels.length > 0 ? (
              <div className="label-chip-list">
                {labels.map((label) => (
                  <span className="label-management-chip" key={label.id}>
                    {label.name}
                    <button
                      type="button"
                      aria-label={`Delete ${label.name} label`}
                      onClick={() => onDeleteLabel(label.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "11.5px", color: "#78716c", margin: 0 }}>No custom labels created yet.</p>
            )}
          </div>
        </section>

        {/* SECTION 5: INTEGRATIONS → GOOGLE CALENDAR */}
        <GoogleCalendarSettings
          preferences={preferences}
          onSavePreferences={onSavePreferences}
          onSyncNow={onSyncGoogle}
          isSyncing={isSyncingGoogle}
          showToast={showToast}
          onError={onError}
        />

        {/* SECTION 6: FOOTER ACTIONS */}
        <div className="preferences-footer-actions">
          <button
            type="button"
            className="preferences-restore-btn"
            onClick={onRestoreDefaults}
          >
            ↺ Restore Default Options
          </button>
          <button
            type="button"
            className="preferences-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDueDate?: string | null;
  initialDueTime?: string | null;
  initialStatus?: PlannerTask["status"];
  preferences: PlannerPreferences;
  labels: TaskLabel[];
  onAddLabel: (name?: string) => TaskLabel | null;
  writableCalendars?: import("@/lib/google-calendar/types").GoogleCalendarConfig[];
  onSaveTask: (taskData: {
    title: string;
    dueDate: string | null;
    dueTime: string | null;
    status: PlannerTask["status"];
    priority: PlannerTask["priority"];
    isPinned: boolean;
    isPersonal: boolean;
    timingPreference: "scheduled" | "whenever";
    labelIds: string[];
    notes: string;
    location?: string;
    googleCalendarId?: string;
  }) => Promise<boolean>;
}

function AddTaskModal({
  isOpen,
  onClose,
  initialDueDate,
  initialDueTime,
  initialStatus,
  preferences,
  labels,
  onAddLabel,
  writableCalendars = [],
  onSaveTask,
}: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [location, setLocation] = useState("");
  const [selectedCalendarId, setSelectedCalendarId] = useState("none");
  const [status, setStatus] = useState<PlannerTask["status"]>("open");
  const [priority, setPriority] = useState<PlannerTask["priority"]>("none");
  const [isPinned, setIsPinned] = useState(false);
  const [isPersonal, setIsPersonal] = useState(false);
  const [timingPreference, setTimingPreference] = useState<"scheduled" | "whenever">("scheduled");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [taskEmoji, setTaskEmoji] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const isSavingRef = useRef(false);

  // Initialize or reset form whenever modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDueDate(initialDueDate ?? "");
      setDueTime(initialDueTime ?? "");
      setLocation("");
      const defaultCal = preferences.googleCalendarSync?.defaultCalendarId;
      const syncEnabled = preferences.googleCalendarSync?.enabled;
      setSelectedCalendarId(syncEnabled && defaultCal ? defaultCal : "none");
      setStatus(initialStatus ?? "open");
      setPriority(preferences.defaultPriority ?? "none");
      setIsPinned(false);
      setIsPersonal(false);
      setTimingPreference("scheduled");
      setSelectedLabelIds([]);
      setNotes("");
      setTaskEmoji("");
      setShowEmojiPicker(false);
      setIsAddingLabel(false);
      setNewLabelInput("");
      setError("");
      isSavingRef.current = false;
      setIsSaving(false);

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Focus title input
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen, initialDueDate, initialDueTime, initialStatus, preferences.defaultPriority, preferences.googleCalendarSync?.defaultCalendarId, preferences.googleCalendarSync?.enabled]);

  // Close emoji picker on click outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  if (!isOpen) return null;

  const handleToggleLabel = (id: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateLabel = () => {
    const trimmed = newLabelInput.trim();
    if (!trimmed) return;
    const created = onAddLabel(trimmed);
    if (created) {
      setSelectedLabelIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setNewLabelInput("");
      setIsAddingLabel(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    setError("");

    try {
      const success = await onSaveTask({
        title: cleanTitle,
        dueDate: dueDate ? dueDate : null,
        dueTime: dueTime ? dueTime : null,
        status,
        priority,
        isPinned,
        isPersonal,
        timingPreference,
        labelIds: selectedLabelIds,
        notes: notes.trim(),
        location: location.trim() || undefined,
        googleCalendarId: selectedCalendarId !== "none" ? selectedCalendarId : undefined,
      });
      if (success) {
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "This task could not be saved. Please try again.";
      setError(msg);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="modal-card add-task-modal-standard"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add Task"
      >
        {/* 1. Modal header */}
        <div className="add-task-modal-header">
          <h3 className="add-task-modal-title">Add Task</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-task-standard-form">
          {/* 2 & 3. Icon / emoji selector + Task title */}
          <div className="add-task-title-group">
            <div className="add-task-title-input-wrap">
              <div className="emoji-picker-anchor" ref={emojiPickerRef}>
                <button
                  type="button"
                  className="add-task-emoji-trigger"
                  aria-label="Pick task emoji"
                  title="Pick task emoji"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                >
                  {taskEmoji || "🙂"}
                </button>
                {showEmojiPicker && (
                  <div className="emoji-picker-popover">
                    <div className="emoji-grid">
                      {EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          className="emoji-item-btn"
                          onClick={() => {
                            setTaskEmoji(em);
                            setTitle((t) => insertEmoji(em, t));
                            setShowEmojiPicker(false);
                            titleInputRef.current?.focus();
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={titleInputRef}
                className="add-task-title-input"
                placeholder="What needs to be done?"
                maxLength={240}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
                required
              />
            </div>
          </div>

          {/* 4 & 5. Due date & Due time */}
          <div className="add-task-row-two-col">
            <label className="add-task-field-label">
              <span className="add-task-field-title">Due date</span>
              <input
                type="date"
                className="add-task-native-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="add-task-field-label">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="add-task-field-title">Time (optional)</span>
                {dueTime && (
                  <button
                    type="button"
                    onClick={() => setDueTime("")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#e11d48",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                    title="Clear time (make all-day)"
                  >
                    Clear time
                  </button>
                )}
              </div>
              <input
                type="time"
                className="add-task-native-input"
                value={dueTime}
                onChange={(e) => {
                  setDueTime(e.target.value);
                  if (e.target.value && !dueDate) {
                    const now = new Date();
                    setDueDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
                  }
                }}
                disabled={isSaving}
              />
            </label>
          </div>

          {/* Quick Time Presets */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "-4px", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: "#78716c", fontWeight: 600 }}>Quick time:</span>
            {[
              { label: "Morning (9 AM)", val: "09:00" },
              { label: "Noon (12 PM)", val: "12:00" },
              { label: "Afternoon (3 PM)", val: "15:00" },
              { label: "Evening (6 PM)", val: "18:00" },
            ].map((preset) => (
              <button
                key={preset.val}
                type="button"
                onClick={() => {
                  setDueTime(preset.val);
                  if (!dueDate) {
                    const now = new Date();
                    setDueDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
                  }
                }}
                style={{
                  background: dueTime === preset.val ? "#ffd84d" : "#f5efe6",
                  border: "1.5px solid #1c1917",
                  borderRadius: "6px",
                  padding: "2px 7px",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#1c1917",
                  transition: "all 0.15s ease",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Status */}
          <div style={{ marginBottom: "6px" }}>
            <label className="add-task-field-label">
              <span className="add-task-field-title">Status</span>
              <select
                className="add-task-native-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as PlannerTask["status"])}
                disabled={isSaving}
              >
                <option value="open">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Done</option>
              </select>
            </label>
          </div>

          {/* 6. Priority & Organization */}
          <div className="add-task-priority-org-wrapper">
            <TaskPriorityOrgControl
              priority={priority}
              isPinned={isPinned}
              isPersonal={isPersonal}
              timingPreference={timingPreference}
              preferences={preferences}
              onSelectPriority={setPriority}
              onTogglePinned={() => setIsPinned((p) => !p)}
              onTogglePersonal={() => setIsPersonal((c) => !c)}
              onToggleTimingPreference={() =>
                setTimingPreference((t) => (t === "whenever" ? "scheduled" : "whenever"))
              }
            />
          </div>

          {/* 7. Labels */}
          <div className="add-task-labels-section">
            <div className="add-task-labels-header">
              <span className="add-task-field-title">Labels</span>
              {!isAddingLabel && (
                <button
                  type="button"
                  className="add-task-add-label-btn"
                  onClick={() => setIsAddingLabel(true)}
                >
                  <Plus size={12} weight="bold" /> Add label
                </button>
              )}
            </div>

            {isAddingLabel && (
              <div className="add-task-new-label-inline">
                <input
                  type="text"
                  className="add-task-new-label-input"
                  placeholder="New label name…"
                  value={newLabelInput}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setNewLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateLabel();
                    } else if (e.key === "Escape") {
                      setIsAddingLabel(false);
                      setNewLabelInput("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="add-task-new-label-save"
                  onClick={handleCreateLabel}
                  disabled={!newLabelInput.trim()}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="add-task-new-label-cancel"
                  onClick={() => {
                    setIsAddingLabel(false);
                    setNewLabelInput("");
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="add-task-labels-list">
              {labels.length === 0 ? (
                <div className="add-task-no-labels">
                  <span>No labels yet.</span>
                  {!isAddingLabel && (
                    <button
                      type="button"
                      className="add-task-create-first-label"
                      onClick={() => setIsAddingLabel(true)}
                    >
                      Create one
                    </button>
                  )}
                </div>
              ) : (
                labels.map((l) => {
                  const isSelected = selectedLabelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`add-task-label-chip ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleToggleLabel(l.id)}
                      aria-pressed={isSelected}
                    >
                      <span className="add-task-chip-check">{isSelected ? "✓" : "+"}</span>
                      <span className="add-task-chip-text">{l.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 8. Notes */}
          <div className="add-task-notes-section">
            <label className="add-task-field-label">
              <span className="add-task-field-title">Notes (optional)</span>
              <textarea
                className="add-task-notes-textarea"
                placeholder="Add details or a reminder…"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSaving}
              />
            </label>
          </div>

          {/* 9. Location */}
          <div style={{ marginBottom: "10px" }}>
            <label className="add-task-field-label">
              <span className="add-task-field-title">Location (optional)</span>
              <input
                type="text"
                className="add-task-notes-textarea"
                style={{ minHeight: "36px", padding: "6px 10px", resize: "none" }}
                placeholder="Meeting location, video link, or room…"
                maxLength={300}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isSaving}
              />
            </label>
          </div>

          {/* 10. Calendar Destination (Google Calendar Two-Way Sync) */}
          {writableCalendars && writableCalendars.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <label className="add-task-field-label">
                <span className="add-task-field-title">Calendar Destination</span>
                <select
                  className="add-task-native-select"
                  value={selectedCalendarId}
                  onChange={(e) => setSelectedCalendarId(e.target.value)}
                  disabled={isSaving}
                  style={{ width: "100%", padding: "6px 10px", fontSize: "12.5px" }}
                >
                  <option value="none">Planorama (Local Only)</option>
                  {writableCalendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      📅 {cal.name} {cal.accountEmail ? `(${cal.accountEmail})` : ""} {cal.primary ? "· Primary" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Error alert if saving fails */}
          {error && (
            <div className="add-task-error-alert" role="alert">
              {error}
            </div>
          )}

          {/* 9. Create Task button: Green success styling */}
          <button
            type="submit"
            className="add-task-submit-btn"
            disabled={!title.trim() || isSaving}
          >
            <Plus size={18} weight="bold" />
            <span>{isSaving ? "Creating…" : "Create Task"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newPriority, setNewPriority] = useState<PlannerTask["priority"]>("none");
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [newIsPersonal, setNewIsPersonal] = useState(false);
  const [newTimingPreference, setNewTimingPreference] = useState<"scheduled" | "whenever">("scheduled");
  const [newRecurrence, setNewRecurrence] = useState<PlannerTask["recurrence"]>("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editPriority, setEditPriority] = useState<PlannerTask["priority"]>("none");
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editIsPersonal, setEditIsPersonal] = useState(false);
  const [editTimingPreference, setEditTimingPreference] = useState<"scheduled" | "whenever">("scheduled");
  const [editRecurrence, setEditRecurrence] = useState<PlannerTask["recurrence"]>("none");
  const [editStatus, setEditStatus] = useState<PlannerTask["status"]>("open");
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<AppView>("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "completed">("all");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSort, setTaskSort] = useState<"due" | "priority" | "newest">("due");
  const [preferences, setPreferences] = useState<PlannerPreferences>(DEFAULT_PREFERENCES);
  currentPlannerPreferences = preferences;
  const resolvedTheme = useMemo(
    () => getResolvedTheme(preferences.calendarTheme),
    [preferences.calendarTheme]
  );
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkIns, setCheckIns] = useState<HabitCheckIn[]>([]);
  const refreshHabits = useCallback(async () => {
    try {
      const [allHabits, allCheckIns] = await Promise.all([getHabits(), getCheckIns()]);
      setHabits(allHabits);
      setCheckIns(allCheckIns);
    } catch {
      // ignore
    }
  }, []);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [labels, setLabels] = useState<TaskLabel[]>(DEFAULT_LABELS);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [editLabelIds, setEditLabelIds] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState("");
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [newProjectId, setNewProjectId] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [calendarFilter, setCalendarFilter] = useState("");
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);

  // Year view state
  const [yearOffset, setYearOffset] = useState(0);

  // Week anchor date (anchors weekly planner to selected date or current week)
  const [weeklyAnchorDate, setWeeklyAnchorDate] = useState<Date>(() => new Date());

  // Weekly layout mode in weekly planner ("timeline" vs "kanban")
  const [weeklyViewMode, setWeeklyViewMode] = useState<"timeline" | "kanban">("timeline");

  // Ref to weekly planner section for smooth scrolling
  const weeklyPlannerRef = useRef<HTMLElement | null>(null);

  // Ref to unified yearline horizontal scroll container
  const yearlineScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollYearline = (offset: number) => {
    yearlineScrollRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  // Yearline horizontal pan (drag-to-scroll)
  const isPanningRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  // Emoji picker state
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // Unified Add Task modal state
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addTaskDueDate, setAddTaskDueDate] = useState<string | null>(null);
  const [addTaskDueTime, setAddTaskDueTime] = useState<string | null>(null);
  const [addTaskStatus, setAddTaskStatus] = useState<PlannerTask["status"]>("open");

  const openAddTask = useCallback((options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => {
    setAddTaskDueDate(options?.date !== undefined ? options.date : (selectedDate || toDateKey(new Date())));
    setAddTaskDueTime(options?.time ?? null);
    setAddTaskStatus(options?.status ?? "open");
    setAddTaskOpen(true);
  }, [selectedDate]);

  const closeAddTask = useCallback(() => {
    setAddTaskOpen(false);
  }, []);

  // Active view button ref for smooth scroll on mobile navigation
  const activeViewRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (activeViewRef.current) {
      activeViewRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [view]);

  // Task detail modal state
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState("");

  // Kanban drag state
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);

  // Google integration status & sidebar toggle state
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [localCalendarEnabled, setLocalCalendarEnabled] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const today = new Date();
  const shownDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const shownYear = today.getFullYear() + yearOffset;

  // Week view computed values
  const weekDays = useMemo(() => {
    return getWeekDays(weeklyAnchorDate, preferences.weekStartsOn);
  }, [weeklyAnchorDate, preferences.weekStartsOn]);

  const orderedWeekDayNames = useMemo(() => {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return [...names.slice(preferences.weekStartsOn), ...names.slice(0, preferences.weekStartsOn)];
  }, [preferences.weekStartsOn]);

  const orderedMiniDayNames = useMemo(() => {
    return orderedWeekDayNames.map((name) => name[0]);
  }, [orderedWeekDayNames]);

  const todayKey = toDateKey(today);

  // Google Calendar integration helpers
  const activeCalendarConfigs = useMemo(() => {
    return preferences.googleCalendarSync?.calendarConfigs || {};
  }, [preferences.googleCalendarSync?.calendarConfigs]);

  const connectedCalendars = useMemo(() => {
    return Object.values(activeCalendarConfigs).filter((cal) => cal.enabled);
  }, [activeCalendarConfigs]);

  const writableCalendars = useMemo(() => {
    return Object.values(activeCalendarConfigs).filter(
      (cal) => cal.enabled && cal.accessRole !== "reader" && cal.accessRole !== "freeBusyReader"
    );
  }, [activeCalendarConfigs]);

  const activeCalendarCount = useMemo(() => {
    let count = localCalendarEnabled ? 1 : 0;
    count += Object.values(activeCalendarConfigs).filter((cal) => cal.enabled).length;
    return count;
  }, [localCalendarEnabled, activeCalendarConfigs]);

  // Filter tasks based on disabled calendars and user's calendar/client selection
  const displayedTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 0. Exclude local tasks if local planner is toggled off
      if (!localCalendarEnabled && !task.isGoogleEvent && !task.googleCalendarId) {
        return false;
      }
      // 1. Exclude events belonging to calendars that were toggled off in settings or sidebar
      if (task.googleCalendarId && activeCalendarConfigs[task.googleCalendarId]?.enabled === false) {
        return false;
      }
      // 2. Filter by user's calendar selection dropdown
      if (calendarFilter === "__local") {
        return !task.isGoogleEvent && !task.googleCalendarId;
      }
      if (calendarFilter && task.googleCalendarId !== calendarFilter) {
        return false;
      }
      return true;
    });
  }, [tasks, activeCalendarConfigs, calendarFilter, localCalendarEnabled]);

  // Tasks grouped for the weekly kanban board
  const weekDateKeys = useMemo(() => new Set(weekDays.map(toDateKey)), [weekDays]);
  const weekTasksByStatus = useMemo(() => {
    const map: Record<PlannerTask["status"], PlannerTask[]> = { open: [], in_progress: [], completed: [] };
    for (const task of displayedTasks) {
      if (task.dueDate && weekDateKeys.has(task.dueDate)) {
        if (map[task.status]) map[task.status].push(task);
        else map.open.push(task);
      }
    }
    return map;
  }, [displayedTasks, weekDateKeys]);

  const completed = displayedTasks.filter((task) => task.status === "completed").length;
  const visibleTasks = displayedTasks.filter((task) => {
    const matchesDate = !selectedDate || task.dueDate === selectedDate;
    const matchesStatus = taskFilter === "all" || task.status === taskFilter;
    const matchesLabel = !labelFilter || (task.labelIds ?? []).includes(labelFilter);
    const matchesProject = !projectFilter || (projectFilter === "__unassigned" ? !task.projectId : task.projectId === projectFilter);
    const query = taskSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || task.title.toLocaleLowerCase().includes(query) || task.notes.toLocaleLowerCase().includes(query);
    return matchesDate && matchesStatus && matchesSearch && matchesLabel && matchesProject;
  }).sort((a, b) => {
    // Keep pinned tasks easy to find at the top
    const aPinned = a.isPinned ? 1 : 0;
    const bPinned = b.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    if (taskSort === "priority") {
      const priorityOrder: Record<PlannerTask["priority"], number> = { p1: 1, p2: 2, p3: 3, p4: 4, none: 5 };
      return (priorityOrder[a.priority ?? "none"] ?? 5) - (priorityOrder[b.priority ?? "none"] ?? 5) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    }
    if (taskSort === "newest") return b.createdAt.localeCompare(a.createdAt);
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt);
  });

  const isOverdue = (task: PlannerTask) => task.status !== "completed" && Boolean(task.dueDate && task.dueDate < todayKey);
  const nextOccurrenceDate = (dateKey: string, recurrence: PlannerTask["recurrence"]) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (recurrence === "daily") date.setUTCDate(date.getUTCDate() + 1);
    if (recurrence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
    if (recurrence === "monthly") {
      const nextMonth = date.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), nextMonth + 1, 0)).getUTCDate();
      date.setUTCMonth(nextMonth, Math.min(day, lastDay));
    }
    return date.toISOString().slice(0, 10);
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const savedPreferences = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (savedPreferences) {
        const parsed = JSON.parse(savedPreferences) as Partial<PlannerPreferences>;
        const weekStartsOn = [0, 1, 6].includes(parsed.weekStartsOn as number) ? (parsed.weekStartsOn as PlannerPreferences["weekStartsOn"]) : DEFAULT_PREFERENCES.weekStartsOn;
        const defaultSort = ["due", "priority", "newest"].includes(parsed.defaultSort ?? "") ? (parsed.defaultSort as PlannerPreferences["defaultSort"]) : DEFAULT_PREFERENCES.defaultSort;
        const defaultPriority = ["p1", "p2", "p3", "p4", "none"].includes(parsed.defaultPriority ?? "") ? (parsed.defaultPriority as PlannerTask["priority"]) : DEFAULT_PREFERENCES.defaultPriority;
        const disabledOptions = Array.isArray(parsed.disabledOptions) ? (parsed.disabledOptions.filter((opt) => typeof opt === "string") as string[]) : [];
        const customLabels = parsed.customLabels && typeof parsed.customLabels === "object" ? (parsed.customLabels as Record<string, string>) : {};
        const customEmojis = parsed.customEmojis && typeof parsed.customEmojis === "object" ? (parsed.customEmojis as Record<string, string>) : {};
        const nextPreferences: PlannerPreferences = {
          weekStartsOn,
          defaultSort,
          defaultPriority,
          disabledOptions,
          customLabels,
          customEmojis,
          calendarTheme: parsed.calendarTheme && typeof parsed.calendarTheme === "object"
            ? (parsed.calendarTheme as CalendarThemeSettings)
            : DEFAULT_PREFERENCES.calendarTheme,
          dashboardWidgets: resolveDashboardWidgets(parsed.dashboardWidgets),
          googleCalendarSync: parsed.googleCalendarSync && typeof parsed.googleCalendarSync === "object"
            ? (parsed.googleCalendarSync as GoogleCalendarSyncSettings)
            : DEFAULT_PREFERENCES.googleCalendarSync,
        };
        setPreferences(nextPreferences);
        setTaskSort(defaultSort);
        setNewPriority(defaultPriority);
      }
      const savedProjects = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (savedProjects) setProjects(JSON.parse(savedProjects));
      const savedLabels = window.localStorage.getItem(LABEL_STORAGE_KEY);
      if (savedLabels) setLabels(JSON.parse(savedLabels));
      const savedTemplates = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (savedTemplates) setTaskTemplates(JSON.parse(savedTemplates));
    } catch { if (active) setSaveError("Could not load saved organization data on this device."); }
    getTasks().then((saved) => { if (active) setTasks(saved); })
      .catch(() => { if (active) setSaveError("Could not load saved tasks on this device."); })
      .finally(() => { if (active) setLoaded(true); });
    void refreshHabits();
    return () => { active = false; };
  }, [refreshHabits]);

  function savePreferences(next: PlannerPreferences) {
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      currentPlannerPreferences = next;
      setPreferences(next);
      setSaveError("");
    } catch {
      setSaveError("Could not save your planner preferences on this device.");
    }
  }

  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);

  const refreshGoogleStatus = useCallback(async () => {
    try {
      const status = await fetchGoogleIntegrationStatus();
      setGoogleStatus(status);
      if (status.calendars && status.calendars.length > 0) {
        const existingConfigs = preferences.googleCalendarSync?.calendarConfigs || {};
        let changed = false;
        const mergedConfigs = { ...existingConfigs };
        for (const cal of status.calendars) {
          if (!mergedConfigs[cal.id]) {
            mergedConfigs[cal.id] = cal;
            changed = true;
          }
        }
        if (changed) {
          savePreferences({
            ...preferences,
            googleCalendarSync: {
              ...(preferences.googleCalendarSync || DEFAULT_GOOGLE_SYNC_SETTINGS),
              enabled: true,
              calendarConfigs: mergedConfigs,
            },
          });
        }
      }
    } catch {
      // Best effort when offline
    }
  }, [preferences]);

  useEffect(() => {
    void refreshGoogleStatus();
  }, [refreshGoogleStatus]);

  const handleToggleCalendar = useCallback((calendarId: string) => {
    const currentSync = preferences.googleCalendarSync || DEFAULT_GOOGLE_SYNC_SETTINGS;
    const currentConfig = currentSync.calendarConfigs[calendarId];
    if (currentConfig) {
      const nextConfigs = {
        ...currentSync.calendarConfigs,
        [calendarId]: {
          ...currentConfig,
          enabled: !currentConfig.enabled,
        },
      };
      savePreferences({
        ...preferences,
        googleCalendarSync: {
          ...currentSync,
          calendarConfigs: nextConfigs,
        },
      });
    } else if (googleStatus?.calendars) {
      const found = googleStatus.calendars.find((c) => c.id === calendarId);
      if (found) {
        const nextConfigs = {
          ...currentSync.calendarConfigs,
          [calendarId]: {
            ...found,
            enabled: false,
          },
        };
        savePreferences({
          ...preferences,
          googleCalendarSync: {
            ...currentSync,
            calendarConfigs: nextConfigs,
          },
        });
      }
    }
  }, [preferences, googleStatus]);

  const handleConnectGoogle = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const handleSyncGoogle = useCallback(async () => {
    setIsSyncingGoogle(true);
    try {
      const syncSettings = preferences.googleCalendarSync ?? DEFAULT_GOOGLE_SYNC_SETTINGS;
      const { updatedTasks, result } = await executeTwoWaySync(tasks, syncSettings);

      // Persist changes to local database
      for (const t of updatedTasks) {
        await updateTask(t);
      }

      // If any imported Google events were deleted on Google, clean them up from local store
      const updatedIds = new Set(updatedTasks.map((t) => t.id));
      for (const t of tasks) {
        if (!updatedIds.has(t.id)) {
          await removeTask(t.id);
        }
      }

      setTasks(updatedTasks);

      const nextSyncSettings = {
        ...syncSettings,
        lastSyncTime: result.lastSyncTime,
        lastSyncStatus: (result.errors.length > 0 ? "error" : "success") as "error" | "success",
        lastSyncError: result.errors.length > 0 ? result.errors[0] : undefined,
      };

      savePreferences({
        ...preferences,
        googleCalendarSync: nextSyncSettings,
      });

      const totalChanges = result.importedCount + result.updatedCount + result.exportedCount;
      if (result.errors.length > 0) {
        showToast(`Sync completed with ${result.errors.length} notice(s).`);
      } else if (totalChanges > 0) {
        showToast(`Google Calendar synced! (${result.importedCount} imported, ${result.exportedCount} exported)`);
      } else {
        showToast("Google Calendar is up to date.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed.";
      setSaveError(msg);
      showToast(`Sync error: ${msg}`);
    } finally {
      setIsSyncingGoogle(false);
      void refreshGoogleStatus();
    }
  }, [preferences, tasks, showToast, refreshGoogleStatus]);

  // Check for Google OAuth callback parameters in URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view") as AppView | null;
    if (viewParam && NAV_VIEWS.some((v) => v.id === viewParam)) {
      setView(viewParam);
    }
    const gcalStatus = params.get("gcal_status");
    const gcalError = params.get("gcal_error");

    if (gcalStatus === "connected") {
      const gcalAccount = params.get("gcal_account");
      showToast(gcalAccount ? `Google account "${gcalAccount}" connected!` : "Google Calendar connected successfully!");
      const url = new URL(window.location.href);
      url.searchParams.delete("gcal_status");
      url.searchParams.delete("gcal_account");
      window.history.replaceState({}, "", url.pathname + url.search);
      // Automatically trigger initial synchronization
      void handleSyncGoogle();
    } else if (gcalError) {
      setSaveError(`Google Calendar connection failed: ${decodeURIComponent(gcalError)}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("gcal_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [handleSyncGoogle, showToast]);

  // Listen for online recovery to sync queued changes
  useEffect(() => {
    function handleOnline() {
      if (preferences.googleCalendarSync?.enabled) {
        void handleSyncGoogle();
      }
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [handleSyncGoogle, preferences.googleCalendarSync?.enabled]);

  // Periodic background sync every 10 minutes if enabled and window is focused
  useEffect(() => {
    if (!preferences.googleCalendarSync?.enabled) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void handleSyncGoogle();
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [handleSyncGoogle, preferences.googleCalendarSync?.enabled]);

  function saveAsTemplate(task: PlannerTask) {
    const name = window.prompt("Name this template", task.title);
    if (!name?.trim()) return;
    const template: TaskTemplate = {
      id: generateId(),
      name: name.trim().slice(0, 80),
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      recurrence: task.recurrence ?? "none",
    };
    const next = [...taskTemplates, template];
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      setTaskTemplates(next);
      setSaveError("");
    } catch {
      setSaveError("Could not save the template on this device.");
    }
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = taskTemplates.find((item) => item.id === templateId);
    if (!template) {
      setNewTask("");
      setNewNotes("");
      setNewPriority("none");
      setNewRecurrence("none");
      setNewProjectId("");
      setSelectedLabelIds([]);
      setSelectedTemplateId("");
      setSaveError("");
      return;
    }
    setNewTask(template.title);
    setNewNotes(template.notes);
    setNewPriority(template.priority);
    setNewRecurrence(template.recurrence);
    setSaveError("");
  }

  function deleteTemplate(templateId: string) {
    const next = taskTemplates.filter((item) => item.id !== templateId);
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      setTaskTemplates(next);
      if (selectedTemplateId === templateId) setSelectedTemplateId("");
      setSaveError("");
    } catch {
      setSaveError("Could not update saved templates.");
    }
  }

  function toggleLabel(labelId: string, editing = false) {
    const setter = editing ? setEditLabelIds : setSelectedLabelIds;
    setter((current) => current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]);
  }

  function addLabel(customName?: string): TaskLabel | null {
    const name = customName !== undefined ? customName : window.prompt("Name your new label");
    const trimmed = name?.trim();
    if (!trimmed) return null;
    if (labels.some((label) => label.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setSaveError("A label with that name already exists.");
      return null;
    }
    const label: TaskLabel = { id: generateId(), name: trimmed.slice(0, 40) };
    const next = [...labels, label];
    try {
      window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(next));
      setLabels(next);
      setSaveError("");
      return label;
    } catch {
      setSaveError("Could not save this label on your device.");
      return null;
    }
  }

  async function deleteLabel(labelId: string) {
    const label = labels.find((item) => item.id === labelId);
    if (!label || !window.confirm(`Delete the "${label.name}" label? Tasks will keep their other labels.`)) return;
    const nextLabels = labels.filter((item) => item.id !== labelId);
    const affected = tasks.filter((task) => task.labelIds.includes(labelId));
    const updatedTasks = affected.map((task) => ({ ...task, labelIds: task.labelIds.filter((id) => id !== labelId) }));
    try {
      await Promise.all(updatedTasks.map((task) => updateTask(task)));
      window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(nextLabels));
      setLabels(nextLabels);
      setSelectedLabelIds((current) => current.filter((id) => id !== labelId));
      setEditLabelIds((current) => current.filter((id) => id !== labelId));
      if (labelFilter === labelId) setLabelFilter("");
      setTasks((current) => current.map((task) => updatedTasks.find((updated) => updated.id === task.id) ?? task));
      setSaveError("");
    } catch {
      setSaveError("Could not delete this label from every task. Please try again.");
    }
  }

  async function exportBackup() {
    try {
      const [habitsData, checkInsData] = await Promise.all([getHabits(), getCheckIns()]);
      const backup = {
        format: "planorama-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        tasks,
        labels,
        projects,
        templates: taskTemplates,
        preferences,
        habits: habitsData,
        habitCheckIns: checkInsData,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `planorama-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveError("");
    } catch {
      setSaveError("Could not export your backup. Please try again.");
    }
  }

  async function importBackup(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup.");
      const backup = parsed as Record<string, unknown>;
      if (backup.format !== "planorama-backup" || backup.version !== 1 || !Array.isArray(backup.tasks)) {
        throw new Error("This file is not a supported Planorama backup.");
      }

      const importedTasks = backup.tasks.map(validateTask);
      const taskIds = importedTasks.map((task) => task.id);
      if (new Set(taskIds).size !== taskIds.length) throw new Error("The backup contains duplicate task IDs.");

      const isValidNamedItems = (value: unknown): value is { id: string; name: string }[] =>
        Array.isArray(value) && value.every((item) =>
          item && typeof item.id === "string" && item.id.trim().length > 0 &&
          typeof item.name === "string" && item.name.trim().length > 0);
      const hasUniqueNamedItems = (items: { id: string; name: string }[]) =>
        new Set(items.map((item) => item.id)).size === items.length &&
        new Set(items.map((item) => item.name.trim().toLocaleLowerCase())).size === items.length;

      const importedLabels = backup.labels === undefined ? labels : backup.labels;
      const importedProjects = backup.projects === undefined ? projects : backup.projects;
      const importedTemplates = backup.templates === undefined ? taskTemplates : backup.templates;
      const importedPreferences = backup.preferences && typeof backup.preferences === "object" ? backup.preferences as Partial<PlannerPreferences> : preferences;
      const restoredPreferences: PlannerPreferences = {
        weekStartsOn: [0, 1, 6].includes(importedPreferences.weekStartsOn as number) ? (importedPreferences.weekStartsOn as PlannerPreferences["weekStartsOn"]) : preferences.weekStartsOn,
        defaultSort: ["due", "priority", "newest"].includes(importedPreferences.defaultSort ?? "") ? (importedPreferences.defaultSort as PlannerPreferences["defaultSort"]) : preferences.defaultSort,
        defaultPriority: ["p1", "p2", "p3", "p4", "none"].includes(importedPreferences.defaultPriority ?? "") ? (importedPreferences.defaultPriority as PlannerTask["priority"]) : (preferences.defaultPriority ?? "none"),
        disabledOptions: Array.isArray(importedPreferences.disabledOptions) ? (importedPreferences.disabledOptions.filter((opt) => typeof opt === "string") as string[]) : (preferences.disabledOptions ?? []),
        customLabels: importedPreferences.customLabels && typeof importedPreferences.customLabels === "object" ? (importedPreferences.customLabels as Record<string, string>) : (preferences.customLabels ?? {}),
        customEmojis: importedPreferences.customEmojis && typeof importedPreferences.customEmojis === "object" ? (importedPreferences.customEmojis as Record<string, string>) : (preferences.customEmojis ?? {}),
        calendarTheme: importedPreferences.calendarTheme && typeof importedPreferences.calendarTheme === "object" ? (importedPreferences.calendarTheme as CalendarThemeSettings) : preferences.calendarTheme,
        dashboardWidgets: resolveDashboardWidgets(importedPreferences.dashboardWidgets ?? preferences.dashboardWidgets),
      };

      const validTemplates = Array.isArray(importedTemplates) && importedTemplates.every((item) =>
        item && typeof item.id === "string" && item.id.trim().length > 0 &&
        typeof item.name === "string" && item.name.trim().length > 0 &&
        typeof item.title === "string" && item.title.trim().length > 0 &&
        typeof item.notes === "string" &&
        ["p1", "p2", "p3", "p4"].includes(item.priority) &&
        ["none", "daily", "weekly", "monthly"].includes(item.recurrence));
      if (!isValidNamedItems(importedLabels) || !hasUniqueNamedItems(importedLabels) ||
          !isValidNamedItems(importedProjects) || !hasUniqueNamedItems(importedProjects) ||
          !validTemplates || !hasUniqueNamedItems(importedTemplates)) {
        throw new Error("The backup contains invalid or duplicate labels, projects, or templates.");
      }

      // Since unrelated tasks are intentionally retained, do not replace local
      // label/project definitions they may still reference. Merge by ID and
      // reject name collisions across different IDs rather than creating orphans.
      const mergeNamedItems = <T extends { id: string; name: string }>(current: T[], incoming: T[]): T[] => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of incoming) byId.set(item.id, item);
        const merged = [...byId.values()];
        const names = new Map<string, string>();
        for (const item of merged) {
          const normalized = item.name.trim().toLocaleLowerCase();
          const existingId = names.get(normalized);
          if (existingId && existingId !== item.id) {
            throw new Error(`Cannot import because "${item.name}" already exists with a different ID. Rename the conflicting item in one backup and try again.`);
          }
          names.set(normalized, item.id);
        }
        return merged;
      };
      const mergedLabels = mergeNamedItems(labels, importedLabels);
      const mergedProjects = mergeNamedItems(projects, importedProjects);
      const mergedTemplates = mergeNamedItems(taskTemplates, importedTemplates);

      if (!window.confirm(`Import ${importedTasks.length} tasks? Existing tasks with matching IDs will be updated; other tasks will be kept.`)) return;

      // Snapshot current state so a failed import can restore task records and local settings.
      const previousTasks = await getTasks();
      const previousHabits = await getHabits();
      const previousCheckIns = await getCheckIns();
      const storageKeys = [LABEL_STORAGE_KEY, PROJECT_STORAGE_KEY, TEMPLATE_STORAGE_KEY, PREFERENCES_STORAGE_KEY];
      const previousStorage = storageKeys.map((key) => [key, window.localStorage.getItem(key)] as const);
      try {
        for (const task of importedTasks) await updateTask(task);
        if (Array.isArray(backup.habits)) {
          writeHabitsToStorage(backup.habits as Habit[]);
        }
        if (Array.isArray(backup.habitCheckIns)) {
          writeCheckInsToStorage(backup.habitCheckIns as HabitCheckIn[]);
        }
        window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(mergedLabels));
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(mergedProjects));
        window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(mergedTemplates));
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(restoredPreferences));
      } catch (error) {
        // Best-effort rollback if storage or task persistence fails partway through.
        writeHabitsToStorage(previousHabits);
        writeCheckInsToStorage(previousCheckIns);
        const previousIds = new Set(previousTasks.map((task) => task.id));
        for (const task of importedTasks) {
          try {
            if (previousIds.has(task.id)) {
              const previous = previousTasks.find((item) => item.id === task.id);
              if (previous) await updateTask(previous);
            } else {
              await removeTask(task.id);
            }
          } catch { /* Preserve the original import error; report it below. */ }
        }
        for (const [key, value] of previousStorage) {
          try {
            if (value === null) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, value);
          } catch { /* Best-effort restoration when browser storage is unavailable. */ }
        }
        throw error;
      }

      setTasks(await getTasks());
      setLabels(mergedLabels as TaskLabel[]);
      setProjects(mergedProjects as TaskProject[]);
      setTaskTemplates(mergedTemplates as TaskTemplate[]);
      setPreferences(restoredPreferences);
      setTaskSort(restoredPreferences.defaultSort);
      setSelectedLabelIds([]);
      setEditLabelIds([]);
      setLabelFilter("");
      setProjectFilter("");
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error && error.message !== "Invalid backup." ? error.message : "Could not import this backup. Check that it is a valid Planorama JSON file.");
    }
  }

  function addProject() {
    const name = window.prompt("Name your project");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (projects.some((project) => project.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) { setSaveError("A project with that name already exists."); return; }
    const next = [...projects, { id: generateId(), name: trimmed.slice(0, 60) }];
    try { window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next)); setProjects(next); setSaveError(""); }
    catch { setSaveError("Could not save this project on your device."); }
  }

  async function deleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project || !window.confirm(`Delete the "${project.name}" project? Its tasks will remain, but become unassigned.`)) return;
    const updatedTasks = tasks.filter((task) => task.projectId === projectId).map((task) => ({ ...task, projectId: null }));
    const nextProjects = projects.filter((item) => item.id !== projectId);
    try {
      await Promise.all(updatedTasks.map((task) => updateTask(task)));
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextProjects));
      setProjects(nextProjects);
      setTasks((current) => current.map((task) => updatedTasks.find((updated) => updated.id === task.id) ?? task));
      if (newProjectId === projectId) setNewProjectId("");
      if (editProjectId === projectId) setEditProjectId("");
      if (projectFilter === projectId) setProjectFilter("");
      setSaveError("");
    } catch { setSaveError("Could not remove this project from every task. Please try again."); }
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    if (newRecurrence !== "none" && !newDueDate) { setSaveError("Choose a due date for a recurring task."); return; }
    try {
      const task = await createTask({
        title,
        notes: newNotes.trim(),
        dueDate: newDueDate || null,
        dueTime: newDueTime || null,
        priority: newPriority,
        isPinned: newIsPinned,
        isPersonal: newIsPersonal,
        timingPreference: newTimingPreference,
        recurrence: newRecurrence,
        labelIds: selectedLabelIds,
        projectId: newProjectId || null,
      });
      setTasks((current) => [...current, task]);
      setNewTask("");
      setNewNotes("");
      setNewDueDate("");
      setNewDueTime("");
      setNewPriority(preferences.defaultPriority ?? "none");
      setNewIsPinned(false);
      setNewIsPersonal(false);
      setNewTimingPreference("scheduled");
      setNewRecurrence("none");
      setSaveError("");
      showToast("Task created!");
    } catch {
      setSaveError("This task could not be saved. Please try again.");
    }
  }

  const handleSaveNewTask = async (taskData: {
    title: string;
    dueDate: string | null;
    dueTime: string | null;
    status: PlannerTask["status"];
    priority: PlannerTask["priority"];
    isPinned: boolean;
    isPersonal: boolean;
    timingPreference: "scheduled" | "whenever";
    labelIds: string[];
    notes: string;
    location?: string;
    googleCalendarId?: string;
  }): Promise<boolean> => {
    const targetCalendar = taskData.googleCalendarId
      ? preferences.googleCalendarSync?.calendarConfigs[taskData.googleCalendarId]
      : undefined;
    const task = await createTask({
      title: taskData.title,
      dueDate: taskData.dueDate,
      dueTime: taskData.dueTime,
      status: taskData.status,
      priority: taskData.priority,
      isPinned: taskData.isPinned,
      isPersonal: taskData.isPersonal,
      timingPreference: taskData.timingPreference,
      labelIds: taskData.labelIds,
      notes: taskData.notes,
      location: taskData.location?.trim() || undefined,
      googleCalendarId: taskData.googleCalendarId,
      googleCalendarName: targetCalendar?.name,
      googleCalendarColor: targetCalendar?.color,
      googleAccountId: targetCalendar?.accountId,
      googleAccountEmail: targetCalendar?.accountEmail,
      source: taskData.googleCalendarId ? "google" : "local",
      syncStatus: taskData.googleCalendarId ? "pending" : undefined,
    });
    setTasks((current) => [...current, task]);
    if (taskData.googleCalendarId && task.dueDate) {
      void handleSyncGoogle();
    }
    showToast("Task created!");
    return true;
  };

  function handleRestoreDefaultPreferences() {
    savePreferences(DEFAULT_PREFERENCES);
    setNewPriority(DEFAULT_PREFERENCES.defaultPriority);
    showToast("Preferences restored to default options.");
  }

  function prevWeek() {
    setWeeklyAnchorDate((curr) => {
      const d = new Date(curr);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeeklyAnchorDate((curr) => {
      const d = new Date(curr);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function todayWeek() {
    setWeeklyAnchorDate(new Date());
    setSelectedDate(todayKey);
  }

  const formatWeekRange = (days: Date[]) => {
    if (days.length === 0) return "";
    const start = days[0];
    const end = days[6];
    const startMonth = start.toLocaleDateString("en", { month: "short" });
    const endMonth = end.toLocaleDateString("en", { month: "short" });
    if (start.getFullYear() === end.getFullYear()) {
      if (start.getMonth() === end.getMonth()) {
        return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  };

  function handleSelectYearDate(dateKey: string) {
    setSelectedDate(dateKey);
    setNewDueDate(dateKey);
    const [y, m, d] = dateKey.split("-").map(Number);
    setWeeklyAnchorDate(new Date(y, m - 1, d));
    if (view === "yearline") {
      handleSelectYearlineDate(dateKey);
    } else {
      setTimeout(() => {
        weeklyPlannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    }
  }

  function handleSelectYearlineDate(dateKey: string) {
    setSelectedDate(dateKey);
    setNewDueDate(dateKey);
    const [y, m, d] = dateKey.split("-").map(Number);
    setWeeklyAnchorDate(new Date(y, m - 1, d));
    const cell = document.getElementById(`yearline-cell-${dateKey}`);
    if (cell) {
      cell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  const handleYearChange = (deltaOrTarget: number | "current") => {
    setYearOffset((curr) => {
      const newOffset = deltaOrTarget === "current" ? 0 : curr + deltaOrTarget;
      const newYear = today.getFullYear() + newOffset;
      if (selectedDate) {
        const [, m, d] = selectedDate.split("-");
        const maxD = daysInMonth(newYear, Number(m) - 1);
        const clampedD = Math.min(Number(d), maxD);
        setSelectedDate(`${newYear}-${m}-${String(clampedD).padStart(2, "0")}`);
      }
      return newOffset;
    });
  };

  const formatFullDateDisplay = (dateKey: string) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  };

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerFor) return;
    function handleEmojiOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleEmojiOutside);
    return () => document.removeEventListener("mousedown", handleEmojiOutside);
  }, [emojiPickerFor]);

  // Yearline horizontal pan (drag-to-scroll)
  useEffect(() => {
    if (!isPanning) return;

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const container = yearlineScrollRef.current;
      if (!container) return;

      const deltaX = e.clientX - startXRef.current;
      if (Math.abs(deltaX) > 4) {
        hasDraggedRef.current = true;
      }

      if (hasDraggedRef.current) {
        e.preventDefault();
        container.scrollLeft = scrollLeftRef.current - deltaX;
      }
    };

    const onWindowMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        setTimeout(() => {
          hasDraggedRef.current = false;
        }, 60);
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove, { passive: false });
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("blur", onWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("blur", onWindowMouseUp);
    };
  }, [isPanning]);

  const handleYearlineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "input, select, textarea, form, .yearline-task-item, .yearline-inline-form, .yearline-cell-add-btn"
      )
    ) {
      return;
    }

    const container = yearlineScrollRef.current;
    if (!container) return;

    isPanningRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftRef.current = container.scrollLeft;
    setIsPanning(true);
  };


  function beginEdit(task: PlannerTask) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditNotes(task.notes);
    setEditLocation(task.location ?? "");
    setEditDueDate(task.dueDate ?? "");
    setEditDueTime(task.dueTime ?? "");
    setEditPriority(task.priority ?? "none");
    setEditIsPinned(Boolean(task.isPinned));
    setEditIsPersonal(Boolean(task.isPersonal));
    setEditTimingPreference(task.timingPreference ?? "scheduled");
    setEditRecurrence(task.recurrence ?? "none");
    setEditLabelIds(task.labelIds ?? []);
    setEditProjectId(task.projectId ?? "");
    setEditStatus(task.status);
    setSaveError("");
  }

  function openTaskDetail(task: PlannerTask) {
    setDetailTaskId(task.id);
    beginEdit(task);
  }

  async function saveEdit(task: PlannerTask) {
    const title = editTitle.trim();
    if (!title) {
      setSaveError("A task title is required.");
      return;
    }
    const updated: PlannerTask = {
      ...task,
      title,
      notes: editNotes.trim(),
      location: editLocation.trim() || undefined,
      dueDate: editDueDate || null,
      dueTime: editDueTime || null,
      priority: editPriority,
      isPinned: editIsPinned,
      isPersonal: editIsPersonal,
      timingPreference: editTimingPreference,
      recurrence: editRecurrence,
      labelIds: editLabelIds,
      projectId: editProjectId || null,
      status: editStatus,
      syncStatus: (task.googleEventId && !task.isReadOnlyCalendar) ? "pending" : task.syncStatus,
    };
    if (updated.recurrence !== "none" && !updated.dueDate) { setSaveError("Choose a due date for a recurring task."); return; }
    try {
      const saved = await updateTask(updated);
      setTasks((current) => current.map((item) => item.id === task.id ? saved : item));
      setEditingId(null);
      setDetailTaskId(null);
      setSaveError("");
      showToast("Task updated!");

      if (saved.googleEventId && !saved.isReadOnlyCalendar) {
        enqueueSyncAction({
          action: "update",
          taskId: saved.id,
          googleEventId: saved.googleEventId,
          googleCalendarId: saved.googleCalendarId,
          googleAccountId: saved.googleAccountId,
          localUpdatedAt: new Date().toISOString(),
        });
        void handleSyncGoogle();
      }
    } catch {
      setSaveError("Your edit could not be saved. Please try again.");
    }
  }

  async function toggleTask(task: PlannerTask) {
    const updated = { ...task, status: task.status === "completed" ? "open" as const : "completed" as const };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    try {
      await updateTask(updated);
      if (updated.status === "completed" && task.status !== "completed" && updated.recurrence !== "none" && updated.dueDate) {
        const nextDueDate = nextOccurrenceDate(updated.dueDate, updated.recurrence);
        const alreadyExists = tasks.some((item) => item.id !== updated.id && item.title === updated.title && item.dueDate === nextDueDate && item.recurrence === updated.recurrence);
        if (!alreadyExists) {
          const nextTask = await createTask({
            title: updated.title,
            notes: updated.notes,
            priority: updated.priority,
            isPinned: updated.isPinned,
            isPersonal: updated.isPersonal,
            timingPreference: updated.timingPreference,
            dueDate: nextDueDate,
            recurrence: updated.recurrence,
            projectId: updated.projectId,
            labelIds: updated.labelIds,
            dueTime: updated.dueTime,
          });
          setTasks((current) => [...current, nextTask]);
        }
      }
      setSaveError("");
    } catch {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item));
      setSaveError("Your change could not be saved.");
    }
  }

  async function moveTaskToStatus(taskId: string, newStatus: PlannerTask["status"]) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const updated = { ...task, status: newStatus };
    setTasks((current) => current.map((item) => item.id === taskId ? updated : item));
    try {
      await updateTask(updated);
      setSaveError("");
    } catch {
      setTasks((current) => current.map((item) => item.id === taskId ? task : item));
      setSaveError("Could not update task status.");
    }
  }

  async function deleteTask(task: PlannerTask) {
    if (task.isReadOnlyCalendar) {
      if (!window.confirm(`"${task.title}" is from a read-only client calendar. Deleting it will remove it from your Planorama view, but will not delete it from Google Calendar. Proceed?`)) {
        return;
      }
    } else if (task.isGoogleEvent || task.googleEventId) {
      const deleteOnGoogle = preferences.googleCalendarSync?.deleteGoogleEventOnTaskDelete;
      const promptMsg = deleteOnGoogle
        ? `Delete "${task.title}"? This task is synced with Google Calendar and will also be deleted from Google Calendar.`
        : `Delete "${task.title}"? This will remove it from Planorama. (Google Calendar event is preserved because deletion protection is enabled).`;
      if (!window.confirm(promptMsg)) return;
    } else {
      if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    }

    try {
      await removeTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (editingId === task.id) setEditingId(null);
      if (detailTaskId === task.id) setDetailTaskId(null);
      setSaveError("");

      if (task.isReadOnlyCalendar) {
        if (task.googleEventId) {
          recordDeletedGoogleEventId(task.googleEventId, task.googleCalendarId, task.googleAccountId);
        }
      } else if (task.isGoogleEvent || task.googleEventId) {
        const deleteOnGoogle = preferences.googleCalendarSync?.deleteGoogleEventOnTaskDelete;
        if (task.googleEventId) {
          recordDeletedGoogleEventId(task.googleEventId, task.googleCalendarId, task.googleAccountId);
        }
        if (deleteOnGoogle && task.googleEventId && task.googleCalendarId) {
          enqueueSyncAction({
            action: "delete",
            taskId: task.id,
            googleEventId: task.googleEventId,
            googleCalendarId: task.googleCalendarId,
            googleAccountId: task.googleAccountId,
            localUpdatedAt: new Date().toISOString(),
          });
          void handleSyncGoogle();
        }
      }
    } catch {
      setSaveError("This task could not be deleted. Please try again.");
    }
  }

  // Kanban helpers
  const kanbanColumns: { key: PlannerTask["status"]; label: string }[] = [
    { key: "open", label: "To Do" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Done" },
  ];
  const tasksByStatus = useMemo(() => {
    const map: Record<PlannerTask["status"], PlannerTask[]> = { open: [], in_progress: [], completed: [] };
    for (const task of displayedTasks) {
      if (map[task.status]) map[task.status].push(task);
      else map.open.push(task); // fallback
    }
    return map;
  }, [displayedTasks]);

  // Detail task lookup
  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null;

  // Memoized tasks by due date for O(1) annual grid lookups
  const tasksByDueDate = useMemo(() => {
    const map: Record<string, PlannerTask[]> = {};
    for (const t of displayedTasks) {
      if (t.dueDate) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    }
    return map;
  }, [displayedTasks]);

  const renderYearlineView = () => {
    const yearTasksCount = displayedTasks.filter((t) => t.dueDate?.startsWith(`${shownYear}-`)).length;
    const yearCompletedCount = displayedTasks.filter((t) => t.dueDate?.startsWith(`${shownYear}-`) && t.status === "completed").length;

    return (
      <section className="yearline-unified-card neo-card" id="yearline-view">
        <div className="card-header">
          <div>
            <span className="section-kicker">UNIFIED ANNUAL PLANNER · ALL 12 MONTHS</span>
            <h2>{shownYear} Yearline</h2>
          </div>
          <div className="calendar-actions">
            <div className="yearline-nav-controls">
              <button
                type="button"
                className="yearline-scroll-btn"
                aria-label="Scroll left"
                title="Scroll left"
                onClick={() => scrollYearline(-480)}
              >
                ◀
              </button>
              <button
                type="button"
                className="yearline-scroll-btn"
                aria-label="Scroll right"
                title="Scroll right"
                onClick={() => scrollYearline(480)}
              >
                ▶
              </button>
            </div>
            <button type="button" className="icon-button" aria-label="Previous year" onClick={() => handleYearChange(-1)}>←</button>
            <button type="button" className="icon-button today-btn" onClick={() => handleYearChange("current")}>This Year</button>
            <button type="button" className="icon-button" aria-label="Next year" onClick={() => handleYearChange(1)}>→</button>
          </div>
        </div>

        <div className="yearline-summary-bar">
          <div className="yearline-stats">
            <span className="yearline-stat-badge">
              {yearTasksCount} task{yearTasksCount === 1 ? "" : "s"} scheduled in {shownYear}
            </span>
            {yearTasksCount > 0 && (
              <span className="yearline-stat-badge">
                {yearCompletedCount} completed ({Math.round((yearCompletedCount / yearTasksCount) * 100)}%)
              </span>
            )}
            {selectedDate && (
              <span className="yearline-selected-pill">
                Selected: {formatFullDateDisplay(selectedDate)}
              </span>
            )}
          </div>
          <div className="yearline-legend-chips">
            <span className="legend-chip weekend" title="Saturday & Sunday"><span className="legend-chip-box weekend" /> Weekend</span>
            <span className="legend-chip active" title="Date with 1 scheduled task"><span className="legend-chip-box active" /> Active</span>
            <span className="legend-chip busy" title="Date with multiple scheduled tasks"><span className="legend-chip-box busy" /> Busy (2+)</span>
            <span className="legend-chip today" title="Current date"><span className="legend-chip-box today" /> Today</span>
          </div>
          {selectedDate && (
            <div className="yearline-quick-actions">
              <button
                type="button"
                className="clear-date-button"
                onClick={() => { setSelectedDate(null); }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        {/* Mobile Horizontal Scroll Cue Banner */}
        <div className="yearline-mobile-scroll-cue" aria-hidden="true">
          <span>⟵ Swipe horizontally to explore all 12 months ⟶</span>
        </div>

        <div
          className={`yearline-scroll-container ${isPanning ? "is-panning" : ""}`}
          ref={yearlineScrollRef}
          onMouseDown={handleYearlineMouseDown}
        >
          <div className="yearline-unified-grid">
            {/* 12 Independent Month Columns */}
            {Array.from({ length: 12 }, (_, mIdx) => {
              const color = getMonthColor(resolvedTheme, mIdx);
              const isTileMode = resolvedTheme.mode === "tiles";
              const maxDays = daysInMonth(shownYear, mIdx);
              const monthTasks = displayedTasks.filter((t) => t.dueDate?.startsWith(`${shownYear}-${String(mIdx + 1).padStart(2, "0")}-`));
              const monthTasksCount = monthTasks.length;
              const activeDaysCount = new Set(monthTasks.map((t) => t.dueDate)).size;
              const isBusyMonth = monthTasksCount >= 8;
              const isModerateMonth = monthTasksCount >= 4 && monthTasksCount < 8;
              const isLightMonth = monthTasksCount >= 1 && monthTasksCount < 4;
              const isQuietMonth = monthTasksCount === 0;
              const gridDays = monthGridDays(shownYear, mIdx, preferences.weekStartsOn);

              return (
                <div
                  key={`month-col-${mIdx}`}
                  className={`yearline-month-column ${isTileMode ? "is-tile-tinted" : ""}`}
                  style={isTileMode ? { backgroundColor: color.tileBg, borderColor: color.border } : undefined}
                >
                  {/* Month Name Header */}
                  <div
                    className="yearline-month-header"
                    style={{
                      backgroundColor: color.bg,
                      borderBottomColor: color.border,
                    }}
                  >
                    <div className="yearline-month-header-content">
                      <div className="yearline-month-title-wrap">
                        <span className="yearline-month-name" style={{ color: color.text }}>
                          {MONTH_NAMES[mIdx]}
                        </span>
                        <span className="yearline-month-num" style={{ color: color.text }}>
                          {String(mIdx + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="yearline-month-badge-wrap">
                        {isQuietMonth ? (
                          <span className="yearline-month-count is-empty" title="Quiet month: 0 tasks">
                            0
                          </span>
                        ) : (
                          <span
                            className={`yearline-month-count ${isBusyMonth ? "is-busy" : isModerateMonth ? "is-moderate" : "is-active"}`}
                            title={`${monthTasksCount} task${monthTasksCount === 1 ? "" : "s"} (${activeDaysCount} active day${activeDaysCount === 1 ? "" : "s"})`}
                          >
                            {monthTasksCount} {monthTasksCount === 1 ? "task" : "tasks"}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Activity density bar */}
                    <div className="yearline-month-density-track" title={`${monthTasksCount} task${monthTasksCount === 1 ? "" : "s"} in ${MONTH_NAMES[mIdx]}`}>
                      <div
                        className={`yearline-month-density-bar ${isBusyMonth ? "is-busy" : isModerateMonth ? "is-moderate" : isLightMonth ? "is-active" : "is-empty"}`}
                        style={{
                          width: isQuietMonth ? "0%" : `${Math.min(100, Math.max(12, Math.round((monthTasksCount / 10) * 100)))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Compact Mini-Calendar */}
                  <div className="yearline-mini-cal-cell">
                    <div className="yearline-mini-weekdays">
                      {orderedWeekDayNames.map((w, idx) => {
                        const isWeekendDay = w === "Sun" || w === "Sat";
                        return (
                          <span key={idx} className={`yearline-mini-weekday ${isWeekendDay ? "is-weekend" : ""}`}>
                            {w[0]}
                          </span>
                        );
                      })}
                    </div>
                    <div className="yearline-mini-grid">
                      {gridDays.map((dayNum, cellIndex) => {
                        if (!dayNum) {
                          return <div key={`empty-${cellIndex}`} className="yearline-mini-day empty" />;
                        }
                        const dateKey = `${shownYear}-${String(mIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                        const dayDate = new Date(shownYear, mIdx, dayNum);
                        const dayOfWeek = dayDate.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isToday = dateKey === todayKey;
                        const isSelected = dateKey === selectedDate;
                        const dueTasks = tasksByDueDate[dateKey] || [];
                        const taskCount = dueTasks.length;
                        const hasTasks = taskCount > 0;
                        const hasMultipleTasks = taskCount > 1;
                        const isHighActivity = taskCount >= 3;

                        return (
                          <button
                            type="button"
                            key={dateKey}
                            className={`yearline-mini-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${isWeekend ? "is-weekend" : ""} ${hasTasks ? "has-tasks" : ""} ${hasMultipleTasks ? "multiple-tasks" : ""} ${isHighActivity ? "high-activity" : ""}`}
                            style={{
                              ...(isToday ? { backgroundColor: resolvedTheme.todayBg } : {}),
                              ...(isSelected && !isToday ? { backgroundColor: resolvedTheme.selectedBg } : {}),
                              ...(isWeekend && !isToday && !isSelected ? { backgroundColor: resolvedTheme.weekendBg } : {}),
                            }}
                            onClick={() => {
                              if (hasDraggedRef.current) return;
                              handleSelectYearlineDate(dateKey);
                            }}
                            title={`${MONTH_NAMES[mIdx]} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` · ${taskCount} task(s)` : ""}`}
                            aria-label={`${MONTH_NAMES[mIdx]} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` (${taskCount} tasks)` : ""}`}
                            aria-pressed={isSelected}
                          >
                            <span className="yearline-mini-day-num">{dayNum}</span>
                            {hasTasks && (
                              <span className="yearline-mini-dot-wrapper">
                                {taskCount === 1 ? (
                                  <span className={`yearline-mini-dot priority-dot-${dueTasks[0].priority}`} />
                                ) : (
                                  <span className={`yearline-mini-badge ${isHighActivity ? "is-high" : "is-med"}`}>
                                    {taskCount > 9 ? "9+" : taskCount}
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Daily Task Rows for this month */}
                  <div className="yearline-month-days">
                    {Array.from({ length: maxDays }, (_, dayIdx) => {
                      const dayNum = dayIdx + 1;
                      const dateKey = `${shownYear}-${String(mIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                      const dayDate = new Date(shownYear, mIdx, dayNum);
                      const weekday = dayDate.toLocaleDateString("en", { weekday: "short" });
                      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                      const isToday = dateKey === todayKey;
                      const isSelected = dateKey === selectedDate;
                      const dayTasks = tasksByDueDate[dateKey] || [];
                      const taskCount = dayTasks.length;
                      const hasTasks = taskCount > 0;
                      const hasMultipleTasks = taskCount > 1;
                      const isHighActivity = taskCount >= 3;

                      return (
                        <div
                          key={`cell-${dateKey}`}
                          id={`yearline-cell-${dateKey}`}
                          className={`yearline-day-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${isWeekend ? "is-weekend" : ""} ${hasTasks ? "has-tasks" : ""} ${hasMultipleTasks ? "multiple-tasks" : ""} ${isHighActivity ? "high-activity" : ""}`}
                          style={{
                            ...(isToday ? { backgroundColor: resolvedTheme.todayBg } : {}),
                            ...(isSelected && !isToday ? { backgroundColor: resolvedTheme.selectedBg } : {}),
                            ...(isWeekend && !isToday && !isSelected ? { backgroundColor: resolvedTheme.weekendBg } : {}),
                          }}
                          onClick={() => {
                            if (hasDraggedRef.current) return;
                            handleSelectYearlineDate(dateKey);
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`${MONTH_NAMES[mIdx]} ${dayNum}, ${weekday}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` · ${taskCount} tasks` : ""}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectYearlineDate(dateKey);
                            }
                          }}
                        >
                          <div className="yearline-cell-header-row">
                            <div className="yearline-cell-date-info">
                              <span className="yearline-cell-day-num">{dayNum}</span>
                              <span className={`yearline-cell-weekday ${isWeekend ? "is-weekend" : ""}`}>{weekday}</span>
                              {hasTasks && (
                                <span
                                  className={`yearline-cell-activity-pill ${isHighActivity ? "is-high" : hasMultipleTasks ? "is-multi" : "is-single"}`}
                                  title={`${taskCount} scheduled item${taskCount === 1 ? "" : "s"}`}
                                >
                                  <span className={`yearline-cell-activity-dot ${taskCount === 1 ? `priority-dot-${dayTasks[0].priority}` : "multi-dot"}`} />
                                  <span className="yearline-cell-activity-count">
                                    {taskCount} {taskCount === 1 ? "task" : "tasks"}
                                  </span>
                                </span>
                              )}
                            </div>
                            <div className="yearline-cell-badges">
                              {isToday && <span className="yearline-cell-today-pill">Today</span>}
                              <button
                                type="button"
                                className="yearline-cell-add-btn"
                                title={`Add task for ${MONTH_NAMES[mIdx]} ${dayNum}`}
                                aria-label={`Add task for ${MONTH_NAMES[mIdx]} ${dayNum}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(dateKey);
                                  openAddTask({ date: dateKey, status: "open" });
                                }}
                              >
                                <Plus size={11} weight="bold" />
                              </button>
                            </div>
                          </div>

                          {/* Tasks inside this date row */}
                          {dayTasks.length > 0 && (
                            <div className="yearline-task-list">
                              {dayTasks.map((t) => (
                                <div
                                  key={t.id}
                                  className={`yearline-task-item ${t.status === "completed" ? "is-done" : ""} ${t.isPinned ? "is-pinned" : ""}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="yearline-task-toggle"
                                    aria-label={t.status === "completed" ? `Mark ${t.title} open` : `Mark ${t.title} complete`}
                                    onClick={() => void toggleTask(t)}
                                  >
                                    {t.status === "completed" ? (
                                      <CheckCircle size={14} weight="fill" color="#15803d" />
                                    ) : (
                                      <Circle size={14} color="#78716c" />
                                    )}
                                  </button>
                                  {t.isPinned && <span className="yearline-task-pin-icon" title="Pinned: Keep this task easy to find">📌</span>}
                                  {t.isGoogleEvent && (
                                    <span
                                      className="yearline-source-dot"
                                      style={{ backgroundColor: t.googleCalendarColor || "#4285F4" }}
                                      title={`Google: ${t.googleCalendarName || "Calendar"}${t.isReadOnlyCalendar ? " (Read-only)" : ""}`}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    className="yearline-task-title-btn"
                                    onClick={() => openTaskDetail(t)}
                                    title={`${t.isGoogleEvent ? `[${t.googleCalendarName || "Google"}] ` : ""}${t.title} · ${priorityLabel(t.priority)}${t.isPinned ? " · Pinned" : ""}${t.isPersonal ? " · Personal" : ""}${t.timingPreference === "whenever" ? " · Whenever" : ""}${t.labelIds?.length ? ` · Labels: ${t.labelIds.map(id => labels.find(l => l.id === id)?.name ?? id).join(", ")}` : ""}`}
                                  >
                                    {t.title}
                                  </button>
                                  {t.labelIds?.length > 0 && (
                                    <span
                                      className="yearline-task-badge-icon"
                                      title={`Labels: ${t.labelIds.map((id) => labels.find((l) => l.id === id)?.name ?? id).join(", ")}`}
                                    >
                                      🏷️
                                    </span>
                                  )}
                                  {t.isPersonal && <span className="yearline-task-badge-icon" title="Personal: Optional category for life tasks">🌿</span>}
                                  {t.timingPreference === "whenever" && <span className="yearline-task-badge-icon" title="Whenever: No specific deadline">🟢</span>}
                                  <span
                                    className={`yearline-task-pri-dot priority-dot-${t.priority}`}
                                    title={`Priority: ${priorityLabel(t.priority)}`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="year-legend-bar">
          <span className="year-legend-item">
            <span className="year-legend-swatch today" /> Today
          </span>
          <span className="year-legend-item">
            <span className="year-legend-swatch selected" /> Selected
          </span>
          <span className="year-legend-item">
            <span className="year-legend-swatch tasks" /> Has Tasks
          </span>
          <span className="year-legend-item">
            <span style={{ display: "inline-block", width: 12, height: 12, border: "1px solid #d9cfbf", background: "repeating-linear-gradient(45deg, #f9f6f0, #f9f6f0 4px, #f2ede4 4px, #f2ede4 8px)", borderRadius: 3, verticalAlign: "middle" }} /> Inactive Date
          </span>
          {selectedDate && (
            <button
              type="button"
              className="clear-date-button"
              onClick={() => { setSelectedDate(null); }}
            >
              Clear selection
            </button>
          )}
          <span className="year-legend-hint">Horizontal scroll, drag to pan, or use ◀ ▶ · Click any date to add or edit tasks · Enter to save · Esc to cancel ✳</span>
        </div>
      </section>
    );
  };

  // --- Render ---
  const renderSelectedDateBanner = () => {
    if (!selectedDate) return null;
    const selectedDateTasks = displayedTasks.filter((t) => t.dueDate === selectedDate);
    return (
      <div className="selected-date-banner neo-card">
        <div className="selected-date-banner-main">
          <div className="selected-date-info">
            <span className="selected-date-badge">SELECTED DATE</span>
            <span className="selected-date-title">{formatFullDateDisplay(selectedDate)}</span>
            <span className="selected-date-count">
              {selectedDateTasks.length} task(s) scheduled
            </span>
          </div>
          <div className="selected-date-actions">
            <button
              type="button"
              className="selected-date-add-btn"
              onClick={() => {
                openAddTask({ date: selectedDate, status: "open" });
              }}
            >
              <Plus size={16} weight="bold" /> Add task for {new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}
            </button>
            <button
              type="button"
              className="selected-date-clear-btn"
              onClick={() => { setSelectedDate(null); }}
            >
              Clear
            </button>
          </div>
        </div>
        {selectedDateTasks.length > 0 && (
          <div className="selected-date-tasks-list">
            {selectedDateTasks.map((task) => (
              <div
                key={task.id}
                className={`selected-date-task-item priority-accent-${task.priority} ${task.status === "completed" ? "is-done" : ""}`}
                onClick={() => openTaskDetail(task)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openTaskDetail(task);
                  }
                }}
              >
                <button
                  type="button"
                  className="selected-date-task-toggle"
                  aria-label={task.status === "completed" ? "Mark incomplete" : "Mark complete"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleTask(task);
                  }}
                >
                  {task.status === "completed" ? (
                    <CheckCircle size={18} weight="fill" color="#15803d" />
                  ) : (
                    <Circle size={18} color="#78716c" />
                  )}
                </button>
                <div className="selected-date-task-info">
                  <span className="selected-date-task-title">{task.title}</span>
                  {task.dueTime && (
                    <span className="selected-date-task-time">
                      🕒 {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <div className="selected-date-task-meta">
                  {task.isPinned && <span title="Pinned">📌</span>}
                  {task.isPersonal && <span className="badge-chip badge-personal">🌿 Personal</span>}
                  {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever">🟢 Whenever</span>}
                  {task.labelIds?.map((id) => {
                    const lbl = labels.find((l) => l.id === id);
                    return lbl ? <span key={id} className="task-label-chip">🏷️ {lbl.name}</span> : null;
                  })}
                  <span className={`priority-badge-sm priority-${task.priority}`}>
                    {priorityEmoji(task.priority)} {priorityLabel(task.priority)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderWeeklyPlanner = (isYearSection = false) => (
    <section className="weekly-planner-card neo-card" id="week-view" ref={isYearSection ? weeklyPlannerRef : undefined}>
      <div className="weekly-planner-header">
        <div>
          <span className="section-kicker">{isYearSection ? "WEEKLY PLANNER" : "WEEKLY OVERVIEW"}</span>
          <h2>{formatWeekRange(weekDays)}</h2>
        </div>
        <div className="weekly-planner-actions">
          <div className="segmented" aria-label="Weekly layout mode">
            <button
              type="button"
              className={weeklyViewMode === "timeline" ? "selected" : ""}
              onClick={() => setWeeklyViewMode("timeline")}
            >
              7-Day Timeline
            </button>
            <button
              type="button"
              className={weeklyViewMode === "kanban" ? "selected" : ""}
              onClick={() => setWeeklyViewMode("kanban")}
            >
              Status Kanban
            </button>
          </div>
          <div className="calendar-actions">
            <button type="button" className="icon-button" aria-label="Previous week" onClick={prevWeek}>←</button>
            <button type="button" className="icon-button today-btn" onClick={todayWeek}>Today</button>
            <button type="button" className="icon-button" aria-label="Next week" onClick={nextWeek}>→</button>
          </div>
        </div>
      </div>
      {saveError && <p className="save-error" role="status" style={{ marginTop: 12, marginBottom: 0 }}>{saveError}</p>}

      {weeklyViewMode === "timeline" ? (
        <>
          {/* Mobile Selected-Day Planner (displayed on <= 768px, hidden on desktop) */}
          {(() => {
            const activeWeekDateKey = (selectedDate && weekDateKeys.has(selectedDate))
              ? selectedDate
              : (weekDateKeys.has(todayKey) ? todayKey : toDateKey(weekDays[0]));
            const activeWeekDate = weekDays.find((d) => toDateKey(d) === activeWeekDateKey) ?? weekDays[0];
            const activeDayIndex = Math.max(0, weekDays.findIndex((d) => toDateKey(d) === activeWeekDateKey));
            const activeDayTasks = displayedTasks.filter((t) => t.dueDate === activeWeekDateKey).sort((a, b) => (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99"));

            return (
              <div className="week-mobile-day-view">
                {/* Horizontal 7-Day Selector Bar */}
                <div className="week-mobile-day-bar" role="tablist" aria-label="Select day of the week">
                  {weekDays.map((day, i) => {
                    const dKey = toDateKey(day);
                    const isAct = dKey === activeWeekDateKey;
                    const isTod = dKey === todayKey;
                    const dayCount = displayedTasks.filter((t) => t.dueDate === dKey).length;
                    return (
                      <button
                        key={dKey}
                        type="button"
                        role="tab"
                        aria-selected={isAct}
                        className={`week-mobile-day-chip ${isAct ? "is-active" : ""} ${isTod ? "is-today" : ""}`}
                        onClick={() => {
                          setSelectedDate(dKey);
                          setNewDueDate(dKey);
                        }}
                      >
                        <span className="week-mobile-chip-day">{orderedWeekDayNames[i]?.slice(0, 3)}</span>
                        <span className="week-mobile-chip-num">{day.getDate()}</span>
                        {dayCount > 0 && (
                          <span className="week-mobile-chip-dot" title={`${dayCount} task(s)`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Focused Active Day Task Card */}
                <div className="week-mobile-focused-card neo-card">
                  <div className="week-mobile-focused-header">
                    <div>
                      <span className="week-mobile-focused-kicker">
                        {orderedWeekDayNames[activeDayIndex] ?? ""}
                        {activeWeekDateKey === todayKey ? " · Today" : ""}
                      </span>
                      <h3 className="week-mobile-focused-title">
                        {activeWeekDate.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="week-mobile-add-btn"
                      onClick={() => openAddTask({ date: activeWeekDateKey, status: "open" })}
                      aria-label={`Add task for ${orderedWeekDayNames[activeDayIndex]}`}
                    >
                      <Plus size={15} weight="bold" />
                      <span>Add Task</span>
                    </button>
                  </div>

                  <div className="week-mobile-tasks-list">
                    {activeDayTasks.length === 0 ? (
                      <div
                        className="week-mobile-empty"
                        role="button"
                        tabIndex={0}
                        onClick={() => openAddTask({ date: activeWeekDateKey, status: "open" })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openAddTask({ date: activeWeekDateKey, status: "open" });
                          }
                        }}
                      >
                        <p>No tasks scheduled for this day.</p>
                        <span className="week-mobile-empty-action">+ Tap here to add a task</span>
                      </div>
                    ) : (
                      activeDayTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`week-mobile-task-card priority-accent-${task.priority} ${task.status === "completed" ? "is-done" : ""} ${task.isPinned ? "is-pinned" : ""}`}
                          onClick={() => openTaskDetail(task)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTaskDetail(task);
                            }
                          }}
                        >
                          <div className="week-mobile-task-main">
                            <button
                              type="button"
                              className="week-mobile-task-toggle"
                              aria-label={task.status === "completed" ? "Mark incomplete" : "Mark complete"}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleTask(task);
                              }}
                            >
                              {task.status === "completed" ? (
                                <CheckCircle size={20} weight="fill" color="#15803d" />
                              ) : (
                                <Circle size={20} color="#78716c" />
                              )}
                            </button>
                            <div className="week-mobile-task-content">
                              <div className="week-mobile-task-title-row">
                                {task.isPinned && <span title="Pinned">📌</span>}
                                <span className="week-mobile-task-title">{task.title}</span>
                              </div>
                              {task.dueTime && (
                                <span className="week-mobile-task-time">
                                  🕒 {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                                </span>
                              )}
                              <div className="week-mobile-task-meta">
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
                                {task.isPersonal && <span className="badge-chip badge-personal">🌿 Personal</span>}
                                {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever">🟢 Whenever</span>}
                                {task.labelIds?.map((id) => {
                                  const lbl = labels.find((l) => l.id === id);
                                  return lbl ? <span key={id} className="task-label-chip">🏷️ {lbl.name}</span> : null;
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="week-mobile-task-move" onClick={(e) => e.stopPropagation()}>
                            <label className="kanban-move-label" aria-label={`Status for ${task.title}`}>
                              <CaretDown size={11} />
                              <select
                                value={task.status}
                                onChange={(e) => void moveTaskToStatus(task.id, e.target.value as PlannerTask["status"])}
                              >
                                <option value="open">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Done</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Desktop 7-Column Timeline Grid (displayed on > 768px, hidden on mobile) */}
          <div className="week-grid">
          {weekDays.map((day, i) => {
            const dateKey = toDateKey(day);
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const dayTasks = displayedTasks.filter((t) => t.dueDate === dateKey).sort((a, b) => (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99"));
            return (
              <div
                className={`week-day-col ${isToday ? "week-today" : ""} ${isSelected ? "week-selected-day" : ""}`}
                key={dateKey}
                onClick={() => {
                  if (selectedDate !== dateKey) {
                    setSelectedDate(dateKey);
                    setNewDueDate(dateKey);
                  }
                }}
              >
                <div className="week-day-header">
                  <span className="week-day-name">{orderedWeekDayNames[i]}</span>
                  <span className={`week-day-date ${isToday ? "today-badge" : ""} ${isSelected ? "selected-badge" : ""}`}>{day.getDate()}</span>
                </div>
                <div
                  className="week-day-tasks"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      openAddTask({ date: dateKey, status: "open" });
                    }
                  }}
                >
                  {dayTasks.length === 0 && (
                    <div
                      className="week-empty week-empty-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openAddTask({ date: dateKey, status: "open" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openAddTask({ date: dateKey, status: "open" });
                        }
                      }}
                    >
                      No tasks · + Add task
                    </div>
                  )}
                  {dayTasks.map((task) => (
                    <div
                      className={`week-task-tile ${task.status === "completed" ? "is-done" : ""} ${task.isPinned ? "is-pinned" : ""} priority-accent-${task.priority}`}
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openTaskDetail(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openTaskDetail(task);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="week-task-status-btn"
                        aria-label={task.status === "completed" ? `Mark ${task.title} as incomplete` : `Mark ${task.title} as complete`}
                        title={task.status === "completed" ? "Mark incomplete" : "Mark complete"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleTask(task);
                        }}
                      >
                        {task.status === "completed" ? (
                          <CheckCircle size={14} weight="fill" className="week-task-checked-icon" />
                        ) : (
                          <span className={`week-task-dot priority-dot-${task.priority}`} />
                        )}
                      </button>
                      <div className="week-task-info">
                        <div className="week-task-title-row">
                          {task.isPinned && <span className="week-task-pin-icon" title="Pinned: Keep this task easy to find">📌</span>}
                          <span className="week-task-title">{task.title}</span>
                        </div>
                        {task.dueTime && (
                          <span className="week-task-time">
                            {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                        <div className="week-task-badges">
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
                          {task.isPersonal && <span className="badge-chip badge-personal" title="Personal: Optional category for life tasks">🌿 Personal</span>}
                          {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever" title="Whenever: No specific deadline">🟢 Whenever</span>}
                          {task.labelIds && task.labelIds.length > 0 && task.labelIds.map((id) => {
                            const labelObj = labels.find((l) => l.id === id);
                            return labelObj ? (
                              <span key={id} className="task-label-chip">🏷️ {labelObj.name}</span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <span className={`priority-badge-sm priority-${task.priority}`}>{priorityEmoji(task.priority)} {priorityLabel(task.priority)}</span>
                      <div className="kanban-tile-touch-move" onClick={(e) => e.stopPropagation()}>
                        <label className="kanban-move-label" aria-label={`Status for ${task.title}`}>
                          <CaretDown size={11} />
                          <select
                            value={task.status}
                            onChange={(e) => void moveTaskToStatus(task.id, e.target.value as PlannerTask["status"])}
                          >
                            <option value="open">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Done</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="week-day-footer">
                  <button
                    type="button"
                    className="week-add-task-btn"
                    aria-label={`Add task for ${orderedWeekDayNames[i]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddTask({ date: dateKey, status: "open" });
                    }}
                  >
                    + Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      ) : (
        <div className="weekly-kanban-board">
          <div className="weekly-kanban-cols">
            {kanbanColumns.map((col) => {
              const colTasks = weekTasksByStatus[col.key];
              return (
                <div
                  className={`weekly-kanban-col weekly-kanban-col-${col.key}`}
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("kanban-drag-over"); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("kanban-drag-over"); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("kanban-drag-over");
                    const taskId = e.dataTransfer.getData("text/plain") || dragTaskId;
                    if (taskId) void moveTaskToStatus(taskId, col.key);
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
                        onClick={() => openAddTask({ date: selectedDate || todayKey, status: col.key })}
                      >
                        <Plus size={13} weight="bold" />
                      </button>
                    </div>
                  </div>
                  <div className="weekly-kanban-body">
                    {colTasks.length === 0 && (
                      <div className="weekly-kanban-empty">
                        {col.key === "open" ? "No tasks to do this week" : col.key === "in_progress" ? "No tasks currently in progress" : "No completed tasks this week"}
                      </div>
                    )}
                    {colTasks.map((task) => {
                      const isTaskDateSelected = Boolean(task.dueDate && task.dueDate === selectedDate);
                      const isTaskDateToday = Boolean(task.dueDate && task.dueDate === todayKey);
                      return (
                        <div
                          className={`weekly-kanban-tile priority-accent-${task.priority} ${task.status === "completed" ? "is-done" : ""}`}
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
                              <span className={`kanban-day-chip ${isTaskDateSelected ? "is-selected-date" : isTaskDateToday ? "is-today-date" : ""}`}>
                                {isTaskDateSelected && <span aria-hidden="true">★ </span>}
                                {new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                              </span>
                            )}
                            <span className="kanban-drag-handle" aria-hidden="true"><DotsSixVertical size={14} /></span>
                          </div>
                          <button
                            type="button"
                            className="weekly-kanban-tile-title"
                            onClick={() => openTaskDetail(task)}
                          >
                            {task.title}
                          </button>
                          {task.labelIds && task.labelIds.length > 0 && (
                            <div className="kanban-task-labels">
                              {task.labelIds.map((id) => {
                                const labelObj = labels.find((l) => l.id === id);
                                return labelObj ? (
                                  <span key={id} className="task-label-chip">🏷️ {labelObj.name}</span>
                                ) : null;
                              })}
                            </div>
                          )}
                          <div className="weekly-kanban-tile-meta">
                            <span className={`priority-badge-sm priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                            {task.dueTime && (
                              <span className="week-task-time">
                                {new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            )}
                            <div className="kanban-tile-touch-move">
                              <label className="kanban-move-label" aria-label={`Move ${task.title}`}>
                                <CaretDown size={11} />
                                <select
                                  value={task.status}
                                  onChange={(e) => void moveTaskToStatus(task.id, e.target.value as PlannerTask["status"])}
                                >
                                  <option value="open">To Do</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="completed">Done</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="kanban-col-add-bottom-btn"
                      onClick={() => openAddTask({ date: selectedDate || todayKey, status: col.key })}
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
    </section>
  );

  return <main
    className="app-shell"
    style={{
      "--calendar-theme-bg": resolvedTheme.calendarBg,
      "--calendar-weekend-bg": resolvedTheme.weekendBg,
      "--calendar-today-bg": resolvedTheme.todayBg,
      "--calendar-selected-bg": resolvedTheme.selectedBg,
      "--calendar-task-dot": resolvedTheme.taskDotColor,
    } as React.CSSProperties}
  >
    <header className="sticky-header" id="app-sticky-header">
      <div className="sticky-header-inner">
        <div className="brand-group">
          <a className="brand" href="#" aria-label="Planorama home">
            <span className="brand-mark">
              <CalendarBlank size={22} weight="fill" />
            </span>
            <span>
              planorama<span className="brand-dot">.</span>
            </span>
          </a>
          <span className="brand-tagline">
            Your life, <span>in color.</span>
          </span>
        </div>

        {/* Segmented view navigation strip placed beside heading on desktop */}
        <div className="view-switcher-container">
          <nav className="view-switcher" role="tablist" aria-label="Views">
            {NAV_VIEWS.map((v) => {
              const isActive = view === v.id;
              return (
                <button
                  key={v.id}
                  ref={isActive ? activeViewRef : null}
                  role="tab"
                  aria-selected={isActive}
                  className={isActive ? "vs-active" : ""}
                  onClick={() => {
                    setView(v.id);
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="topbar-actions">
          <UserProfileButton
            onOpenPreferences={() => setPreferencesModalOpen(true)}
            showToast={showToast}
          />
          <button
            type="button"
            className="header-preferences-btn"
            onClick={() => setPreferencesModalOpen(true)}
            aria-label="Planner preferences and customization"
            title="Planner preferences and customization"
          >
            <Gear size={17} weight="bold" />
            <span className="preferences-btn-label">Preferences</span>
          </button>
          <button
            className="quick-add-fab"
            onClick={() => openAddTask({ date: selectedDate || todayKey, status: "open" })}
            aria-label="Add task"
          >
            <Plus size={18} weight="bold" />
            <span className="add-task-label">Add Task</span>
          </button>
          <div
            className="date-chip"
            role="button"
            tabIndex={0}
            title="Today's date"
            onClick={() => {
              setSelectedDate(todayKey);
              setNewDueDate(todayKey);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedDate(todayKey);
                setNewDueDate(todayKey);
              }
            }}
          >
            <span className="date-dot" aria-hidden="true" />
            <span className="date-chip-full">
              {today.toLocaleDateString("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="date-chip-compact">
              <CalendarBlank size={14} weight="bold" />
              <span>
                {today.toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>

    <section className="main-panel">
      <div className={view === "agenda" ? "content-grid" : "content-single"}>
        {/* ===== DASHBOARD VIEW (Personal Planning Command Center) ===== */}
        {view === "dashboard" && (
          <DashboardView
            tasks={tasks}
            habits={habits}
            checkIns={checkIns}
            todayKey={todayKey}
            selectedDate={selectedDate}
            onSelectDate={(dateKey) => {
              setSelectedDate(dateKey);
              setNewDueDate(dateKey);
            }}
            onQuickAdd={(dateKey) => {
              setSelectedDate(dateKey);
              openAddTask({ date: dateKey, status: "open" });
            }}
            onToggleTask={(task) => void toggleTask(task)}
            onEditTask={(task) => openTaskDetail(task)}
            onDeleteTask={(task) => void deleteTask(task)}
            onViewCalendar={() => setView("month")}
            onOpenPreferences={() => setPreferencesModalOpen(true)}
            onRestoreWidgets={() => {
              savePreferences({
                ...preferences,
                dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w })),
              });
              showToast("Restored default dashboard layout!");
            }}
            showToast={(msg) => {
              showToast(msg);
              void refreshHabits();
            }}
            onError={(err) => setSaveError(err)}
            labels={labels}
            weekDays={weekDays}
            weekStartsOn={preferences.weekStartsOn}
            resolvedTheme={resolvedTheme}
            widgetConfigs={preferences.dashboardWidgets}
            priorityLabel={(p) => priorityLabel(p, preferences)}
            priorityEmoji={(p) => priorityEmoji(p, preferences)}
            onHabitsChanged={() => void refreshHabits()}
          />
        )}

        {/* ===== YEAR VIEW (12-Month Calendar Overview + Selected Date Banner + Weekly Planner) ===== */}
        {view === "year" && (
          <div className="content-single">
            <section
              className="year-planner-card neo-card"
              id="year-view"
              style={{ backgroundColor: resolvedTheme.calendarBg }}
            >
              <div className="card-header">
                <div>
                  <span className="section-kicker">FULL YEAR CALENDAR</span>
                  <h2>{shownYear} Yearly Planner</h2>
                </div>
                <div className="calendar-actions">
                  <button type="button" className="icon-button" aria-label="Previous year" onClick={() => setYearOffset((y) => y - 1)}>←</button>
                  <button type="button" className="icon-button today-btn" onClick={() => setYearOffset(0)}>This Year</button>
                  <button type="button" className="icon-button" aria-label="Next year" onClick={() => setYearOffset((y) => y + 1)}>→</button>
                </div>
              </div>

              <div className="year-planner-grid">
                {Array.from({ length: 12 }, (_, monthIndex) => {
                  const monthDate = new Date(shownYear, monthIndex, 1);
                  const monthTitle = monthDate.toLocaleDateString("en", { month: "long" });
                  const gridDays = monthGridDays(shownYear, monthIndex, preferences.weekStartsOn);
                  const monthColor = getMonthColor(resolvedTheme, monthIndex);
                  const isTileMode = resolvedTheme.mode === "tiles";

                  return (
                    <div
                      className={`year-month-card ${isTileMode ? "is-tile-tinted" : ""}`}
                      key={monthIndex}
                      style={isTileMode ? { backgroundColor: monthColor.tileBg, borderColor: monthColor.border } : undefined}
                    >
                      <div
                        className="year-month-header"
                        style={{
                          backgroundColor: monthColor.bg,
                          borderColor: monthColor.border,
                          color: monthColor.text,
                        }}
                      >
                        <span className="year-month-title" style={{ color: monthColor.text }}>{monthTitle}</span>
                        <span className="year-month-num" style={{ color: monthColor.text }}>{String(monthIndex + 1).padStart(2, "0")}</span>
                      </div>
                      <div className="year-mini-weekdays">
                        {orderedMiniDayNames.map((w, idx) => {
                          const isWeekendDay = w === "S";
                          return (
                            <span key={idx} className={`year-mini-weekday ${isWeekendDay ? "is-weekend" : ""}`}>
                              {w}
                            </span>
                          );
                        })}
                      </div>
                      <div className="year-mini-grid">
                        {gridDays.map((dayNum, cellIndex) => {
                          if (!dayNum) {
                            return <div key={`empty-${cellIndex}`} className="year-mini-day empty" />;
                          }
                          const dateKey = `${shownYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          const dayDate = new Date(shownYear, monthIndex, dayNum);
                          const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                          const isToday = dateKey === todayKey;
                          const isSelected = dateKey === selectedDate;
                          const dueTasks = displayedTasks.filter((t) => t.dueDate === dateKey);
                          const hasTasks = dueTasks.length > 0;
                          const openCount = dueTasks.filter((t) => t.status !== "completed").length;

                          return (
                            <button
                              type="button"
                              key={dateKey}
                              className={`year-mini-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${isWeekend ? "is-weekend" : ""} ${hasTasks ? "has-tasks" : ""}`}
                              style={{
                                ...(isToday ? { backgroundColor: resolvedTheme.todayBg } : {}),
                                ...(isSelected && !isToday ? { backgroundColor: resolvedTheme.selectedBg } : {}),
                                ...(isWeekend && !isToday && !isSelected ? { backgroundColor: resolvedTheme.weekendBg } : {}),
                              }}
                              onClick={() => handleSelectYearDate(dateKey)}
                              title={`${monthTitle} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` · ${dueTasks.length} task(s) (${openCount} open)` : ""}`}
                              aria-label={`${monthTitle} ${dayNum}, ${shownYear}${isWeekend ? " (Weekend)" : ""}${hasTasks ? ` (${dueTasks.length} tasks)` : ""}`}
                              aria-pressed={isSelected}
                            >
                              <span className="year-mini-day-num">{dayNum}</span>
                              {hasTasks && (
                                <span className="year-mini-dot-wrapper">
                                  {dueTasks.length === 1 ? (
                                    <span
                                      className={`year-mini-dot priority-dot-${dueTasks[0].priority}`}
                                      style={{ borderColor: resolvedTheme.taskDotColor }}
                                    />
                                  ) : (
                                    <span
                                      className="year-mini-badge"
                                      style={{ borderColor: resolvedTheme.taskDotColor }}
                                    >
                                      {dueTasks.length > 9 ? "9+" : dueTasks.length}
                                    </span>
                                  )}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="year-legend-bar">
                <span className="year-legend-item">
                  <span className="year-legend-swatch today" style={{ backgroundColor: resolvedTheme.todayBg }} /> Today
                </span>
                <span className="year-legend-item">
                  <span className="year-legend-swatch selected" style={{ backgroundColor: resolvedTheme.selectedBg }} /> Selected
                </span>
                <span className="year-legend-item">
                  <span className="year-legend-swatch tasks" style={{ backgroundColor: resolvedTheme.taskDotColor }} /> Has Tasks
                </span>
                <button
                  type="button"
                  className="clear-date-button"
                  onClick={() => { setSelectedDate(null); }}
                  disabled={!selectedDate}
                >
                  Clear selection
                </button>
                <span className="year-legend-hint">Click any date to open its week below ✳</span>
              </div>
            </section>

            {/* Selected Date Quick Banner */}
            {renderSelectedDateBanner()}

            {/* Interactive Weekly Kanban Planner below year */}
            {renderWeeklyPlanner(true)}
          </div>
        )}

        {/* ===== YEARLINE VIEW (Single Horizontal Row 12-Month Timeline + Selected Date Banner + Weekly Planner) ===== */}
        {view === "yearline" && (
          <div className="content-single">
            {renderYearlineView()}
          </div>
        )}

        {/* ===== WEEK VIEW ===== */}
        {view === "week" && renderWeeklyPlanner(false)}

        {/* ===== KANBAN VIEW ===== */}
        {view === "kanban" && (
          <section className="kanban-board neo-card" id="kanban-view">
            <div className="card-header">
              <div>
                <span className="section-kicker">TASK BOARD</span>
                <h2>Kanban<span className="heading-period">.</span></h2>
              </div>
            </div>
            <div className="kanban-columns">
              {kanbanColumns.map((col) => {
                const colTasks = tasksByStatus[col.key];
                return (
                  <div
                    className={`kanban-col kanban-col-${col.key}`}
                    key={col.key}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("kanban-drag-over"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("kanban-drag-over"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("kanban-drag-over");
                      const taskId = e.dataTransfer.getData("text/plain") || dragTaskId;
                      if (taskId) void moveTaskToStatus(taskId, col.key);
                      setDragTaskId(null);
                    }}
                  >
                    <div className="kanban-col-header">
                      <div className="kanban-col-header-left">
                        <span className={`kanban-status-dot kanban-dot-${col.key}`} />
                        <span className="kanban-col-title">{col.label}</span>
                      </div>
                      <div className="kanban-col-header-actions">
                        <span className="kanban-col-count">{colTasks.length}</span>
                        <button
                          type="button"
                          className="kanban-col-add-btn"
                          aria-label={`Add task to ${col.label}`}
                          title={`Add task to ${col.label}`}
                          onClick={() => openAddTask({ date: selectedDate || todayKey, status: col.key })}
                        >
                          <Plus size={13} weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="kanban-col-body">
                      {colTasks.length === 0 && (
                        <div className="kanban-empty">
                          {col.key === "open" ? "Add a task to get started" : col.key === "in_progress" ? "Drag tasks here when you start working" : "Completed tasks show up here"}
                        </div>
                      )}
                      {colTasks.map((task) => (
                        <div
                          className={`kanban-tile priority-accent-${task.priority} ${task.isPinned ? "is-pinned" : ""}`}
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", task.id);
                            setDragTaskId(task.id);
                          }}
                          onDragEnd={() => setDragTaskId(null)}
                        >
                          <div className="kanban-tile-top">
                            <span className="kanban-drag-handle" aria-hidden="true"><DotsSixVertical size={14} /></span>
                            {task.isPinned && <span className="kanban-pin-badge" title="Pinned: Keep this task easy to find">📌</span>}
                            <button type="button" className="kanban-tile-title" onClick={() => openTaskDetail(task)}>{task.title}</button>
                          </div>
                          <div className="kanban-tile-meta">
                            <div className="kanban-badges-group">
                              {task.isPersonal && <span className="badge-chip badge-personal" title="Personal: Optional category for life tasks">🌿 Personal</span>}
                              {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever" title="Whenever: No specific deadline">🟢 Whenever</span>}
                              {task.labelIds && task.labelIds.length > 0 && task.labelIds.map((id) => {
                                const labelObj = labels.find((l) => l.id === id);
                                return labelObj ? (
                                  <span key={id} className="task-label-chip">🏷️ {labelObj.name}</span>
                                ) : null;
                              })}
                              <span className={`priority-badge-sm priority-${task.priority}`}>{priorityEmoji(task.priority)} {priorityLabel(task.priority)}</span>
                            </div>
                            {task.dueDate && <span className={`kanban-due ${isOverdue(task) ? "overdue" : ""}`}>{isOverdue(task) ? "Overdue · " : ""}{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                          </div>
                          {/* Touch-friendly status selector */}
                          <div className="kanban-tile-touch-move">
                            <label className="kanban-move-label" aria-label={`Move ${task.title}`}>
                              <CaretDown size={12} />
                              <select value={task.status} onChange={(e) => void moveTaskToStatus(task.id, e.target.value as PlannerTask["status"])}>
                                <option value="open">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Done</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="kanban-col-add-bottom-btn"
                        onClick={() => openAddTask({ date: selectedDate || todayKey, status: col.key })}
                      >
                        + Add task
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== GOOGLE CALENDAR-STYLE MONTH WORKSPACE ===== */}
        {view === "month" && (
          <div className="month-workspace-container">
            <CalendarSidebar
              currentShownDate={shownDate}
              selectedDate={selectedDate}
              onSelectDate={(dateKey) => {
                setSelectedDate(dateKey);
                setNewDueDate(dateKey || "");
              }}
              onNavigateMonth={(offset) => setMonthOffset((curr) => curr + offset)}
              weekStartsOn={preferences.weekStartsOn}
              tasks={tasks}
              onAddEvent={(dateKey) => openAddTask({ date: dateKey || selectedDate || todayKey, status: "open" })}
              onAddTask={(dateKey) => openAddTask({ date: dateKey || selectedDate || todayKey, status: "open" })}
              localCalendarEnabled={localCalendarEnabled}
              onToggleLocalCalendar={() => setLocalCalendarEnabled((prev) => !prev)}
              googleStatus={googleStatus}
              calendarConfigs={activeCalendarConfigs}
              onToggleCalendar={handleToggleCalendar}
              onConnectGoogle={handleConnectGoogle}
              onSyncGoogle={handleSyncGoogle}
              isSyncingGoogle={isSyncingGoogle}
              isOpenOnMobile={mobileSidebarOpen}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
            <MonthView
              shownDate={shownDate}
              today={today}
              todayKey={todayKey}
              selectedDate={selectedDate}
              onSelectDate={(dateKey) => {
                setSelectedDate(dateKey);
                setNewDueDate(dateKey || "");
              }}
              onNavigateMonth={(offset) => setMonthOffset((curr) => curr + offset)}
              onResetToToday={() => {
                setMonthOffset(0);
                setSelectedDate(todayKey);
                setNewDueDate(todayKey);
              }}
              weekStartsOn={preferences.weekStartsOn}
              resolvedTheme={resolvedTheme}
              tasks={displayedTasks}
              allCalendarConfigs={activeCalendarConfigs}
              onAddTask={(options) => openAddTask({ date: options?.date || selectedDate || todayKey, time: options?.time, status: options?.status || "open" })}
              onOpenTaskDetail={openTaskDetail}
              onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
              activeCalendarCount={activeCalendarCount}
            />
          </div>
        )}

        {/* ===== EXISTING AGENDA CALENDAR CARD ===== */}
        {view === "agenda" && (
          <section
            className="calendar-card neo-card"
            id="calendar"
            style={{ backgroundColor: resolvedTheme.calendarBg }}
          >
            <div className="card-header">
              <div>
                <span className="section-kicker">THE BIG PICTURE</span>
                <h2>Agenda</h2>
              </div>
              <div className="calendar-actions">
                <button
                  type="button"
                  className="agenda-add-task-header-btn"
                  onClick={() => openAddTask({ date: selectedDate || todayKey, status: "open" })}
                >
                  <Plus size={14} weight="bold" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>
            <div className="agenda-list">
              {displayedTasks.filter((task) => task.dueDate).slice().sort((a, b) => {
                const aPinned = a.isPinned ? 1 : 0;
                const bPinned = b.isPinned ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                return (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
              }).map((task) => (
                <button type="button" className={"agenda-item " + (task.status === "completed" ? "is-done" : "") + (task.isPinned ? " is-pinned" : "")} key={task.id} onClick={() => openTaskDetail(task)}>
                  <span className="agenda-date">{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                  <span className="agenda-task-title">
                    <span className="agenda-task-name">
                      {task.isPinned && <span className="task-row-pin" title="Pinned">📌</span>}
                      {task.title}
                    </span>
                    <small>{task.dueTime ? new Date("2000-01-01T" + task.dueTime).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : "All day"}{task.status === "completed" ? " · Completed" : ""}</small>
                  </span>
                  <div className="agenda-badges">
                    {task.isPersonal && <span className="badge-chip badge-personal" title="Personal: Optional category for life tasks">🌿 Personal</span>}
                    {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever" title="Whenever: No specific deadline">🟢 Whenever</span>}
                    {task.labelIds && task.labelIds.length > 0 && task.labelIds.map((id) => {
                      const labelObj = labels.find((l) => l.id === id);
                      return labelObj ? (
                        <span key={id} className="task-label-chip">🏷️ {labelObj.name}</span>
                      ) : null;
                    })}
                    <span className={"priority-badge priority-" + task.priority}>{priorityEmoji(task.priority)} {priorityLabel(task.priority)}</span>
                  </div>
                </button>
              ))}
              {tasks.every((task) => !task.dueDate) && (
                <div className="agenda-empty-state">
                  <p className="empty-tasks">Add a due date to a task and it will appear here.</p>
                  <button
                    type="button"
                    className="agenda-add-task-header-btn"
                    onClick={() => openAddTask({ date: selectedDate || todayKey, status: "open" })}
                  >
                    <Plus size={14} weight="bold" />
                    <span>Add Task</span>
                  </button>
                </div>
              )}
            </div>
            <div className="calendar-footer">
              <span className="legend"><i className="day-dot pink" /> Tasks due</span>
              <button type="button" className="clear-date-button" onClick={() => { setSelectedDate(null); }} disabled={!selectedDate}>Clear date</button>
              <span className="footer-hint">Select a day to filter tasks or add a task ✳</span>
            </div>
          </section>
        )}

        {/* Selected Date Quick Banner for Agenda view */}
        {view === "agenda" && selectedDate && renderSelectedDateBanner()}

        {/* ===== DASHBOARD SIDEBAR (Daily Habits + Tasks, visible only in agenda view) ===== */}
        {view === "agenda" && (
          <div className="dashboard-sidebar">
            <DailyHabitsWidget
              todayKey={todayKey}
              onNotify={showToast}
              onError={(err) => setSaveError(err)}
            />
            <section className="tasks-card neo-card" id="tasks"><div className="tasks-top"><div><span className="section-kicker">ONE THING AT A TIME</span><h2>Little wins<span className="heading-period">.</span></h2></div><span className="task-progress">{completed}/{tasks.length}</span></div><div className="progress-track"><span style={{ width: (tasks.length ? (completed / tasks.length) * 100 : 0) + "%" }} /></div><p className="tasks-subtitle">{loaded ? "Saved on this device · your progress stays here." : "Loading your saved tasks…"}</p>
            <div className="label-manager">
              <div className="label-manager-heading"><strong>Labels</strong><button type="button" className="task-action" onClick={() => void addLabel()}>+ Add label</button></div>
              <div className="label-chip-list">{labels.map((label) => <span className="label-management-chip" key={label.id}>{label.name}<button type="button" aria-label={`Delete ${label.name} label`} onClick={() => deleteLabel(label.id)}>×</button></span>)}</div>
            </div>
            <div className="planner-preferences" aria-label="Planner preferences">
              <div className="label-manager-heading">
                <strong>Planner preferences</strong>
                <button
                  type="button"
                  className="task-action"
                  onClick={() => setPreferencesModalOpen(true)}
                >
                  Customize options →
                </button>
              </div>
              <div className="preference-quick-summary">
                <span className="preference-chip">Theme: {THEME_PRESET_METADATA[resolvedTheme.preset]?.name ?? resolvedTheme.preset}</span>
                <span className="preference-chip">Mode: {resolvedTheme.mode === "headers" ? "Colored Headers" : resolvedTheme.mode === "tiles" ? "Colored Tiles" : "Custom"}</span>
                <span className="preference-chip">Start: {preferences.weekStartsOn === 0 ? "Sun" : preferences.weekStartsOn === 1 ? "Mon" : "Sat"}</span>
                <span className="preference-chip">Sort: {preferences.defaultSort}</span>
                <span className="preference-chip">Default: {priorityEmoji(preferences.defaultPriority ?? "none", preferences)} {priorityLabel(preferences.defaultPriority ?? "none", preferences)}</span>
              </div>
              <div className="preference-fields">
                <label>Week starts on<select aria-label="Week starts on" value={preferences.weekStartsOn} onChange={(event) => savePreferences({ ...preferences, weekStartsOn: Number(event.target.value) as PlannerPreferences["weekStartsOn"] })}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={6}>Saturday</option></select></label>
                <label>Default task sorting<select aria-label="Default task sorting" value={preferences.defaultSort} onChange={(event) => { const defaultSort = event.target.value as PlannerPreferences["defaultSort"]; savePreferences({ ...preferences, defaultSort }); setTaskSort(defaultSort); }}><option value="due">Due date</option><option value="priority">Priority</option><option value="newest">Newest first</option></select></label>
              </div>
            </div>
            <div className="backup-tools" aria-label="Backup and restore">
              <div><strong>Backup your planner</strong><p>Export tasks, labels, projects, and templates to a JSON file.</p></div>
              <div className="backup-actions"><button type="button" className="task-action" onClick={exportBackup}>Export backup</button><label className="task-action import-backup">Import backup<input aria-label="Import Planorama backup" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ""; }} /></label></div>
            </div>
            <div className="project-manager">
              <div className="label-manager-heading"><strong>Projects</strong><button type="button" className="task-action" onClick={addProject}>+ Add project</button></div>
              {projects.length > 0 ? <div className="project-chip-list">{projects.map((project) => <span className="project-chip" key={project.id}>{project.name}<button type="button" aria-label={`Delete ${project.name} project`} onClick={() => void deleteProject(project.id)}>×</button></span>)}</div> : <p className="project-empty">Group related tasks into a project, like Website or Study Plan.</p>}
            </div>
            <div className="template-tools">
              <label>Task templates
                <select aria-label="Use a saved task template" value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)}>
                  <option value="">Start from scratch…</option>
                  {taskTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              {selectedTemplateId && <button type="button" className="task-action delete-template" onClick={() => deleteTemplate(selectedTemplateId)}>Delete template</button>}
            </div>
            <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void addTask(); }}>
              <input aria-label="New task" placeholder="Add something to your list…" maxLength={240} value={newTask} onChange={(event) => setNewTask(event.target.value)} />
              <button aria-label="Add task" type="submit"><Plus size={20} weight="bold" /></button>
              <div className="quick-add-options">
                <fieldset className="label-picker">
                  <legend>Labels (optional)</legend>
                  {labels.map((label) => (
                    <label key={label.id}>
                      <input type="checkbox" checked={selectedLabelIds.includes(label.id)} onChange={() => toggleLabel(label.id)} />
                      {label.name}
                    </label>
                  ))}
                </fieldset>
                <label>Project (optional)
                  <select aria-label="Assign task to project" value={newProjectId} onChange={(event) => setNewProjectId(event.target.value)}>
                    <option value="">No project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                <label className="notes-field">Notes (optional)
                  <textarea aria-label="New task notes" placeholder="Add details or a reminder…" maxLength={2000} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
                </label>
                <label>Due date <input aria-label="Task due date" type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label>
                <label>Due time (optional) <input aria-label="Task due time" type="time" value={newDueTime} onChange={(event) => setNewDueTime(event.target.value)} /></label>
                <label>Repeat
                  <select aria-label="Task repeat" value={newRecurrence} onChange={(event) => setNewRecurrence(event.target.value as PlannerTask["recurrence"])}>
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <TaskPriorityOrgControl
                  priority={newPriority}
                  isPinned={newIsPinned}
                  isPersonal={newIsPersonal}
                  timingPreference={newTimingPreference}
                  preferences={preferences}
                  onSelectPriority={setNewPriority}
                  onTogglePinned={() => setNewIsPinned((p) => !p)}
                  onTogglePersonal={() => setNewIsPersonal((c) => !c)}
                  onToggleTimingPreference={() => setNewTimingPreference((t) => (t === "whenever" ? "scheduled" : "whenever"))}
                />
              </div>
            </form>
            {saveError && <p className="save-error" role="status">{saveError}</p>}
            <div className="task-tools">
              {connectedCalendars.length > 0 && (
                <label className="task-calendar-filter">Calendar
                  <select aria-label="Filter by calendar" value={calendarFilter} onChange={(event) => setCalendarFilter(event.target.value)}>
                    <option value="">All calendars</option>
                    <option value="__local">Planorama only</option>
                    {connectedCalendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.accountEmail ? `${cal.name} (${cal.accountEmail})` : cal.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="task-label-filter">Label
                <select aria-label="Filter by label" value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
                  <option value="">All labels</option>
                  {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                </select>
              </label>
              <label className="task-project-filter">Project
                <select aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                  <option value="">All projects</option>
                  <option value="__unassigned">No project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="task-search">
                <span className="sr-only">Search tasks</span>
                <input type="search" placeholder="Search your tasks…" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} aria-label="Search tasks" />
                <span aria-hidden="true">⌕</span>
              </label>
              <label className="task-sort">Sort by
                <select aria-label="Sort tasks" value={taskSort} onChange={(event) => setTaskSort(event.target.value as typeof taskSort)}>
                  <option value="due">Due date</option>
                  <option value="priority">Priority</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>
            <div className="task-filter-bar" aria-label="Filter tasks">
              {(["all", "open", "completed"] as const).map((filter) => (
                <button type="button" key={filter} className={taskFilter === filter ? "active" : ""} onClick={() => setTaskFilter(filter)}>
                  {filter === "all" ? "All" : filter === "open" ? "To do" : "Done"}
                </button>
              ))}
              {selectedDate && <span className="selected-date-label">{new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>}
            </div>
            <div className="task-list">
              {visibleTasks.map((task) => editingId === task.id && !detailTaskId ? (
                <form className="task-edit-form" key={task.id} onSubmit={(event) => { event.preventDefault(); void saveEdit(task); }}>
                  <label>Task title<input autoFocus maxLength={240} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                  <label>Notes (optional)<textarea maxLength={2000} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Add details or a reminder…" /></label>
                  <fieldset className="label-picker edit-label-picker">
                    <legend>Labels</legend>
                    {labels.map((label) => (
                      <label key={label.id}>
                        <input type="checkbox" checked={editLabelIds.includes(label.id)} onChange={() => toggleLabel(label.id, true)} />
                        {label.name}
                      </label>
                    ))}
                  </fieldset>
                  <label className="task-project-edit">Project
                    <select aria-label="Edit task project" value={editProjectId} onChange={(event) => setEditProjectId(event.target.value)}>
                      <option value="">No project</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </label>
                  <div className="task-edit-fields">
                    <label>Due date<input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></label>
                    <label>Due time<input type="time" value={editDueTime} onChange={(event) => setEditDueTime(event.target.value)} /></label>
                    <label>Location (optional)<input maxLength={200} value={editLocation} onChange={(event) => setEditLocation(event.target.value)} placeholder="Physical address, room, or meeting link" /></label>
                    <label>Repeat
                      <select value={editRecurrence} onChange={(event) => setEditRecurrence(event.target.value as PlannerTask["recurrence"])}>
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </label>
                    <label>Status
                      <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as PlannerTask["status"])}>
                        <option value="open">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Done</option>
                      </select>
                    </label>
                  </div>
                  <TaskPriorityOrgControl
                    priority={editPriority}
                    isPinned={editIsPinned}
                    isPersonal={editIsPersonal}
                    timingPreference={editTimingPreference}
                    preferences={preferences}
                    onSelectPriority={setEditPriority}
                    onTogglePinned={() => setEditIsPinned((p) => !p)}
                    onTogglePersonal={() => setEditIsPersonal((c) => !c)}
                    onToggleTimingPreference={() => setEditTimingPreference((t) => (t === "whenever" ? "scheduled" : "whenever"))}
                  />
                  <div className="task-edit-actions">
                    <button type="submit" className="task-action save">Save changes</button>
                    <button type="button" className="task-action" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={"task-row " + (task.status === "completed" ? "is-done" : "") + (task.isPinned ? " is-pinned" : "")} key={task.id}>
                  <button className="task-toggle" aria-label={task.status === "completed" ? `Mark ${task.title} as open` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}>
                    <span className={"task-check " + (task.status === "completed" ? "checked" : "")}>
                      {task.status === "completed" && <CheckCircle size={18} weight="fill" />}
                    </span>
                  </button>
                  <span className="task-title" role="button" tabIndex={0} onClick={() => openTaskDetail(task)} onKeyDown={(e) => { if (e.key === "Enter") openTaskDetail(task); }}>
                    <span className="task-title-main">
                      {task.isPinned && <span className="task-row-pin" title="Pinned: Keep this task easy to find">📌</span>}
                      {task.title}
                    </span>
                    {task.projectId && <span className="task-project-chip">{projects.find((project) => project.id === task.projectId)?.name ?? "Project"}</span>}
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
                    {task.syncStatus === "pending" && (
                      <span className="badge-chip" style={{ background: "#fef3c7", color: "#b45309", fontSize: "10.5px" }} title="Pending sync with Google Calendar">
                        ⏳ Syncing
                      </span>
                    )}
                    {task.syncStatus === "conflict" && (
                      <span className="badge-chip" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: "10.5px" }} title="Conflict detected with Google Calendar">
                        ⚠️ Conflict
                      </span>
                    )}
                    {task.labelIds?.length > 0 && <span className="task-labels">{task.labelIds.map((id) => <small className="task-label-chip" key={id}>{labels.find((label) => label.id === id)?.name ?? id}</small>)}</span>}
                    <div className="task-row-tags">
                      {task.isPersonal && <span className="badge-chip badge-personal" title="Personal: Optional category for life tasks">🌿 Personal</span>}
                      {task.timingPreference === "whenever" && <span className="badge-chip badge-whenever" title="Whenever: No specific deadline">🟢 Whenever</span>}
                    </div>
                    {task.location && (
                      <small style={{ color: "#475569", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        📍 {task.location}
                      </small>
                    )}
                    {task.notes && <small className="task-notes-preview">{task.notes}</small>}
                    {task.dueDate && <small className={"task-due-date " + (isOverdue(task) ? "overdue" : "")}>{isOverdue(task) ? "Overdue · " : ""}{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}{task.dueTime ? ` · ${new Date(`2000-01-01T${task.dueTime}`).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}` : ""}</small>}
                  </span>
                  <span className={"priority-badge priority-" + task.priority}>{priorityEmoji(task.priority)} {priorityLabel(task.priority)}</span>
                  <div className="task-row-actions">
                    <button type="button" className="task-action" aria-label={`Save ${task.title} as template`} onClick={() => saveAsTemplate(task)}>Template</button>
                    <button type="button" className="task-action" aria-label={`Edit ${task.title}`} onClick={() => beginEdit(task)}>Edit</button>
                    <button type="button" className="task-action delete" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            {loaded && tasks.length === 0 && <p className="empty-tasks">Your list is a blank page. Add a little win to get started.</p>}{loaded && tasks.length > 0 && visibleTasks.length === 0 && <p className="empty-tasks">{selectedDate ? "No tasks are due on this date." : "No tasks match this filter."}</p>}
            <div className="gentle-reminder"><span>✳</span><p>Small steps count. You don&apos;t have to do it all today.</p></div>
          </section>
        </div>
        )}
      </div>

      {/* ===== STANDARDIZED ADD TASK MODAL ===== */}
      <AddTaskModal
        isOpen={addTaskOpen}
        onClose={closeAddTask}
        initialDueDate={addTaskDueDate}
        initialDueTime={addTaskDueTime}
        initialStatus={addTaskStatus}
        preferences={preferences}
        labels={labels}
        onAddLabel={addLabel}
        onSaveTask={handleSaveNewTask}
        writableCalendars={writableCalendars}
      />

      {/* ===== TASK DETAIL MODAL ===== */}
      {detailTask && detailTaskId && (
        <div className="modal-overlay" onClick={() => { setDetailTaskId(null); setEditingId(null); }} onKeyDown={(e) => { if (e.key === "Escape") { setDetailTaskId(null); setEditingId(null); } }}>
          <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Task details">
            <div className="modal-header">
              <h3>Task Details</h3>
              <button className="modal-close" onClick={() => { setDetailTaskId(null); setEditingId(null); }} aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void saveEdit(detailTask); }} className="detail-form">
              {detailTask.isGoogleEvent && (
                <div
                  className="google-event-detail-banner"
                  style={{
                    borderLeft: `4px solid ${detailTask.googleCalendarColor || "#4285F4"}`,
                    background: "#f8fafc",
                    padding: "10px 14px",
                    borderRadius: "6px",
                    marginBottom: "14px",
                    border: "1px solid #cbd5e1",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontWeight: 700,
                        fontSize: "12px",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        backgroundColor: `${detailTask.googleCalendarColor || "#4285F4"}22`,
                        color: detailTask.googleCalendarColor || "#1a73e8",
                      }}
                    >
                      📅 {detailTask.googleCalendarName || "Google Calendar"}
                      {detailTask.isReadOnlyCalendar && " 🔒 (Read-only Client Calendar)"}
                    </span>
                    {detailTask.googleHtmlLink && (
                      <a
                        href={detailTask.googleHtmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "11.5px", color: "#2563eb", textDecoration: "underline", fontWeight: 600 }}
                      >
                        Open in Google Calendar ↗
                      </a>
                    )}
                  </div>
                  {detailTask.googleAccountEmail && (
                    <div style={{ fontSize: "11.5px", color: "#475569" }}>
                      <strong>Account:</strong> {detailTask.googleAccountEmail}
                    </div>
                  )}
                  {detailTask.location && (
                    <div style={{ fontSize: "11.5px", color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>📍</span> {detailTask.location}
                    </div>
                  )}
                  {detailTask.attendees && detailTask.attendees.length > 0 && (
                    <div style={{ fontSize: "11.5px", color: "#475569" }}>
                      <strong>Attendees:</strong> {detailTask.attendees.map((a) => a.displayName || a.email).join(", ")}
                    </div>
                  )}
                  {detailTask.isReadOnlyCalendar && (
                    <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "#64748b", lineHeight: 1.4 }}>
                      This client calendar was shared with view-only permissions. Edits saved here update your Planorama view, but will not overwrite your client&apos;s Google Calendar.
                    </p>
                  )}
                </div>
              )}
              <label className="detail-label">Title
                <input autoFocus maxLength={240} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setDetailTaskId(null); setEditingId(null); } }} />
              </label>
              <label className="detail-label">Notes
                <textarea maxLength={2000} rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add details or a reminder…" />
              </label>
              <label className="detail-label">Location
                <input maxLength={200} value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Physical address, room, or meeting link" />
              </label>
              <div className="detail-grid">
                <label className="detail-label">Due date <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></label>
                <label className="detail-label">Start time <input type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} /></label>
                <label className="detail-label">Status
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as PlannerTask["status"])}>
                    <option value="open">To Do</option><option value="in_progress">In Progress</option><option value="completed">Done</option>
                  </select>
                </label>
                <label className="detail-label">Repeat
                  <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value as PlannerTask["recurrence"])}>
                    <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="detail-label">Project
                  <select value={editProjectId} onChange={(e) => setEditProjectId(e.target.value)}>
                    <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <TaskPriorityOrgControl
                priority={editPriority}
                isPinned={editIsPinned}
                isPersonal={editIsPersonal}
                timingPreference={editTimingPreference}
                preferences={preferences}
                onSelectPriority={setEditPriority}
                onTogglePinned={() => setEditIsPinned((p) => !p)}
                onTogglePersonal={() => setEditIsPersonal((c) => !c)}
                onToggleTimingPreference={() => setEditTimingPreference((t) => (t === "whenever" ? "scheduled" : "whenever"))}
              />
              <fieldset className="label-picker detail-labels"><legend>Labels</legend>{labels.map((label) => <label key={label.id}><input type="checkbox" checked={editLabelIds.includes(label.id)} onChange={() => toggleLabel(label.id, true)} />{label.name}</label>)}</fieldset>
              {saveError && <p className="save-error" role="status">{saveError}</p>}
              <div className="detail-actions">
                <button type="submit" className="task-action save">Save changes</button>
                <button type="button" className="task-action delete" onClick={() => void deleteTask(detailTask)}>Delete</button>
                <button type="button" className="task-action" onClick={() => { setDetailTaskId(null); setEditingId(null); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== PREFERENCES MODAL ===== */}
      <PreferencesModal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        preferences={preferences}
        onSavePreferences={savePreferences}
        labels={labels}
        onAddLabel={addLabel}
        onDeleteLabel={deleteLabel}
        onRestoreDefaults={handleRestoreDefaultPreferences}
        onSyncGoogle={handleSyncGoogle}
        isSyncingGoogle={isSyncingGoogle}
        showToast={showToast}
        onError={(err) => setSaveError(err)}
      />

      {/* ===== TOAST ===== */}
      {toast && <div className="toast" role="status">{toast}</div>}

      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
