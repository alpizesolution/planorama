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
  Gear,
} from "@phosphor-icons/react";
import { createTask, getTasks, removeTask, updateTask } from "@/lib/schedule/task-service";
import type { PlannerTask, PlannerPreferences } from "@/lib/schedule/types";
import { validateTask } from "@/lib/schedule/validation";
import { getWeekDays, getWorkWeekDays, toDateKey, monthGridDays, daysInMonth } from "@/lib/calendar/date-utils";
import { generateId } from "@/lib/schedule/id";
import { DashboardView } from "@/app/components/dashboard/dashboard-view";
import { getHabits, getCheckIns } from "@/lib/habits/habit-service";
import { writeHabitsToStorage, writeCheckInsToStorage } from "@/lib/habits/storage";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import type { CalendarThemeSettings } from "@/lib/calendar/calendar-themes";
import {
  DEFAULT_CALENDAR_THEME,
  getMonthColor,
  getResolvedTheme,
} from "@/lib/calendar/calendar-themes";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  resolveDashboardWidgets,
} from "@/lib/dashboard/types";
import { CalendarWorkspaceShell } from "@/app/components/calendar/calendar-workspace-shell";
import { DayView } from "@/app/components/calendar/day-view";
import { MonthView } from "@/app/components/calendar/month-view";
import { WeekView } from "@/app/components/calendar/week-view";
import { YearView } from "@/app/components/calendar/year-view";
import { AgendaView } from "@/app/components/calendar/agenda-view";
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
import {
  UnifiedCreateModal,
  type CreateMode,
  type SaveEventData,
  type SaveTaskData,
  type SaveAppointmentData,
} from "@/app/components/calendar/unified-create-modal";
import { saveAppointmentSchedule } from "@/lib/schedule/appointment-service";
import {
  DEFAULT_ITEM_COLORS,
  resolveItemColorPreferences,
  getItemType,
  getItemTileStyle,
  DEFAULT_ITEM_STYLES,
  resolveItemStylesPreferences,
} from "@/lib/calendar/item-color";
import {
  SettingsWorkspace,
  type SettingsSectionId,
} from "@/app/components/settings/settings-workspace";
import {
  TASK_OPTIONS,
  getOptionLabel,
  getOptionEmoji,
  getOptionDescription,
  priorityLabel,
  priorityEmoji,
} from "@/lib/schedule/task-options";

type TaskTemplate = { id: string; name: string; title: string; notes: string; priority: PlannerTask["priority"]; recurrence: PlannerTask["recurrence"] };
export type TaskLabel = { id: string; name: string };
type TaskProject = { id: string; name: string };
type AppView = "dashboard" | "day" | "month" | "year" | "yearline" | "agenda" | "week" | "workWeek" | "kanban" | "settings";

