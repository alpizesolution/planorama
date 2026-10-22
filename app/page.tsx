"use client";

import { useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, ListChecks, Plus, Sparkle } from "@phosphor-icons/react";

type PlannerTask = { id: number; title: string; done: boolean; color: string };
const starterTasks: PlannerTask[] = [
  { id: 1, title: "Plan the week ahead", done: false, color: "pink" },
  { id: 2, title: "Make room for a proper break", done: false, color: "lime" },
  { id: 3, title: "Review this month’s goals", done: true, color: "blue" },
];
const monthName = (date: Date) => date.toLocaleDateString("en", { month: "long", year: "numeric" });

export default function HomePage() {
  const [tasks, setTasks] = useState(starterTasks);
  const [newTask, setNewTask] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<"month" | "year">("month");
  const today = new Date();
  const shownDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const calendarDays = useMemo(() => {
    const firstWeekday = new Date(shownDate.getFullYear(), shownDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(shownDate.getFullYear(), shownDate.getMonth() + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  }, [shownDate.getFullYear(), shownDate.getMonth()]);
  const completed = tasks.filter((task) => task.done).length;
  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setTasks((current) => [...current, { id: Date.now(), title, done: false, color: "orange" }]);
    setNewTask("");
  }
  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Planorama home"><span className="brand-mark"><CalendarBlank size={24} weight="fill" /></span><span>planorama<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="nav-list" aria-label="Main navigation"><a className="nav-item active" href="#calendar"><CalendarBlank size={20} weight="bold" /> Calendar</a><a className="nav-item" href="#tasks"><ListChecks size={20} weight="bold" /> My tasks <span className="nav-count">{tasks.filter((t) => !t.done).length}</span></a></nav>
      <div className="sidebar-bottom"><div className="mini-sparkle"><Sparkle size={19} weight="fill" /></div><p className="sidebar-note">Big plans, little steps.</p><p className="sidebar-muted">A little progress still counts.</p><span className="phase-tag">PHASE 1 · FOUNDATION</span></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div><span className="eyebrow">YOUR PERSONAL PLANNER</span><h1>Your life, <span>in color.</span></h1></div><div className="date-chip"><span className="date-dot" /> {today.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</div></header>
      <div className="content-grid">
        <section className="calendar-card neo-card" id="calendar"><div className="card-header"><div><span className="section-kicker">THE BIG PICTURE</span><h2>{view === "month" ? monthName(shownDate) : shownDate.getFullYear()}</h2></div><div className="calendar-actions"><div className="segmented" aria-label="Calendar view"><button className={view === "month" ? "selected" : ""} onClick={() => setView("month")}>Month</button><button className={view === "year" ? "selected" : ""} onClick={() => setView("year")}>Year</button></div><button className="icon-button" aria-label="Previous month" onClick={() => setMonthOffset((n) => n - 1)}>←</button><button className="icon-button" aria-label="Next month" onClick={() => setMonthOffset((n) => n + 1)}>→</button></div></div>
          {view === "month" ? <div className="calendar-grid">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => <div className="weekday" key={day}>{day}</div>)}{calendarDays.map((day, index) => { const isToday = day === today.getDate() && shownDate.getMonth() === today.getMonth() && shownDate.getFullYear() === today.getFullYear(); return <div className={"day-cell " + (!day ? "empty " : "") + (isToday ? "today" : "")} key={shownDate.getMonth() + "-" + index}><span>{day ?? ""}</span>{day === 8 && <i className="day-dot pink" />}{day === 14 && <i className="day-dot lime" />}{day === 22 && <i className="day-dot blue" />}</div>; })}</div> : <div className="year-grid">{Array.from({ length: 12 }, (_, i) => { const month = new Date(shownDate.getFullYear(), i, 1); return <button key={i} className={"year-month month-color-" + (i % 4)} onClick={() => { setMonthOffset(i - today.getMonth()); setView("month"); }}><strong>{month.toLocaleDateString("en", { month: "short" })}</strong><span>{new Date(month.getFullYear(), i + 1, 0).getDate()} days</span></button>; })}</div>}
          <div className="calendar-footer"><span className="legend"><i className="day-dot pink" /> Personal</span><span className="legend"><i className="day-dot lime" /> Goals</span><span className="legend"><i className="day-dot blue" /> Reminders</span><span className="footer-hint">Your plans will live here ✳</span></div>
        </section>
        <section className="tasks-card neo-card" id="tasks"><div className="tasks-top"><div><span className="section-kicker">ONE THING AT A TIME</span><h2>Little wins<span className="heading-period">.</span></h2></div><span className="task-progress">{completed}/{tasks.length}</span></div><div className="progress-track"><span style={{ width: (tasks.length ? (completed / tasks.length) * 100 : 0) + "%" }} /></div><p className="tasks-subtitle">A few things on your mind today.</p>
          <form className="quick-add" onSubmit={(event) => { event.preventDefault(); addTask(); }}><input aria-label="New task" placeholder="Add something to your list…" value={newTask} onChange={(event) => setNewTask(event.target.value)} /><button aria-label="Add task" type="submit"><Plus size={20} weight="bold" /></button></form>
          <div className="task-list">{tasks.map((task) => <button className={"task-row " + (task.done ? "is-done" : "")} key={task.id} onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}><span className={"task-check " + (task.done ? "checked" : "")}>{task.done && <CheckCircle size={18} weight="fill" />}</span><span className="task-title">{task.title}</span><i className={"task-color " + task.color} /></button>)}</div>
          <div className="gentle-reminder"><span>✳</span><p>Small steps count. You don’t have to do it all today.</p></div>
        </section>
      </div>
      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
