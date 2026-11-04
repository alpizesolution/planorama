"use client";

import { useEffect, useState } from "react";
import {
  CheckSquare,
  CalendarBlank,
  Leaf,
  CaretDown,
  CheckCircle,
  Hourglass,
  WarningCircle,
  SkipForward,
} from "@phosphor-icons/react";
import type { DailyProgress, ProgressCount } from "@/lib/calendar/daily-progress";

const COLLAPSE_KEY = "planorama.dailyProgress.collapsed";

interface RingProps {
  label: string;
  emptyLabel: string;
  count: ProgressCount;
  tone: "tasks" | "activities" | "habits";
  icon: React.ReactNode;
  animate: boolean;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ label, emptyLabel, count, tone, icon, animate }: RingProps) {
  const fraction = animate ? count.percent / 100 : 0;
  const offset = CIRCUMFERENCE * (1 - fraction);
  const isEmpty = count.total === 0;

  return (
    <div
      className={`dp-ring-card dp-tone-${tone}${isEmpty ? " is-empty" : ""}`}
      role="group"
      aria-label={`${label}: ${count.completed} of ${count.total} completed, ${count.percent} percent`}
    >
      <div className="dp-ring-wrap">
        <svg className="dp-ring-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="dp-ring-track" cx="50" cy="50" r={RADIUS} />
          <circle
            className="dp-ring-value"
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="dp-ring-center" aria-hidden="true">
          <span className="dp-ring-percent">
            {isEmpty ? "–" : count.percent}
            {!isEmpty && <small>%</small>}
          </span>
          <span className="dp-ring-count">
            {count.completed}/{count.total}
          </span>
        </div>
      </div>
      <div className="dp-ring-label" aria-hidden="true">
        <span className="dp-ring-icon">{icon}</span>
        <span className="dp-ring-label-text">{label}</span>
      </div>
      <span className="dp-ring-sub" aria-hidden="true">
        {isEmpty ? emptyLabel : `${count.completed} of ${count.total} done`}
      </span>
    </div>
  );
}

export interface DailyProgressPanelProps {
  progress: DailyProgress;
}

export function DailyProgressPanel({ progress }: DailyProgressPanelProps) {
  // Start rings at 0 and let CSS transition them to the real value after mount.
  const [animate, setAnimate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
    return () => cancelAnimationFrame(id);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const { overall, summary, relation } = progress;
  const contextLabel =
    relation === "today" ? "Today's progress" : relation === "past" ? "Past day review" : "Planned for this day";
  const overallFill = animate ? overall.percent : 0;

  return (
    <section
      className={`daily-progress-panel is-${relation}${collapsed ? " is-collapsed" : ""}`}
      aria-label="Daily progress"
    >
      <div className="dp-head">
        <div className="dp-head-titles">
          <span className="dp-kicker">Daily progress</span>
          <span className="dp-context">{contextLabel}</span>
        </div>
        <div className="dp-head-right">
          <span className="dp-head-overall" aria-hidden={!collapsed}>
            <strong>{overall.percent}%</strong> · {overall.completed}/{overall.total}
          </span>
          <button
            type="button"
            className="dp-collapse-btn"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show daily progress" : "Hide daily progress"}
          >
            <CaretDown size={14} weight="bold" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="dp-body">
          <div className="dp-rings">
            <ProgressRing
              label="Tasks"
              emptyLabel="No tasks"
              count={progress.tasks}
              tone="tasks"
              icon={<CheckSquare size={13} weight="bold" />}
              animate={animate}
            />
            <ProgressRing
              label="Activities"
              emptyLabel="No activities"
              count={progress.activities}
              tone="activities"
              icon={<CalendarBlank size={13} weight="bold" />}
              animate={animate}
            />
            <ProgressRing
              label="Habits"
              emptyLabel="No habits due"
              count={progress.habits}
              tone="habits"
              icon={<Leaf size={13} weight="bold" />}
              animate={animate}
            />
          </div>

          <div className="dp-overall">
            <div className="dp-overall-row">
              <div className="dp-overall-headline">
                <span className="dp-overall-percent">{overall.percent}%</span>
                <span className="dp-overall-caption">overall completion</span>
              </div>
              <dl className="dp-overall-stats">
                <div>
                  <dt>Done</dt>
                  <dd>{overall.completed}</dd>
                </div>
                <div>
                  <dt>Scheduled</dt>
                  <dd>{overall.total}</dd>
                </div>
                <div>
                  <dt>Left</dt>
                  <dd>{overall.remaining}</dd>
                </div>
              </dl>
            </div>
            <div
              className="dp-bar"
              role="progressbar"
              aria-label="Overall daily completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overall.percent}
              aria-valuetext={`${overall.completed} of ${overall.total} items completed`}
            >
              <span className="dp-bar-fill" style={{ width: `${overallFill}%` }} />
            </div>

            <ul className="dp-summary" aria-label="Daily summary">
              <li className="dp-chip dp-chip-completed">
                <CheckCircle size={14} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.completed}</span>
                <span className="dp-chip-label">Completed</span>
              </li>
              <li className="dp-chip dp-chip-remaining">
                <Hourglass size={14} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.remaining}</span>
                <span className="dp-chip-label">Remaining</span>
              </li>
              <li className="dp-chip dp-chip-overdue">
                <WarningCircle size={14} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.overdue}</span>
                <span className="dp-chip-label">Overdue</span>
              </li>
              <li className="dp-chip dp-chip-skipped">
                <SkipForward size={14} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.skipped}</span>
                <span className="dp-chip-label">Skipped</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
