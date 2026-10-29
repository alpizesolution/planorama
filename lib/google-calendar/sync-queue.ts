import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarEvent, GoogleEventPayload } from "../server/google-calendar";

export type SyncActionType = "create" | "update" | "delete";

export interface SyncQueueItem {
  id: string;
  operationId: string;
  action: SyncActionType;
  taskId: string;
  googleEventId?: string;
  googleCalendarId?: string;
  googleAccountId?: string;
  googleETag?: string;
  payload?: GoogleEventPayload;
  localUpdatedAt: string;
  attempts: number;
  lastError?: string;
  queuedAt: string;
}

const QUEUE_STORAGE_KEY = "planorama:sync_queue:v1";
const TOMBSTONES_STORAGE_KEY = "planorama:sync_tombstones:v1";

let memoryQueue: SyncQueueItem[] = [];
let memoryTombstones: string[] = [];

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
}

/**
 * Retrieve all pending items in the durable synchronization queue.
 */
export function getSyncQueue(): SyncQueueItem[] {
  const storage = getStorage();
  if (!storage) return memoryQueue;

  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryQueue = parsed;
      return parsed;
    }
  } catch {
    // Return in-memory fallback if storage corrupted
  }
  return memoryQueue;
}

function saveQueue(queue: SyncQueueItem[]): void {
  memoryQueue = queue;
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage quota or restricted mode
  }
}

/**
 * Enqueue a sync action for a task, coalescing redundant or conflicting operations.
 */
