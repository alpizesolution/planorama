"use client";

import { useState, useMemo } from "react";
import { CaretLeft, CaretRight, Plus, ArrowRight } from "@phosphor-icons/react";
import type { PlannerTask } from "@/lib/schedule/types";
import type { ResolvedCalendarTheme } from "@/lib/calendar/calendar-themes";
import { getMonthColor } from "@/lib/calendar/calendar-themes";
import { monthGridDays } from "@/lib/calendar/date-utils";

interface MiniCalendarWidgetProps {
  tasks: PlannerTask[];
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onQuickAdd: (dateKey: string) => void;
  onViewCalendar: () => void;
  weekStartsOn: 0 | 1 | 6;
  resolvedTheme: ResolvedCalendarTheme;
}

export function MiniCalendarWidget({
  tasks,
  todayKey,
  selectedDate,
  onSelectDate,
  onQuickAdd,
  onViewCalendar,
  weekStartsOn,
  resolvedTheme,
}: MiniCalendarWidgetProps) {
  const [currentMonthOffset, setCurrentMonthOffset] = useState(0);

  const displayedDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + currentMonthOffset, 1);
  }, [currentMonthOffset]);

  const shownYear = displayedDate.getFullYear();
  const shownMonthIndex = displayedDate.getMonth();
  const monthName = displayedDate.toLocaleDateString("en", { month: "long" });

  const gridDays = useMemo(
    () => monthGridDays(shownYear, shownMonthIndex, weekStartsOn),
    [shownYear, shownMonthIndex, weekStartsOn]
  );

  const monthColor = useMemo(
    () => getMonthColor(resolvedTheme, shownMonthIndex),
    [resolvedTheme, shownMonthIndex]
  );

  const weekdays = useMemo(() => {
    const days = ["S", "M", "T", "W", "T", "F", "S"];
    return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)];
  }, [weekStartsOn]);

  const tasksByDueDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) {
      if (t.dueDate) {
        map[t.dueDate] = (map[t.dueDate] || 0) + 1;
      }
    }
    return map;
  }, [tasks]);

  return (
    <section className="dashboard-widget mini-calendar-card neo-card" aria-label="Mini Calendar">
      <div className="card-header dashboard-widget-header">
        <div>
          <span className="section-kicker">CALENDAR AT A GLANCE</span>
          <h2 className="dashboard-widget-title">
            <span
              className="mini-cal-month-badge"
              style={{
                backgroundColor: monthColor.bg,
                borderColor: monthColor.border,
                color: monthColor.text,
              }}
            >
              {monthName} {shownYear}
            </span>
          </h2>
        </div>
        <div className="mini-cal-nav-actions">
          <button
            type="button"
            className="icon-button mini-btn"
            onClick={() => setCurrentMonthOffset((n) => n - 1)}
            aria-label="Previous month"
            title="Previous month"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <button
            type="button"
            className="icon-button mini-btn"
            onClick={() => setCurrentMonthOffset(0)}
            aria-label="This month"
            title="Reset to current month"
          >
            Today
          </button>
          <button
            type="button"
            className="icon-button mini-btn"
            onClick={() => setCurrentMonthOffset((n) => n + 1)}
            aria-label="Next month"
            title="Next month"
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>

      <div className="mini-cal-grid-wrap">
        <div className="mini-cal-weekdays">
          {weekdays.map((w, i) => {
            const isWeekendDay = w === "S";
            return (
              <span key={i} className={`mini-cal-weekday ${isWeekendDay ? "is-weekend" : ""}`}>
                {w}
              </span>
            );
          })}
        </div>

        <div className="mini-cal-days-grid">
          {gridDays.map((dayNum, cellIndex) => {
            if (!dayNum) {
              return <div key={`empty-${cellIndex}`} className="mini-cal-cell is-empty" />;
            }

            const dateKey = `${shownYear}-${String(shownMonthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const dayDate = new Date(shownYear, shownMonthIndex, dayNum);
            const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const taskCount = tasksByDueDate[dateKey] || 0;

            return (
              <button
                key={dateKey}
                type="button"
                className={`mini-cal-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${isWeekend ? "is-weekend" : ""} ${taskCount > 0 ? "has-tasks" : ""}`}
                style={{
                  ...(isToday ? { backgroundColor: resolvedTheme.todayBg } : {}),
                  ...(isSelected && !isToday ? { backgroundColor: resolvedTheme.selectedBg } : {}),
                  ...(isWeekend && !isToday && !isSelected ? { backgroundColor: resolvedTheme.weekendBg } : {}),
                }}
                onClick={() => onSelectDate(dateKey)}
                title={`${monthName} ${dayNum}, ${shownYear}${taskCount > 0 ? ` · ${taskCount} task(s)` : ""}`}
                aria-label={`${monthName} ${dayNum}, ${shownYear}${taskCount > 0 ? `, ${taskCount} tasks` : ""}`}
                aria-pressed={isSelected}
              >
                <span className="mini-cal-num">{dayNum}</span>
                {taskCount > 0 && (
                  <span
                    className="mini-cal-task-dot"
                    style={{ backgroundColor: resolvedTheme.taskDotColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mini-cal-footer">
        {selectedDate ? (
          <div className="mini-cal-selected-info">
            <span className="mini-cal-selected-label">Selected:</span>
            <span className="mini-cal-selected-val">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              type="button"
              className="mini-cal-add-selected-btn"
              onClick={() => onQuickAdd(selectedDate)}
              title="Add task for selected date"
            >
              <Plus size={12} weight="bold" />
              <span>Add for Date</span>
            </button>
          </div>
        ) : (
          <span className="mini-cal-hint">Click any date to filter or add tasks</span>
        )}
        <button
          type="button"
          className="mini-cal-full-cal-btn"
          onClick={onViewCalendar}
          title="Open Full Calendar View"
        >
          <span>Full Calendar</span>
          <ArrowRight size={13} weight="bold" />
        </button>
      </div>
    </section>
  );
}
