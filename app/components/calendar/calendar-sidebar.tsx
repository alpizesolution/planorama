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
  X,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type {
  GoogleCalendarConfig,
  GoogleIntegrationStatus,
} from "@/lib/google-calendar/types";

interface CalendarSidebarProps {
  currentShownDate: Date;
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onNavigateMonth: (offset: number) => void;
  weekStartsOn: 0 | 1 | 6;
  tasks: PlannerTask[];

  onAddEvent: (dateKey?: string) => void;
  onAddTask: (dateKey?: string) => void;

  localCalendarEnabled: boolean;
  onToggleLocalCalendar: () => void;
  googleStatus: GoogleIntegrationStatus | null;
  calendarConfigs: Record<string, GoogleCalendarConfig>;
  onToggleCalendar: (calendarId: string) => void;
  onConnectGoogle: () => void;
  onSyncGoogle: () => Promise<void>;
  isSyncingGoogle: boolean;

  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

export function CalendarSidebar({
  currentShownDate,
  selectedDate,
  onSelectDate,
  onNavigateMonth,
  weekStartsOn,
  tasks,
  onAddEvent,
  onAddTask,
  localCalendarEnabled,
  onToggleLocalCalendar,
  googleStatus,
  calendarConfigs,
  onToggleCalendar,
  onConnectGoogle,
  onSyncGoogle,
  isSyncingGoogle,
  isOpenOnMobile = false,
  onCloseMobile,
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

  // Close create dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCreateDropdownOpen(false);
      }
    }
    if (createDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      // Filter by search query if present
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = cal.name.toLowerCase().includes(q);
        const matchesEmail = cal.accountEmail?.toLowerCase().includes(q);
        const matchesId = cal.id.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesId) continue;
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

  return (
    <>
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
            <div className="sidebar-create-dropdown" role="menu">
              <button
                type="button"
                className="create-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setCreateDropdownOpen(false);
                  onAddEvent(selectedDate || undefined);
                }}
              >
                <span className="item-icon event-icon">📅</span>
                <div className="item-details">
                  <strong>Event</strong>
                  <small>Timed meeting or calendar event</small>
                </div>
              </button>
              <button
                type="button"
                className="create-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setCreateDropdownOpen(false);
                  onAddTask(selectedDate || undefined);
                }}
              >
                <span className="item-icon task-icon">✓</span>
                <div className="item-details">
                  <strong>Task</strong>
                  <small>Planner to-do item with priority</small>
                </div>
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
              <span className="section-count">{1 + myCalendars.length}</span>
            </button>

            {myCalendarsOpen && (
              <div className="calendar-items-list">
                {/* Local Planorama Planner Tasks */}
                <label className="calendar-item-row local-calendar-row">
                  <input
                    type="checkbox"
                    checked={localCalendarEnabled}
                    onChange={onToggleLocalCalendar}
                    className="calendar-checkbox"
                  />
                  <span className="calendar-color-swatch" style={{ backgroundColor: "#ff3d8b" }} />
                  <span className="calendar-item-name">Personal Planner</span>
                  <span className="calendar-badge badge-local">Local</span>
                </label>

                {/* Primary Google Calendars */}
                {myCalendars.map((cal) => {
                  const isChecked = cal.enabled !== false;
                  return (
                    <label key={cal.id} className="calendar-item-row">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleCalendar(cal.id)}
                        className="calendar-checkbox"
                      />
                      <span className="calendar-color-swatch" style={{ backgroundColor: cal.color || "#3b5bff" }} />
                      <div className="calendar-item-info">
                        <span className="calendar-item-name" title={cal.name}>
                          {cal.name}
                        </span>
                        {cal.accountEmail && (
                          <span className="calendar-item-account" title={cal.accountEmail}>
                            {cal.accountEmail}
                          </span>
                        )}
                      </div>
                      {cal.primary && <span className="calendar-badge badge-primary">Primary</span>}
                    </label>
                  );
                })}
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
                  clientCalendars.map((cal) => {
                    const isChecked = cal.enabled !== false;
                    const isReadOnly = cal.accessRole === "reader" || cal.accessRole === "freeBusyReader";
                    return (
                      <label key={cal.id} className="calendar-item-row client-calendar-row">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleCalendar(cal.id)}
                          className="calendar-checkbox"
                        />
                        <span className="calendar-color-swatch" style={{ backgroundColor: cal.color || "#10b981" }} />
                        <div className="calendar-item-info">
                          <span className="calendar-item-name" title={cal.name}>
                            {cal.name}
                          </span>
                          {cal.accountEmail && (
                            <span className="calendar-item-account client-email" title={cal.accountEmail}>
                              {cal.accountEmail}
                            </span>
                          )}
                        </div>
                        {isReadOnly ? (
                          <span className="calendar-badge badge-readonly" title="Read-only client calendar">
                            <Lock size={10} weight="bold" /> Read-only
                          </span>
                        ) : (
                          <span className="calendar-badge badge-editable" title="Full edit access">
                            Edit
                          </span>
                        )}
                      </label>
                    );
                  })
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
                  {otherCalendars.map((cal) => {
                    const isChecked = cal.enabled !== false;
                    return (
                      <label key={cal.id} className="calendar-item-row">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleCalendar(cal.id)}
                          className="calendar-checkbox"
                        />
                        <span className="calendar-color-swatch" style={{ backgroundColor: cal.color || "#8b5cf6" }} />
                        <div className="calendar-item-info">
                          <span className="calendar-item-name" title={cal.name}>
                            {cal.name}
                          </span>
                        </div>
                      </label>
                    );
                  })}
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
      </aside>
    </>
  );
}
