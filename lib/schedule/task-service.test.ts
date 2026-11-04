import { describe, expect, it } from "vitest";
import { validateTask, validateNewTask } from "./validation";
import { createTask, getTasks, updateTask, removeTask } from "./task-service";

describe("Task validation and creation flow", () => {
  it("validates tasks with valid dueDate formatted as YYYY-MM-DD", () => {
    const rawTask = {
      id: "test-task-1",
      title: "Finish project",
      status: "open",
      priority: "p4",
      dueDate: "2026-10-26",
      dueTime: "10:30",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const valid = validateTask(rawTask);
    expect(valid.dueDate).toBe("2026-10-26");
    expect(valid.dueTime).toBe("10:30");
    expect(valid.title).toBe("Finish project");
  });

  it("validates new task input from weekly inline creation", () => {
    const input = {
      title: "Finish project",
      dueDate: "2026-10-26",
      priority: "p4" as const,
      status: "open" as const,
    };
    const validated = validateNewTask(input);
    expect(validated.title).toBe("Finish project");
    expect(validated.dueDate).toBe("2026-10-26");
    expect(validated.priority).toBe("p4");
    expect(validated.status).toBe("open");
  });

  it("rejects invalid dates or times", () => {
    const base = {
      id: "task-err",
      title: "Error test",
      status: "open",
      priority: "p4",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => validateTask({ ...base, dueDate: "10-26-2026" })).toThrow("Task due date must use YYYY-MM-DD.");
    expect(() => validateTask({ ...base, dueDate: "invalid-date" })).toThrow("Task due date must use YYYY-MM-DD.");
    expect(() => validateTask({ ...base, dueTime: "25:99" })).toThrow("Task due time must use HH:mm.");
  });

  it("creates, saves, retrieves, updates, and deletes tasks via storage service", async () => {
    const created = await createTask({
      title: "Test task",
      dueDate: "2026-10-26",
      priority: "p4",
      status: "open",
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Test task");
    expect(created.dueDate).toBe("2026-10-26");
    expect(created.status).toBe("open");

    const tasks = await getTasks();
    const found = tasks.find((t) => t.id === created.id);
    expect(found).toBeDefined();
    expect(found?.dueDate).toBe("2026-10-26");

    // Toggle completion
    const updated = await updateTask({ ...created, status: "completed" });
    expect(updated.status).toBe("completed");

    const reloaded = await getTasks();
    const updatedFound = reloaded.find((t) => t.id === created.id);
    expect(updatedFound?.status).toBe("completed");

    // Cleanup
    await removeTask(created.id);
    const afterDelete = await getTasks();
    expect(afterDelete.find((t) => t.id === created.id)).toBeUndefined();
  });
});

describe("Cross-platform UUID generation (generateId)", () => {
  it("generates a valid UUID string matching RFC 4122 v4 pattern", async () => {
    const { generateId } = await import("./id");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 20; i++) {
      const id = generateId();
      expect(id).toMatch(uuidPattern);
    }
  });

  it("generates 1,000 unique IDs without any collisions", async () => {
    const { generateId } = await import("./id");
    const ids = new Set<string>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(count);
  });

  it("succeeds when crypto.randomUUID is undefined (e.g. HTTP / insecure context)", async () => {
    const { generateId } = await import("./id");
    const originalCrypto = globalThis.crypto;
    try {
      // Simulate insecure context where randomUUID does not exist, but getRandomValues does
      const mockCrypto = {
        getRandomValues: (arr: Uint8Array) => originalCrypto.getRandomValues(arr),
      } as unknown as Crypto;
      Object.defineProperty(globalThis, "crypto", { value: mockCrypto, configurable: true, writable: true });

      const id = generateId();
      expect(id).toBeDefined();
      expect(id).toHaveLength(36);
      expect(id.split("-")).toHaveLength(5);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true, writable: true });
    }
  });
});

