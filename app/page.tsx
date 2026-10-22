"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, ListChecks, Plus, Sparkle } from "@phosphor-icons/react";
import { createTask, getTasks, updateTask } from "@/lib/schedule/task-service";
import type { PlannerTask } from "@/lib/schedule/types";

const monthName = (date: Date) => date.toLocaleDateString("en", { month: "long", year: "numeric" });

export default function HomePage() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState<PlannerTask["priority"]>("p4");
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<"month" | "year">("month");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const today = new Date();
  const shownDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const calendarDays = useMemo(() => {
    const offset = new Date(shownDate.getFullYear(), shownDate.getMonth(), 1).getDay();
    const count = new Date(shownDate.getFullYear(), shownDate.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [shownDate.getFullYear(), shownDate.getMonth()]);
  const completed = tasks.filter((task) => task.status === "completed").length;

  useEffect(() => {
    let active = true;
    getTasks().then((saved) => { if (active) setTasks(saved); })
      .catch(() => { if (active) setSaveError("Could not load saved tasks on this device."); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    try {
      const task = await createTask({ title, dueDate: newDueDate || null, priority: newPriority });
      setTasks((current) => [...current, task]);
      setNewTask("");
      setNewDueDate("");
      setNewPriority("p4");
      setSaveError("");
    } catch {
      setSaveError("This task could not be saved. Please try again.");
    }
  }

  async function toggleTask(task: PlannerTask) {
    const updated = { ...task, status: task.status === "completed" ? "open" as const : "completed" as const };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    try {
      await updateTask(updated);
      setSaveError("");
    } catch {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item));
      setSaveError("Your change could not be saved.");
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Planorama home"><span className="brand-mark"><CalendarBlank size={24} weight="fill" /></span><span>planorama<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="nav-list" aria-label="Main navigation"><a className="nav-item active" href="#calendar"><CalendarBlank size={20} weight="bold" /> Calendar</a><a className="nav-item" href="#tasks"><ListChecks size={20} weight="bold" /> My tasks <span className="nav-count">{tasks.filter((t) => t.status === "open").length}</span></a></nav>
      <div className="sidebar-bottom"><div className="mini-sparkle"><Sparkle size={19} weight="fill" /></div><p className="sidebar-note">Big plans, little steps.</p><p className="sidebar-muted">A little progress still counts.</p><span className="phase-tag">PHASE 2 · LOCAL DATA</span></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div><span className="eyebrow">YOUR PERSONAL PLANNER</span><h1>Your life, <span>in color.</span></h1></div><div className="date-chip"><span className="date-dot" /> {today.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</div></header>
      <div className="content-grid">
        <section className="calendar-card neo-card" id="calendar"><div className="card-header"><div><span className="section-kicker">THE BIG PICTURE</span><h2>{view === "month" ? monthName(shownDate) : shownDate.getFullYear()}</h2></div><div className="calendar-actions"><div className="segmented" aria-label="Calendar view"><button className={view === "month" ? "selected" : ""} onClick={() => setView("month")}>Month</button><button className={view === "year" ? "selected" : ""} onClick={() => setView("year")}>Year</button></div><button className="icon-button" aria-label="Previous month" onClick={() => setMonthOffset((n) => n - 1)}>←</button><button className="icon-button" aria-label="Next month" onClick={() => setMonthOffset((n) => n + 1)}>→</button></div></div>
          {view === "month" ? <div className="calendar-grid">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => <div className="weekday" key={day}>{day}</div>)}{calendarDays.map((day, index) => { const isToday = day === today.getDate() && shownDate.getMonth() === today.getMonth() && shownDate.getFullYear() === today.getFullYear(); const taskCount = tasks.filter((task) => task.dueDate === (day ? [shownDate.getFullYear(), String(shownDate.getMonth() + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-") : "")).length; return <div className={"day-cell " + (!day ? "empty " : "") + (isToday ? "today" : "")} key={shownDate.getMonth() + "-" + index}><span>{day ?? ""}</span>{taskCount > 0 && <i className="day-dot pink" />}</div>; })}</div> : <div className="year-grid">{Array.from({ length: 12 }, (_, i) => { const month = new Date(shownDate.getFullYear(), i, 1); return <button key={i} className={"year-month month-color-" + (i % 4)} onClick={() => { setMonthOffset(i - today.getMonth() + (shownDate.getFullYear() - today.getFullYear()) * 12); setView("month"); }}><strong>{month.toLocaleDateString("en", { month: "short" })}</strong><span>{new Date(month.getFullYear(), i + 1, 0).getDate()} days</span></button>; })}</div>}
          <div className="calendar-footer"><span className="legend"><i className="day-dot pink" /> Tasks due</span><span className="footer-hint">Your plans will live here ✳</span></div>
        </section>
        <section className="tasks-card neo-card" id="tasks"><div className="tasks-top"><div><span className="section-kicker">ONE THING AT A TIME</span><h2>Little wins<span className="heading-period">.</span></h2></div><span className="task-progress">{completed}/{tasks.length}</span></div><div className="progress-track"><span style={{ width: (tasks.length ? (completed / tasks.length) * 100 : 0) + "%" }} /></div><p className="tasks-subtitle">{loaded ? "Saved on this device · your progress stays here." : "Loading your saved tasks…"}</p>
          <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void addTask(); }}><input aria-label="New task" placeholder="Add something to your list…" maxLength={240} value={newTask} onChange={(event) => setNewTask(event.target.value)} /><button aria-label="Add task" type="submit"><Plus size={20} weight="bold" /></button><div className="quick-add-options"><label>Due date <input aria-label="Task due date" type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label><label>Priority <select aria-label="Task priority" value={newPriority} onChange={(event) => setNewPriority(event.target.value as PlannerTask["priority"])}><option value="p1">P1 · Urgent</option><option value="p2">P2 · High</option><option value="p3">P3 · Normal</option><option value="p4">P4 · Low</option></select></label></div></form>
          {saveError && <p className="save-error" role="status">{saveError}</p>}
          <div className="task-list">{tasks.map((task) => <button className={"task-row " + (task.status === "completed" ? "is-done" : "")} key={task.id} onClick={() => void toggleTask(task)}><span className={"task-check " + (task.status === "completed" ? "checked" : "")}>{task.status === "completed" && <CheckCircle size={18} weight="fill" />}</span><span className="task-title">{task.title}{task.dueDate && <small className="task-due-date">{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</small>}</span><i className={"task-color " + (task.priority === "p1" ? "pink" : task.priority === "p2" ? "orange" : task.priority === "p3" ? "blue" : "lime")} /></button>)}</div>
          {loaded && tasks.length === 0 && <p className="empty-tasks">Your list is a blank page. Add a little win to get started.</p>}
          <div className="gentle-reminder"><span>✳</span><p>Small steps count. You don’t have to do it all today.</p></div>
        </section>
      </div>
      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
