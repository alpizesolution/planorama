"use client";

import { useMemo } from "react";
import { ChartBar, Flame } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import { calculateWeeklyProgress } from "@/lib/dashboard/dashboard-utils";

interface WeeklyProgressWidgetProps {
  tasks: PlannerTask[];
  habits: Habit[];
  checkIns: HabitCheckIn[];
  weekDays: Date[];
  todayKey: string;
}

export function WeeklyProgressWidget({
  tasks,
  habits,
  checkIns,
  weekDays,
  todayKey,
}: WeeklyProgressWidgetProps) {
  const stats = useMemo(
    () => calculateWeeklyProgress(tasks, habits, checkIns, weekDays, todayKey),
    [tasks, habits, checkIns, weekDays, todayKey]
  );

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return "";
    const start = weekDays[0];
    const end = weekDays[weekDays.length - 1];
    const startStr = start.toLocaleDateString("en", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en", { month: "short", day: "numeric" });
    return `${startStr} – ${endStr}`;
  }, [weekDays]);

  const hasActivity = stats.totalWeekTasks > 0 || stats.habitsExpected > 0;

  return (
    <section className="dashboard-widget weekly-progress-card neo-card" aria-label="Weekly Progress">
      <div className="card-header dashboard-widget-header">
        <div>
          <span className="section-kicker">MOMENTUM & HABITS</span>
          <h2 className="dashboard-widget-title">
            <span>Weekly Progress</span>
            <span className="dashboard-date-range-badge">{weekRangeLabel}</span>
          </h2>
        </div>
        <div className="weekly-progress-header-icon">
          <ChartBar size={20} weight="bold" />
        </div>
      </div>

      {!hasActivity ? (
        <div className="dashboard-empty-state">
          <span className="dashboard-empty-icon" aria-hidden="true">🌱</span>
          <p className="dashboard-empty-title">No weekly activity yet</p>
          <p className="dashboard-empty-desc">
            Schedule tasks or start tracking habits for this week to see your weekly momentum.
          </p>
        </div>
      ) : (
        <div className="weekly-progress-body">
          {/* Top Quick Metrics */}
          <div className="weekly-stats-row">
            <div className="weekly-stat-box">
              <span className="weekly-stat-num">{stats.tasksCompleted}</span>
              <span className="weekly-stat-label">Tasks Done</span>
            </div>
            <div className="weekly-stat-box">
              <span className="weekly-stat-num">{stats.tasksRemaining}</span>
              <span className="weekly-stat-label">Remaining</span>
            </div>
            <div className="weekly-stat-box accent-box">
              <span className="weekly-stat-num">{stats.taskCompletionPercent}%</span>
              <span className="weekly-stat-label">Tasks Rate</span>
            </div>
            {stats.habitsExpected > 0 && (
              <div className="weekly-stat-box habit-box">
                <span className="weekly-stat-num">{stats.habitsCompleted}/{stats.habitsExpected}</span>
                <span className="weekly-stat-label">Habits Done</span>
              </div>
            )}
          </div>

          {/* Daily Completion Chart */}
          <div className="weekly-chart-section">
            <div className="weekly-chart-header">
              <span className="weekly-chart-title">Daily Task Completion</span>
              <span className="weekly-chart-legend">
                <span className="chart-legend-swatch done" /> Done / Total
              </span>
            </div>

            <div className="weekly-bars-container">
              {stats.dailyChart.map((col) => {
                const maxBarHeight = 64; // px
                const fillPercent = col.totalTasks > 0 ? (col.completedTasks / col.totalTasks) * 100 : 0;
                const barHeight = col.totalTasks > 0 ? Math.max(12, Math.min(maxBarHeight, col.totalTasks * 14)) : 6;
                const fillHeight = (fillPercent / 100) * barHeight;

                return (
                  <div
                    key={col.dateKey}
                    className={`weekly-bar-col ${col.isToday ? "is-today-col" : ""}`}
                    title={`${col.dayShort} (${col.dateKey}): ${col.completedTasks} of ${col.totalTasks} completed`}
                  >
                    <div className="weekly-bar-count">
                      {col.totalTasks > 0 ? `${col.completedTasks}/${col.totalTasks}` : "—"}
                    </div>
                    <div className="weekly-bar-track" style={{ height: `${maxBarHeight}px` }}>
                      <div
                        className={`weekly-bar-pillar ${col.totalTasks > 0 ? "has-data" : "no-data"} ${col.isToday ? "is-today" : ""}`}
                        style={{ height: `${barHeight}px` }}
                      >
                        <div
                          className="weekly-bar-fill"
                          style={{ height: `${fillHeight}px` }}
                        />
                      </div>
                    </div>
                    <span className="weekly-bar-day">{col.dayShort}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Habits Summary Bar if habit data is available */}
          {stats.habitsExpected > 0 && (
            <div className="weekly-habits-summary-card">
              <div className="weekly-habits-summary-top">
                <div className="weekly-habits-summary-title">
                  <Flame size={16} weight="fill" className="weekly-habits-flame" />
                  <span>Habit Check-in Momentum</span>
                </div>
                <span className="weekly-habits-summary-badge">
                  {stats.habitsCompleted} of {stats.habitsExpected} completed ({stats.habitCompletionPercent}%)
                </span>
              </div>
              <div className="progress-track weekly-habit-track">
                <span
                  className="weekly-habit-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, stats.habitCompletionPercent))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
