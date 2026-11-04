import { validateTask } from "./validation";
import type { PlannerTask } from "./types";

const DATABASE_NAME = "planorama-local";
const DATABASE_VERSION = 1;
const TASK_STORE = "tasks";
const FALLBACK_KEY = "planorama:tasks:v1";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TASK_STORE)) db.createObjectStore(TASK_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local database."));
  });
}

function runTransaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, mode);
    work(tx.objectStore(TASK_STORE), resolve, reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("Local database transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Local database transaction was cancelled."));
  }));
}

let memoryTasks: PlannerTask[] = [];

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function readFallback(): PlannerTask[] {
  try {
    const storage = getStorage();
    if (!storage) return memoryTasks;
    const raw = storage.getItem(FALLBACK_KEY);
    if (!raw) return memoryTasks;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return memoryTasks;
    const tasks = parsed.map(validateTask);
    memoryTasks = tasks;
    return tasks;
  } catch {
    return memoryTasks;
  }
}

function writeFallback(tasks: PlannerTask[]): void {
  memoryTasks = tasks;
  try {
    const storage = getStorage();
    storage?.setItem(FALLBACK_KEY, JSON.stringify(tasks));
  } catch {
    // Handle storage quota exceeded or disabled cookies/storage
  }
}

export async function listLocalTasks(): Promise<PlannerTask[]> {
  try {
    const values = await runTransaction<PlannerTask[]>("readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try { resolve((request.result as unknown[]).map(validateTask)); } catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
    return values.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return readFallback();
  }
}

export async function saveLocalTask(task: PlannerTask): Promise<void> {
  const valid = validateTask(task);
  try {
    await runTransaction<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(valid);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // If IndexedDB fails, continue and persist in fallback
  }
  const tasks = readFallback();
  writeFallback([...tasks.filter((item) => item.id !== valid.id), valid]);
}

export async function deleteLocalTask(id: string): Promise<void> {
  try {
    await runTransaction<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // If IndexedDB fails, continue and remove from fallback
  }
  writeFallback(readFallback().filter((task) => task.id !== id));
}
