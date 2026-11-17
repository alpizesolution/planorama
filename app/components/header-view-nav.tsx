"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { NAV_VIEWS, type AppView } from "@/lib/calendar/view-routing";

/** Views grouped under the "Calendar" menu in the compact header nav. */
export const CALENDAR_GROUP_VIEWS: AppView[] = ["day", "week", "workWeek", "month", "year", "yearline"];

interface HeaderViewNavProps {
  view: AppView;
  onSelect: (view: AppView) => void;
}

/**
 * Top header view navigation.
 *
 * Renders two variants and lets CSS pick one by viewport width:
 * - `.view-switcher-full`: every view as its own tab (wide screens).
 * - `.view-switcher-compact`: Dashboard · Calendar ▾ · Agenda · Board · Holidays,
 *   so the header fits on 1024–1600px laptops without clipping.
 */
export function HeaderViewNav({ view, onSelect }: HeaderViewNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const calendarViews = NAV_VIEWS.filter((v) => CALENDAR_GROUP_VIEWS.includes(v.id));
  const topLevelViews = NAV_VIEWS.filter((v) => !CALENDAR_GROUP_VIEWS.includes(v.id));
  const activeCalendarView = calendarViews.find((v) => v.id === view);

  const select = (id: AppView) => {
    setMenuOpen(false);
    onSelect(id);
  };

  return (
    <div className="view-switcher-container">
      <nav className="view-switcher view-switcher-full" role="tablist" aria-label="Views">
        {NAV_VIEWS.map((v) => {
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={isActive ? "vs-active" : ""}
              onClick={() => select(v.id)}
            >
              {v.label}
            </button>
          );
        })}
      </nav>

      <nav className="view-switcher view-switcher-compact" aria-label="Views">
        {topLevelViews.slice(0, 1).map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            className={view === v.id ? "vs-active" : ""}
            onClick={() => select(v.id)}
          >
            {v.label}
          </button>
        ))}

        <div className="vs-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`vs-menu-trigger ${activeCalendarView ? "vs-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {activeCalendarView ? activeCalendarView.label : "Calendar"}
            <CaretDown size={12} weight="bold" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="vs-menu" role="menu" aria-label="Calendar views">
              {calendarViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={view === v.id}
                  className={view === v.id ? "is-selected" : ""}
                  onClick={() => select(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {topLevelViews.slice(1).map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            className={view === v.id ? "vs-active" : ""}
            onClick={() => select(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
