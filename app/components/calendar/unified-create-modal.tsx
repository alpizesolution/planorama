"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  CalendarClock,
  CheckSquare,
  CalendarPlus,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  Sparkles,
  Info,
} from "lucide-react";
import { X, Plus, Check } from "@phosphor-icons/react";
import type { PlannerTask, PlannerPreferences, Recurrence } from "@/lib/schedule/types";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { DEFAULT_ITEM_COLORS } from "@/lib/calendar/item-color";
import type { TaskLabel } from "@/app/page";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  type DayAvailability,
  type MeetingMethod,
  type AppointmentSchedule,
} from "@/lib/schedule/appointment-types";
import { calculateAvailableSlots } from "@/lib/schedule/appointment-service";

export type CreateMode = "event" | "task" | "appointment";

export interface SaveEventData {
  title: string;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  isAllDay: boolean;
  durationMinutes: number;
  calendarId: string;
  recurrence: Recurrence;
  location?: string;
  attendees?: { email: string; displayName?: string }[];
  isPrivateAvailabilityOnly: boolean; // Busy (false) vs Free (true) or Busy block
  notes: string;
}

export interface SaveTaskData {
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
  recurrence: Recurrence;
}

export interface SaveAppointmentData {
  title: string;
  description: string;
  durationMinutes: number;
  days: DayAvailability[];
  timeZone: string;
  schedulingWindowDays: number;
  bufferMinutes: number;
  meetingMethod: MeetingMethod;
  locationDetails?: string;
  calendarId: string;
  minNoticeHours: number;
  maxBookingsPerDay: number;
}

export interface UnifiedCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: CreateMode;
  initialDate?: string | null;
  initialTime?: string | null;
  preferences: PlannerPreferences;
  labels: TaskLabel[];
  onAddLabel: (name?: string) => TaskLabel | null;
  writableCalendars?: GoogleCalendarConfig[];
  existingTasks?: PlannerTask[];
  onSaveEvent: (data: SaveEventData) => Promise<boolean>;
  onSaveTask: (data: SaveTaskData) => Promise<boolean>;
  onSaveAppointmentSchedule?: (data: SaveAppointmentData) => Promise<boolean>;
}

const EMOJIS = ["🙂", "💡", "📅", "🚀", "⚡", "⭐", "🎯", "🔥", "💻", "📚", "🎨", "✨"];