export function enqueueSyncAction(
  action: Omit<SyncQueueItem, "id" | "attempts" | "queuedAt" | "operationId"> & {
    operationId?: string;
  }
): void {
  const queue = getSyncQueue();
  const existingIdx = queue.findIndex((item) => item.taskId === action.taskId);

  const now = new Date().toISOString();
  const operationId = action.operationId || `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newItem: SyncQueueItem = {
    ...action,
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operationId,
    attempts: 0,
    queuedAt: now,
  };

  if (existingIdx >= 0) {
    const existing = queue[existingIdx];

    // Case 1: If item was queued for "create" and is now "delete" before syncing to Google:
    // Just remove it from queue entirely (event was never created on Google)
    if (existing.action === "create" && action.action === "delete") {
      queue.splice(existingIdx, 1);
      saveQueue(queue);
      return;
    }

    // Case 2: If item was queued for "create" and is now "update", update payload but keep "create"
    if (existing.action === "create" && action.action === "update") {
      queue[existingIdx] = {
        ...existing,
        payload: action.payload || existing.payload,
        localUpdatedAt: action.localUpdatedAt,
      };
      saveQueue(queue);
      return;
    }

    // Case 3: If item was queued for "update" and is now "delete", replace with "delete"
    if (existing.action === "update" && action.action === "delete") {
      queue[existingIdx] = newItem;
      saveQueue(queue);
      return;
    }

    // Case 4: Multiple updates coalesce to latest payload
    if (existing.action === "update" && action.action === "update") {
      queue[existingIdx] = {
        ...existing,
        payload: action.payload || existing.payload,
        localUpdatedAt: action.localUpdatedAt,
      };
      saveQueue(queue);
      return;
    }
  }

  queue.push(newItem);
  saveQueue(queue);
}

/**
 * Remove an item from the queue after successful synchronization.
 */
export function dequeueSyncItem(id: string): void {
  const queue = getSyncQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

/**
 * Record a failed attempt for an item with exponential backoff metadata.
 */
export function recordSyncItemFailure(id: string, error: string): void {
  const queue = getSyncQueue().map((item) => {
    if (item.id === id) {
      return {
        ...item,
        attempts: item.attempts + 1,
        lastError: error,
      };
    }
    return item;
  });
  saveQueue(queue);
}

/**
 * Check if a task has pending un-synchronized changes in the queue.
 */
export function hasPendingSync(taskId: string): boolean {
  return getSyncQueue().some((item) => item.taskId === taskId);
}

/**
 * Clear all items in the sync queue (e.g. on account disconnect).
 */
export function clearSyncQueue(): void {
  saveQueue([]);
}

/**
 * Composite key helper for tombstone tracking across accounts and calendars.
 */
export function makeTombstoneKey(
  googleEventId: string,
  calendarId?: string,
  accountId?: string
): string {
  if (accountId && calendarId) {
    return `${accountId}:${calendarId}:${googleEventId}`;
  }
  if (calendarId) {
    return `${calendarId}:${googleEventId}`;
  }
  return googleEventId;
}

/**
 * Tombstones: track Google event IDs unlinked locally to prevent re-importing when
 * deleteGoogleEventOnTaskDelete is false.
 */
export function getDeletedGoogleEventIds(): Set<string> {
  const storage = getStorage();
  if (!storage) return new Set(memoryTombstones);

  try {
    const raw = storage.getItem(TOMBSTONES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryTombstones = parsed;
      return new Set(parsed);
    }
  } catch {
    // Fallback
  }
  return new Set(memoryTombstones);
}

export function recordDeletedGoogleEventId(
  googleEventId: string,
  calendarId?: string,
  accountId?: string
): void {
  if (!googleEventId) return;
  const current = getDeletedGoogleEventIds();
  current.add(googleEventId);
  if (calendarId) {
    current.add(`${calendarId}:${googleEventId}`);
  }
  if (accountId && calendarId) {
    current.add(`${accountId}:${calendarId}:${googleEventId}`);
  }
  const arr = Array.from(current).slice(-1000); // Keep max 1000 tombstones
  memoryTombstones = arr;

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // Ignore
    }
  }
}

export function isEventTombstoned(
  googleEventId: string,
  calendarId?: string,
  accountId?: string,
  tombstoneSet?: Set<string>
): boolean {
  if (!googleEventId) return false;
  const set = tombstoneSet || getDeletedGoogleEventIds();
  if (accountId && calendarId && set.has(`${accountId}:${calendarId}:${googleEventId}`)) {
    return true;
  }
  if (calendarId && set.has(`${calendarId}:${googleEventId}`)) {
    return true;
  }
  return set.has(googleEventId);
}

export function clearTombstones(): void {
  memoryTombstones = [];
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(TOMBSTONES_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

export interface ConflictResolutionResult {
  winner: "google" | "local";
  hasConflict: boolean;
  resolutionMessage: string;
}

/**
 * Resolves potential conflicts between local Planorama task state and incoming Google Calendar event.
 * Compares modification timestamps and pending sync queue status.
 */
export function resolveEventConflict(
  localTask: PlannerTask,
  googleEvent: GoogleCalendarEvent,
  lastSyncedAt?: string
): ConflictResolutionResult {
  const hasPending = hasPendingSync(localTask.id);
  const localTime = new Date(localTask.updatedAt).getTime();
  const googleTime = googleEvent.updated ? new Date(googleEvent.updated).getTime() : 0;
  const syncTime = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;

  // If local has no pending edits and Google was updated after last sync:
  if (!hasPending && googleTime > syncTime) {
    return {
      winner: "google",
      hasConflict: false,
      resolutionMessage: `Updated "${localTask.title}" from Google Calendar changes.`,
    };
  }

  // If local has pending edits but Google was not modified since last sync:
  if (hasPending && googleTime <= syncTime) {
    return {
      winner: "local",
      hasConflict: false,
      resolutionMessage: `Local pending edits for "${localTask.title}" take precedence.`,
    };
  }

  // Genuine conflict: both Google and local modified since last sync
  if (hasPending && googleTime > syncTime && Math.abs(googleTime - localTime) > 2000) {
    if (googleTime > localTime) {
      return {
        winner: "google",
        hasConflict: true,
        resolutionMessage: `Conflict detected for "${localTask.title}". Google Calendar version was newer and applied.`,
      };
    } else {
      return {
        winner: "local",
        hasConflict: true,
        resolutionMessage: `Conflict detected for "${localTask.title}". Local Planorama edit was newer and preserved.`,
      };
    }
  }

  // Fallback: newer timestamp wins
  if (googleTime >= localTime) {
    return {
      winner: "google",
      hasConflict: false,
      resolutionMessage: `Google Calendar version applied.`,
    };
  }

  return {
    winner: "local",
    hasConflict: false,
    resolutionMessage: `Local Planorama version preserved.`,
  };
}