describe("Monthly calendar date task creation and multi-view synchronization", () => {
  it("creates 'Finish project' on November 7, 2026 with default priority and status", async () => {
    // 1. Click November 7, 2026 -> date key '2026-11-07'
    const targetDateKey = "2026-11-07";

    // 2. Quick task entry: Task title required, default priority 'p3' (Normal), default status 'open' (To Do)
    const taskInput = {
      title: "Finish project",
      dueDate: targetDateKey,
      priority: "p3" as const,
      status: "open" as const,
    };

    // 3. Save task
    const created = await createTask(taskInput);

    // 4. Verify due date is November 7, 2026
    expect(created.id).toBeDefined();
    expect(created.title).toBe("Finish project");
    expect(created.dueDate).toBe("2026-11-07");
    expect(created.priority).toBe("p3");
    expect(created.status).toBe("open");

    // 5. Refresh page simulation: getTasks reloads from persistence
    const reloadedTasks = await getTasks();
    const persistedTask = reloadedTasks.find((t) => t.id === created.id);
    expect(persistedTask).toBeDefined();
    expect(persistedTask?.dueDate).toBe("2026-11-07");
    expect(persistedTask?.title).toBe("Finish project");
    expect(persistedTask?.priority).toBe("p3");
    expect(persistedTask?.status).toBe("open");

    // 6. Check Weekly view matching: Week of Nov 7, 2026 (Mon Nov 2 - Sun Nov 8)
    const { getWeekDays, toDateKey } = await import("../calendar/date-utils");
    const weekDays = getWeekDays(new Date(2026, 10, 7)); // month index 10 = Nov
    const saturday = weekDays.find((d) => toDateKey(d) === "2026-11-07");
    expect(saturday).toBeDefined();
    expect(saturday?.getDay()).toBe(6); // Saturday is day 6

    const weeklyMatchedTasks = reloadedTasks.filter((t) => t.dueDate === (saturday ? toDateKey(saturday) : ""));
    expect(weeklyMatchedTasks.some((t) => t.id === created.id)).toBe(true);

    // 7. Check Kanban view matching: Task is in 'open' ("To Do") column
    const kanbanOpenTasks = reloadedTasks.filter((t) => t.status === "open");
    expect(kanbanOpenTasks.some((t) => t.id === created.id)).toBe(true);

    // Cleanup
    await removeTask(created.id);
  });

  it("updates task status in Weekly Kanban while preserving date and surviving reload", async () => {
    const task = await createTask({
      title: "Interactive Kanban Task",
      dueDate: "2026-11-07",
      priority: "p3",
      status: "open",
    });

    const { getWeekDays, toDateKey } = await import("../calendar/date-utils");
    const weekDays = getWeekDays(new Date(2026, 10, 7), 1);
    const weekDateKeys = new Set(weekDays.map(toDateKey));

    // Initially in "open" (To Do)
    expect(weekDateKeys.has(task.dueDate!)).toBe(true);
    expect(task.status).toBe("open");

    // Move to "in_progress"
    const movedToInProgress = await updateTask({ ...task, status: "in_progress" });
    expect(movedToInProgress.status).toBe("in_progress");
    expect(movedToInProgress.dueDate).toBe("2026-11-07");

    // Verify persistence after reload
    let allTasks = await getTasks();
    let reloaded = allTasks.find((t) => t.id === task.id);
    expect(reloaded?.status).toBe("in_progress");
    expect(reloaded?.dueDate).toBe("2026-11-07");

    // Move to "completed" (Done)
    const movedToCompleted = await updateTask({ ...task, status: "completed" });
    expect(movedToCompleted.status).toBe("completed");
    expect(movedToCompleted.dueDate).toBe("2026-11-07");

    allTasks = await getTasks();
    reloaded = allTasks.find((t) => t.id === task.id);
    expect(reloaded?.status).toBe("completed");
    expect(reloaded?.dueDate).toBe("2026-11-07");

    // Cleanup
    await removeTask(task.id);
  });

  it("supports multiple tasks on the same date in Annual Task Grid with independent completion status", async () => {
    const targetDate = "2026-06-15";
    const taskA = await createTask({
      title: "Mid-year review",
      dueDate: targetDate,
      priority: "p1",
      status: "open",
    });
    const taskB = await createTask({
      title: "Team lunch",
      dueDate: targetDate,
      priority: "p3",
      status: "open",
    });

    expect(taskA.id).not.toBe(taskB.id);
    expect(taskA.dueDate).toBe(targetDate);
    expect(taskB.dueDate).toBe(targetDate);

    // Fetch and group by due date (simulating tasksByDueDate)
    const all = await getTasks();
    const cellTasks = all.filter((t) => t.dueDate === targetDate);
    expect(cellTasks).toHaveLength(2);

    // Toggle taskA to completed
    const updatedA = await updateTask({ ...taskA, status: "completed" });
    expect(updatedA.status).toBe("completed");

    // Verify taskB remains open
    const refreshed = await getTasks();
    const refreshedA = refreshed.find((t) => t.id === taskA.id);
    const refreshedB = refreshed.find((t) => t.id === taskB.id);
    expect(refreshedA?.status).toBe("completed");
    expect(refreshedB?.status).toBe("open");

    // Cleanup
    await removeTask(taskA.id);
    await removeTask(taskB.id);
  });

  describe("Complete Priority, Focus & Category Options", () => {
    it("creates a task with default 'none' priority and timingPreference scheduled", async () => {
      const task = await createTask({ title: "Sensible default task" });
      expect(task.priority).toBe("none");
      expect(task.isPinned).toBe(false);
      expect(task.isPersonal).toBe(false);
      expect(task.timingPreference).toBe("scheduled");
      await removeTask(task.id);
    });

    it("supports all 4 explicit priority levels (Do This Now, High, Medium, Low) and No Priority", async () => {
      const p1 = await createTask({ title: "Urgent task", priority: "p1" });
      const p2 = await createTask({ title: "High task", priority: "p2" });
      const p3 = await createTask({ title: "Medium task", priority: "p3" });
      const p4 = await createTask({ title: "Low task", priority: "p4" });
      const pNone = await createTask({ title: "No Priority task", priority: "none" });

      expect(p1.priority).toBe("p1");
      expect(p2.priority).toBe("p2");
      expect(p3.priority).toBe("p3");
      expect(p4.priority).toBe("p4");
      expect(pNone.priority).toBe("none");

      await removeTask(p1.id);
      await removeTask(p2.id);
      await removeTask(p3.id);
      await removeTask(p4.id);
      await removeTask(pNone.id);
    });

    it("allows independent pinning and unpinning without losing priority", async () => {
      const task = await createTask({
        title: "Important pinned task",
        priority: "p2",
        isPinned: false,
      });

      // Pin the task
      const pinned = await updateTask({ ...task, isPinned: true });
      expect(pinned.isPinned).toBe(true);
      expect(pinned.priority).toBe("p2");

      // Reload from storage
      const all = await getTasks();
      const reloaded = all.find((t) => t.id === task.id);
      expect(reloaded?.isPinned).toBe(true);
      expect(reloaded?.priority).toBe("p2");

      // Unpin the task
      const unpinned = await updateTask({ ...pinned, isPinned: false });
      expect(unpinned.isPinned).toBe(false);
      expect(unpinned.priority).toBe("p2");

      await removeTask(task.id);
    });

    it("allows independent Personal category assignment without overwriting priority", async () => {
      const task = await createTask({
        title: "Life admin chore",
        priority: "p3",
        isPersonal: true,
      });
      expect(task.isPersonal).toBe(true);
      expect(task.priority).toBe("p3");

      // Update to high priority while remaining personal
      const updated = await updateTask({ ...task, priority: "p2" });
      expect(updated.isPersonal).toBe(true);
      expect(updated.priority).toBe("p2");

      // Remove personal category
      const nonPersonal = await updateTask({ ...updated, isPersonal: false });
      expect(nonPersonal.isPersonal).toBe(false);
      expect(nonPersonal.priority).toBe("p2");

      await removeTask(task.id);
    });

    it("preserves dueDate when timingPreference is set to 'whenever'", async () => {
      const originalDueDate = "2026-11-20";
      const task = await createTask({
        title: "Flexible project task",
        dueDate: originalDueDate,
        timingPreference: "whenever",
        priority: "p4",
      });

      expect(task.timingPreference).toBe("whenever");
      expect(task.dueDate).toBe(originalDueDate);

      // Verify persistence
      const reloaded = (await getTasks()).find((t) => t.id === task.id);
      expect(reloaded?.timingPreference).toBe("whenever");
      expect(reloaded?.dueDate).toBe(originalDueDate);

      // Toggle back to scheduled
      const scheduled = await updateTask({ ...task, timingPreference: "scheduled" });
      expect(scheduled.timingPreference).toBe("scheduled");
      expect(scheduled.dueDate).toBe(originalDueDate);

      await removeTask(task.id);
    });

    it("backward compatibility: parses legacy tasks missing new fields gracefully", () => {
      const legacyRaw = {
        id: "legacy-task-99",
        title: "Legacy task from earlier version",
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const parsed = validateTask(legacyRaw);
      expect(parsed.priority).toBe("none");
      expect(parsed.isPinned).toBe(false);
      expect(parsed.isPersonal).toBe(false);
      expect(parsed.timingPreference).toBe("scheduled");
    });

    it("verifies DEFAULT_PREFERENCES schema and initial values", async () => {
      const { DEFAULT_PREFERENCES } = await import("./types");
      expect(DEFAULT_PREFERENCES.defaultPriority).toBe("none");
      expect(DEFAULT_PREFERENCES.weekStartsOn).toBe(0);
      expect(DEFAULT_PREFERENCES.defaultSort).toBe("due");
      expect(DEFAULT_PREFERENCES.disabledOptions).toEqual([]);
      expect(DEFAULT_PREFERENCES.customLabels).toEqual({});
      expect(DEFAULT_PREFERENCES.calendarTheme).toEqual({ preset: "colorful", mode: "headers" });
      expect(DEFAULT_PREFERENCES.dashboardWidgets).toBeDefined();
      expect(DEFAULT_PREFERENCES.dashboardWidgets?.length).toBe(6);
    });

    it("ensures tasks with disabled priorities remain valid and editable without data loss", async () => {
      // Create task with priority p1
      const task = await createTask({
        title: "Historical task with high priority",
        priority: "p1",
      });
      expect(task.priority).toBe("p1");

      // Simulate priority p1 being disabled in user preferences:
      // The task data in storage must retain priority p1 and remain editable
      const updated = await updateTask({
        ...task,
        title: "Historical task with high priority (renamed)",
      });
      expect(updated.priority).toBe("p1");
      expect(updated.title).toBe("Historical task with high priority (renamed)");

      const reloaded = (await getTasks()).find((t) => t.id === task.id);
      expect(reloaded?.priority).toBe("p1");

      await removeTask(task.id);
    });

    it("creates, persists, and updates tasks with multiple labels and notes", async () => {
      const task = await createTask({
        title: "Multi-label test task",
        dueDate: "2026-10-30",
        notes: "Detailed notes about this task",
        priority: "p2",
        status: "open",
        labelIds: ["label-1", "label-2", "label-3"],
        isPinned: true,
        isPersonal: true,
        timingPreference: "whenever",
      });

      expect(task.labelIds).toEqual(["label-1", "label-2", "label-3"]);
      expect(task.notes).toBe("Detailed notes about this task");
      expect(task.isPinned).toBe(true);
      expect(task.isPersonal).toBe(true);
      expect(task.timingPreference).toBe("whenever");
      expect(task.dueDate).toBe("2026-10-30");

      // Verify retrieval from storage
      const fetched = (await getTasks()).find((t) => t.id === task.id);
      expect(fetched).toBeDefined();
      expect(fetched?.labelIds).toEqual(["label-1", "label-2", "label-3"]);
      expect(fetched?.notes).toBe("Detailed notes about this task");

      // Update labels (remove one, add another)
      const updated = await updateTask({
        ...task,
        labelIds: ["label-1", "label-4"],
        notes: "Updated notes",
      });
      expect(updated.labelIds).toEqual(["label-1", "label-4"]);
      expect(updated.notes).toBe("Updated notes");

      const reloaded = (await getTasks()).find((t) => t.id === task.id);
      expect(reloaded?.labelIds).toEqual(["label-1", "label-4"]);
      expect(reloaded?.notes).toBe("Updated notes");

      await removeTask(task.id);
    });

    it("standardized task creation handles all entry-point context combinations", async () => {
      // Month/Year/Yearline entry point: prefilled date, default status
      const calendarTask = await createTask({
        title: "Calendar Entry Point Task",
        dueDate: "2026-10-24",
        status: "open",
        priority: "none",
        labelIds: ["work", "study"],
        notes: "Created from month date cell",
      });
      expect(calendarTask.dueDate).toBe("2026-10-24");
      expect(calendarTask.status).toBe("open");
      expect(calendarTask.labelIds).toEqual(["work", "study"]);

      // Kanban Board entry point: prefilled status 'in_progress', default date
      const kanbanTask = await createTask({
        title: "Board Column Entry Point Task",
        dueDate: "2026-10-24",
        status: "in_progress",
        priority: "p2",
        isPinned: true,
        labelIds: ["errands"],
      });
      expect(kanbanTask.status).toBe("in_progress");
      expect(kanbanTask.priority).toBe("p2");
      expect(kanbanTask.isPinned).toBe(true);

      // Verify both persist across storage reloads
      const reloaded = await getTasks();
      const foundCalendar = reloaded.find((t) => t.id === calendarTask.id);
      const foundKanban = reloaded.find((t) => t.id === kanbanTask.id);

      expect(foundCalendar).toBeDefined();
      expect(foundCalendar?.dueDate).toBe("2026-10-24");
      expect(foundCalendar?.labelIds).toEqual(["work", "study"]);

      expect(foundKanban).toBeDefined();
      expect(foundKanban?.status).toBe("in_progress");
      expect(foundKanban?.isPinned).toBe(true);

      await removeTask(calendarTask.id);
      await removeTask(kanbanTask.id);
    });
  });
});



