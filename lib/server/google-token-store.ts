import fs from "node:fs/promises";
import path from "node:path";
import { encryptText, decryptText, type EncryptedPayload } from "./crypto";

export interface StoredGoogleCredentials {
  sessionId: string;
  accountId?: string;
  userEmail?: string;
  userName?: string;
  userPicture?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Milliseconds timestamp
  scope: string;
  connectedAt: string;
  updatedAt: string;
  isPrimary?: boolean;
}

export interface StoredGoogleAccount {
  accountId: string;
  userEmail: string;
  userName?: string;
  userPicture?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  connectedAt: string;
  updatedAt: string;
  isPrimary?: boolean;
}

export interface StoredSessionGoogleData {
  sessionId: string;
  accounts: Record<string, StoredGoogleAccount>;
  primaryAccountId?: string;
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
 * Normalizes raw decrypted JSON to StoredSessionGoogleData, handling legacy single-account payload.
 */
function normalizeSessionData(sessionId: string, rawData: unknown): StoredSessionGoogleData {
  if (!rawData || typeof rawData !== "object") {
    return { sessionId, accounts: {} };
  }

  const obj = rawData as Record<string, unknown>;

  // Check if it already matches multi-account format
  if (obj.accounts && typeof obj.accounts === "object") {
    return {
      sessionId,
      accounts: obj.accounts as Record<string, StoredGoogleAccount>,
      primaryAccountId: (obj.primaryAccountId as string) || Object.keys(obj.accounts as object)[0],
    };
  }

  // Legacy single-account format: top-level accessToken
  if (typeof obj.accessToken === "string") {
    const creds = obj as unknown as StoredGoogleCredentials;
    const accountId = creds.accountId || creds.userEmail || "primary";
    const account: StoredGoogleAccount = {
      accountId,
      userEmail: creds.userEmail || "primary@google.com",
      userName: creds.userName,
      userPicture: creds.userPicture,
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      scope: creds.scope,
      connectedAt: creds.connectedAt,
      updatedAt: creds.updatedAt,
      isPrimary: true,
    };

    return {
      sessionId,
      accounts: { [accountId]: account },
      primaryAccountId: accountId,
    };
  }

  return { sessionId, accounts: {} };
}

/**
 * Retrieve raw decrypted session data.
 */
async function loadRawSessionData(sessionId: string): Promise<StoredSessionGoogleData> {
  let payload: EncryptedPayload | null = memoryTokenCache.get(sessionId) || null;

  if (!payload) {
    try {
      const filePath = getFilePath(sessionId);
      const raw = await fs.readFile(filePath, "utf8");
      payload = JSON.parse(raw) as EncryptedPayload;
      memoryTokenCache.set(sessionId, payload);
    } catch {
      return { sessionId, accounts: {} };
    }
  }

  try {
    const decryptedJson = decryptText(payload);
    const parsed = JSON.parse(decryptedJson);
    return normalizeSessionData(sessionId, parsed);
  } catch (err) {
    console.error("[GoogleTokenStore] Failed to decrypt stored credentials for session:", err);
    return { sessionId, accounts: {} };
  }
}

/**
 * Persist encrypted session data to memory and disk.
 */
async function writeSessionData(sessionId: string, data: StoredSessionGoogleData): Promise<void> {
  const payload = encryptText(JSON.stringify(data));
  memoryTokenCache.set(sessionId, payload);

  try {
    await ensureStorageDir();
    const filePath = getFilePath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.warn("[GoogleTokenStore] Failed to write token file to disk, relying on memory cache:", err);
  }
}

/**
 * Encrypt and store Google credentials at rest for a user session (supports multi-account).
 */
export async function saveEncryptedCredentials(
  sessionId: string,
  credentials: StoredGoogleCredentials,
  targetAccountId?: string
): Promise<void> {
  const current = await loadRawSessionData(sessionId);
  const accountId = targetAccountId || credentials.accountId || credentials.userEmail || "primary";

  const isFirstAccount = Object.keys(current.accounts).length === 0;
  const isPrimary = credentials.isPrimary ?? (isFirstAccount || current.primaryAccountId === accountId);

  const account: StoredGoogleAccount = {
    accountId,
    userEmail: credentials.userEmail || accountId,
    userName: credentials.userName,
    userPicture: credentials.userPicture,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    scope: credentials.scope,
    connectedAt: credentials.connectedAt,
    updatedAt: credentials.updatedAt,
    isPrimary,
  };

  current.accounts[accountId] = account;
  if (isPrimary || !current.primaryAccountId) {
    current.primaryAccountId = accountId;
  }

  await writeSessionData(sessionId, current);
}

/**
 * Retrieve and decrypt stored Google credentials for a user session.
 * If accountId is provided, returns that specific account.
 * Otherwise returns the primary account.
 */
export async function getDecryptedCredentials(
  sessionId: string,
  accountId?: string
): Promise<StoredGoogleCredentials | null> {
  const data = await loadRawSessionData(sessionId);
  const accountKeys = Object.keys(data.accounts);
  if (accountKeys.length === 0) return null;

  let target: StoredGoogleAccount | undefined;
  if (accountId && data.accounts[accountId]) {
    target = data.accounts[accountId];
  } else if (data.primaryAccountId && data.accounts[data.primaryAccountId]) {
    target = data.accounts[data.primaryAccountId];
  } else {
    target = data.accounts[accountKeys[0]];
  }

  if (!target) return null;

  return {
    sessionId,
    accountId: target.accountId,
    userEmail: target.userEmail,
    userName: target.userName,
    userPicture: target.userPicture,
    accessToken: target.accessToken,
    refreshToken: target.refreshToken,
    expiresAt: target.expiresAt,
    scope: target.scope,
    connectedAt: target.connectedAt,
    updatedAt: target.updatedAt,
    isPrimary: target.isPrimary,
  };
}

/**
 * Retrieve all connected Google accounts for a session.
 */
export async function getAllConnectedAccounts(
  sessionId: string
): Promise<StoredGoogleAccount[]> {
  const data = await loadRawSessionData(sessionId);
  return Object.values(data.accounts);
}

/**
 * Delete stored credentials for a session or for a specific account.
 */
export async function deleteCredentials(
  sessionId: string,
  accountId?: string
): Promise<void> {
  if (accountId) {
    const data = await loadRawSessionData(sessionId);
    if (data.accounts[accountId]) {
      delete data.accounts[accountId];
      // If deleted account was primary, reassign primary to another account
      if (data.primaryAccountId === accountId) {
        const remainingKeys = Object.keys(data.accounts);
        data.primaryAccountId = remainingKeys.length > 0 ? remainingKeys[0] : undefined;
        if (data.primaryAccountId && data.accounts[data.primaryAccountId]) {
          data.accounts[data.primaryAccountId].isPrimary = true;
        }
      }

      if (Object.keys(data.accounts).length > 0) {
        await writeSessionData(sessionId, data);
        return;
      }
    }
  }

  // Wiping all credentials for this session
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
