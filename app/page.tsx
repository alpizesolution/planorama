"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, ListChecks, Plus, Sparkle } from "@phosphor-icons/react";
import { createTask, getTasks, removeTask, updateTask } from "@/lib/schedule/task-service";
import type { PlannerTask } from "@/lib/schedule/types";

type TaskTemplate = { id: string; name: string; title: string; notes: string; priority: PlannerTask["priority"]; recurrence: PlannerTask["recurrence"] };

const TEMPLATE_STORAGE_KEY = "planorama-task-templates";
const monthName = (date: Date) => date.toLocaleDateString("en", { month: "long", year: "numeric" });

export default function HomePage() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState<PlannerTask["priority"]>("p4");
  const [newRecurrence, setNewRecurrence] = useState<PlannerTask["recurrence"]>("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<PlannerTask["priority"]>("p4");
  const [editRecurrence, setEditRecurrence] = useState<PlannerTask["recurrence"]>("none");
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "completed">("all");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSort, setTaskSort] = useState<"due" | "priority" | "newest">("due");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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
    const query = taskSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || task.title.toLocaleLowerCase().includes(query) || task.notes.toLocaleLowerCase().includes(query);
    return matchesDate && matchesStatus && matchesSearch;
  }).sort((a, b) => {
    if (taskSort === "priority") {
      const priorityOrder = { p1: 1, p2: 2, p3: 3, p4: 4 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    }
    if (taskSort === "newest") return b.createdAt.localeCompare(a.createdAt);
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt);
  });
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const formatDateKey = (day: number) => [shownDate.getFullYear(), String(shownDate.getMonth() + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
  const priorityLabel = (priority: PlannerTask["priority"]) => ({ p1: "Urgent", p2: "High", p3: "Normal", p4: "Low" })[priority];
  const isOverdue = (task: PlannerTask) => task.status === "open" && Boolean(task.dueDate && task.dueDate < todayKey);
  const nextOccurrenceDate = (dateKey: string, recurrence: PlannerTask["recurrence"]) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (recurrence === "daily") date.setUTCDate(date.getUTCDate() + 1);
    if (recurrence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
    if (recurrence === "monthly") {
      const nextMonth = date.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), nextMonth + 1, 0)).getUTCDate();
      date.setUTCMonth(nextMonth, Math.min(day, lastDay));
    }
    return date.toISOString().slice(0, 10);
  };

  useEffect(() => {
    let active = true;
    getTasks().then((saved) => { if (active) setTasks(saved); })
      .catch(() => { if (active) setSaveError("Could not load saved tasks on this device."); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  function saveAsTemplate(task: PlannerTask) {
    const name = window.prompt("Name this template", task.title);
    if (!name?.trim()) return;
    const template: TaskTemplate = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      recurrence: task.recurrence ?? "none",
    };
    const next = [...taskTemplates, template];
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      setTaskTemplates(next);
      setSaveError("");
    } catch {
      setSaveError("Could not save the template on this device.");
    }
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = taskTemplates.find((item) => item.id === templateId);
    if (!template) {
      setNewTask("");
      setNewNotes("");
      setNewPriority("p4");
      setNewRecurrence("none");
      setSaveError("");
      return;
    }
    setNewTask(template.title);
    setNewNotes(template.notes);
    setNewPriority(template.priority);
    setNewRecurrence(template.recurrence);
    setSaveError("");
  }

  function deleteTemplate(templateId: string) {
    const next = taskTemplates.filter((item) => item.id !== templateId);
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
      setTaskTemplates(next);
      if (selectedTemplateId === templateId) setSelectedTemplateId("");
      setSaveError("");
    } catch {
      setSaveError("Could not update saved templates.");
    }
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    if (newRecurrence !== "none" && !newDueDate) { setSaveError("Choose a due date for a recurring task."); return; }
    try {
      const task = await createTask({ title, notes: newNotes.trim(), dueDate: newDueDate || null, priority: newPriority, recurrence: newRecurrence });
      setTasks((current) => [...current, task]);
      setNewTask("");
      setNewNotes("");
      setNewDueDate("");
      setNewPriority("p4");
      setNewRecurrence("none");
      setSaveError("");
    } catch {
      setSaveError("This task could not be saved. Please try again.");
    }
  }

  function beginEdit(task: PlannerTask) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditNotes(task.notes);
    setEditDueDate(task.dueDate ?? "");
    setEditPriority(task.priority);
    setEditRecurrence(task.recurrence ?? "none");
    setSaveError("");
  }

  async function saveEdit(task: PlannerTask) {
    const title = editTitle.trim();
    if (!title) {
      setSaveError("A task title is required.");
      return;
    }
    const updated = { ...task, title, notes: editNotes.trim(), dueDate: editDueDate || null, priority: editPriority, recurrence: editRecurrence };
    if (updated.recurrence !== "none" && !updated.dueDate) { setSaveError("Choose a due date for a recurring task."); return; }
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
      if (updated.status === "completed" && task.status !== "completed" && updated.recurrence !== "none" && updated.dueDate) {
        const nextDueDate = nextOccurrenceDate(updated.dueDate, updated.recurrence);
        const alreadyExists = tasks.some((item) => item.id !== updated.id && item.title === updated.title && item.dueDate === nextDueDate && item.recurrence === updated.recurrence);
        if (!alreadyExists) {
          const nextTask = await createTask({ title: updated.title, notes: updated.notes, priority: updated.priority, dueDate: nextDueDate, recurrence: updated.recurrence });
          setTasks((current) => [...current, nextTask]);
        }
      }
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
          {view === "month" ? <div className="calendar-grid">{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => <div className="weekday" key={day}>{day}</div>)}{calendarDays.map((day, index) => { const isToday = day === today.getDate() && shownDate.getMonth() === today.getMonth() && shownDate.getFullYear() === today.getFullYear(); const dateKey = day ? formatDateKey(day) : ""; const dueTasks = day ? tasks.filter((task) => task.dueDate === dateKey) : []; const taskCount = dueTasks.length; const openCount = dueTasks.filter((task) => task.status === "open").length; const isSelected = Boolean(day && selectedDate === dateKey); return <button type="button" className={"day-cell " + (!day ? "empty " : "") + (isToday ? "today " : "") + (isSelected ? "selected-day" : "") + (taskCount ? " has-tasks" : "")} key={shownDate.getMonth() + "-" + index} disabled={!day} aria-pressed={isSelected} aria-label={day ? `${dateKey}${taskCount ? `, ${taskCount} tasks due, ${openCount} still open` : ", no tasks due"}` : "Empty calendar cell"} onClick={() => { setSelectedDate((current) => current === dateKey ? null : dateKey); setNewDueDate(dateKey); }}><span>{day ?? ""}</span>{taskCount > 0 && <span className="calendar-task-count" aria-hidden="true">{taskCount}</span>}</button>; })}</div> : <div className="year-grid">{Array.from({ length: 12 }, (_, i) => { const month = new Date(shownDate.getFullYear(), i, 1); return <button key={i} className={"year-month month-color-" + (i % 4)} onClick={() => { setMonthOffset(i - today.getMonth() + (shownDate.getFullYear() - today.getFullYear()) * 12); setView("month"); }}><strong>{month.toLocaleDateString("en", { month: "short" })}</strong><span>{new Date(month.getFullYear(), i + 1, 0).getDate()} days</span></button>; })}</div>}
          <div className="calendar-footer"><span className="legend"><i className="day-dot pink" /> Tasks due</span><button type="button" className="clear-date-button" onClick={() => setSelectedDate(null)} disabled={!selectedDate}>Clear date</button><span className="footer-hint">Select a day to filter tasks ✳</span></div>
        </section>
        <section className="tasks-card neo-card" id="tasks"><div className="tasks-top"><div><span className="section-kicker">ONE THING AT A TIME</span><h2>Little wins<span className="heading-period">.</span></h2></div><span className="task-progress">{completed}/{tasks.length}</span></div><div className="progress-track"><span style={{ width: (tasks.length ? (completed / tasks.length) * 100 : 0) + "%" }} /></div><p className="tasks-subtitle">{loaded ? "Saved on this device · your progress stays here." : "Loading your saved tasks…"}</p>
          <div className="template-tools">
            <label>Task templates
              <select aria-label="Use a saved task template" value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)}>
                <option value="">Start from scratch…</option>
                {taskTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            {selectedTemplateId && <button type="button" className="task-action delete-template" onClick={() => deleteTemplate(selectedTemplateId)}>Delete template</button>}
          </div>
          <form className="quick-add" onSubmit={(event) => { event.preventDefault(); void addTask(); }}><input aria-label="New task" placeholder="Add something to your list…" maxLength={240} value={newTask} onChange={(event) => setNewTask(event.target.value)} /><button aria-label="Add task" type="submit"><Plus size={20} weight="bold" /></button><div className="quick-add-options"><label className="notes-field">Notes (optional) <textarea aria-label="New task notes" placeholder="Add details or a reminder…" maxLength={2000} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} /></label><label>Due date <input aria-label="Task due date" type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label><label>Priority <select aria-label="Task priority" value={newPriority} onChange={(event) => setNewPriority(event.target.value as PlannerTask["priority"])}><option value="p1">P1 · Urgent</option><option value="p2">P2 · High</option><option value="p3">P3 · Normal</option><option value="p4">P4 · Low</option></select></label><label>Repeat <select aria-label="Task repeat" value={newRecurrence} onChange={(event) => setNewRecurrence(event.target.value as PlannerTask["recurrence"])}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div></form>
          {saveError && <p className="save-error" role="status">{saveError}</p>}
          <div className="task-tools"><label className="task-search"><span className="sr-only">Search tasks</span><input type="search" placeholder="Search your tasks…" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} aria-label="Search tasks" /><span aria-hidden="true">⌕</span></label><label className="task-sort">Sort by<select aria-label="Sort tasks" value={taskSort} onChange={(event) => setTaskSort(event.target.value as typeof taskSort)}><option value="due">Due date</option><option value="priority">Priority</option><option value="newest">Newest</option></select></label></div><div className="task-filter-bar" aria-label="Filter tasks">{(["all", "open", "completed"] as const).map((filter) => <button type="button" key={filter} className={taskFilter === filter ? "active" : ""} onClick={() => setTaskFilter(filter)}>{filter === "all" ? "All" : filter === "open" ? "To do" : "Done"}</button>)}{selectedDate && <span className="selected-date-label">{new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>}</div><div className="task-list">{visibleTasks.map((task) => editingId === task.id ? <form className="task-edit-form" key={task.id} onSubmit={(event) => { event.preventDefault(); void saveEdit(task); }}><label>Task title<input autoFocus maxLength={240} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><label>Notes (optional)<textarea maxLength={2000} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Add details or a reminder…" /></label><div className="task-edit-fields"><label>Due date<input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></label><label>Priority<select value={editPriority} onChange={(event) => setEditPriority(event.target.value as PlannerTask["priority"])}><option value="p1">P1 · Urgent</option><option value="p2">P2 · High</option><option value="p3">P3 · Normal</option><option value="p4">P4 · Low</option></select></label><label>Repeat<select value={editRecurrence} onChange={(event) => setEditRecurrence(event.target.value as PlannerTask["recurrence"])}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div><div className="task-edit-actions"><button type="submit" className="task-action save">Save changes</button><button type="button" className="task-action" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <div className={"task-row " + (task.status === "completed" ? "is-done" : "")} key={task.id}><button className="task-toggle" aria-label={task.status === "completed" ? `Mark ${task.title} as open` : `Complete ${task.title}`} onClick={() => void toggleTask(task)}><span className={"task-check " + (task.status === "completed" ? "checked" : "")}>{task.status === "completed" && <CheckCircle size={18} weight="fill" />}</span></button><span className="task-title">{task.title}{task.notes && <small className="task-notes-preview">{task.notes}</small>}{task.dueDate && <small className={"task-due-date " + (isOverdue(task) ? "overdue" : "")}>{isOverdue(task) ? "Overdue · " : ""}{new Date(task.dueDate + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</small>}</span><span className={"priority-badge priority-" + task.priority}>{priorityLabel(task.priority)}</span><div className="task-row-actions"><button type="button" className="task-action" aria-label={`Save ${task.title} as template`} onClick={() => saveAsTemplate(task)}>Template</button><button type="button" className="task-action" aria-label={`Edit ${task.title}`} onClick={() => beginEdit(task)}>Edit</button><button type="button" className="task-action delete" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task)}>Delete</button></div></div>)}</div>
          {loaded && tasks.length === 0 && <p className="empty-tasks">Your list is a blank page. Add a little win to get started.</p>}{loaded && tasks.length > 0 && visibleTasks.length === 0 && <p className="empty-tasks">{selectedDate ? "No tasks are due on this date." : "No tasks match this filter."}</p>}
          <div className="gentle-reminder"><span>✳</span><p>Small steps count. You don’t have to do it all today.</p></div>
        </section>
      </div>
      <footer className="page-footer"><span>MADE FOR YOUR MANY PLANS</span><span>Planorama <b>✳</b> A little more organized, a lot more you.</span></footer>
    </section>
  </main>;
}
