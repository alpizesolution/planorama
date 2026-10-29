"use client";

import { useMemo, useState } from "react";
import { ArrowClockwise, Gear, DotsSixVertical } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import type { DashboardWidgetConfig, DashboardWidgetId } from "@/lib/dashboard/types";
import {
  DASHBOARD_WIDGET_METADATA,
  resolveDashboardWidgets,
} from "@/lib/dashboard/types";

import { DailyOverviewWidget } from "./daily-overview-widget";
import { TodaysFocusWidget } from "./todays-focus-widget";
import { DailyHabitsWidget } from "../daily-habits-widget";
import { UpcomingWidget } from "./upcoming-widget";
import { MiniCalendarWidget } from "./mini-calendar-widget";
import { WeeklyProgressWidget } from "./weekly-progress-widget";
import { DashboardCustomizationModal } from "./dashboard-customization-modal";

import type { ItemColorPreferences, ItemStylesPreferences } from "@/lib/calendar/item-color";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";

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
  onSaveWidgetConfigs?: (nextWidgets: DashboardWidgetConfig[]) => void;
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
  itemColors?: ItemColorPreferences;
  itemStyles?: ItemStylesPreferences;
  allCalendarConfigs?: Record<string, GoogleCalendarConfig>;
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
  onRestoreWidgets,
  onSaveWidgetConfigs,
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
  itemColors,
  itemStyles,
  allCalendarConfigs,
}: DashboardViewProps) {
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [directDraggedId, setDirectDraggedId] = useState<DashboardWidgetId | null>(null);
  const [directDragOverId, setDirectDragOverId] = useState<DashboardWidgetId | null>(null);

  const resolvedWidgets = useMemo(() => {
    return resolveDashboardWidgets(widgetConfigs);
  }, [widgetConfigs]);

  const activeWidgets = useMemo(() => {
    return resolvedWidgets.filter((w) => w.visible);
  }, [resolvedWidgets]);

  const [y, m, d] = todayKey.split("-").map(Number);
  const todayDate = new Date(y, m - 1, d);
  const formattedToday = todayDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Direct widget drag-and-drop on the dashboard
  function handleDirectDragStart(id: DashboardWidgetId, e: React.DragEvent) {
    setDirectDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDirectDragOver(id: DashboardWidgetId, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (directDragOverId !== id) {
      setDirectDragOverId(id);
    }
  }

  function handleDirectDrop(targetId: DashboardWidgetId, e: React.DragEvent) {
    e.preventDefault();
    if (!directDraggedId || directDraggedId === targetId || !onSaveWidgetConfigs) {
      setDirectDraggedId(null);
      setDirectDragOverId(null);
      return;
    }

    const next = [...resolvedWidgets];
    const fromIndex = next.findIndex((w) => w.id === directDraggedId);
    const toIndex = next.findIndex((w) => w.id === targetId);

    if (fromIndex >= 0 && toIndex >= 0) {
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      onSaveWidgetConfigs(next);
      showToast?.(`Rearranged ${DASHBOARD_WIDGET_METADATA[directDraggedId]?.name || "widget"}`);
    }

    setDirectDraggedId(null);
    setDirectDragOverId(null);
  }

  function handleDirectDragEnd() {
    setDirectDraggedId(null);
    setDirectDragOverId(null);
  }

  const renderWidgetContent = (id: DashboardWidgetId) => {
    switch (id) {
      case "daily_overview":
        return (
          <DailyOverviewWidget
            tasks={tasks}
            todayKey={todayKey}
            onQuickAdd={onQuickAdd}
          />
        );

      case "todays_focus":
        return (
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
            itemColors={itemColors}
            itemStyles={itemStyles}
            allCalendarConfigs={allCalendarConfigs}
          />
        );

      case "daily_habits":
        return (
          <DailyHabitsWidget
            todayKey={todayKey}
            onNotify={showToast}
            onError={onError}
            onDataChanged={onHabitsChanged}
          />
        );

      case "upcoming":
        return (
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
            itemColors={itemColors}
            itemStyles={itemStyles}
            allCalendarConfigs={allCalendarConfigs}
          />
        );

      case "mini_calendar":
        return (
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
        );

      case "weekly_progress":
        return (
          <WeeklyProgressWidget
            tasks={tasks}
            habits={habits}
            checkIns={checkIns}
            weekDays={weekDays}
            todayKey={todayKey}
          />
        );

      default:
        return null;
    }
  };

  const renderGridItem = (w: DashboardWidgetConfig) => {
    const meta = DASHBOARD_WIDGET_METADATA[w.id];
    const isDragging = directDraggedId === w.id;
    const isDragOver = directDragOverId === w.id;
    const itemClass = `dashboard-grid-item item-${w.id.replace(/_/g, "-")} ${
      isDragging ? "is-direct-dragging" : ""
    } ${isDragOver ? "is-direct-drag-over" : ""}`;

    return (
      <div
        key={w.id}
        className={itemClass}
        onDragOver={(e) => handleDirectDragOver(w.id, e)}
        onDrop={(e) => handleDirectDrop(w.id, e)}
      >
        <div className="dashboard-widget-wrapper">
          <div
            className="dashboard-widget-direct-handle"
            draggable
            onDragStart={(e) => handleDirectDragStart(w.id, e)}
            onDragEnd={handleDirectDragEnd}
            title={`Drag to rearrange ${meta.name} on dashboard`}
            aria-label={`Drag to rearrange ${meta.name}`}
          >
            <DotsSixVertical size={15} weight="bold" />
            <span className="direct-handle-text">Move</span>
          </div>
          {renderWidgetContent(w.id)}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container" id="dashboard-view">
      {/* Dashboard Page Header Toolbar with Dedicated Gear Button */}
      <div className="dashboard-header-toolbar">
        <div className="dashboard-header-left">
          <span className="dashboard-kicker">COMMAND CENTER</span>
          <div className="dashboard-title-row">
            <h1 className="dashboard-title">Dashboard</h1>
            <span className="dashboard-header-date-badge" title="Today's date">
              <span className="dashboard-date-dot" aria-hidden="true" />
              {formattedToday}
            </span>
          </div>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            id="dashboard-customize-btn"
            className="dashboard-customize-btn neo-btn"
            onClick={() => setIsCustomizeModalOpen(true)}
            title="Customize dashboard"
            aria-label="Customize dashboard"
          >
            <Gear size={16} weight="bold" />
            <span className="dashboard-customize-btn-text">Customize</span>
          </button>
        </div>
      </div>

      {activeWidgets.length === 0 ? (
        <div className="dashboard-empty-all neo-card">
          <span className="dashboard-empty-all-icon">⚙️</span>
          <h3>All Dashboard Widgets Are Hidden</h3>
          <p>
            You have hidden every widget in your dashboard customization settings. Restore the
            default layout or choose which widgets appear on your command center.
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
              onClick={() => setIsCustomizeModalOpen(true)}
            >
              <Gear size={15} weight="bold" />
              <span>Customize Dashboard</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-widgets-grid">
          {activeWidgets.map((w) => renderGridItem(w))}
        </div>
      )}

      {/* Dedicated Dashboard Customization Modal */}
      <DashboardCustomizationModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        widgetConfigs={widgetConfigs}
        onSaveWidgets={(next) => {
          onSaveWidgetConfigs?.(next);
        }}
        onRestoreDefaults={() => {
          onRestoreWidgets();
        }}
      />
    </div>
  );
}
