"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  CalendarBlank,
  CaretDown,
  CaretRight,
  CaretLeft,
  CheckCircle,
  Circle,
  Lock,
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  ArrowCounterClockwise,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import { ChevronLeft, ChevronRight, CalendarClock, CheckSquare, CalendarPlus } from "lucide-react";
import type { PlannerTask } from "@/lib/schedule/types";
import type {
  GoogleCalendarConfig,
  GoogleIntegrationStatus,
  ConnectedGoogleAccount,
} from "@/lib/google-calendar/types";
import { LOCAL_HOLIDAYS_COLOR } from "@/lib/holidays/service";
import { renameGoogleAccount, renameGoogleCalendar } from "@/lib/google-calendar/sync-service";
import { type ItemColorPreferences, DEFAULT_ITEM_COLORS, type ItemStylesPreferences, DEFAULT_ITEM_STYLES } from "@/lib/calendar/item-color";

export interface CalendarSidebarProps {
  currentShownDate: Date;
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onNavigateMonth: (offset: number) => void;
  weekStartsOn: 0 | 1 | 6;
  tasks: PlannerTask[];
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;

  onAddEvent: (dateKey?: string) => void;
  onAddTask: (dateKey?: string) => void;
  onAddAppointmentSchedule?: (dateKey?: string) => void;

  localCalendarEnabled: boolean;
  onToggleLocalCalendar: () => void;
  /** Built-in Holidays calendar (independent of Google Calendar). */
  localHolidaysEnabled?: boolean;
  onToggleLocalHolidays?: () => void;
  googleStatus: GoogleIntegrationStatus | null;
  calendarConfigs: Record<string, GoogleCalendarConfig>;
  onToggleCalendar: (calendarId: string) => void;
  onConnectGoogle: () => void;
  onSyncGoogle: () => Promise<void>;
  isSyncingGoogle: boolean;

  onRenameAccount?: (accountId: string, newName: string | null) => Promise<void>;
  onRenameCalendar?: (calendarId: string, newName: string | null) => Promise<void>;

  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;

  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function CalendarSidebar({
  currentShownDate,
  selectedDate,
  onSelectDate,
  onNavigateMonth,
  weekStartsOn,
  tasks,
  itemColors = DEFAULT_ITEM_COLORS,
  itemStyles = DEFAULT_ITEM_STYLES,
  onAddEvent,
  onAddTask,
  onAddAppointmentSchedule,
  localCalendarEnabled,
  onToggleLocalCalendar,
  localHolidaysEnabled = true,
  onToggleLocalHolidays,
  googleStatus,
  calendarConfigs,
  onToggleCalendar,
  onConnectGoogle,
  onSyncGoogle,
  isSyncingGoogle,
  onRenameAccount,
  onRenameCalendar,
  isOpenOnMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}: CalendarSidebarProps) {
  // Create Dropdown state
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mini-calendar state (internal offset relative to current shown date)
  const [miniMonthOffset, setMiniMonthOffset] = useState(0);

  // Collapsible section toggles
  const [myCalendarsOpen, setMyCalendarsOpen] = useState(true);
  const [clientCalendarsOpen, setClientCalendarsOpen] = useState(true);
  const [otherCalendarsOpen, setOtherCalendarsOpen] = useState(true);

  // Search filter query
  const [searchQuery, setSearchQuery] = useState("");

  // Rename Dialog State
  const [renameTarget, setRenameTarget] = useState<{
    calendar: GoogleCalendarConfig;
    account?: ConnectedGoogleAccount;
    currentDisplayName: string;
    originalEmail: string;
    originalName: string;
  } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleSaveRename = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameTarget) return;

    setIsSavingRename(true);
    setRenameError(null);
    const trimmed = renameInput.trim();
    const finalName = trimmed.length > 0 ? trimmed : null;

