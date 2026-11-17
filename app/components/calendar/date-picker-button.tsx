"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react";

export type DatePickerMode = "day" | "month";

interface DatePickerButtonProps {
  /** Selected date as YYYY-MM-DD, or "" when nothing is selected. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** "day" shows a month grid of days; "month" shows the 12 months of a year. */
  mode?: DatePickerMode;
  /** Label shown when value is empty. */
  placeholder?: string;
  className?: string;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseKey(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/**
 * A compact "Nov 17, 2026 ▾" button that opens a small calendar popover.
 * Replaces the browser's native date input, which rendered a duplicate icon on
 * desktop and truncated the date on narrow phones.
 */
export function DatePickerButton({
  value,
  onChange,
  ariaLabel,
  mode = "day",
  placeholder = "Pick a date",
  className = "",
}: DatePickerButtonProps) {
  const parsed = parseKey(value);
  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? today.getMonth());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = parsed
    ? mode === "month"
      ? `${MONTHS_SHORT[parsed.m]} ${parsed.y}`
      : `${MONTHS_SHORT[parsed.m]} ${parsed.d}, ${parsed.y}`
    : placeholder;

  const dayCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const pick = (key: string) => {
    setOpen(false);
    onChange(key);
  };

  return (
    <div className={`cal-ws-picker-wrap date-picker-btn-wrap ${className}`} ref={wrapRef}>
      <button
        type="button"
        className={`cal-ws-picker-input date-picker-btn ${parsed ? "" : "is-empty"}`}
        aria-label={`${ariaLabel}: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            // Re-centre the popover on the selected date each time it opens.
            const base = parseKey(value) ?? { y: today.getFullYear(), m: today.getMonth() };
            setViewYear(base.y);
            setViewMonth(base.m);
          }
          setOpen(!open);
        }}
      >
        <span className="date-picker-btn-label">{label}</span>
        <CaretDown size={12} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <div className="date-picker-popover" role="dialog" aria-label={ariaLabel}>
          <div className="date-picker-popover-head">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => (mode === "month" ? setViewYear((y) => y - 1) : shiftMonth(-1))}
              aria-label={mode === "month" ? "Previous year" : "Previous month"}
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <strong>{mode === "month" ? viewYear : `${MONTHS_SHORT[viewMonth]} ${viewYear}`}</strong>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => (mode === "month" ? setViewYear((y) => y + 1) : shiftMonth(1))}
              aria-label={mode === "month" ? "Next year" : "Next month"}
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>

          {mode === "month" ? (
            <div className="date-picker-months">
              {MONTHS_SHORT.map((name, m) => {
                const isSelected = parsed?.y === viewYear && parsed?.m === m;
                const isCurrent = today.getFullYear() === viewYear && today.getMonth() === m;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`date-picker-cell ${isSelected ? "is-selected" : ""} ${isCurrent ? "is-today" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => pick(toKey(viewYear, m, 1))}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="date-picker-days">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`} className="date-picker-weekday" aria-hidden="true">
                  {w}
                </span>
              ))}
              {dayCells.map((d, i) => {
                if (d === null) return <span key={`blank-${i}`} />;
                const key = toKey(viewYear, viewMonth, d);
                const isSelected = key === value;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`date-picker-cell ${isSelected ? "is-selected" : ""} ${key === todayKey ? "is-today" : ""}`}
                    aria-pressed={isSelected}
                    aria-label={new Date(viewYear, viewMonth, d).toLocaleDateString("en", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    onClick={() => pick(key)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
