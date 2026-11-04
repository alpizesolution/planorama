"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Circle,
  Plus,
  X,
  Flame,
  PencilSimple,
  Trash,
  Archive,
  ChartBar,
  CaretDown,
  CaretUp,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { Habit, HabitCheckIn, HabitScheduleType } from "@/lib/habits/types";
import {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  unarchiveHabit,
  deleteHabit,
  getCheckIns,
  toggleCheckIn,
} from "@/lib/habits/habit-service";
import {
  calculateHabitStats,
  isHabitScheduledForDate,
  getPastDays,
} from "@/lib/habits/streak-utils";

const HABIT_EMOJI_SUGGESTIONS = [
  "💧", "🏃", "📚", "🧘", "💊", "🥗", "💤", "✍️",
  "🎯", "🧹", "🚶", "☀️", "🏋️", "🍎", "🧠", "🌿",
  "💻", "🎨", "🍵", "✨"
];

const TARGET_SUGGESTIONS = [
  "8 glasses",
  "30 mins",
  "15 mins",
  "10,000 steps",
  "20 pages",
  "1 chapter",
  "1 lesson",
  "Once",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DailyHabitsWidgetProps {
  todayKey: string;
  onNotify?: (message: string) => void;
  onError?: (error: string) => void;
  onDataChanged?: () => void;
}

export function DailyHabitsWidget({
  todayKey,
  onNotify,
  onError,
  onDataChanged,
}: DailyHabitsWidgetProps) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkIns, setCheckIns] = useState<HabitCheckIn[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Modals & Panels
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [showOtherHabits, setShowOtherHabits] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Add/Edit Form State
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("💧");
  const [formDescription, setFormDescription] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<HabitScheduleType>("everyday");
  const [formCustomDays, setFormCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formTarget, setFormTarget] = useState("");
  const [formReminderTime, setFormReminderTime] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Load habits and check-ins
  const refreshData = useCallback(async () => {
    try {
      const [allHabits, allCheckIns] = await Promise.all([getHabits(), getCheckIns()]);
      setHabits(allHabits);
      setCheckIns(allCheckIns);
      setLoaded(true);
    } catch {
      onError?.("Could not load daily habits on this device.");
      setLoaded(true);
    }
  }, [onError]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Derived habits categories
  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => h.archived), [habits]);

  // Scheduled for today vs unscheduled today
  const todayScheduledHabits = useMemo(
    () => activeHabits.filter((h) => isHabitScheduledForDate(h, todayKey)),
    [activeHabits, todayKey]
  );

  const todayUnscheduledHabits = useMemo(
    () => activeHabits.filter((h) => !isHabitScheduledForDate(h, todayKey)),
    [activeHabits, todayKey]
  );

  // Check-ins lookup for today: habitId -> boolean
  const todayCompletedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of checkIns) {
      if (c.date === todayKey) {
        map.set(c.habitId, c.completed);
      }
    }
    return map;
  }, [checkIns, todayKey]);

  // Today's completion counts
  const totalScheduledToday = todayScheduledHabits.length;
  const completedTodayCount = todayScheduledHabits.filter(
    (h) => todayCompletedMap.get(h.id) === true
  ).length;
  const progressPercent =
    totalScheduledToday > 0 ? Math.round((completedTodayCount / totalScheduledToday) * 100) : 0;
  const allDoneToday = totalScheduledToday > 0 && completedTodayCount === totalScheduledToday;

  // Toggle habit check-in for today
  const handleToggleToday = async (habit: Habit) => {
    const currentCompleted = todayCompletedMap.get(habit.id) || false;
    const nextCompleted = !currentCompleted;

    // Optimistic UI update
    setCheckIns((prev) => {
      const existingIdx = prev.findIndex((c) => c.habitId === habit.id && c.date === todayKey);
      const now = new Date().toISOString();
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], completed: nextCompleted, completedAt: now };
        return copy;
      }
      return [
        ...prev,
        {
          id: `${habit.id}:${todayKey}`,
          habitId: habit.id,
          date: todayKey,
          completed: nextCompleted,
          completedAt: now,
        },
      ];
    });

    try {
      await toggleCheckIn(habit.id, todayKey);
      onDataChanged?.();
      if (nextCompleted) {
        onNotify?.(`Nice work! Checked off "${habit.name}"`);
      }
    } catch {
      onError?.("Could not update habit check-in. Please try again.");
      void refreshData();
    }
  };

  // Toggle check-in for a historical date
  const handleToggleDate = async (habitId: string, dateKey: string) => {
    try {
      const { completed } = await toggleCheckIn(habitId, dateKey);
      setCheckIns((prev) => {
        const existingIdx = prev.findIndex((c) => c.habitId === habitId && c.date === dateKey);
        const now = new Date().toISOString();
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = { ...copy[existingIdx], completed, completedAt: now };
          return copy;
        }
        return [
          ...prev,
          {
            id: `${habitId}:${dateKey}`,
            habitId,
            date: dateKey,
            completed,
            completedAt: now,
          },
        ];
      });
      onNotify?.(completed ? `Completed for ${dateKey}` : `Undone for ${dateKey}`);
    } catch {
      onError?.("Failed to update check-in history.");
      void refreshData();
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setEditingHabit(null);
    setFormName("");
    setFormIcon("💧");
    setFormDescription("");
    setFormScheduleType("everyday");
    setFormCustomDays([1, 2, 3, 4, 5]);
    setFormTarget("");
    setFormReminderTime("");
    setFormError("");
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setFormName(habit.name);
    setFormIcon(habit.icon || "💧");
    setFormDescription(habit.description || "");
    setFormScheduleType(habit.scheduleType);
    setFormCustomDays(habit.customDays || [1, 2, 3, 4, 5]);
    setFormTarget(habit.target || "");
    setFormReminderTime(habit.reminderTime || "");
    setFormError("");
    setIsAddModalOpen(true);
  };

  // Submit Habit Form (Create or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError("Habit name is required.");
      return;
    }
    if (formScheduleType === "custom" && formCustomDays.length === 0) {
      setFormError("Please select at least one day for custom schedule.");
      return;
    }

    setFormSubmitting(true);
    setFormError("");

    try {
      if (editingHabit) {
        const updated = await updateHabit(editingHabit.id, {
          name: trimmed,
          icon: formIcon.trim() || undefined,
          description: formDescription.trim() || undefined,
          scheduleType: formScheduleType,
          customDays: formScheduleType === "custom" ? formCustomDays : [0, 1, 2, 3, 4, 5, 6],
          target: formTarget.trim() || undefined,
          reminderTime: formReminderTime.trim() || undefined,
        });
        setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
        onNotify?.(`Updated habit "${updated.name}"`);
      } else {
        const created = await createHabit({
          name: trimmed,
          icon: formIcon.trim() || undefined,
          description: formDescription.trim() || undefined,
          scheduleType: formScheduleType,
          customDays: formScheduleType === "custom" ? formCustomDays : [0, 1, 2, 3, 4, 5, 6],
          target: formTarget.trim() || undefined,
          reminderTime: formReminderTime.trim() || undefined,
        });
        setHabits((prev) => [...prev, created]);
        onNotify?.(`Created new habit "${created.name}"`);
      }
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save habit.";
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Archive habit
  const handleArchive = async (habit: Habit) => {
    try {
      const updated = await archiveHabit(habit.id);
      setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      onNotify?.(`Archived habit "${habit.name}". Past history is preserved.`);
    } catch {
      onError?.("Could not archive habit.");
    }
  };

  // Unarchive habit
  const handleUnarchive = async (habit: Habit) => {
    try {
      const updated = await unarchiveHabit(habit.id);
      setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      onNotify?.(`Restored habit "${habit.name}"`);
    } catch {
      onError?.("Could not restore habit.");
    }
  };

  // Delete habit
  const handleDelete = async (habit: Habit) => {
    if (!window.confirm(`Delete habit "${habit.name}"? Historical check-ins will remain saved.`)) {
      return;
    }
    try {
      await deleteHabit(habit.id);
      setHabits((prev) => prev.filter((h) => h.id !== habit.id));
      onNotify?.(`Deleted habit "${habit.name}"`);
    } catch {
      onError?.("Could not delete habit.");
    }
  };

  // Helper for schedule badge text
  const getScheduleLabel = (habit: Habit) => {
    if (habit.scheduleType === "everyday") return "Every day";
    if (habit.scheduleType === "weekdays") return "Weekdays";
    if (habit.scheduleType === "weekends") return "Weekends";
    if (habit.scheduleType === "custom") {
      const days = (habit.customDays || []).map((d) => WEEKDAY_NAMES[d]).join(", ");
      return days || "Custom";
    }
    return "Every day";
  };

  // Human date formatting for widget subtitle
  const displayTodayDate = useMemo(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [todayKey]);

  // Past 14 days for history strip
  const past14Days = useMemo(() => getPastDays(14, todayKey), [todayKey]);

  return (
    <section className="habits-card neo-card" id="daily-habits" aria-label="Daily habits tracker">
      {/* Widget Header */}
      <div className="habits-header">
        <div>
          <span className="section-kicker">DAILY ROUTINE</span>
          <h2 className="habits-title">
            Daily Habits <span className="heading-period">.</span>
          </h2>
          <span className="habits-date-subtitle">{displayTodayDate}</span>
        </div>
        <div className="habits-header-actions">
          <button
            type="button"
            className="habits-add-btn"
            onClick={openAddModal}
            aria-label="Add new habit"
          >
            <Plus size={14} weight="bold" />
            <span>Add Habit</span>
          </button>
          <button
            type="button"
            className={`habits-stats-toggle-btn ${isStatsExpanded ? "active" : ""}`}
            onClick={() => setIsStatsExpanded((prev) => !prev)}
            aria-label={isStatsExpanded ? "Hide habit statistics" : "View habit streaks & history"}
            title="View streaks, history & stats"
          >
            <ChartBar size={15} weight="bold" />
            <span>{isStatsExpanded ? "Close Stats" : "Streaks & History"}</span>
          </button>
        </div>
      </div>

      {/* Daily Progress Bar */}
      <div className="habits-progress-section">
        <div className="habits-progress-header">
          <span className="habits-progress-label">
            {totalScheduledToday === 0
              ? "No habits scheduled today"
              : allDoneToday
              ? "All done for today! 🎉"
              : `${completedTodayCount} of ${totalScheduledToday} completed`}
          </span>
          {totalScheduledToday > 0 && (
            <span className="habits-progress-badge">{progressPercent}%</span>
          )}
        </div>
        <div
          className="habits-progress-track"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className={`habits-progress-fill ${allDoneToday ? "is-complete" : ""}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Today's Checklist */}
      <div className="habits-checklist" role="list" aria-label="Today's scheduled habits">
        {todayScheduledHabits.length === 0 ? (
          <div className="habits-empty-state">
            <p>
              {!loaded
                ? "Loading your daily habits..."
                : activeHabits.length === 0
                ? "No habits created yet. Tap \"+ Add Habit\" to build your routine!"
                : "No habits scheduled for today. Enjoy your break or check other habits below."}
            </p>
          </div>
        ) : (
          todayScheduledHabits.map((habit) => {
            const isCompleted = todayCompletedMap.get(habit.id) === true;
            const stats = calculateHabitStats(habit, checkIns, todayKey);

            return (
              <div
                key={habit.id}
                className={`habit-row ${isCompleted ? "is-completed" : ""}`}
                role="listitem"
              >
                {/* One-tap checkbox button */}
                <button
                  type="button"
                  className="habit-check-btn"
                  onClick={() => handleToggleToday(habit)}
                  aria-label={
                    isCompleted
                      ? `Mark "${habit.name}" as not completed for today`
                      : `Check off "${habit.name}" for today`
                  }
                >
                  <span className={`habit-checkbox ${isCompleted ? "checked" : ""}`}>
                    {isCompleted ? (
                      <CheckCircle size={22} weight="fill" color="#16a34a" />
                    ) : (
                      <Circle size={22} color="#78716c" />
                    )}
                  </span>
                </button>

                {/* Habit Info */}
                <div
                  className="habit-info-clickable"
                  onClick={() => openEditModal(habit)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditModal(habit);
                    }
                  }}
                  title="Click to edit habit"
                >
                  <span className="habit-icon-pill">{habit.icon || "✨"}</span>
                  <div className="habit-text-group">
                    <div className="habit-name-row">
                      <span className="habit-name">{habit.name}</span>
                      {habit.target && <span className="habit-target-tag">{habit.target}</span>}
                    </div>
                    {habit.description && (
                      <span className="habit-desc-preview">{habit.description}</span>
                    )}
                  </div>
                </div>

                {/* Streak Badge */}
                <div className="habit-badges-group">
                  <span
                    className={`habit-streak-pill ${stats.currentStreak > 0 ? "has-streak" : ""}`}
                    title={`Current streak: ${stats.currentStreak} ${
                      stats.currentStreak === 1 ? "day" : "days"
                    }`}
                  >
                    <Flame
                      size={13}
                      weight="fill"
                      color={stats.currentStreak > 0 ? "#ea580c" : "#a8a29e"}
                    />
                    <span>{stats.currentStreak}</span>
                  </span>

                  <button
                    type="button"
                    className="habit-row-action-btn"
                    onClick={() => openEditModal(habit)}
                    aria-label={`Edit ${habit.name}`}
                    title="Edit habit"
                  >
                    <PencilSimple size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Unscheduled Today Accordion */}
      {todayUnscheduledHabits.length > 0 && (
        <div className="habits-unscheduled-section">
          <button
            type="button"
            className="habits-unscheduled-toggle"
            onClick={() => setShowOtherHabits((prev) => !prev)}
            aria-expanded={showOtherHabits}
          >
            <span>
              Other habits ({todayUnscheduledHabits.length}) · Unscheduled today
            </span>
            {showOtherHabits ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>

          {showOtherHabits && (
            <div className="habits-unscheduled-list">
              {todayUnscheduledHabits.map((habit) => {
                const isCompleted = todayCompletedMap.get(habit.id) === true;
                const stats = calculateHabitStats(habit, checkIns, todayKey);

                return (
                  <div
                    key={habit.id}
                    className={`habit-row unscheduled ${isCompleted ? "is-completed" : ""}`}
                  >
                    <button
                      type="button"
                      className="habit-check-btn"
                      onClick={() => handleToggleToday(habit)}
                      aria-label={`Check off "${habit.name}" today`}
                    >
                      <span className={`habit-checkbox ${isCompleted ? "checked" : ""}`}>
                        {isCompleted ? (
                          <CheckCircle size={20} weight="fill" color="#16a34a" />
                        ) : (
                          <Circle size={20} color="#78716c" />
                        )}
                      </span>
                    </button>
                    <div
                      className="habit-info-clickable"
                      onClick={() => openEditModal(habit)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="habit-icon-pill">{habit.icon || "✨"}</span>
                      <div className="habit-text-group">
                        <span className="habit-name">{habit.name}</span>
                        <span className="habit-schedule-sub">
                          {getScheduleLabel(habit)}
                        </span>
                      </div>
                    </div>
                    <span className="habit-streak-pill">
                      <Flame size={12} weight="fill" color="#a8a29e" />
                      <span>{stats.currentStreak}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expandable History, Streaks & Statistics Section */}
      {isStatsExpanded && (
        <div className="habits-stats-drawer" role="region" aria-label="Habits streaks and history">
          <div className="habits-stats-drawer-header">
            <div>
              <h3>Habit Streaks & History</h3>
              <p className="habits-stats-sub">
                Streaks respect each habit&apos;s schedule. Tap any past day in the 14-day history strip to toggle check-in records.
              </p>
            </div>
            <div className="habits-stats-filters">
              <button
                type="button"
                className={`stats-filter-btn ${!showArchived ? "active" : ""}`}
                onClick={() => setShowArchived(false)}
              >
                Active ({activeHabits.length})
              </button>
              <button
                type="button"
                className={`stats-filter-btn ${showArchived ? "active" : ""}`}
                onClick={() => setShowArchived(true)}
              >
                Archived ({archivedHabits.length})
              </button>
            </div>
          </div>

          <div className="habits-stats-cards-grid">
            {(showArchived ? archivedHabits : activeHabits).map((habit) => {
              const stats = calculateHabitStats(habit, checkIns, todayKey);
              const completedDates = new Set(
                checkIns.filter((c) => c.habitId === habit.id && c.completed).map((c) => c.date)
              );

              return (
                <div key={habit.id} className="habit-stat-card">
                  <div className="habit-stat-card-top">
                    <div className="habit-stat-title-group">
                      <span className="habit-icon-pill">{habit.icon || "✨"}</span>
                      <div>
                        <h4>{habit.name}</h4>
                        <span className="habit-stat-schedule">
                          {getScheduleLabel(habit)}
                          {habit.target ? ` · Target: ${habit.target}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="habit-stat-actions">
                      <button
                        type="button"
                        className="habit-stat-btn"
                        onClick={() => openEditModal(habit)}
                        title="Edit habit"
                      >
                        <PencilSimple size={13} />
                        <span>Edit</span>
                      </button>
                      {habit.archived ? (
                        <button
                          type="button"
                          className="habit-stat-btn"
                          onClick={() => handleUnarchive(habit)}
                          title="Restore habit to active"
                        >
                          <ArrowCounterClockwise size={13} />
                          <span>Restore</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="habit-stat-btn"
                          onClick={() => handleArchive(habit)}
                          title="Archive habit"
                        >
                          <Archive size={13} />
                          <span>Archive</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="habit-stat-btn danger"
                        onClick={() => handleDelete(habit)}
                        title="Delete habit"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 4 Key Stat Metrics */}
                  <div className="habit-metrics-strip">
                    <div className="habit-metric-box">
                      <span className="metric-num">
                        🔥 {stats.currentStreak}
                      </span>
                      <span className="metric-label">Current Streak</span>
                    </div>
                    <div className="habit-metric-box">
                      <span className="metric-num">
                        🏆 {stats.longestStreak}
                      </span>
                      <span className="metric-label">Best Streak</span>
                    </div>
                    <div className="habit-metric-box">
                      <span className="metric-num">
                        ✓ {stats.totalCompletions}
                      </span>
                      <span className="metric-label">Total Days</span>
                    </div>
                    <div className="habit-metric-box">
                      <span className="metric-num">
                        {stats.completionRate}%
                      </span>
                      <span className="metric-label">30d Rate</span>
                    </div>
                  </div>

                  {/* 14-day Check-In History Strip */}
                  <div className="habit-history-strip-container">
                    <span className="history-strip-title">Recent 14 Days Check-In:</span>
                    <div className="history-strip-cells">
                      {past14Days.map((dKey) => {
                        const isScheduled = isHabitScheduledForDate(habit, dKey);
                        const isDone = completedDates.has(dKey);
                        const isToday = dKey === todayKey;
                        const [year, month, day] = dKey.split("-").map(Number);
                        const dayObj = new Date(year, month - 1, day);
                        const weekdayShort = WEEKDAY_NAMES[dayObj.getDay()];

                        return (
                          <button
                            type="button"
                            key={dKey}
                            className={`history-cell ${isDone ? "is-done" : ""} ${
                              !isScheduled ? "is-unscheduled" : ""
                            } ${isToday ? "is-today" : ""}`}
                            onClick={() => handleToggleDate(habit.id, dKey)}
                            title={`${weekdayShort}, ${dKey}: ${
                              isDone
                                ? "Completed (tap to undo)"
                                : isScheduled
                                ? "Missed/Pending (tap to mark complete)"
                                : "Not scheduled (tap to log)"
                            }`}
                          >
                            <span className="history-cell-weekday">{weekdayShort[0]}</span>
                            <span className="history-cell-day">{day}</span>
                            <span className="history-cell-status">
                              {isDone ? "✓" : isScheduled ? "·" : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Habit Modal */}
      {isAddModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsAddModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsAddModalOpen(false);
          }}
        >
          <div
            className="modal-card habit-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={editingHabit ? "Edit habit" : "Create new habit"}
          >
            <div className="modal-header">
              <h3>{editingHabit ? "Edit Habit" : "New Daily Habit"}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="habit-form">
              {/* Habit Name */}
              <label className="habit-form-label">
                Habit name <span className="req">*</span>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={120}
                  placeholder="e.g. Drink 8 glasses of water, 20 min read"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="habit-form-input"
                />
              </label>

              {/* Emoji / Icon Selector */}
              <div className="habit-form-group">
                <span className="habit-form-label">Emoji / Icon</span>
                <div className="habit-emoji-picker-row">
                  <div className="habit-selected-emoji-preview">{formIcon || "✨"}</div>
                  <div className="habit-emoji-buttons-scroll">
                    {HABIT_EMOJI_SUGGESTIONS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        className={`habit-emoji-opt-btn ${formIcon === emoji ? "selected" : ""}`}
                        onClick={() => setFormIcon(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <label className="habit-form-label">
                Description (optional)
                <input
                  type="text"
                  maxLength={300}
                  placeholder="Brief note or why it matters to you..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="habit-form-input"
                />
              </label>

              {/* Schedule Type */}
              <div className="habit-form-group">
                <span className="habit-form-label">Schedule</span>
                <div className="habit-schedule-selector">
                  <button
                    type="button"
                    className={`schedule-opt-btn ${formScheduleType === "everyday" ? "selected" : ""}`}
                    onClick={() => setFormScheduleType("everyday")}
                  >
                    Every Day
                  </button>
                  <button
                    type="button"
                    className={`schedule-opt-btn ${formScheduleType === "weekdays" ? "selected" : ""}`}
                    onClick={() => setFormScheduleType("weekdays")}
                  >
                    Weekdays
                  </button>
                  <button
                    type="button"
                    className={`schedule-opt-btn ${formScheduleType === "weekends" ? "selected" : ""}`}
                    onClick={() => setFormScheduleType("weekends")}
                  >
                    Weekends
                  </button>
                  <button
                    type="button"
                    className={`schedule-opt-btn ${formScheduleType === "custom" ? "selected" : ""}`}
                    onClick={() => setFormScheduleType("custom")}
                  >
                    Custom
                  </button>
                </div>

                {/* Custom days checkboxes */}
                {formScheduleType === "custom" && (
                  <div className="custom-days-picker">
                    {WEEKDAY_NAMES.map((name, dayIdx) => {
                      const isChecked = formCustomDays.includes(dayIdx);
                      return (
                        <button
                          type="button"
                          key={name}
                          className={`custom-day-btn ${isChecked ? "active" : ""}`}
                          onClick={() => {
                            setFormCustomDays((prev) =>
                              prev.includes(dayIdx)
                                ? prev.filter((d) => d !== dayIdx)
                                : [...prev, dayIdx].sort((a, b) => a - b)
                            );
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Daily Target or Unit */}
              <div className="habit-form-group">
                <label className="habit-form-label">
                  Daily target or unit (optional)
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="e.g. 8 glasses, 30 mins, 10 pages"
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    className="habit-form-input"
                  />
                </label>
                <div className="habit-suggestion-chips">
                  {TARGET_SUGGESTIONS.map((sug) => (
                    <button
                      type="button"
                      key={sug}
                      className="suggestion-chip"
                      onClick={() => setFormTarget(sug)}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reminder Time */}
              <label className="habit-form-label">
                Reminder time (optional)
                <input
                  type="time"
                  value={formReminderTime}
                  onChange={(e) => setFormReminderTime(e.target.value)}
                  className="habit-form-input time-input"
                />
              </label>

              {formError && <p className="habit-form-error">{formError}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="habit-cancel-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || !formName.trim()}
                  className="habit-submit-btn"
                >
                  {formSubmitting
                    ? "Saving..."
                    : editingHabit
                    ? "Save Changes"
                    : "Create Habit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