    try {
      if (onRenameAccount && renameTarget.account?.accountId) {
        await onRenameAccount(renameTarget.account.accountId, finalName);
      } else if (onRenameCalendar && renameTarget.calendar?.id) {
        await onRenameCalendar(renameTarget.calendar.id, finalName);
      } else if (renameTarget.account?.accountId) {
        await renameGoogleAccount(renameTarget.account.accountId, finalName);
      } else if (renameTarget.calendar?.id) {
        await renameGoogleCalendar(renameTarget.calendar.id, finalName);
      }
      setRenameTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save display name.";
      setRenameError(msg);
    } finally {
      setIsSavingRename(false);
    }
  };

  const handleResetToOriginal = async () => {
    if (!renameTarget) return;
    setIsSavingRename(true);
    setRenameError(null);

    try {
      if (onRenameAccount && renameTarget.account?.accountId) {
        await onRenameAccount(renameTarget.account.accountId, null);
      } else if (onRenameCalendar && renameTarget.calendar?.id) {
        await onRenameCalendar(renameTarget.calendar.id, null);
      } else if (renameTarget.account?.accountId) {
        await renameGoogleAccount(renameTarget.account.accountId, null);
      } else if (renameTarget.calendar?.id) {
        await renameGoogleCalendar(renameTarget.calendar.id, null);
      }
      setRenameTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reset display name.";
      setRenameError(msg);
    } finally {
      setIsSavingRename(false);
    }
  };

  // Close rename modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && renameTarget && !isSavingRename) {
        setRenameTarget(null);
      }
    }
    if (renameTarget) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [renameTarget, isSavingRename]);

  // Close create dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCreateDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCreateDropdownOpen(false);
      }
    }
    if (createDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [createDropdownOpen]);

  // Synchronize mini-calendar with main calendar when main calendar month changes
  const shownYear = currentShownDate.getFullYear();
  const shownMonth = currentShownDate.getMonth();
  useEffect(() => {
    setMiniMonthOffset(0);
  }, [shownYear, shownMonth]);

  // Mini Calendar date math
  const today = new Date();
  const miniShownDate = useMemo(() => {
    return new Date(
      currentShownDate.getFullYear(),
      currentShownDate.getMonth() + miniMonthOffset,
      1
    );
  }, [currentShownDate, miniMonthOffset]);

  const miniCalendarDays = useMemo(() => {
    const firstDayIndex = new Date(
      miniShownDate.getFullYear(),
      miniShownDate.getMonth(),
      1
    ).getDay();
    const offset = (firstDayIndex - weekStartsOn + 7) % 7;
    const daysInCurrMonth = new Date(
      miniShownDate.getFullYear(),
      miniShownDate.getMonth() + 1,
      0
    ).getDate();

    const days: Array<{ day: number | null; dateKey: string; isCurrentMonth: boolean }> = [];

    // Empty lead cells
    for (let i = 0; i < offset; i++) {
      days.push({ day: null, dateKey: "", isCurrentMonth: false });
    }

    // Days in month
    for (let d = 1; d <= daysInCurrMonth; d++) {
      const y = miniShownDate.getFullYear();
      const m = String(miniShownDate.getMonth() + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      days.push({ day: d, dateKey: `${y}-${m}-${dayStr}`, isCurrentMonth: true });
    }

    return days;
  }, [miniShownDate, weekStartsOn]);

  // Task activity lookup for mini-calendar dots
  const taskDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.dueDate) set.add(t.dueDate);
    }
    return set;
  }, [tasks]);

  const orderedMiniWeekdays = useMemo(() => {
    const days = ["S", "M", "T", "W", "T", "F", "S"];
    return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)];
  }, [weekStartsOn]);

  // All active calendar list from configs
  const allCalendars = useMemo(() => {
    return Object.values(calendarConfigs);
  }, [calendarConfigs]);

  // Categorize calendars: My Calendars vs Client Calendars vs Other Calendars
  const { myCalendars, clientCalendars, otherCalendars } = useMemo(() => {
    const primaryAccountEmail = googleStatus?.userEmail?.toLowerCase();

    const my: GoogleCalendarConfig[] = [];
    const client: GoogleCalendarConfig[] = [];
    const other: GoogleCalendarConfig[] = [];

    for (const cal of allCalendars) {
      const matchingAccount = googleStatus?.accounts?.find((acc) =>
        (cal.accountId && acc.accountId === cal.accountId) ||
        (cal.accountEmail && acc.userEmail.toLowerCase() === cal.accountEmail.toLowerCase())
      );
      const accountCustomName = matchingAccount?.customDisplayName || cal.accountCustomDisplayName;
      const calendarCustomName = cal.customDisplayName;

      // Filter by search query if present
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = cal.name.toLowerCase().includes(q);
        const matchesEmail = cal.accountEmail?.toLowerCase().includes(q);
        const matchesId = cal.id.toLowerCase().includes(q);
        const matchesAccountCustom = Boolean(accountCustomName?.toLowerCase().includes(q));
        const matchesCalendarCustom = Boolean(calendarCustomName?.toLowerCase().includes(q));
        if (!matchesName && !matchesEmail && !matchesId && !matchesAccountCustom && !matchesCalendarCustom) {
          continue;
        }
      }

      const isReadOnly = cal.accessRole === "reader" || cal.accessRole === "freeBusyReader";
      const isClientAccount = Boolean(
        cal.accountEmail &&
        primaryAccountEmail &&
        cal.accountEmail.toLowerCase() !== primaryAccountEmail
      );

      if (isClientAccount) {
        client.push(cal);
      } else if (cal.primary || cal.accessRole === "owner" || !isReadOnly) {
        my.push(cal);
      } else {
        other.push(cal);
      }
    }

    return { myCalendars: my, clientCalendars: client, otherCalendars: other };
  }, [allCalendars, googleStatus, searchQuery]);

  // Reusable renderer for calendar rows with custom display names
  const renderCalendarRow = (cal: GoogleCalendarConfig, isClient = false) => {
    const isChecked = cal.enabled !== false;
    const isReadOnly = cal.accessRole === "reader" || cal.accessRole === "freeBusyReader";

    const matchingAccount = googleStatus?.accounts?.find((acc) =>
      (cal.accountId && acc.accountId === cal.accountId) ||
      (cal.accountEmail && acc.userEmail.toLowerCase() === cal.accountEmail.toLowerCase())
    );

    const accountCustomName = matchingAccount?.customDisplayName || cal.accountCustomDisplayName;
    const calendarCustomName = cal.customDisplayName;

    let primaryLabel = cal.name;
    const secondaryLabel = cal.accountEmail;

    if (calendarCustomName) {
      primaryLabel = calendarCustomName;
    } else if (accountCustomName) {
      if (
        cal.primary ||
        !cal.name ||
        cal.name.toLowerCase() === cal.accountEmail?.toLowerCase() ||
        cal.name.toLowerCase() === matchingAccount?.userEmail.toLowerCase() ||
        cal.name.toLowerCase() === matchingAccount?.userName?.toLowerCase()
      ) {
        primaryLabel = accountCustomName;
      } else {
        primaryLabel = `${accountCustomName} – ${cal.name}`;
      }
    }

    const hasCustomName = Boolean(calendarCustomName || accountCustomName);

    return (
      <div
        key={cal.id}
        className={`calendar-item-row ${isClient ? "client-calendar-row" : ""} ${hasCustomName ? "has-custom-name" : ""}`}
      >
        <label className="calendar-item-clickable">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleCalendar(cal.id)}
            className="calendar-checkbox"
          />
          <span
            className="calendar-color-swatch"
            style={{ backgroundColor: cal.color || (isClient ? "#10b981" : "#3b5bff") }}
          />
          <div className="calendar-item-info">
            <span className="calendar-item-name" title={primaryLabel}>
              {primaryLabel}
            </span>
            {secondaryLabel && (
              <span
                className={`calendar-item-account ${isClient ? "client-email" : ""}`}
                title={secondaryLabel}
              >
                {secondaryLabel}
              </span>
            )}
          </div>
        </label>

        <div className="calendar-item-trailing">
          {cal.primary && <span className="calendar-badge badge-primary">Primary</span>}
          {isClient && (
            isReadOnly ? (
              <span className="calendar-badge badge-readonly" title="Read-only client calendar">
                <Lock size={10} weight="bold" /> Read-only
              </span>
            ) : (
              <span className="calendar-badge badge-editable" title="Full edit access">
                Edit
              </span>
            )
          )}
          <button
            type="button"
            className={`calendar-item-edit-btn ${hasCustomName ? "is-customized" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRenameTarget({
                calendar: cal,
                account: matchingAccount,
                currentDisplayName: accountCustomName || calendarCustomName || "",
                originalEmail: cal.accountEmail || matchingAccount?.userEmail || "",
                originalName: cal.name || matchingAccount?.userName || "",
              });
              setRenameInput(accountCustomName || calendarCustomName || "");
              setRenameError(null);
            }}
            aria-label={`Rename ${primaryLabel}`}
            title={`Customize display name (${cal.accountEmail || cal.name})`}
          >
            <PencilSimple size={12} weight="bold" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`calendar-sidebar-rail ${isCollapsed ? "is-collapsed" : "is-expanded"}`}>
      {/* Mobile Drawer Backdrop */}
      {isOpenOnMobile && (
        <div
          className="calendar-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`calendar-sidebar neo-card ${isOpenOnMobile ? "is-open-mobile" : ""}`}>
        {/* Mobile Header with Close Button */}
        <div className="sidebar-mobile-header">
          <div className="sidebar-mobile-title">
            <CalendarBlank size={18} weight="bold" />
            <span>Calendars</span>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* 1. Prominent "+ Create" Button & Dropdown */}
        <div className="sidebar-create-section" ref={dropdownRef}>
          <button
            type="button"
            className="sidebar-create-btn"
            onClick={() => setCreateDropdownOpen((prev) => !prev)}
            aria-expanded={createDropdownOpen}
            aria-haspopup="true"
            id="sidebar-create-button"
          >
            <span className="create-btn-icon">
              <Plus size={20} weight="bold" />
            </span>
            <span className="create-btn-text">Create</span>
            <CaretDown size={14} weight="bold" className={`create-caret ${createDropdownOpen ? "open" : ""}`} />
          </button>

          {createDropdownOpen && (
            <div className="sidebar-create-dropdown" role="menu" aria-label="Create options">
              <button
                type="button"
                className="create-dropdown-item item-event"
                role="menuitem"
                id="create-dropdown-event-option"
                onClick={() => {
                  setCreateDropdownOpen(false);
                  onAddEvent(selectedDate || undefined);
                }}
              >
                <div className="create-dropdown-item-content">
                  <span className="item-icon event-icon" aria-hidden="true">
                    <CalendarClock size={17} strokeWidth={2.2} />
                  </span>
                  <div className="item-details">
                    <strong className="item-title">Create an event</strong>
                    <small className="item-desc">Meetings, appointments, or anything happening at a specific time.</small>
                  </div>
                </div>
                <ChevronRight size={15} strokeWidth={2.2} className="item-chevron" aria-hidden="true" />
              </button>

              <button
                type="button"
                className="create-dropdown-item item-task"
                role="menuitem"
                id="create-dropdown-task-option"
                onClick={() => {
                  setCreateDropdownOpen(false);
                  onAddTask(selectedDate || undefined);
                }}
              >
                <div className="create-dropdown-item-content">
                  <span className="item-icon task-icon" aria-hidden="true">
                    <CheckSquare size={17} strokeWidth={2.2} />
                  </span>
                  <div className="item-details">
                    <strong className="item-title">Create a task</strong>
                    <small className="item-desc">To-dos and work you need to complete.</small>
                  </div>
                </div>
                <ChevronRight size={15} strokeWidth={2.2} className="item-chevron" aria-hidden="true" />
              </button>

              <button
                type="button"
                className="create-dropdown-item item-appointment"
                role="menuitem"
                id="create-dropdown-appointment-option"
                onClick={() => {
                  setCreateDropdownOpen(false);
                  onAddAppointmentSchedule?.(selectedDate || undefined);
                }}
              >
                <div className="create-dropdown-item-content">
                  <span className="item-icon appointment-icon" aria-hidden="true">
                    <CalendarPlus size={17} strokeWidth={2.2} />
                  </span>
                  <div className="item-details">
                    <strong className="item-title">Appointment schedule</strong>
                    <small className="item-desc">Set up bookable availability and meeting slots.</small>
                  </div>
                </div>
                <ChevronRight size={15} strokeWidth={2.2} className="item-chevron" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* 2. Interactive Mini-Calendar */}
        <div className="sidebar-mini-calendar">
          <div className="mini-calendar-header">
            <span className="mini-month-label">
              {miniShownDate.toLocaleDateString("en", { month: "long", year: "numeric" })}
            </span>
            <div className="mini-nav-buttons">
              <button
                type="button"
                className="mini-nav-btn"
                aria-label="Previous month in mini calendar"
                onClick={() => setMiniMonthOffset((o) => o - 1)}
              >
                <CaretLeft size={13} weight="bold" />
              </button>
              <button
                type="button"
                className="mini-today-btn"
                title="Jump to current month"
                onClick={() => {
                  setMiniMonthOffset(0);
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                  onSelectDate(todayStr);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="mini-nav-btn"
                aria-label="Next month in mini calendar"
                onClick={() => setMiniMonthOffset((o) => o + 1)}
              >
                <CaretRight size={13} weight="bold" />
              </button>
            </div>
          </div>

          <div className="mini-calendar-grid">
            {orderedMiniWeekdays.map((wd, i) => (
              <div key={`${wd}-${i}`} className="mini-weekday">
                {wd}
              </div>
            ))}

            {miniCalendarDays.map((item, idx) => {
              if (!item.day) {
                return <div key={`empty-${idx}`} className="mini-day-cell empty" />;
              }

              const isToday =
                item.day === today.getDate() &&
                miniShownDate.getMonth() === today.getMonth() &&
                miniShownDate.getFullYear() === today.getFullYear();
              const isSelected = selectedDate === item.dateKey;
              const hasTasks = taskDatesSet.has(item.dateKey);

              return (
                <button
                  type="button"
                  key={item.dateKey}
                  className={`mini-day-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${hasTasks ? "has-tasks" : ""}`}
                  onClick={() => {
                    onSelectDate(item.dateKey);
                    // If mini-calendar was scrolled to another month, sync main view
                    if (miniMonthOffset !== 0) {
                      onNavigateMonth(miniMonthOffset);
                      setMiniMonthOffset(0);
                    }
                  }}
                  aria-label={`${item.dateKey}${isToday ? ", today" : ""}${isSelected ? ", selected" : ""}`}
                >
                  <span className="mini-day-number">{item.day}</span>
                  {hasTasks && <span className="mini-day-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Search Calendars & People */}
        <div className="sidebar-search-box">
          <MagnifyingGlass size={15} weight="bold" className="search-icon" />
          <input
            type="text"
            placeholder="Search calendars..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sidebar-search-input"
            aria-label="Search calendars and clients"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear calendar search"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        {/* 4. Calendar Sections Container (Scrollable) */}
        <div className="sidebar-calendar-lists">
          {/* Section A: My Calendars */}
          <div className="calendar-section">
            <button
              type="button"
              className="section-header-btn"
              onClick={() => setMyCalendarsOpen((prev) => !prev)}
              aria-expanded={myCalendarsOpen}
            >
              <span className="section-chevron">
                {myCalendarsOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </span>
              <span className="section-title">My Calendars</span>
              <span className="section-count">{1 + (onToggleLocalHolidays ? 1 : 0) + myCalendars.length}</span>
            </button>

            {myCalendarsOpen && (
              <div className="calendar-items-list">
                {/* Local Planorama Planner Tasks */}
                <div className="calendar-item-row local-calendar-row">
                  <label className="calendar-item-clickable">
                    <input
                      type="checkbox"
                      checked={localCalendarEnabled}
                      onChange={onToggleLocalCalendar}
                      className="calendar-checkbox"
                    />
                    <span
                      className="calendar-color-swatch"
                      style={{ backgroundColor: itemStyles?.event?.primaryColor || itemColors.eventColor }}
                    />
                    <div className="calendar-item-info">
                      <span className="calendar-item-name" title="Personal Planner">Personal Planner</span>
                    </div>
                  </label>
                  <div className="calendar-item-trailing">
                    <span className="calendar-badge badge-local">Local</span>
                  </div>
                </div>

                {/* Built-in Holidays calendar (own colour, no Google account needed) */}
                {onToggleLocalHolidays && (
                  <div className="calendar-item-row local-calendar-row">
                    <label className="calendar-item-clickable">
                      <input
                        type="checkbox"
                        checked={localHolidaysEnabled}
                        onChange={onToggleLocalHolidays}
                        className="calendar-checkbox"
                      />
                      <span className="calendar-color-swatch" style={{ backgroundColor: LOCAL_HOLIDAYS_COLOR }} />
                      <div className="calendar-item-info">
                        <span className="calendar-item-name" title="Holidays">Holidays</span>
                      </div>
                    </label>
                    <div className="calendar-item-trailing">
                      <span className="calendar-badge badge-local">Local</span>
                    </div>
                  </div>
                )}

                {/* Primary Google Calendars */}
                {myCalendars.map((cal) => renderCalendarRow(cal, false))}
              </div>
            )}
          </div>

          {/* Section B: Client Calendars (Virtual Assistant Multi-Account Management) */}
          <div className="calendar-section">
            <button
              type="button"
              className="section-header-btn"
              onClick={() => setClientCalendarsOpen((prev) => !prev)}
              aria-expanded={clientCalendarsOpen}
            >
              <span className="section-chevron">
                {clientCalendarsOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </span>
              <span className="section-title">Client Calendars</span>
              <span className="section-count client-count">{clientCalendars.length}</span>
            </button>

            {clientCalendarsOpen && (
              <div className="calendar-items-list">
                {clientCalendars.length > 0 ? (
                  clientCalendars.map((cal) => renderCalendarRow(cal, true))
                ) : (
                  <div className="calendar-empty-hint">
                    <p>No client calendars connected yet.</p>
                    <small>Virtual assistants can connect secondary client accounts to manage schedules side-by-side.</small>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section C: Other Calendars */}
          {otherCalendars.length > 0 && (
            <div className="calendar-section">
              <button
                type="button"
                className="section-header-btn"
                onClick={() => setOtherCalendarsOpen((prev) => !prev)}
                aria-expanded={otherCalendarsOpen}
              >
                <span className="section-chevron">
                  {otherCalendarsOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
                </span>
                <span className="section-title">Other Calendars</span>
                <span className="section-count">{otherCalendars.length}</span>
              </button>

              {otherCalendarsOpen && (
                <div className="calendar-items-list">
                  {otherCalendars.map((cal) => renderCalendarRow(cal, false))}
                </div>
              )}
            </div>
          )}

          {/* Action to connect another Google account / add client */}
          <div className="sidebar-connect-action">
            <button
              type="button"
              className="sidebar-add-account-btn"
              onClick={onConnectGoogle}
              title="Connect personal Google account or add a client calendar"
            >
              <Plus size={14} weight="bold" />
              <span>{googleStatus?.connected ? "+ Add Client Account" : "+ Connect Google Calendar"}</span>
            </button>
          </div>
        </div>

        {/* 5. Real-time Synchronization Status Footer */}
        <div className="sidebar-footer-sync">
          <div className="sync-status-indicator">
            {isSyncingGoogle ? (
              <>
                <ArrowClockwise size={15} weight="bold" className="sync-spinner" />
                <span className="status-text syncing">Syncing...</span>
              </>
            ) : googleStatus?.connected ? (
              <>
                <CheckCircle size={15} weight="fill" className="status-icon connected" />
                <div className="status-text-group">
                  <span className="status-text connected">Connected</span>
                  {googleStatus.lastSyncTime && (
                    <small className="sync-timestamp">
                      {new Date(googleStatus.lastSyncTime).toLocaleTimeString("en", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  )}
                </div>
              </>
            ) : (
              <>
                <Circle size={13} weight="fill" className="status-icon local" />
                <span className="status-text local">Local Mode</span>
              </>
            )}
          </div>

          {googleStatus?.connected && (
            <button
              type="button"
              className="sidebar-sync-now-btn"
              onClick={onSyncGoogle}
              disabled={isSyncingGoogle}
              title="Sync with Google Calendar now"
              aria-label="Sync with Google Calendar now"
            >
              <ArrowClockwise size={13} weight="bold" className={isSyncingGoogle ? "sync-spinner" : ""} />
              <span>Sync</span>
            </button>
          )}
        </div>

        {/* Rename Modal / Popover */}
        {renameTarget && (
          <div
            className="calendar-rename-modal-overlay"
            onClick={() => !isSavingRename && setRenameTarget(null)}
            role="presentation"
          >
            <div
              className="calendar-rename-modal neo-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rename-dialog-title"
            >
              <div className="rename-modal-header">
                <div className="rename-modal-title-group">
                  <span className="rename-modal-icon-badge">
                    <PencilSimple size={16} weight="bold" />
                  </span>
                  <h3 id="rename-dialog-title" className="rename-modal-title">
                    Customize Display Name
                  </h3>
                </div>
                <button
                  type="button"
                  className="rename-modal-close-btn"
                  onClick={() => !isSavingRename && setRenameTarget(null)}
                  aria-label="Close dialog"
                  disabled={isSavingRename}
                >
                  <X size={15} weight="bold" />
                </button>
              </div>

              <div className="rename-modal-body">
                {/* Secondary Information: Original Identity */}
                <div className="rename-account-meta-box">
                  <div className="rename-meta-icon">
                    <CalendarBlank size={18} weight="duotone" />
                  </div>
                  <div className="rename-meta-details">
                    <div className="rename-meta-email-row">
                      <strong className="rename-meta-email" title={renameTarget.originalEmail || renameTarget.calendar.name}>
                        {renameTarget.originalEmail || renameTarget.calendar.name}
                      </strong>
                      {renameTarget.calendar.primary ? (
                        <span className="calendar-badge badge-primary">Primary</span>
                      ) : renameTarget.account && !renameTarget.account.isPrimary ? (
                        <span className="calendar-badge badge-client">Client</span>
                      ) : null}
                    </div>
                    {renameTarget.originalName && renameTarget.originalName !== renameTarget.originalEmail && (
                      <span className="rename-meta-original-name">
                        Original Google Name: {renameTarget.originalName}
                      </span>
                    )}
                    <small className="rename-meta-hint">
                      The custom name replaces this email as the primary visible label in the sidebar.
                    </small>
                  </div>
                </div>

                <form onSubmit={handleSaveRename}>
                  <div className="rename-form-field">
                    <label htmlFor="custom-display-name-input" className="rename-field-label">
                      Custom Display Name
                    </label>
                    <input
                      id="custom-display-name-input"
                      type="text"
                      className="rename-field-input"
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      placeholder="e.g. Client A – Marketing, My Personal Calendar"
                      maxLength={80}
                      autoFocus
                      disabled={isSavingRename}
                    />
                    <span className="rename-field-subtext">
                      Changes will persist across refreshes, devices, and sessions without overwriting Google account info.
                    </span>
                  </div>

                  {renameError && (
                    <div className="rename-error-alert" role="alert">
                      {renameError}
                    </div>
                  )}

                  <div className="rename-modal-footer">
                    <button
                      type="button"
                      className="rename-reset-btn"
                      onClick={handleResetToOriginal}
                      disabled={isSavingRename || !renameTarget.currentDisplayName}
                      title="Reset to original Google account name or email fallback"
                    >
                      <ArrowCounterClockwise size={13} weight="bold" />
                      <span>Reset to Original</span>
                    </button>

                    <div className="rename-footer-right">
                      <button
                        type="button"
                        className="rename-cancel-btn"
                        onClick={() => setRenameTarget(null)}
                        disabled={isSavingRename}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rename-save-btn"
                        disabled={isSavingRename}
                      >
                        {isSavingRename ? (
                          <>
                            <ArrowClockwise size={13} weight="bold" className="sync-spinner" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Save</span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Desktop/Tablet Edge Collapse / Expand Arrow Button */}
      {onToggleCollapse && (
        <button
          type="button"
          className={`sidebar-edge-toggle-btn ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand calendar sidebar" : "Collapse calendar sidebar"}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? "Expand calendar sidebar" : "Collapse calendar sidebar"}
          id="sidebar-edge-toggle-btn"
        >
          {isCollapsed ? (
            <ChevronRight size={16} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={16} strokeWidth={2.5} />
          )}
        </button>
      )}
    </div>
  );
}
