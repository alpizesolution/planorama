"use client";

import React from "react";
import { CaretLeft, CaretRight, CalendarBlank } from "@phosphor-icons/react";

export interface CalendarWorkspaceHeaderProps {
  /** Section kicker label, e.g. "DAILY WORKSPACE", "WEEKLY WORKSPACE" */
  kicker: React.ReactNode;
  /** Full primary title shown on desktop/tablet */
  title: React.ReactNode;
  /** Optional shorter title used on narrow mobile screens */
  compactTitle?: React.ReactNode;
  /** Whether the current view includes today */
  isToday?: boolean;
  /** Tag label when current date/range is active, e.g. "Today", "This Week" */
  todayTagLabel?: string;
  /** Optional badges or counters (e.g. active calendars count, filter indicator) */
  badge?: React.ReactNode;

  /** Navigation handlers */
  onPrevious?: () => void;
  previousLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  onToday?: () => void;
  todayButtonLabel?: string;

  /** Optional date picker */
  datePickerValue?: string;
  onDatePickerChange?: (value: string) => void;
  datePickerAriaLabel?: string;

  /** Additional toolbar items or action buttons */
  extraControls?: React.ReactNode;

  /** Optional CSS class & styles */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * CalendarWorkspaceHeader
 *
 * Unified header contract across all Planorama calendar workspaces:
 * Day, Week, Work Weeks, Month, Year, Yearline, and Agenda.
 *
 * Guarantees a predictable, accessible layout across all viewports:
 * - Desktop/Tablet: Left (Page info) + Right (Navigation + Date picker + Actions)
 * - Mobile (<= 768px):
 *     Row 1: Page Information (Kicker + Title + Today badge)
 *     Row 2: Navigation controls ([ < ] [ Today ] [ > ]) + Date Picker
 *     Row 3 (<= 360px): Date picker moves to full-width row 3 if needed
 *
 * Prevents overlapping controls, squeezed buttons, and unpredictable wrapping.
 */
export function CalendarWorkspaceHeader({
  kicker,
  title,
  compactTitle,
  isToday = false,
  todayTagLabel = "Today",
  badge,
  onPrevious,
  previousLabel = "Previous",
  onNext,
  nextLabel = "Next",
  onToday,
  todayButtonLabel = "Today",
  datePickerValue,
  onDatePickerChange,
  datePickerAriaLabel = "Jump to date",
  extraControls,
  className = "",
  style,
}: CalendarWorkspaceHeaderProps) {
  const hasNavigation = Boolean(onPrevious || onNext || onToday);

  return (
    <header className={`cal-workspace-header ${className}`} style={style}>
      {/* Row 1 on Mobile / Left on Desktop: Page Information */}
      <div className="cal-ws-info-row">
        <div className="cal-ws-title-group">
          <span className="cal-ws-kicker section-kicker">{kicker}</span>
          <div className="cal-ws-heading-row">
            <h2 className={`cal-ws-heading cal-ws-heading-full ${compactTitle ? "has-compact" : ""}`}>
              {title}
            </h2>
            {compactTitle && (
              <h2 className="cal-ws-heading cal-ws-heading-compact" aria-hidden="true">
                {compactTitle}
              </h2>
            )}
            {isToday && (
              <span className="cal-ws-today-tag day-today-tag">
                {todayTagLabel}
              </span>
            )}
            {badge}
          </div>
        </div>
      </div>

      {/* Row 2 on Mobile / Right on Desktop: Navigation Controls & Actions */}
      <div className="cal-ws-controls-row">
        {hasNavigation && (
          <div className="cal-ws-nav-cluster" role="group" aria-label="Period navigation">
            {onPrevious && (
              <button
                type="button"
                className="icon-button cal-ws-nav-btn cal-ws-prev-btn"
                onClick={onPrevious}
                aria-label={previousLabel}
                title={previousLabel}
              >
                <CaretLeft size={16} weight="bold" />
              </button>
            )}
            {onToday && (
              <button
                type="button"
                className={`icon-button today-btn cal-ws-today-btn ${isToday ? "is-active-today" : ""}`}
                onClick={onToday}
                title={`Go to ${todayButtonLabel}`}
              >
                {todayButtonLabel}
              </button>
            )}
            {onNext && (
              <button
                type="button"
                className="icon-button cal-ws-nav-btn cal-ws-next-btn"
                onClick={onNext}
                aria-label={nextLabel}
                title={nextLabel}
              >
                <CaretRight size={16} weight="bold" />
              </button>
            )}
          </div>
        )}

        {/* Compact Date Picker */}
        {onDatePickerChange && (
          <div className="cal-ws-picker-wrap" title={datePickerAriaLabel}>
            <input
              type="date"
              className="cal-ws-picker-input day-picker-input"
              value={datePickerValue || ""}
              onChange={(e) => {
                if (e.target.value) {
                  onDatePickerChange(e.target.value);
                }
              }}
              aria-label={datePickerAriaLabel}
            />
            <span className="cal-ws-picker-icon day-picker-icon" aria-hidden="true">
              <CalendarBlank size={14} weight="bold" />
            </span>
          </div>
        )}

        {extraControls}
      </div>
    </header>
  );
}
