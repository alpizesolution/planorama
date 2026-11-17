"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./welcome.module.css";

const VIEWS = [
  {
    id: "week",
    label: "Week",
    src: "/landing/week.webp",
    caption: "A seven-day timeline with a live “now” line, all-day lane and daily progress under every date.",
  },
  {
    id: "month",
    label: "Month",
    src: "/landing/month.webp",
    caption: "The whole month at a glance, with holidays, events and tasks as color-coded pills.",
  },
  {
    id: "year",
    label: "Year",
    src: "/landing/year.webp",
    caption: "Twelve mini-calendars on one screen, so long-range plans and holidays never sneak up on you.",
  },
  {
    id: "board",
    label: "Board",
    src: "/landing/board.webp",
    caption: "Drag tasks from To Do to Done, filter by date, label or project, and keep work-in-progress honest.",
  },
] as const;

export function ViewShowcase() {
  const [active, setActive] = useState<(typeof VIEWS)[number]["id"]>("week");
  const current = VIEWS.find((v) => v.id === active) ?? VIEWS[0];

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseTabs} role="tablist" aria-label="Planorama views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`showcase-tab-${v.id}`}
            aria-selected={v.id === active}
            aria-controls="showcase-panel"
            className={v.id === active ? styles.showcaseTabActive : styles.showcaseTab}
            onClick={() => setActive(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`showcase-tab-${current.id}`}
        className={styles.showcasePanel}
      >
        <div className={styles.browser}>
          <div className={styles.browserBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <Image
            key={current.id}
            src={current.src}
            alt={`Planorama ${current.label} view`}
            width={1600}
            height={1000}
            sizes="(max-width: 900px) 100vw, 1100px"
            className={styles.browserImg}
          />
        </div>
        <p className={styles.showcaseCaption}>{current.caption}</p>
      </div>
    </div>
  );
}
