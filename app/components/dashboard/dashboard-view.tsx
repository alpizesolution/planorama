"use client";

import { useMemo } from "react";
import { ArrowClockwise, Gear } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import type { DashboardWidgetConfig, DashboardWidgetId } from "@/lib/dashboard/types";
import { resolveDashboardWidgets } from "@/lib/dashboard/types";

import { DailyOverviewWidget } from "./daily-overview-widget";
import { TodaysFocusWidget } from "./todays-focus-widget";
import { DailyHabitsWidget } from "../daily-habits-widget";
import { UpcomingWidget } from "./upcoming-widget";
import { MiniCalendarWidget } from "./mini-calendar-widget";
import { WeeklyProgressWidget } from "./weekly-progress-widget";

interface DashboardViewProps {
  tasks: PlannerTask[];
  habits: Habit[];
  checkIns: HabitCheckIn[];
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onQuickAdd: (dateKey: string) => void;
  onToggleTask: (task: PlannerTask) => void;
  onEditTask: (task: PlannerTask) => void;
  onDeleteTask: (task: PlannerTask) => void;
  onViewCalendar: () => void;
  onOpenPreferences: () => void;
  onRestoreWidgets: () => void;
  showToast: (msg: string) => void;
  onError: (err: string) => void;
  labels: { id: string; name: string }[];
  weekDays: Date[];
  weekStartsOn: 0 | 1 | 6;
  resolvedTheme: ResolvedCalendarTheme;
  widgetConfigs?: DashboardWidgetConfig[];
  priorityLabel: (p: PlannerTask["priority"]) => string;
  priorityEmoji: (p: PlannerTask["priority"]) => string;
  onHabitsChanged?: () => void;
}

export function DashboardView({
  tasks,
  habits,
  checkIns,
  todayKey,
  selectedDate,
  onSelectDate,
  onQuickAdd,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onViewCalendar,
  onOpenPreferences,
  onRestoreWidgets,
  showToast,
  onError,
  labels,
  weekDays,
  weekStartsOn,
  resolvedTheme,
  widgetConfigs,
  priorityLabel,
  priorityEmoji,
  onHabitsChanged,
}: DashboardViewProps) {
  const activeWidgets = useMemo(() => {
    const resolved = resolveDashboardWidgets(widgetConfigs);
    return resolved.filter((w) => w.visible);
  }, [widgetConfigs]);

  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case "daily_overview":
        return (
          <div key="daily_overview" className="dashboard-grid-item item-daily-overview">
            <DailyOverviewWidget
              tasks={tasks}
              todayKey={todayKey}
              onQuickAdd={onQuickAdd}
            />
          </div>
        );

      case "todays_focus":
        return (
          <div key="todays_focus" className="dashboard-grid-item item-todays-focus">
            <TodaysFocusWidget
              tasks={tasks}
              todayKey={todayKey}
              labels={labels}
              onToggleTask={onToggleTask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              onQuickAdd={onQuickAdd}
              priorityLabel={priorityLabel}
              priorityEmoji={priorityEmoji}
            />
          </div>
        );

      case "daily_habits":
        return (
          <div key="daily_habits" className="dashboard-grid-item item-daily-habits">
            <DailyHabitsWidget
              todayKey={todayKey}
              onNotify={showToast}
              onError={onError}
              onDataChanged={onHabitsChanged}
            />
          </div>
        );

      case "upcoming":
        return (
          <div key="upcoming" className="dashboard-grid-item item-upcoming">
            <UpcomingWidget
              tasks={tasks}
              todayKey={todayKey}
              labels={labels}
              onToggleTask={onToggleTask}
              onEditTask={onEditTask}
              onQuickAdd={onQuickAdd}
              onViewCalendar={onViewCalendar}
              priorityLabel={priorityLabel}
              priorityEmoji={priorityEmoji}
            />
          </div>
        );

      case "mini_calendar":
        return (
          <div key="mini_calendar" className="dashboard-grid-item item-mini-calendar">
            <MiniCalendarWidget
              tasks={tasks}
              todayKey={todayKey}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onQuickAdd={onQuickAdd}
              onViewCalendar={onViewCalendar}
              weekStartsOn={weekStartsOn}
              resolvedTheme={resolvedTheme}
            />
          </div>
        );

      case "weekly_progress":
        return (
          <div key="weekly_progress" className="dashboard-grid-item item-weekly-progress">
            <WeeklyProgressWidget
              tasks={tasks}
              habits={habits}
              checkIns={checkIns}
              weekDays={weekDays}
              todayKey={todayKey}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container" id="dashboard-view">
      {activeWidgets.length === 0 ? (
        <div className="dashboard-empty-all neo-card">
          <span className="dashboard-empty-all-icon">⚙️</span>
          <h3>All Dashboard Widgets Are Hidden</h3>
          <p>
            You have hidden every widget in your dashboard preferences. Restore the default layout or
            customize which widgets appear on your command center.
          </p>
          <div className="dashboard-empty-all-actions">
            <button
              type="button"
              className="dashboard-restore-all-btn"
              onClick={onRestoreWidgets}
            >
              <ArrowClockwise size={15} weight="bold" />
              <span>Restore Default Widgets</span>
            </button>
            <button
              type="button"
              className="dashboard-open-pref-btn"
              onClick={onOpenPreferences}
            >
              <Gear size={15} weight="bold" />
              <span>Customize Preferences</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-widgets-grid">
          {activeWidgets.map((w) => renderWidget(w.id))}
        </div>
      )}
    </div>
  );
}