const NAV_VIEWS: { id: AppView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "workWeek", label: "Work Weeks" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "yearline", label: "Yearline" },
  { id: "agenda", label: "Agenda" },
  { id: "kanban", label: "Board" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

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
  itemColors: DEFAULT_ITEM_COLORS,
};

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
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("general");
  const [previousView, setPreviousView] = useState<AppView>("month");

  const openSettings = useCallback((section: SettingsSectionId = "general") => {
    setView((curr) => {
      if (curr !== "settings") {
        setPreviousView(curr);
      }
      return "settings";
    });
    setSettingsSection(section);
  }, []);

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

  // Unified Creation Modal state (Event, Task & Appointment Schedule)
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [createModalMode, setCreateModalMode] = useState<CreateMode>("task");
  const [addTaskDueDate, setAddTaskDueDate] = useState<string | null>(null);
  const [addTaskDueTime, setAddTaskDueTime] = useState<string | null>(null);
  const [addTaskStatus, setAddTaskStatus] = useState<PlannerTask["status"]>("open");

  const openCreateModal = useCallback((modalMode: CreateMode = "event", options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => {
    setCreateModalMode(modalMode);
    setAddTaskDueDate(options?.date !== undefined ? options.date : (selectedDate || toDateKey(new Date())));
    setAddTaskDueTime(options?.time ?? null);
    setAddTaskStatus(options?.status ?? "open");
    setAddTaskOpen(true);
  }, [selectedDate]);

  const openAddTask = useCallback((options?: { date?: string | null; time?: string | null; status?: PlannerTask["status"] }) => {
    openCreateModal("task", options);
  }, [openCreateModal]);

  const openAddEvent = useCallback((options?: { date?: string | null; time?: string | null }) => {
    openCreateModal("event", options);
  }, [openCreateModal]);

  const openAddAppointment = useCallback((options?: { date?: string | null }) => {
    openCreateModal("appointment", options);
  }, [openCreateModal]);

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Toggle sidebar function that persists preference on desktop/tablet
  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.innerWidth > 768) {
        savePreferences({
          ...preferences,
          sidebarCollapsed: !next,
        });
      }
      return next;
    });
  };

  // On mobile screens, collapse sidebar on initial mount and on view changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, [view]);

  // Handle Escape key to close open drawers
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSidebarOpen(false);
      }
    }
    if (sidebarOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [sidebarOpen]);

  const today = useMemo(() => new Date(), []);
  const shownDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const shownYear = today.getFullYear() + yearOffset;

  // Mini-calendar date for sidebar (in week/day/year view, follows active anchor or selected date + month offset)
  const miniCalendarShownDate = useMemo(() => {
    let base = today;
    if (view === "week" || view === "workWeek") {
      base = weeklyAnchorDate;
    } else if (view === "day" || view === "agenda" || view === "dashboard" || view === "kanban") {
      if (selectedDate) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        base = new Date(y, m - 1, d);
      } else {
        base = today;
      }
    } else if (view === "year" || view === "yearline") {
      if (selectedDate) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        base = new Date(y, m - 1, d);
      } else {
        base = new Date(today.getFullYear() + yearOffset, today.getMonth(), 1);
      }
    }
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  }, [view, weeklyAnchorDate, selectedDate, today, monthOffset, yearOffset]);

  // Day view computed current date
  const currentDayDate = useMemo(() => {
    if (!selectedDate) return today;
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate, today]);

  const handleNavigateDay = (offset: number) => {
    const [y, m, d] = (selectedDate || todayKey).split("-").map(Number);
    const nextDate = new Date(y, m - 1, d + offset);
    const nextKey = toDateKey(nextDate);
    setSelectedDate(nextKey);
    setNewDueDate(nextKey);
    setWeeklyAnchorDate(nextDate);
    setMonthOffset(0);
  };

  const handleResetDayToToday = () => {
    setSelectedDate(todayKey);
    setNewDueDate(todayKey);
    setWeeklyAnchorDate(today);
    setMonthOffset(0);
  };

  // Week view computed values
  const weekDays = useMemo(() => {
    return getWeekDays(weeklyAnchorDate, preferences.weekStartsOn);
  }, [weeklyAnchorDate, preferences.weekStartsOn]);

  const workWeekDays = useMemo(() => {
    return getWorkWeekDays(weeklyAnchorDate);
  }, [weeklyAnchorDate]);

  const orderedWeekDayNames = useMemo(() => {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return [...names.slice(preferences.weekStartsOn), ...names.slice(0, preferences.weekStartsOn)];
  }, [preferences.weekStartsOn]);


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
          sidebarCollapsed: typeof parsed.sidebarCollapsed === "boolean" ? parsed.sidebarCollapsed : DEFAULT_PREFERENCES.sidebarCollapsed,
          itemColors: resolveItemColorPreferences(parsed.itemColors),
          itemStyles: resolveItemStylesPreferences(parsed.itemStyles, parsed.itemColors),
        };
        setPreferences(nextPreferences);
        if (typeof window !== "undefined" && window.innerWidth > 768 && typeof parsed.sidebarCollapsed === "boolean") {
          setSidebarOpen(!parsed.sidebarCollapsed);
        }
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
    const returnUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    window.location.href = `/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}`;
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
    const sectionParam = params.get("section") as SettingsSectionId | null;
    if (viewParam && (NAV_VIEWS.some((v) => v.id === viewParam) || viewParam === "settings")) {
      setView(viewParam);
    }
    if (sectionParam) {
      setSettingsSection(sectionParam);
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
      const decodedError = decodeURIComponent(gcalError);
      const friendlyError = decodedError.includes("expired")
        ? "Google authorization timed out. Please try connecting again."
        : decodedError.includes("replay attack prevented")
        ? "Authorization request already completed. Please reconnect if needed."
        : decodedError.includes("does not match")
        ? "Google Calendar connection session expired or changed. Please reconnect."
        : `Google Calendar connection failed: ${decodedError}`;
      setSaveError(friendlyError);
      showToast(`Connection notice: ${friendlyError}`);
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
        itemColors: resolveItemColorPreferences(importedPreferences.itemColors ?? preferences.itemColors),
        itemStyles: resolveItemStylesPreferences(importedPreferences.itemStyles ?? preferences.itemStyles, importedPreferences.itemColors ?? preferences.itemColors),
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
        itemType: "task",
        color: preferences.itemColors?.taskColor,
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

  const handleSaveNewTask = async (taskData: SaveTaskData): Promise<boolean> => {
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
      itemType: "task",
      color: preferences.itemColors?.taskColor,
    });
    setTasks((current) => [...current, task]);
    if (taskData.googleCalendarId && task.dueDate) {
      void handleSyncGoogle();
    }
    showToast("Task created!");
    return true;
  };

  const handleSaveNewEvent = async (eventData: SaveEventData): Promise<boolean> => {
    const isGoogle = Boolean(eventData.calendarId && eventData.calendarId !== "none");
    const targetCalendar = isGoogle
      ? preferences.googleCalendarSync?.calendarConfigs[eventData.calendarId]
      : undefined;

    const task = await createTask({
      title: eventData.title,
      dueDate: eventData.startDate,
      dueTime: eventData.isAllDay ? null : eventData.startTime,
      status: "open",
      priority: "none",
      isPinned: false,
      isPersonal: false,
      timingPreference: eventData.isAllDay ? "whenever" : "scheduled",
      labelIds: [],
      notes: eventData.notes,
      location: eventData.location,
      attendees: eventData.attendees,
      isAllDay: eventData.isAllDay,
      durationMinutes: eventData.durationMinutes,
      isPrivateAvailabilityOnly: eventData.isPrivateAvailabilityOnly,
      googleCalendarId: isGoogle ? eventData.calendarId : undefined,
      googleCalendarName: targetCalendar?.name,
      googleCalendarColor: targetCalendar?.color,
      googleAccountId: targetCalendar?.accountId,
      googleAccountEmail: targetCalendar?.accountEmail,
      isGoogleEvent: isGoogle,
      source: isGoogle ? "google" : "local",
      syncStatus: isGoogle ? "pending" : undefined,
      recurrence: eventData.recurrence,
      itemType: "event",
      color: isGoogle ? targetCalendar?.color : preferences.itemColors?.eventColor,
    });

    setTasks((current) => [...current, task]);
    if (isGoogle && task.dueDate) {
      void handleSyncGoogle();
    }
    showToast("Event created!");
    return true;
  };

  const handleSaveNewAppointment = async (apptData: SaveAppointmentData): Promise<boolean> => {
    await saveAppointmentSchedule(apptData);
    const activeDay = apptData.days.find((d) => d.enabled);
    const task = await createTask({
      title: `Availability: ${apptData.title}`,
      dueDate: selectedDate || todayKey,
      dueTime: activeDay?.startTime ?? "09:00",
      status: "open",
      priority: "none",
      isPinned: false,
      isPersonal: false,
      timingPreference: "scheduled",
      labelIds: [],
      notes: apptData.description || `Booking slot duration: ${apptData.durationMinutes} min`,
      durationMinutes: apptData.durationMinutes,
      itemType: "appointment",
      color: preferences.itemColors?.scheduleColor,
    });
    setTasks((current) => [...current, task]);
    showToast("Appointment schedule saved!");
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
    setMonthOffset(0);
  }

  function nextWeek() {
    setWeeklyAnchorDate((curr) => {
      const d = new Date(curr);
      d.setDate(d.getDate() + 7);
      return d;
    });
    setMonthOffset(0);
  }

  function todayWeek() {
    setWeeklyAnchorDate(new Date());
    setSelectedDate(todayKey);
    setNewDueDate(todayKey);
    setMonthOffset(0);
  }

  function handleSelectYearDate(dateKey: string) {
    setSelectedDate(dateKey);
    setNewDueDate(dateKey);
    const [y, m, d] = dateKey.split("-").map(Number);
    setWeeklyAnchorDate(new Date(y, m - 1, d));
    setYearOffset(y - today.getFullYear());
    setMonthOffset(0);
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
        const newKey = `${newYear}-${m}-${String(clampedD).padStart(2, "0")}`;
        setSelectedDate(newKey);
        setNewDueDate(newKey);
        setWeeklyAnchorDate(new Date(newYear, Number(m) - 1, clampedD));
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
                              {dayTasks.map((t) => {
                                const tileStyle = getItemTileStyle(t, preferences.itemStyles, activeCalendarConfigs);
                                const iType = getItemType(t);
                                const isAppt = iType === "appointment";
                                const isEvt = iType === "event";
                                return (
                                  <div
                                    key={t.id}
                                    className={`yearline-task-item ${tileStyle.className} ${t.status === "completed" ? "is-done" : ""} ${t.isPinned ? "is-pinned" : ""}`}
                                    style={{
                                      ...tileStyle.style,
                                      backgroundColor: t.status === "completed" ? "#fafaf9" : tileStyle.style.backgroundColor,
                                    }}
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
                                    {isAppt && <span className="yearline-task-badge-icon" title="Appointment Schedule">⏱️</span>}
                                    {isEvt && !t.isGoogleEvent && <span className="yearline-task-badge-icon" title="Event">📅</span>}
                                    {t.isPinned && <span className="yearline-task-pin-icon" title="Pinned: Keep this task easy to find">📌</span>}
                                    {t.isGoogleEvent && (
                                      <span
                                        className="yearline-source-dot"
                                        style={{ backgroundColor: t.googleCalendarColor || tileStyle.primaryColor }}
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
                                );
                              })}
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
            {selectedDateTasks.map((task) => {
              const tileStyle = getItemTileStyle(task, preferences.itemStyles, activeCalendarConfigs);
              const iType = getItemType(task);
              const isAppt = iType === "appointment";
              const isEvt = iType === "event";
              return (
                <div
                  key={task.id}
                  className={`selected-date-task-item ${tileStyle.className} priority-accent-${task.priority} ${task.status === "completed" ? "is-done" : ""}`}
                  style={{
                    ...tileStyle.style,
                    backgroundColor: task.status === "completed" ? "#fafaf9" : tileStyle.style.backgroundColor,
                  }}
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
                    {isAppt && <span className="badge-chip" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>⏱️ Schedule</span>}
                    {isEvt && <span className="badge-chip" style={{ backgroundColor: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>📅 Event</span>}
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
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderWeeklyPlanner = (isYearSection = false, isWorkWeek = false) => (
    <WeekView
      weekDays={isWorkWeek ? workWeekDays : weekDays}
      weeklyAnchorDate={weeklyAnchorDate}
      today={today}
      todayKey={todayKey}
      selectedDate={selectedDate}
      onSelectDate={(dateKey) => {
        setSelectedDate(dateKey);
        setNewDueDate(dateKey || "");
        if (dateKey) {
          const [y, m, d] = dateKey.split("-").map(Number);
          setWeeklyAnchorDate(new Date(y, m - 1, d));
          setMonthOffset(0);
        }
      }}
      onNavigateWeek={(offset) => {
        if (offset < 0) prevWeek();
        else nextWeek();
      }}
      onResetToToday={todayWeek}
      weekStartsOn={preferences.weekStartsOn}
      resolvedTheme={resolvedTheme}
      tasks={displayedTasks}
      allCalendarConfigs={activeCalendarConfigs}
      onAddTask={(options) =>
        openAddTask({
          date: options?.date || selectedDate || toDateKey(weeklyAnchorDate) || todayKey,
          time: options?.time,
          status: options?.status || "open",
        })
      }
      onOpenTaskDetail={openTaskDetail}
      onToggleMobileSidebar={() => setSidebarOpen((prev) => !prev)}
      activeCalendarCount={activeCalendarCount}
      currentView={view}
      weeklyViewMode={weeklyViewMode}
      onSwitchWeeklyMode={(m) => setWeeklyViewMode(m)}
      onToggleTask={toggleTask}
      onMoveTaskStatus={moveTaskToStatus}
      labels={labels}
      saveError={saveError}
      onClearSaveError={() => setSaveError("")}
      isYearSection={isYearSection}
      sectionRef={isYearSection ? weeklyPlannerRef : undefined}
      itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
      itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
    />
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
            onOpenPreferences={() => openSettings("general")}
            showToast={showToast}
          />
          <button
            type="button"
            className={`header-preferences-btn ${view === "settings" ? "is-active" : ""}`}
            onClick={() => {
              if (view === "settings") {
                setView(previousView || "month");
              } else {
                openSettings(settingsSection);
              }
            }}
            aria-label="Planner preferences and customization"
            title="Planner preferences and customization"
          >
            <Gear size={17} weight="bold" />
            <span className="preferences-btn-label">Preferences</span>
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
      <div className="content-single">
        {view === "settings" ? (
          <SettingsWorkspace
            activeSection={settingsSection}
            onSelectSection={setSettingsSection}
            onReturnToPlanner={() => setView(previousView || "month")}
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
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
            taskTemplates={taskTemplates}
            onDeleteTemplate={deleteTemplate}
          />
        ) : (
          <CalendarWorkspaceShell
            view={view}
            sidebarOpen={sidebarOpen}
            sidebarProps={{
              currentShownDate: view === "month" ? shownDate : miniCalendarShownDate,
              selectedDate,
              onSelectDate: (dateKey) => {
                setSelectedDate(dateKey);
                setNewDueDate(dateKey || "");
                if (dateKey) {
                  const [y, m, d] = dateKey.split("-").map(Number);
                  setWeeklyAnchorDate(new Date(y, m - 1, d));
                  if (view === "year" || view === "yearline") {
                    handleSelectYearDate(dateKey);
                  } else if (view === "week" || view === "workWeek") {
                    setMonthOffset(0);
                  }
                }
              },
              onNavigateMonth: (offset) => setMonthOffset((curr) => curr + offset),
              weekStartsOn: preferences.weekStartsOn,
              tasks,
              onAddEvent: (dateKey) =>
                openAddEvent({
                  date: dateKey || selectedDate || (view === "week" || view === "workWeek" ? toDateKey(weeklyAnchorDate) : todayKey),
                  time: "09:00",
                }),
              onAddTask: (dateKey) =>
                openAddTask({
                  date: dateKey || selectedDate || (view === "week" || view === "workWeek" ? toDateKey(weeklyAnchorDate) : todayKey),
                }),
              onAddAppointmentSchedule: (dateKey) =>
                openAddAppointment({
                  date: dateKey || selectedDate || (view === "week" || view === "workWeek" ? toDateKey(weeklyAnchorDate) : todayKey),
                }),
              localCalendarEnabled,
              onToggleLocalCalendar: () => setLocalCalendarEnabled((prev) => !prev),
              googleStatus,
              calendarConfigs: activeCalendarConfigs,
              onToggleCalendar: handleToggleCalendar,
              onConnectGoogle: handleConnectGoogle,
              onSyncGoogle: handleSyncGoogle,
              isSyncingGoogle,
              isOpenOnMobile: sidebarOpen,
              onCloseMobile: () => setSidebarOpen(false),
              isCollapsed: !sidebarOpen,
              onToggleCollapse: handleToggleSidebar,
              itemColors: preferences.itemColors ?? DEFAULT_ITEM_COLORS,
              itemStyles: preferences.itemStyles ?? DEFAULT_ITEM_STYLES,
            }}
          >
            {/* ===== DASHBOARD VIEW (Personal Planning Command Center) ===== */}
            {view === "dashboard" && (
              <DashboardView
                tasks={displayedTasks}
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
                onOpenPreferences={() => openSettings("dashboard")}
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
              onSaveWidgetConfigs={(nextWidgets) => {
                savePreferences({
                  ...preferences,
                  dashboardWidgets: nextWidgets,
                });
              }}
              priorityLabel={(p) => priorityLabel(p, preferences)}
              priorityEmoji={(p) => priorityEmoji(p, preferences)}
              onHabitsChanged={() => void refreshHabits()}
              itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
              itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
              allCalendarConfigs={activeCalendarConfigs}
            />
          )}

          {/* ===== YEAR VIEW (12-Month Calendar Overview + Selected Date Banner + Weekly Planner) ===== */}
          {view === "year" && (
            <>
              <YearView
                shownYear={shownYear}
                today={today}
                todayKey={todayKey}
                selectedDate={selectedDate}
                onSelectDate={handleSelectYearDate}
                onClearSelectedDate={() => setSelectedDate(null)}
                onYearChange={handleYearChange}
                weekStartsOn={preferences.weekStartsOn}
                resolvedTheme={resolvedTheme}
                tasks={displayedTasks}
                allCalendarConfigs={activeCalendarConfigs}
                activeCalendarCount={activeCalendarCount}
                itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
                itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
              />
              {/* Selected Date Quick Banner */}
              {renderSelectedDateBanner()}
              {/* Interactive Weekly Planner below year */}
              {renderWeeklyPlanner(true)}
            </>
          )}

          {/* ===== YEARLINE VIEW (Single Horizontal Row 12-Month Timeline + Selected Date Banner + Weekly Planner) ===== */}
          {view === "yearline" && (
            <>
              {renderYearlineView()}
              {/* Selected Date Quick Banner */}
              {renderSelectedDateBanner()}
              {/* Interactive Weekly Planner below year */}
              {renderWeeklyPlanner(true)}
            </>
          )}

          {/* ===== DAY VIEW ===== */}
          {view === "day" && (
            <DayView
              currentDate={currentDayDate}
              currentDateKey={selectedDate || todayKey}
              today={today}
              todayKey={todayKey}
              onNavigateDay={handleNavigateDay}
              onResetToToday={handleResetDayToToday}
              onSelectDate={(dateKey) => {
                setSelectedDate(dateKey);
                setNewDueDate(dateKey);
                const [y, m, d] = dateKey.split("-").map(Number);
                setWeeklyAnchorDate(new Date(y, m - 1, d));
              }}
              resolvedTheme={resolvedTheme}
              tasks={displayedTasks}
              allCalendarConfigs={activeCalendarConfigs}
              onAddTask={(options) =>
                openAddTask({
                  date: options?.date || selectedDate || todayKey,
                  time: options?.time,
                  status: options?.status || "open",
                })
              }
              onOpenTaskDetail={openTaskDetail}
              activeCalendarCount={activeCalendarCount}
              currentView={view}
              itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
              itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
            />
          )}

          {/* ===== WEEK VIEW ===== */}
          {view === "week" && renderWeeklyPlanner(false, false)}

          {/* ===== WORK WEEKS VIEW ===== */}
          {view === "workWeek" && renderWeeklyPlanner(false, true)}

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
                        {colTasks.map((task) => {
                          const tileStyle = getItemTileStyle(task, preferences.itemStyles, activeCalendarConfigs);
                          const iType = getItemType(task);
                          const isAppt = iType === "appointment";
                          const isEvt = iType === "event";
                          return (
                            <div
                              className={`kanban-tile ${tileStyle.className} priority-accent-${task.priority} ${task.isPinned ? "is-pinned" : ""}`}
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
                                <span className="kanban-drag-handle" aria-hidden="true"><DotsSixVertical size={14} /></span>
                                {task.isPinned && <span className="kanban-pin-badge" title="Pinned: Keep this task easy to find">📌</span>}
                                <button type="button" className="kanban-tile-title" onClick={() => openTaskDetail(task)}>{task.title}</button>
                              </div>
                              <div className="kanban-tile-meta">
                                <div className="kanban-badges-group">
                                  {isAppt && <span className="badge-chip" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>⏱️ Schedule</span>}
                                  {isEvt && <span className="badge-chip" style={{ backgroundColor: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>📅 Event</span>}
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
            </section>
          )}

          {/* ===== GOOGLE CALENDAR-STYLE MONTH WORKSPACE ===== */}
          {view === "month" && (
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
              activeCalendarCount={activeCalendarCount}
              itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
              itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
            />
          )}

          {/* ===== AGENDA VIEW (Google Calendar Shared Sidebar + Chronological Schedule) ===== */}
          {view === "agenda" && (
            <AgendaView
              today={today}
              todayKey={todayKey}
              selectedDate={selectedDate}
              onSelectDate={(dateKey) => {
                setSelectedDate(dateKey);
                setNewDueDate(dateKey || "");
                if (dateKey) {
                  const [y, m, d] = dateKey.split("-").map(Number);
                  setWeeklyAnchorDate(new Date(y, m - 1, d));
                  setMonthOffset(0);
                }
              }}
              tasks={displayedTasks}
              allTasksCount={tasks.length}
              allCalendarConfigs={activeCalendarConfigs}
              labels={labels}
              resolvedTheme={resolvedTheme}
              priorityLabel={(p) => priorityLabel(p, preferences)}
              priorityEmoji={(p) => priorityEmoji(p, preferences)}
              onOpenTaskDetail={openTaskDetail}
              onAddTask={(options) =>
                openAddTask({
                  date: options?.date || selectedDate || todayKey,
                  time: options?.time,
                  status: options?.status || "open",
                })
              }
              onToggleTask={(task) => void toggleTask(task)}
              activeCalendarCount={activeCalendarCount}
              itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
              itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
            />
          )}
        </CalendarWorkspaceShell>
        )}
      </div>

      {/* ===== UNIFIED CREATION MODAL (Event, Task & Appointment Schedule) ===== */}
      <UnifiedCreateModal
        isOpen={addTaskOpen}
        onClose={closeAddTask}
        initialMode={createModalMode}
        initialDate={addTaskDueDate}
        initialTime={addTaskDueTime}
        preferences={preferences}
        labels={labels}
        onAddLabel={addLabel}
        writableCalendars={writableCalendars}
        existingTasks={tasks}
        onSaveEvent={handleSaveNewEvent}
        onSaveTask={handleSaveNewTask}
        onSaveAppointmentSchedule={handleSaveNewAppointment}
      />

      {/* ===== TASK / EVENT DETAIL MODAL ===== */}
      {detailTask && detailTaskId && (() => {
        const itemType = getItemType(detailTask);
        const tileStyle = getItemTileStyle(detailTask, preferences.itemStyles, activeCalendarConfigs);
        const itemColor = tileStyle.primaryColor;
        const isEvent = itemType === "event" || Boolean(detailTask.isGoogleEvent || detailTask.durationMinutes || detailTask.isAllDay);
        const isAppt = itemType === "appointment";
        return (
          <div className="modal-overlay" onClick={() => { setDetailTaskId(null); setEditingId(null); }} onKeyDown={(e) => { if (e.key === "Escape") { setDetailTaskId(null); setEditingId(null); } }}>
            <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={isAppt ? "Appointment schedule details" : isEvent ? "Event details" : "Task details"}>
              <div className="modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{isAppt ? "Appointment Details" : isEvent ? "Event Details" : "Task Details"}</h3>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: `${itemColor}20`,
                      color: tileStyle.indicatorColor,
                      border: `1.5px solid ${tileStyle.borderColor}`,
                    }}
                  >
                    {isAppt ? "⏱️ Appointment Schedule" : isEvent ? "📅 Event" : "☑️ Task"}
                  </span>
                </div>
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
                <label className="detail-label">{isEvent ? "Description" : "Notes"}
                  <textarea maxLength={2000} rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder={isEvent ? "Meeting agenda, notes or documents…" : "Add details or a reminder…"} />
                </label>
                <label className="detail-label">Location
                  <input maxLength={200} value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Physical address, room, or meeting link" />
                </label>
                <div className="detail-grid">
                  <label className="detail-label">{isEvent ? "Event Date" : "Due date"} <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></label>
                  <label className="detail-label">{isEvent ? "Start time" : "Scheduled time (optional)"} <input type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} /></label>
                  {!isEvent && (
                    <label className="detail-label">Status
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as PlannerTask["status"])}>
                        <option value="open">To Do</option><option value="in_progress">In Progress</option><option value="completed">Done</option>
                      </select>
                    </label>
                  )}
                  <label className="detail-label">Repeat
                    <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value as PlannerTask["recurrence"])}>
                      <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                    </select>
                  </label>
                  {!isEvent && (
                    <label className="detail-label">Project
                      <select value={editProjectId} onChange={(e) => setEditProjectId(e.target.value)}>
                        <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {!isEvent && (
                  <>
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
                  </>
                )}
                {saveError && <p className="save-error" role="status">{saveError}</p>}
                <div className="detail-actions">
                  <button type="submit" className="task-action save">Save changes</button>
                  <button type="button" className="task-action delete" onClick={() => void deleteTask(detailTask)}>Delete</button>
                  <button type="button" className="task-action" onClick={() => { setDetailTaskId(null); setEditingId(null); }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ===== TOAST ===== */}
      {toast && <div className="toast" role="status">{toast}</div>}

      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
