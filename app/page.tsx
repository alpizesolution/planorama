"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, ListChecks, Plus, Sparkle } from "@phosphor-icons/react";
import { createTask, getTasks, removeTask, updateTask } from "@/lib/schedule/task-service";
import type { PlannerTask } from "@/lib/schedule/types";

const monthName = (date: Date) => date.toLocaleDateString("en", { month: "long", year: "numeric" });

export default function HomePage() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState<PlannerTask["priority"]>("p4");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<PlannerTask["priority"]>("p4");
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "completed">("all");
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
  const visibleTasks = tasks.filter((task) => {
    const matchesDate = !selectedDate || task.dueDate === selectedDate;
    const matchesStatus = taskFilter === "all" || task.status === taskFilter;
    return matchesDate && matchesStatus;
  });
  const formatDateKey = (day: number) => [shownDate.getFullYear(), String(shownDate.getMonth() + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");

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

  function beginEdit(task: PlannerTask) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDueDate(task.dueDate ?? "");
    setEditPriority(task.priority);
    setSaveError("");
  }

  async function saveEdit(task: PlannerTask) {
    const title = editTitle.trim();
    if (!title) {
      setSaveError("A task title is required.");
      return;
    }
    const updated = { ...task, title, dueDate: editDueDate || null, priority: editPriority };
    try {
      const saved = await updateTask(updated);
      setTasks((current) => current.map((item) => item.id === task.id ? saved : item));
      setEditingId(null);
      setSaveError("");
    } catch {
      setSaveError("Your edit could not be saved. Please try again.");
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

  async function deleteTask(task: PlannerTask) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    try {
      await removeTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (editingId === task.id) setEditingId(null);
      setSaveError("");
    } catch {
      setSaveError("This task could not be deleted. Please try again.");
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Planorama home"><span className="brand-mark"><CalendarBlank size={24} weight="fill" /></span><span>planorama<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="nav-list" aria-label="Main navigation"><a className="nav-item active" href="#calendar"><CalendarBlank size={20} weight="bold" /> Calendar</a><a className="nav-item" href="#tasks"><ListChecks size={20} weight="bold" /> My tasks <span className="nav-count">{tasks.filter((t) => t.status === "open").length}</span></a></nav>
      <div className="sidebar-bottom"><div className="mini-sparkle"><Sparkle size={19} weight="fill" /></div><p className="sidebar-note">Big plans, little steps.</p><p className="sidebar-muted">A little progress still counts.</p><span className="phase-tag">PHASE 3 · TASK MANAGEMENT</span></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div><span className="eyebrow">YOUR PERSONAL PLANNER</span><h1>Your life, <span>in color.</span></h1></div><div className="date-chip"><span className="date-dot" /> {today.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</div></header>
      <div className="content-grid">
        <section className="calendar-card neo-card" id="calendar"><div className="card-header"><div><span className="section-kicker">THE BIG PICTURE</span><h2>{view === "month" ? monthName(shownDate) : shownDate.getFullYear()}</h2></div><div className="calendar-actions"><div className="segmented" aria-label="Calendar view"><button className={view === "month" ? "selected" : ""} onClick={() => setView("month")}>Month</button><button className={view === "year" ? "selected" : ""} onClick={() => setView("year")}>Year</button></div><button className="icon-button" aria-label="Previous month" onClick={() => setMonthOffset((n) => n - 1)}>←</button><button className="icon-button" aria-label="Next month" onClick={() => setMonthOffset((n) => n + 1)}>→</button></div></div>
          {view === "month" ? <div className="calendar-grid">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => <div className="weekday" key={day}>{day}</div>)}{calendarDays.map((day, index) => { const isToday = day === today.getDate() && shownDate.getMonth() === today.getMonth() && shownDate.getFullYear() === today.getFullYear(); const dateKey = day ? formatDateKey(day) : ""; const taskCount = tasks.filter((task) => task.dueDate === dateKey).length; const isSelected = Boolean(day && selectedDate === dateKey); return <button type="button" className={"day-cell " + (!day ? "empty " : "") + (isToday ? "today " : "") + (isSelected ? "selected-day" : "")} key={shownDate.getMonth() + "-" + index} disabled={!day} aria-pressed={isSelected} aria-label={day ? `${dateKey}${taskCount ? `, ${taskCount} tasks due` : ""}` : "Empty calendar cell"} onClick={() => setSelectedDate((current) => current === dateKey ? null : dateKey)}><span>{day ?? ""}</span>{taskCount > 0 && <i className="day-dot pink" />}</button>; })}</div> : <div className="year-grid">{Array.from({ length: 12 }, (_, i) => { const month = new Date(shownDate.getFullYear(), i, 1); return <button key={i} className={"year-month month-color-" + (i % 4)} onClick={() => { setMonthOffset(i - today.getMonth() + (shownDate.getFullYear() - today.getFullYear()) * 12); setView("month"); }}><strong>{month.toLocaleDateString("en", { month: "short" })}</strong><span>{new Date(month.getFullYear(), i + 1, 0).getDate()} days</span></button>; })}</div>}
          <div className="calendar-footer"><span className="legend"><i className="day-dot pink" /> Tasks due</span><button type="button" className="clear-date-button" onClick={() => setSelectedDate(null)} disabled={!selectedDate}>Clear date</button><span className="footer-hint">Select a day to filter tasks ✳</span></div>
        </section>
        <section className="tasks-card neo-card" id="tasks"><div className="tasks-top"><div><span className="section-kicker">ONE THING AT A TIME</span><h2>Little wins<span className="heading-period">.</span></h2></div><span className="task-progress">{completed}/{tasks.length}</span></div><div className="progress-track"><span style={{ width: (tasks.length ? (completed / tasks.length) * 100 : 0) + "%" }} /></div><p className="tasks-subtitle">{loaded ? "Saved on this device · your progress stays here." : "Loading your saved tasks…"}</p>
          <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void addTask(); }}><input aria-label="New task" placeholder="Add something to your list…" maxLength={240} value={newTask} onChange={(event) => setNewTask(event.target.value)} /><button aria-label="Add task" type="submit"><Plus size={20} weight="bold" /></button><div className="quick-add-options"><label>Due date <input aria-label="Task due date" type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label><label>Priority <select aria-label="Task priority" value={newPriority} onChange={(event) => setNewPriority(event.target.value as PlannerTask["priority"])}><option value="p1">P1 · Urgent</option><option value="p2">P2 · High</option><option value="p3">P3 · Normal</option><option value="p4">P4 · Low</option></select></label></div></form>
          {saveError && <p className="save-error" role="status">{saveError}</p>}
          <div className="task-filter-bar" aria-label="Filter tasks">{(["all", "open", "completed"] as const).map((filter) => <button type="button" key={filter} className={taskFilter === filter ? "active" : ""} onClick={() => setTaskFilter(filter)}>{filter === "all" ? "All" : filter === "open" ? "To do" : "Done"}</button>)}{selectedDate && <span className="selected-date-label">{new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>}</div><div className="task-list">{visibleTasks.map((task) => editingId === task.id ? <form className="task-edit-form" key={task.id} onSubmit={(event) => { event.preventDefault(); void saveEdit(task); }}><label>Task title<input autoFocus maxLength={240} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><div className="task-edit-fields"><label>Due date<input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></label><label>Priority<select value={editPriority} onChange={(event) => setEditPriority(event.target.value as PlannerTask["priority"])}><option value="p1">P1 · Urgent</option><option value="p2">P2 · High</option><option value="p3">P3 · Normal</option><option value="p4">P4 · Low</option></select></label></div><div className="task-edit-actions"><button type="submit" className="task-action save">Save changes</button><button type="button" className="task-action" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <div className={"task-row " + (task.status === "completed" ? "is-done" : "")} key={task.id}><button className="task-toggle" aria-label={task.status === "completed" ? `Mark ${task.title} as open` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}><span className={"task-check " + (task.status === "completed" ? "checked" : "")}>{task.status === "completed" && <CheckCircle size={18} weight="fill" />}</span></button><span className="task-title">{task.title}{task.dueDate && <small className="task-due-date">{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</small>}</span><i className={"task-color " + (task.priority === "p1" ? "pink" : task.priority === "p2" ? "orange" : task.priority === "p3" ? "blue" : "lime")} /><div className="task-row-actions"><button type="button" className="task-action" aria-label={`Edit ${task.title}`} onClick={() => beginEdit(task)}>Edit</button><button type="button" className="task-action delete" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task)}>Delete</button></div></div>)}</div>
          {loaded && tasks.length === 0 && <p className="empty-tasks">Your list is a blank page. Add a little win to get started.</p>}{loaded && tasks.length > 0 && visibleTasks.length === 0 && <p className="empty-tasks">{selectedDate ? "No tasks are due on this date." : "No tasks match this filter."}</p>}
          <div className="gentle-reminder"><span>✳</span><p>Small steps count. You don’t have to do it all today.</p></div>
        </section>
      </div>
      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
