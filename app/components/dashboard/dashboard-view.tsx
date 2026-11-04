"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  ArrowClockwise,
  Gear,
  DotsSixVertical,
  ArrowsOutCardinal,
} from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { Habit, HabitCheckIn } from "@/lib/habits/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import type {
  DashboardWidgetConfig,
  DashboardWidgetId,
  DashboardWidgetWidth,
  DashboardWidgetHeight,
} from "@/lib/dashboard/types";
import {
  DASHBOARD_WIDGET_METADATA,
  WIDGET_HEIGHT_LABELS,
  getWidgetColSpan,
  calculateSnappedColSpan,
  calculateSnappedWidgetWidth,
  calculateSnappedWidgetHeight,
  balanceDashboardLayout,
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

type ResizeDirection = "left" | "right" | "bottom" | "corner";

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

  // Selection state for touch devices / click focus affordance
  const [selectedWidgetId, setSelectedWidgetId] = useState<DashboardWidgetId | null>(null);

  // Live active resizing state
  const [resizingState, setResizingState] = useState<{
    widgetId: DashboardWidgetId;
    direction: ResizeDirection;
    currentColSpan: number;
    currentWidth: DashboardWidgetWidth;
    currentHeight: DashboardWidgetHeight;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);

  // Ref to hold mutable drag session
  const resizeSessionRef = useRef<{
    widgetId: DashboardWidgetId;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startColSpan: number;
    startWidth: DashboardWidgetWidth;
    startHeight: DashboardWidgetHeight;
    initialWidgetWidthPx: number;
    initialWidgetHeightPx: number;
    containerWidth: number;
    currentColSpan: number;
    currentWidth: DashboardWidgetWidth;
    currentHeight: DashboardWidgetHeight;
  } | null>(null);

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

  // Clear selection on background click
  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest(".dashboard-grid-item")) {
        setSelectedWidgetId(null);
      }
    }
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  // Direct widget drag-and-drop on the dashboard (Moving widgets)
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

  // Initiate interactive direct drag-to-resize
  function handleResizeStart(
    e: React.MouseEvent | React.TouchEvent,
    widgetId: DashboardWidgetId,
    direction: ResizeDirection
  ) {
    e.stopPropagation();
    if ("preventDefault" in e && e.cancelable) {
      e.preventDefault();
    }

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const targetWidget = resolvedWidgets.find((w) => w.id === widgetId);
    if (!targetWidget) return;

    const meta = DASHBOARD_WIDGET_METADATA[widgetId];
    const initialColSpan = getWidgetColSpan(targetWidget);
    const initialWidth = targetWidget.width || meta.defaultWidth;
    const initialHeight = targetWidget.height || meta.defaultHeight;

    const gridEl = gridRef.current;
    const containerWidth = gridEl ? gridEl.getBoundingClientRect().width : window.innerWidth;

    const widgetEl = document.querySelector(`.item-${widgetId.replace(/_/g, "-")}`) as HTMLElement | null;
    const initialWidgetWidthPx = widgetEl ? widgetEl.getBoundingClientRect().width : (containerWidth * initialColSpan) / 12;
    const initialWidgetHeightPx = widgetEl ? widgetEl.getBoundingClientRect().height : 360;

    setSelectedWidgetId(widgetId);

    const session = {
      widgetId,
      direction,
      startX: clientX,
      startY: clientY,
      startColSpan: initialColSpan,
      startWidth: initialWidth,
      startHeight: initialHeight,
      initialWidgetWidthPx,
      initialWidgetHeightPx,
      containerWidth,
      currentColSpan: initialColSpan,
      currentWidth: initialWidth,
      currentHeight: initialHeight,
    };

    resizeSessionRef.current = session;
    setResizingState({
      widgetId,
      direction,
      currentColSpan: initialColSpan,
      currentWidth: initialWidth,
      currentHeight: initialHeight,
    });

    const cursor =
      direction === "left" || direction === "right"
        ? "col-resize"
        : direction === "bottom"
        ? "row-resize"
        : "nwse-resize";

    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: MouseEvent | TouchEvent) {
      if (!resizeSessionRef.current) return;
      const currentX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaX = currentX - resizeSessionRef.current.startX;
      const deltaY = currentY - resizeSessionRef.current.startY;

      const newColSpan = calculateSnappedColSpan(
        meta,
        resizeSessionRef.current.initialWidgetWidthPx,
        deltaX,
        direction,
        resizeSessionRef.current.containerWidth
      );

      const newWidth = calculateSnappedWidgetWidth(
        meta,
        resizeSessionRef.current.initialWidgetWidthPx,
        deltaX,
        direction,
        resizeSessionRef.current.containerWidth
      );

      const newHeight = calculateSnappedWidgetHeight(
        meta,
        resizeSessionRef.current.initialWidgetHeightPx,
        deltaY,
        direction
      );

      resizeSessionRef.current.currentColSpan = newColSpan;
      resizeSessionRef.current.currentWidth = newWidth;
      resizeSessionRef.current.currentHeight = newHeight;

      setResizingState({
        widgetId,
        direction,
        currentColSpan: newColSpan,
        currentWidth: newWidth,
        currentHeight: newHeight,
      });
    }

    function onPointerEnd() {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerEnd);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerEnd);
      window.removeEventListener("touchcancel", onPointerEnd);

      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const activeSession = resizeSessionRef.current;
      resizeSessionRef.current = null;
      setResizingState(null);

      if (activeSession && onSaveWidgetConfigs) {
        const hasChanged =
          activeSession.currentColSpan !== activeSession.startColSpan ||
          activeSession.currentWidth !== activeSession.startWidth ||
          activeSession.currentHeight !== activeSession.startHeight;

        if (hasChanged) {
          const next = resolvedWidgets.map((item) =>
            item.id === activeSession.widgetId
              ? {
                  ...item,
                  colSpan: activeSession.currentColSpan,
                  width: activeSession.currentWidth,
                  height: activeSession.currentHeight,
                }
              : item
          );
          const balanced = balanceDashboardLayout(next);
          onSaveWidgetConfigs(balanced);
          const hMeta = WIDGET_HEIGHT_LABELS[activeSession.currentHeight];
          showToast?.(`${meta.name}: ${activeSession.currentColSpan} Columns · ${hMeta.label}`);
        }
      }
    }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerEnd);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerEnd);
    window.addEventListener("touchcancel", onPointerEnd);
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
    const isSelected = selectedWidgetId === w.id;

    const isThisResizing = resizingState?.widgetId === w.id;
    const colSpan = isThisResizing ? resizingState.currentColSpan : getWidgetColSpan(w);
    const effectiveWidth = isThisResizing ? resizingState.currentWidth : (w.width || meta.defaultWidth);
    const effectiveHeight = isThisResizing ? resizingState.currentHeight : (w.height || meta.defaultHeight);
    const mobileHeight = w.mobileHeight || effectiveHeight;
    const isMobileHidden = w.mobileVisible === false;

    const isMinCols = colSpan === meta.minCols;
    const isFullWidth = colSpan === 12;
    const heightMeta = WIDGET_HEIGHT_LABELS[effectiveHeight];

    const itemClass = [
      "dashboard-grid-item",
      `item-${w.id.replace(/_/g, "-")}`,
      `item-cols-${colSpan}`,
      `item-width-${effectiveWidth}`,
      `item-height-${effectiveHeight}`,
      `item-mobile-height-${mobileHeight}`,
      isMobileHidden ? "is-mobile-hidden" : "",
      isDragging ? "is-direct-dragging" : "",
      isDragOver ? "is-direct-drag-over" : "",
      isSelected ? "is-selected" : "",
      isThisResizing ? "is-resizing" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={w.id}
        className={itemClass}
        onClick={() => setSelectedWidgetId(w.id)}
        onDragOver={(e) => handleDirectDragOver(w.id, e)}
        onDrop={(e) => handleDirectDrop(w.id, e)}
      >
        <div className="dashboard-widget-wrapper">
          {/* Top toolbar with clean Move handle only */}
          <div className="dashboard-widget-top-controls">
            <div
              className="dashboard-widget-direct-handle"
              draggable
              onDragStart={(e) => handleDirectDragStart(w.id, e)}
              onDragEnd={handleDirectDragEnd}
              title={`Drag to rearrange ${meta.name} on dashboard`}
              aria-label={`Drag to rearrange ${meta.name}`}
            >
              <DotsSixVertical size={14} weight="bold" />
              <span className="direct-handle-text">Move</span>
            </div>
          </div>

          {/* Floating Live Dimension Indicator Badge while Resizing */}
          {isThisResizing && (
            <div
              className="dashboard-resize-indicator-pill"
              role="status"
              aria-live="polite"
            >
              <span className="resize-indicator-icon">📐</span>
              <span className="resize-indicator-text">
                {colSpan} Columns {isMinCols ? "(Min width)" : isFullWidth ? "(Full width)" : `(${Math.round((colSpan / 12) * 100)}% row)`} · {heightMeta.label}
              </span>
            </div>
          )}

          {/* Left Edge Resize Handle (Only when horizontal resizing is permitted) */}
          {meta.minCols < meta.maxCols && (
            <div
              className="dashboard-resize-handle resize-handle-left"
              onMouseDown={(e) => handleResizeStart(e, w.id, "left")}
              onTouchStart={(e) => handleResizeStart(e, w.id, "left")}
              title={`Drag left edge to resize ${meta.name} width (Min ${meta.minCols} cols)`}
              aria-label={`Drag left edge to resize ${meta.name} width`}
            >
              <div className="resize-handle-bar" />
            </div>
          )}

          {/* Right Edge Resize Handle (Only when horizontal resizing is permitted) */}
          {meta.minCols < meta.maxCols && (
            <div
              className="dashboard-resize-handle resize-handle-right"
              onMouseDown={(e) => handleResizeStart(e, w.id, "right")}
              onTouchStart={(e) => handleResizeStart(e, w.id, "right")}
              title={`Drag right edge to resize ${meta.name} width (Min ${meta.minCols} cols)`}
              aria-label={`Drag right edge to resize ${meta.name} width`}
            >
              <div className="resize-handle-bar" />
            </div>
          )}

          {/* Bottom Edge Resize Handle */}
          <div
            className="dashboard-resize-handle resize-handle-bottom"
            onMouseDown={(e) => handleResizeStart(e, w.id, "bottom")}
            onTouchStart={(e) => handleResizeStart(e, w.id, "bottom")}
            title={`Drag bottom edge to resize ${meta.name} height`}
            aria-label={`Drag bottom edge to resize ${meta.name} height`}
          >
            <div className="resize-handle-bar-h" />
          </div>

          {/* Bottom-Right Corner Resize Handle */}
          <div
            className="dashboard-resize-handle resize-handle-corner"
            onMouseDown={(e) => handleResizeStart(e, w.id, "corner")}
            onTouchStart={(e) => handleResizeStart(e, w.id, "corner")}
            title={`Drag corner to resize ${meta.name}`}
            aria-label={`Drag corner to resize ${meta.name}`}
          >
            <ArrowsOutCardinal size={11} weight="bold" className="resize-corner-icon" />
          </div>

          {/* Actual Widget Content */}
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
            title="Customize dashboard visibility and order"
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
        <div className="dashboard-widgets-grid" ref={gridRef}>
          {activeWidgets.map((w) => renderGridItem(w))}
        </div>
      )}

      {/* Dedicated Dashboard Customization Modal (Visibility & Reorder) */}
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
