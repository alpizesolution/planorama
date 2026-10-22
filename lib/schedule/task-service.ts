import { validateNewTask, validateTask } from "./validation";
import { deleteLocalTask, listLocalTasks, saveLocalTask } from "./local-store";
import type { NewPlannerTask, PlannerTask } from "./types";

export async function getTasks(): Promise<PlannerTask[]> {
  return listLocalTasks();
}

export async function createTask(input: NewPlannerTask): Promise<PlannerTask> {
  const now = new Date().toISOString();
  const fields = validateNewTask(input);
  const task: PlannerTask = { ...fields, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await saveLocalTask(task);
  return task;
}

export async function updateTask(task: PlannerTask): Promise<PlannerTask> {
  const updated = validateTask({ ...task, updatedAt: new Date().toISOString() });
  await saveLocalTask(updated);
  return updated;
}

export async function removeTask(id: string): Promise<void> {
  if (!id.trim()) throw new Error("Task ID is required.");
  await deleteLocalTask(id);
}
