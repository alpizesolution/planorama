"use client";

import { useMemo } from "react";
import { Plus, CheckCircle, WarningCircle, Clock, CalendarBlank } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import { calculateDailyOverview } from "@/lib/dashboard/dashboard-utils";

interface DailyOverviewWidgetProps {
  tasks: PlannerTask[];
  todayKey: string;
  onQuickAdd: (dateKey: string) => void;
}

export function DailyOverviewWidget({
  tasks,
  todayKey,
  onQuickAdd,
}: DailyOverviewWidgetProps) {
  const stats = useMemo(
    () => calculateDailyOverview(tasks, todayKey),
    [tasks, todayKey]
  );

  const [y, m, d] = todayKey.split("-").map(Number);
  const todayDate = new Date(y, m - 1, d);
  const fullDateDisplay = todayDate.toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const weekdayDisplay = todayDate.toLocaleDateString("en", { weekday: "long" });

  return (
    <section className="dashboard-widget daily-overview-card neo-card" aria-label="Daily Overview">
      <div className="daily-overview-top">
        <div className="daily-overview-greeting">
          <span className="section-kicker">PERSONAL COMMAND CENTER · {weekdayDisplay.toUpperCase()}</span>
          <h2 className="daily-overview-date">
            <CalendarBlank size={26} weight="fill" className="daily-overview-cal-icon" />
            <span>{fullDateDisplay}</span>
          </h2>
        </div>
        <button
          type="button"
          className="dashboard-quick-add-btn"
          onClick={() => onQuickAdd(todayKey)}
          aria-label="Add task for today"
        >
          <Plus size={16} weight="bold" />
          <span>Add Task for Today</span>
        </button>
      </div>

      {/* 4 Overview Stat Tiles */}
      <div className="daily-stats-grid">
        <div className="daily-stat-tile stat-due-today">
          <div className="daily-stat-icon-wrap">
            <Clock size={20} weight="bold" />
          </div>
          <div className="daily-stat-info">
            <span className="daily-stat-val">{stats.totalDueToday}</span>
            <span className="daily-stat-lbl">Due Today</span>
          </div>
        </div>

        <div className="daily-stat-tile stat-completed-today">
          <div className="daily-stat-icon-wrap">
            <CheckCircle size={20} weight="fill" />
          </div>
          <div className="daily-stat-info">
            <span className="daily-stat-val">{stats.completedToday}</span>
            <span className="daily-stat-lbl">Completed</span>
          </div>
        </div>

        <div className={`daily-stat-tile stat-overdue ${stats.overdueCount > 0 ? "has-overdue" : ""}`}>
          <div className="daily-stat-icon-wrap">
            <WarningCircle size={20} weight="fill" />
          </div>
          <div className="daily-stat-info">
            <span className="daily-stat-val">{stats.overdueCount}</span>
            <span className="daily-stat-lbl">Overdue</span>
          </div>
        </div>

        <div className="daily-stat-tile stat-progress-rate">
          <div className="daily-stat-icon-wrap">
            <span className="daily-stat-percent-badge">{stats.progressPercent}%</span>
          </div>
          <div className="daily-stat-info">
            <span className="daily-stat-val">{stats.remainingToday}</span>
            <span className="daily-stat-lbl">Remaining</span>
          </div>
        </div>
      </div>

      {/* Daily Progress Bar */}
      <div className="daily-progress-section">
        <div className="daily-progress-labels">
          <span className="daily-progress-text">
            {stats.totalDueToday === 0
              ? stats.overdueCount > 0
                ? "No tasks scheduled for today, but you have overdue items."
                : "No tasks due today. You're all clear!"
              : `${stats.completedToday} of ${stats.totalDueToday} task${stats.totalDueToday === 1 ? "" : "s"} done (${stats.progressPercent}%)`}
          </span>
          <span className="daily-progress-percent">{stats.progressPercent}%</span>
        </div>
        <div className="progress-track daily-progress-track">
          <span
            className="daily-progress-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, stats.progressPercent))}%` }}
          />
        </div>
      </div>
    </section>
  );
}