export function UnifiedCreateModal({
  isOpen,
  onClose,
  initialMode = "event",
  initialDate,
  initialTime,
  preferences,
  labels,
  onAddLabel,
  writableCalendars = [],
  existingTasks = [],
  onSaveEvent,
  onSaveTask,
  onSaveAppointmentSchedule,
}: UnifiedCreateModalProps) {
  const [mode, setMode] = useState<CreateMode>(initialMode);

  // Common / Shared Title
  const [title, setTitle] = useState("");

  // ====== EVENT STATE ======
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEndTime, setEventEndTime] = useState("10:00");
  const [eventIsAllDay, setEventIsAllDay] = useState(false);
  const [eventCalendarId, setEventCalendarId] = useState("none");
  const [eventRecurrence, setEventRecurrence] = useState<Recurrence>("none");
  const [eventLocation, setEventLocation] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventIsBusy, setEventIsBusy] = useState(true);
  const [eventGuestInput, setEventGuestInput] = useState("");
  const [eventGuests, setEventGuests] = useState<string[]>([]);

  // ====== TASK STATE ======
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("");
  const [taskStatus, setTaskStatus] = useState<PlannerTask["status"]>("open");
  const [taskPriority, setTaskPriority] = useState<PlannerTask["priority"]>("none");
  const [taskIsPinned, setTaskIsPinned] = useState(false);
  const [taskIsPersonal, setTaskIsPersonal] = useState(false);
  const [taskTimingPref, setTaskTimingPref] = useState<"scheduled" | "whenever">("scheduled");
  const [taskSelectedLabelIds, setTaskSelectedLabelIds] = useState<string[]>([]);
  const [taskNotes, setTaskNotes] = useState("");
  const [taskEmoji, setTaskEmoji] = useState("");
  const [taskCalendarId, setTaskCalendarId] = useState("none");
  const [taskRecurrence, setTaskRecurrence] = useState<Recurrence>("none");
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");

  // ====== APPOINTMENT SCHEDULE STATE ======
  const [apptDuration, setApptDuration] = useState<number>(30);
  const [apptDays, setApptDays] = useState<DayAvailability[]>(DEFAULT_WEEKLY_AVAILABILITY);
  const [apptBuffer, setApptBuffer] = useState<number>(0);
  const [apptWindow, setApptWindow] = useState<number>(30);
  const [apptMethod, setApptMethod] = useState<MeetingMethod>("google_meet");
  const [apptLocation, setApptLocation] = useState("");
  const [apptCalendarId, setApptCalendarId] = useState("none");
  const [apptMinNotice, setApptMinNotice] = useState<number>(2);
  const [apptMaxBookings, setApptMaxBookings] = useState<number>(0);
  const [apptDescription, setApptDescription] = useState("");

  // UI / Status
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize or reset when modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setTitle("");
      setError("");
      setIsSaving(false);

      const defaultDate =
        initialDate ||
        new Date().toISOString().slice(0, 10);
      const defaultTime = initialTime || "09:00";

      // Calculate end time (+1 hour)
      const [h, m] = defaultTime.split(":").map(Number);
      const endH = (h + 1) % 24;
      const defaultEndTime = `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;

      // Initialize Event
      setEventStartDate(defaultDate);
      setEventStartTime(defaultTime);
      setEventEndDate(defaultDate);
      setEventEndTime(defaultEndTime);
      setEventIsAllDay(false);
      setEventCalendarId(
        preferences.googleCalendarSync?.enabled && preferences.googleCalendarSync.defaultCalendarId
          ? preferences.googleCalendarSync.defaultCalendarId
          : "none"
      );
      setEventRecurrence("none");
      setEventLocation("");
      setEventNotes("");
      setEventIsBusy(true);
      setEventGuests([]);
      setEventGuestInput("");

      // Initialize Task
      setTaskDueDate(defaultDate);
      setTaskDueTime(initialTime || "");
      setTaskStatus("open");
      setTaskPriority(preferences.defaultPriority ?? "none");
      setTaskIsPinned(false);
      setTaskIsPersonal(false);
      setTaskTimingPref("scheduled");
      setTaskSelectedLabelIds([]);
      setTaskNotes("");
      setTaskEmoji("");
      setTaskCalendarId("none");
      setTaskRecurrence("none");
      setIsAddingLabel(false);
      setNewLabelInput("");

      // Initialize Appointment Schedule
      setApptDuration(30);
      setApptDays(DEFAULT_WEEKLY_AVAILABILITY);
      setApptBuffer(0);
      setApptWindow(30);
      setApptMethod("google_meet");
      setApptLocation("");
      setApptCalendarId("none");
      setApptMinNotice(2);
      setApptMaxBookings(0);
      setApptDescription("");

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen, initialMode, initialDate, initialTime, preferences]);

  // Compute live slot preview for Appointment Schedule
  const previewSlots = useMemo(() => {
    if (mode !== "appointment") return [];
    const dummySchedule: AppointmentSchedule = {
      id: "preview",
      title: title || "Consultation",
      description: apptDescription,
      durationMinutes: apptDuration,
      days: apptDays,
      timeZone: preferences.timeZone || "Asia/Manila",
      schedulingWindowDays: apptWindow,
      bufferMinutes: apptBuffer,
      meetingMethod: apptMethod,
      locationDetails: apptLocation,
      calendarId: apptCalendarId,
      minNoticeHours: apptMinNotice,
      maxBookingsPerDay: apptMaxBookings,
      createdAt: "",
      updatedAt: "",
    };
    return calculateAvailableSlots(
      dummySchedule,
      existingTasks,
      eventStartDate ? new Date(eventStartDate) : new Date(),
      5
    );
  }, [
    mode,
    title,
    apptDescription,
    apptDuration,
    apptDays,
    preferences.timeZone,
    apptWindow,
    apptBuffer,
    apptMethod,
    apptLocation,
    apptCalendarId,
    apptMinNotice,
    apptMaxBookings,
    existingTasks,
    eventStartDate,
  ]);

  if (!isOpen) return null;

  // Add guest helper for Events
  const handleAddGuest = () => {
    const email = eventGuestInput.trim().toLowerCase();
    if (!email) return;
    if (!email.includes("@")) {
      setError("Please enter a valid guest email address.");
      return;
    }
    if (!eventGuests.includes(email)) {
      setEventGuests((prev) => [...prev, email]);
    }
    setEventGuestInput("");
    setError("");
  };

  const handleRemoveGuest = (email: string) => {
    setEventGuests((prev) => prev.filter((g) => g !== email));
  };

  // Quick duration helper for Events
  const handleApplyDuration = (minutes: number) => {
    if (!eventStartTime) return;
    const [h, m] = eventStartTime.split(":").map(Number);
    const totalM = h * 60 + m + minutes;
    const endH = Math.floor(totalM / 60) % 24;
    const endM = totalM % 60;
    setEventEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  };

  // Day toggle for Appointment Schedule
  const handleToggleDay = (dayIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    setApptDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayIndex ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const handleDayTimeChange = (
    dayIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6,
    field: "startTime" | "endTime",
    val: string
  ) => {
    setApptDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayIndex ? { ...d, [field]: val } : d))
    );
  };

  // Form submission dispatcher
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Please enter a title.");
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    setError("");

    try {
      if (mode === "event") {
        if (!eventStartDate) {
          throw new Error("Event start date is required.");
        }
        const effectiveEndDate = eventEndDate || eventStartDate;

        let duration = 60;
        if (!eventIsAllDay) {
          if (!eventStartTime || !eventEndTime) {
            throw new Error("Start and end times are required for timed events.");
          }
          const [sh, sm] = eventStartTime.split(":").map(Number);
          const [eh, em] = eventEndTime.split(":").map(Number);
          const startTotal = sh * 60 + sm;
          const endTotal = eh * 60 + em;

          if (eventStartDate === effectiveEndDate && endTotal <= startTotal) {
            throw new Error("Event end time must be after the start time.");
          }
          duration = Math.max(15, endTotal - startTotal);
        }

        const success = await onSaveEvent({
          title: cleanTitle,
          startDate: eventStartDate,
          startTime: eventIsAllDay ? null : eventStartTime,
          endDate: effectiveEndDate,
          endTime: eventIsAllDay ? null : eventEndTime,
          isAllDay: eventIsAllDay,
          durationMinutes: duration,
          calendarId: eventCalendarId,
          recurrence: eventRecurrence,
          location: eventLocation.trim() || undefined,
          attendees: eventGuests.map((g) => ({ email: g })),
          isPrivateAvailabilityOnly: !eventIsBusy,
          notes: eventNotes.trim(),
        });

        if (success) onClose();
      } else if (mode === "task") {
        const success = await onSaveTask({
          title: cleanTitle,
          dueDate: taskDueDate || null,
          dueTime: taskDueTime || null,
          status: taskStatus,
          priority: taskPriority,
          isPinned: taskIsPinned,
          isPersonal: taskIsPersonal,
          timingPreference: taskTimingPref,
          labelIds: taskSelectedLabelIds,
          notes: taskNotes.trim(),
          googleCalendarId: taskCalendarId !== "none" ? taskCalendarId : undefined,
          recurrence: taskRecurrence,
        });

        if (success) onClose();
      } else if (mode === "appointment") {
        if (!onSaveAppointmentSchedule) {
          throw new Error("Appointment schedule creation is not supported.");
        }

        const hasDay = apptDays.some((d) => d.enabled);
        if (!hasDay) {
          throw new Error("Please select at least one available day of the week.");
        }

        for (const day of apptDays) {
          if (day.enabled && day.startTime >= day.endTime) {
            throw new Error("Start time must be earlier than end time for all enabled days.");
          }
        }

        const success = await onSaveAppointmentSchedule({
          title: cleanTitle,
          description: apptDescription.trim(),
          durationMinutes: apptDuration,
          days: apptDays,
          timeZone: preferences.timeZone || "Asia/Manila",
          schedulingWindowDays: apptWindow,
          bufferMinutes: apptBuffer,
          meetingMethod: apptMethod,
          locationDetails: apptLocation.trim() || undefined,
          calendarId: apptCalendarId,
          minNoticeHours: apptMinNotice,
          maxBookingsPerDay: apptMaxBookings,
        });

        if (success) onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not complete creation. Please check the fields.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCal = writableCalendars.find((c) => c.id === (mode === "event" ? eventCalendarId : taskCalendarId));
  const itemColors = preferences.itemColors ?? DEFAULT_ITEM_COLORS;
  const defaultModeColor = mode === "event"
    ? itemColors.eventColor
    : mode === "appointment"
    ? itemColors.scheduleColor
    : itemColors.taskColor;
  const calColor = selectedCal?.color || defaultModeColor;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="modal-card unified-create-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Create ${mode === "event" ? "Event" : mode === "task" ? "Task" : "Appointment Schedule"}`}
      >
        {/* Modal Top Bar: Segmented Mode Selector & Close Button */}
        <div className="unified-create-header">
          <div className="unified-create-tabs" role="tablist" aria-label="Creation modes">
            <button
              type="button"
              role="tab"
              id="tab-event"
              aria-selected={mode === "event"}
              aria-controls="panel-event"
              className={`create-tab-btn tab-event ${mode === "event" ? "is-active" : ""}`}
              onClick={() => {
                setMode("event");
                setError("");
              }}
            >
              <CalendarClock size={16} strokeWidth={2.3} />
              <span>Event</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-task"
              aria-selected={mode === "task"}
              aria-controls="panel-task"
              className={`create-tab-btn tab-task ${mode === "task" ? "is-active" : ""}`}
              onClick={() => {
                setMode("task");
                setError("");
              }}
            >
              <CheckSquare size={16} strokeWidth={2.3} />
              <span>Task</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-appointment"
              aria-selected={mode === "appointment"}
              aria-controls="panel-appointment"
              className={`create-tab-btn tab-appointment ${mode === "appointment" ? "is-active" : ""}`}
              onClick={() => {
                setMode("appointment");
                setError("");
              }}
            >
              <CalendarPlus size={16} strokeWidth={2.3} />
              <span>Appointment schedule</span>
            </button>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Form Body */}
        <form onSubmit={handleSubmit} className="unified-create-form">
          {/* Title Input Group with Mode Badge */}
          <div className="unified-title-section">
            <div className="unified-title-input-wrap">
              {mode === "task" && (
                <div className="task-emoji-anchor">
                  <button
                    type="button"
                    className="task-emoji-trigger"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title="Add emoji"
                  >
                    {taskEmoji || "🙂"}
                  </button>
                  {showEmojiPicker && (
                    <div className="task-emoji-popover">
                      {EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          className="emoji-item-btn"
                          onClick={() => {
                            setTaskEmoji(em);
                            setTitle((t) => `${em} ${t.replace(/^(\p{Emoji}|\p{Extended_Pictographic})\s*/u, "")}`);
                            setShowEmojiPicker(false);
                            titleInputRef.current?.focus();
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <input
                ref={titleInputRef}
                className="unified-title-input"
                placeholder={
                  mode === "event"
                    ? "Add event title (e.g. Client Design Review)"
                    : mode === "task"
                    ? "Add task title (e.g. Prepare invoice report)"
                    : "Add schedule title (e.g. 30-min Consultation)"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={240}
                required
              />
            </div>
          </div>

          {/* ============================================================== */}
          {/* MODE 1: CALENDAR EVENT FORM                                     */}
          {/* ============================================================== */}
          {mode === "event" && (
            <div className="mode-content-panel event-panel" id="panel-event" role="tabpanel" aria-labelledby="tab-event">
              {/* Date & Time Row */}
              <div className="form-section-card">
                <div className="form-row-header">
                  <span className="field-group-title">
                    <Clock size={15} /> Date & Time
                  </span>
                  <label className="all-day-checkbox-label">
                    <input
                      type="checkbox"
                      checked={eventIsAllDay}
                      onChange={(e) => setEventIsAllDay(e.target.checked)}
                    />
                    <span>All day</span>
                  </label>
                </div>

                <div className="form-row-dates">
                  <div className="date-time-col">
                    <span className="sub-label">Starts</span>
                    <div className="date-time-inputs">
                      <input
                        type="date"
                        className="native-input"
                        value={eventStartDate}
                        onChange={(e) => {
                          setEventStartDate(e.target.value);
                          if (!eventEndDate || eventEndDate < e.target.value) {
                            setEventEndDate(e.target.value);
                          }
                        }}
                        required
                      />
                      {!eventIsAllDay && (
                        <input
                          type="time"
                          className="native-input time-input"
                          value={eventStartTime}
                          onChange={(e) => setEventStartTime(e.target.value)}
                          required
                        />
                      )}
                    </div>
                  </div>

                  <div className="date-time-col">
                    <span className="sub-label">Ends</span>
                    <div className="date-time-inputs">
                      <input
                        type="date"
                        className="native-input"
                        value={eventEndDate}
                        min={eventStartDate}
                        onChange={(e) => setEventEndDate(e.target.value)}
                        required
                      />
                      {!eventIsAllDay && (
                        <input
                          type="time"
                          className="native-input time-input"
                          value={eventEndTime}
                          onChange={(e) => setEventEndTime(e.target.value)}
                          required
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Duration Buttons (When not all day) */}
                {!eventIsAllDay && (
                  <div className="quick-duration-strip">
                    <span className="quick-label">Duration:</span>
                    {[
                      { label: "15m", val: 15 },
                      { label: "30m", val: 30 },
                      { label: "45m", val: 45 },
                      { label: "1h", val: 60 },
                      { label: "1.5h", val: 90 },
                      { label: "2h", val: 120 },
                    ].map((dur) => (
                      <button
                        key={dur.val}
                        type="button"
                        className="quick-dur-btn"
                        onClick={() => handleApplyDuration(dur.val)}
                      >
                        {dur.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Calendar Destination & Availability */}
              <div className="form-grid-two-col">
                <label className="field-block">
                  <span className="field-title">
                    Calendar
                    <span
                      className="calendar-color-dot"
                      style={{
                        display: "inline-block",
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        backgroundColor: calColor,
                        marginLeft: 6,
                        verticalAlign: "middle",
                      }}
                    />
                  </span>
                  <select
                    className="native-select"
                    value={eventCalendarId}
                    onChange={(e) => setEventCalendarId(e.target.value)}
                  >
                    <option value="none">📅 Planorama (Local Calendar)</option>
                    {writableCalendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.name} {cal.accountEmail ? `(${cal.accountEmail})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span className="field-title">Show as</span>
                  <select
                    className="native-select"
                    value={eventIsBusy ? "busy" : "free"}
                    onChange={(e) => setEventIsBusy(e.target.value === "busy")}
                  >
                    <option value="busy">🔴 Busy (Blocks availability)</option>
                    <option value="free">🟢 Free (Available during this time)</option>
                  </select>
                </label>
              </div>

              {/* Recurrence & Location */}
              <div className="form-grid-two-col">
                <label className="field-block">
                  <span className="field-title">Repeat</span>
                  <select
                    className="native-select"
                    value={eventRecurrence}
                    onChange={(e) => setEventRecurrence(e.target.value as Recurrence)}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>

                <label className="field-block">
                  <span className="field-title">Location / Meeting link</span>
                  <div className="input-with-icon">
                    <MapPin size={15} className="input-icon" />
                    <input
                      type="text"
                      className="native-input input-padded"
                      placeholder="Room, office, or Google Meet link…"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      maxLength={300}
                    />
                  </div>
                </label>
              </div>

              {/* Guests / Attendees */}
              <div className="field-block">
                <span className="field-title">
                  <Users size={14} /> Guests / Attendees (optional)
                </span>
                <div className="guest-input-row">
                  <input
                    type="email"
                    className="native-input"
                    placeholder="Enter guest email and press Add…"
                    value={eventGuestInput}
                    onChange={(e) => setEventGuestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddGuest();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="guest-add-btn"
                    onClick={handleAddGuest}
                    disabled={!eventGuestInput.trim()}
                  >
                    <Plus size={14} weight="bold" /> Add
                  </button>
                </div>

                {eventGuests.length > 0 && (
                  <div className="guest-chips-wrap">
                    {eventGuests.map((email) => (
                      <span key={email} className="guest-chip">
                        <span>{email}</span>
                        <button
                          type="button"
                          className="chip-remove"
                          onClick={() => handleRemoveGuest(email)}
                          aria-label={`Remove ${email}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <label className="field-block">
                <span className="field-title">Description</span>
                <textarea
                  className="native-textarea"
                  rows={3}
                  placeholder="Add meeting agenda, documents, or notes…"
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  maxLength={5000}
                />
              </label>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 2: DEDICATED TASK TO-DO FORM                               */}
          {/* ============================================================== */}
          {mode === "task" && (
            <div className="mode-content-panel task-panel" id="panel-task" role="tabpanel" aria-labelledby="tab-task">
              {/* Due Date & Optional Scheduled Time */}
              <div className="form-section-card">
                <div className="form-grid-two-col">
                  <label className="field-block">
                    <span className="field-title">Due date (Deadline)</span>
                    <input
                      type="date"
                      className="native-input"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <div className="field-title-row">
                      <span className="field-title">Scheduled time (optional)</span>
                      {taskDueTime && (
                        <button
                          type="button"
                          className="clear-link-btn"
                          onClick={() => setTaskDueTime("")}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="time"
                      className="native-input"
                      value={taskDueTime}
                      onChange={(e) => setTaskDueTime(e.target.value)}
                    />
                  </label>
                </div>
                <div className="task-deadline-hint">
                  <Info size={13} />
                  <span>
                    A due date is a deadline. A task without a scheduled time remains a checklist to-do; adding a time places it on your daily timeline.
                  </span>
                </div>
              </div>

              {/* Priority & Status Controls */}
              <div className="form-grid-two-col">
                <label className="field-block">
                  <span className="field-title">Priority</span>
                  <select
                    className="native-select"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as PlannerTask["priority"])}
                  >
                    <option value="none">No Priority</option>
                    <option value="p4">🟢 Low (P4)</option>
                    <option value="p3">🔵 Medium (P3)</option>
                    <option value="p2">🟠 High (P2)</option>
                    <option value="p1">🔴 Urgent (P1)</option>
                  </select>
                </label>

                <label className="field-block">
                  <span className="field-title">Status</span>
                  <select
                    className="native-select"
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value as PlannerTask["status"])}
                  >
                    <option value="open">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Done</option>
                  </select>
                </label>
              </div>

              {/* Labels & Tags */}
              <div className="field-block">
                <div className="field-title-row">
                  <span className="field-title">Labels</span>
                  {!isAddingLabel && (
                    <button
                      type="button"
                      className="add-sub-btn"
                      onClick={() => setIsAddingLabel(true)}
                    >
                      <Plus size={12} weight="bold" /> Add label
                    </button>
                  )}
                </div>

                {isAddingLabel && (
                  <div className="inline-add-label">
                    <input
                      type="text"
                      className="native-input input-compact"
                      placeholder="Label name…"
                      value={newLabelInput}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      maxLength={40}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="label-action-btn save"
                      disabled={!newLabelInput.trim()}
                      onClick={() => {
                        const trimmed = newLabelInput.trim();
                        if (trimmed) {
                          const created = onAddLabel(trimmed);
                          if (created) {
                            setTaskSelectedLabelIds((prev) => [...prev, created.id]);
                            setNewLabelInput("");
                            setIsAddingLabel(false);
                          }
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="label-action-btn cancel"
                      onClick={() => {
                        setIsAddingLabel(false);
                        setNewLabelInput("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="task-labels-pill-grid">
                  {labels.map((l) => {
                    const selected = taskSelectedLabelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        className={`label-chip-selector ${selected ? "is-selected" : ""}`}
                        onClick={() =>
                          setTaskSelectedLabelIds((prev) =>
                            prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id]
                          )
                        }
                      >
                        {selected ? <Check size={12} weight="bold" /> : <Plus size={12} />}
                        <span>{l.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pin & Personal Toggles */}
              <div className="task-toggles-strip">
                <label className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={taskIsPinned}
                    onChange={(e) => setTaskIsPinned(e.target.checked)}
                  />
                  <span>📌 Pin to top</span>
                </label>

                <label className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={taskIsPersonal}
                    onChange={(e) => setTaskIsPersonal(e.target.checked)}
                  />
                  <span>🌿 Personal task</span>
                </label>
              </div>

              {/* Task Details / Notes */}
              <label className="field-block">
                <span className="field-title">Details / Notes (optional)</span>
                <textarea
                  className="native-textarea"
                  rows={3}
                  placeholder="Add checklists, links, or context to complete this task…"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  maxLength={5000}
                />
              </label>

              {/* Optional Google Sync */}
              {writableCalendars.length > 0 && (
                <label className="field-block">
                  <span className="field-title">Sync to Google Calendar (optional)</span>
                  <select
                    className="native-select"
                    value={taskCalendarId}
                    onChange={(e) => setTaskCalendarId(e.target.value)}
                  >
                    <option value="none">Planorama (Local Only)</option>
                    {writableCalendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        📅 {cal.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 3: APPOINTMENT SCHEDULE AVAILABILITY FORM                  */}
          {/* ============================================================== */}
          {mode === "appointment" && (
            <div className="mode-content-panel appt-panel" id="panel-appointment" role="tabpanel" aria-labelledby="tab-appointment">
              {/* Notice Banner */}
              <div className="appt-info-banner">
                <Sparkles size={16} className="banner-icon" />
                <div className="banner-text">
                  <strong>Reusable Availability Schedule</strong>
                  <p>
                    Set up your working booking slots. Note: Public client self-booking links require public domain URL hosting. Your schedule will be used to enforce availability and prevent double bookings in Planorama.
                  </p>
                </div>
              </div>

              {/* Duration & Buffer */}
              <div className="form-grid-two-col">
                <label className="field-block">
                  <span className="field-title">Appointment duration</span>
                  <select
                    className="native-select"
                    value={apptDuration}
                    onChange={(e) => setApptDuration(Number(e.target.value))}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes (1 hour)</option>
                    <option value={90}>90 minutes (1.5 hours)</option>
                  </select>
                </label>

                <label className="field-block">
                  <span className="field-title">Buffer between appointments</span>
                  <select
                    className="native-select"
                    value={apptBuffer}
                    onChange={(e) => setApptBuffer(Number(e.target.value))}
                  >
                    <option value={0}>None (Back-to-back)</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </label>
              </div>

              {/* Weekly Availability per Day */}
              <div className="form-section-card">
                <span className="field-group-title">
                  <Clock size={15} /> Available days & hours
                </span>
                <div className="appt-days-list">
                  {([
                    { day: 1, name: "Monday" },
                    { day: 2, name: "Tuesday" },
                    { day: 3, name: "Wednesday" },
                    { day: 4, name: "Thursday" },
                    { day: 5, name: "Friday" },
                    { day: 6, name: "Saturday" },
                    { day: 0, name: "Sunday" },
                  ] as const).map(({ day, name }) => {
                    const config = apptDays.find((d) => d.dayOfWeek === day) || {
                      dayOfWeek: day,
                      enabled: false,
                      startTime: "09:00",
                      endTime: "17:00",
                    };
                    return (
                      <div key={day} className={`day-availability-row ${config.enabled ? "is-enabled" : "is-disabled"}`}>
                        <label className="day-check-label">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={() => handleToggleDay(day)}
                          />
                          <span className="day-name">{name}</span>
                        </label>

                        {config.enabled ? (
                          <div className="day-hours-inputs">
                            <input
                              type="time"
                              className="native-input time-input-sm"
                              value={config.startTime}
                              onChange={(e) => handleDayTimeChange(day, "startTime", e.target.value)}
                            />
                            <span className="to-divider">–</span>
                            <input
                              type="time"
                              className="native-input time-input-sm"
                              value={config.endTime}
                              onChange={(e) => handleDayTimeChange(day, "endTime", e.target.value)}
                            />
                          </div>
                        ) : (
                          <span className="unavailable-text">Unavailable</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Meeting Method & Advance Notice */}
              <div className="form-grid-two-col">
                <label className="field-block">
                  <span className="field-title">Meeting method</span>
                  <select
                    className="native-select"
                    value={apptMethod}
                    onChange={(e) => setApptMethod(e.target.value as MeetingMethod)}
                  >
                    <option value="google_meet">📹 Google Meet video call</option>
                    <option value="in_person">🏢 In-person meeting</option>
                    <option value="phone">📞 Phone call</option>
                    <option value="custom">🌐 Custom link / address</option>
                  </select>
                </label>

                <label className="field-block">
                  <span className="field-title">Minimum advance notice</span>
                  <select
                    className="native-select"
                    value={apptMinNotice}
                    onChange={(e) => setApptMinNotice(Number(e.target.value))}
                  >
                    <option value={0}>None</option>
                    <option value={2}>2 hours</option>
                    <option value={4}>4 hours</option>
                    <option value={12}>12 hours</option>
                    <option value={24}>24 hours</option>
                  </select>
                </label>
              </div>

              {/* Calendar conflict check */}
              <label className="field-block">
                <span className="field-title">Check for conflicts on calendar</span>
                <select
                  className="native-select"
                  value={apptCalendarId}
                  onChange={(e) => setApptCalendarId(e.target.value)}
                >
                  <option value="none">Planorama (Local Tasks & Events)</option>
                  {writableCalendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      📅 {cal.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Live Preview of Available Booking Slots */}
              <div className="appt-slots-preview-card">
                <div className="preview-header">
                  <span className="preview-title">
                    <Sparkles size={14} /> Live Availability Slots Preview (Next 5 Days)
                  </span>
                  <span className="preview-count">{previewSlots.filter((s) => s.isAvailable).length} slots open</span>
                </div>

                <div className="preview-slots-grid">
                  {previewSlots.length === 0 ? (
                    <span className="no-slots-msg">No slots available with current schedule. Check enabled days.</span>
                  ) : (
                    previewSlots.slice(0, 12).map((slot, idx) => (
                      <div
                        key={`${slot.date}-${slot.startTime}-${idx}`}
                        className={`slot-badge ${slot.isAvailable ? "is-open" : "is-blocked"}`}
                        title={slot.isAvailable ? "Available" : slot.conflictTitle || "Blocked"}
                      >
                        <span className="slot-date">{slot.date.slice(5)}</span>
                        <span className="slot-time">{slot.startTime}</span>
                        {!slot.isAvailable && <span className="slot-status">Busy</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Alert Box */}
          {error && (
            <div className="unified-create-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="unified-create-footer">
            <button
              type="button"
              className="footer-cancel-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={`footer-submit-btn submit-${mode}`}
              disabled={!title.trim() || isSaving}
            >
              <Plus size={16} weight="bold" />
              <span>
                {isSaving
                  ? "Saving…"
                  : mode === "event"
                  ? "Create Event"
                  : mode === "task"
                  ? "Create Task"
                  : "Save Schedule"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
