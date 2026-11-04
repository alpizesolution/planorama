import fs from "node:fs/promises";
import path from "node:path";
import { encryptText, decryptText, type EncryptedPayload } from "./crypto";

export interface StoredGoogleCredentials {
  sessionId: string;
  userEmail?: string;
  userName?: string;
  userPicture?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Milliseconds timestamp
  scope: string;
  connectedAt: string;
  updatedAt: string;
}

export interface StoredCalendarSyncMeta {
  syncTokens: Record<string, string>; // calendarId -> syncToken
  lastSyncedAt?: string;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string;
}

const STORAGE_DIR = path.join(process.cwd(), ".planorama", "tokens");

// In-memory fallback map for environments with restricted filesystem access (e.g. serverless read-only)
const memoryTokenCache = new Map<string, EncryptedPayload>();
const memorySyncMetaCache = new Map<string, StoredCalendarSyncMeta>();

async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch {
    // Ignore if directory already exists or filesystem is read-only
  }
}

function getFilePath(sessionId: string): string {
  // Sanitize sessionId to alphanumeric and safe characters to prevent path traversal
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(STORAGE_DIR, `${safeSessionId}.enc`);
}

function getMetaFilePath(sessionId: string): string {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(STORAGE_DIR, `${safeSessionId}.meta.json`);
}

/**
 * Encrypt and store Google credentials at rest for a user session.
 */
export async function saveEncryptedCredentials(
  sessionId: string,
  credentials: StoredGoogleCredentials
): Promise<void> {
  const payload = encryptText(JSON.stringify(credentials));
  memoryTokenCache.set(sessionId, payload);

  try {
    await ensureStorageDir();
    const filePath = getFilePath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
  } catch (err) {
    // Continue with in-memory cache if filesystem write fails
    console.warn("[GoogleTokenStore] Failed to write token file to disk, relying on memory cache:", err);
  }
}

/**
 * Retrieve and decrypt stored Google credentials for a user session.
 * Returns null if not found or if decryption fails.
 */
export async function getDecryptedCredentials(
  sessionId: string
): Promise<StoredGoogleCredentials | null> {
  let payload: EncryptedPayload | null = memoryTokenCache.get(sessionId) || null;

  if (!payload) {
    try {
      const filePath = getFilePath(sessionId);
      const raw = await fs.readFile(filePath, "utf8");
      payload = JSON.parse(raw) as EncryptedPayload;
      memoryTokenCache.set(sessionId, payload);
    } catch {
      return null;
    }
  }

  try {
    const decryptedJson = decryptText(payload);
    return JSON.parse(decryptedJson) as StoredGoogleCredentials;
  } catch (err) {
    console.error("[GoogleTokenStore] Failed to decrypt stored credentials for session:", err);
    return null;
  }
}

/**
 * Delete stored credentials for a session (used on disconnect or token revocation).
 */
export async function deleteCredentials(sessionId: string): Promise<void> {
  memoryTokenCache.delete(sessionId);
  memorySyncMetaCache.delete(sessionId);

  try {
    const filePath = getFilePath(sessionId);
    await fs.unlink(filePath);
  } catch {
    // File might not exist
  }

  try {
    const metaPath = getMetaFilePath(sessionId);
    await fs.unlink(metaPath);
  } catch {
    // File might not exist
  }
}

/**
 * Store calendar sync metadata (sync tokens, last sync timestamp).
 */
export async function saveSyncMeta(
  sessionId: string,
  meta: StoredCalendarSyncMeta
): Promise<void> {
  memorySyncMetaCache.set(sessionId, meta);

  try {
    await ensureStorageDir();
    const metaPath = getMetaFilePath(sessionId);
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // In-memory fallback
  }
}

/**
 * Retrieve calendar sync metadata.
 */
export async function getSyncMeta(sessionId: string): Promise<StoredCalendarSyncMeta> {
  const cached = memorySyncMetaCache.get(sessionId);
  if (cached) return cached;

  try {
    const metaPath = getMetaFilePath(sessionId);
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as StoredCalendarSyncMeta;
    memorySyncMetaCache.set(sessionId, parsed);
    return parsed;
  } catch {
    return { syncTokens: {} };
  }
}
