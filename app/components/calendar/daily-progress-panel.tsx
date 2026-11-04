"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  Hourglass,
  WarningCircle,
  SkipForward,
  CaretDown,
} from "@phosphor-icons/react";
import type { DailyProgress } from "@/lib/calendar/daily-progress";

const COLLAPSE_KEY = "planorama.dailyProgress.collapsed";

export interface DailyProgressPanelProps {
  progress: DailyProgress;
}

export function DailyProgressPanel({ progress }: DailyProgressPanelProps) {
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
    relation === "today" ? "Today" : relation === "past" ? "Past day" : "Upcoming";
  const barWidth = animate ? overall.percent : 0;

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
          <span className="dp-head-overall" aria-label={`${overall.percent}% complete`}>
            <strong>{overall.percent}%</strong>
            <span className="dp-head-counts">{overall.completed}/{overall.total}</span>
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
          <div
            className="dp-bar"
            role="progressbar"
            aria-label="Overall daily completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overall.percent}
            aria-valuetext={`${overall.completed} of ${overall.total} items completed`}
          >
            <span className="dp-bar-fill" style={{ width: `${barWidth}%` }} />
          </div>

          <div className="dp-stats-row">
            <dl className="dp-stats">
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

            <ul className="dp-summary" aria-label="Daily summary">
              <li className="dp-chip dp-chip-completed">
                <CheckCircle size={13} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.completed}</span>
                <span className="dp-chip-label">Done</span>
              </li>
              <li className="dp-chip dp-chip-remaining">
                <Hourglass size={13} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.remaining}</span>
                <span className="dp-chip-label">Left</span>
              </li>
              <li className="dp-chip dp-chip-overdue">
                <WarningCircle size={13} weight="fill" aria-hidden="true" />
                <span className="dp-chip-value">{summary.overdue}</span>
                <span className="dp-chip-label">Overdue</span>
              </li>
              <li className="dp-chip dp-chip-skipped">
                <SkipForward size={13} weight="fill" aria-hidden="true" />
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
