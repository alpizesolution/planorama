import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { encryptText, decryptText, type EncryptedPayload } from "./crypto";
import type { GoogleCalendarItem } from "./google-calendar";

export class StorageUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export interface StoredGoogleCredentials {
  sessionId: string;
  userId?: string;
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

export interface StoredUserGoogleData {
  ownerId: string; // Firebase UID or guest sessionId
  accounts: Record<string, StoredGoogleAccount>;
  primaryAccountId?: string;
  updatedAt: string;
}

export interface StoredCalendarSyncMeta {
  syncTokens: Record<string, string>; // "${accountId}:${calendarId}" -> syncToken
  lastSyncedAt?: string;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string;
  verifiedCalendars?: {
    items: GoogleCalendarItem[];
    cachedAt: number;
  };
}

// Durable file storage directory
const STORAGE_BASE_DIR = path.join(process.cwd(), ".planorama", "storage", "users");
const LEGACY_STORAGE_DIR = path.join(process.cwd(), ".planorama", "tokens");

// In-flight sync locks with expiration
const syncLocks = new Map<string, number>();

/**
 * Sanitize an owner/user ID for safe directory and file naming (prevents path traversal).
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function getUserStorageDir(ownerId: string): string {
  return path.join(STORAGE_BASE_DIR, sanitizeId(ownerId));
}

function getCredentialsFilePath(ownerId: string): string {
  return path.join(getUserStorageDir(ownerId), "credentials.enc");
}

function getSyncMetaFilePath(ownerId: string): string {
  return path.join(getUserStorageDir(ownerId), "sync_meta.json");
}

function getLegacyFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(LEGACY_STORAGE_DIR, `${safeId}.enc`);
}

function getLegacyMetaFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(LEGACY_STORAGE_DIR, `${safeId}.meta.json`);
}

/**
 * Atomically writes content to a file via a temporary file + rename.
 * Guarantees zero corruption during concurrent reads or sudden process terminations.
 * Throws StorageUnavailableError explicitly if write fails.
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    throw new StorageUnavailableError(`Failed to create storage directory for ${path.basename(filePath)}`, err);
  }

  const tempPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw new StorageUnavailableError(`Durable write failed for ${path.basename(filePath)}`, err);
  }
}

/**
 * Normalizes raw decrypted JSON to StoredUserGoogleData, supporting legacy schemas.
 */
function normalizeUserData(ownerId: string, rawData: unknown): StoredUserGoogleData {
  if (!rawData || typeof rawData !== "object") {
    return { ownerId, accounts: {}, updatedAt: new Date().toISOString() };
  }

  const obj = rawData as Record<string, unknown>;

  // Schema 1: Multi-account format with accounts map
  if (obj.accounts && typeof obj.accounts === "object") {
    const accounts = obj.accounts as Record<string, StoredGoogleAccount>;
    const accountKeys = Object.keys(accounts);
    return {
      ownerId,
      accounts,
      primaryAccountId: (obj.primaryAccountId as string) || accountKeys[0],
      updatedAt: (obj.updatedAt as string) || new Date().toISOString(),
    };
  }

  // Schema 2: Legacy single-account format with top-level accessToken
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
      connectedAt: creds.connectedAt || new Date().toISOString(),
      updatedAt: creds.updatedAt || new Date().toISOString(),
      isPrimary: true,
    };

    return {
      ownerId,
      accounts: { [accountId]: account },
      primaryAccountId: accountId,
      updatedAt: new Date().toISOString(),
    };
  }

  return { ownerId, accounts: {}, updatedAt: new Date().toISOString() };
}

/**
 * Loads and decrypts stored Google account data for a user or session.
 * Automatically checks and migrates legacy token files if present.
 */
async function loadUserData(ownerId: string): Promise<StoredUserGoogleData> {
  const filePath = getCredentialsFilePath(ownerId);

  // 1. Check current durable file
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as EncryptedPayload;
    const decryptedJson = decryptText(payload);
    const parsed = JSON.parse(decryptedJson);
    return normalizeUserData(ownerId, parsed);
  } catch (readErr: unknown) {
    const nodeErr = readErr as { code?: string };
    if (nodeErr.code !== "ENOENT") {
      // If file exists but failed to read or decrypt, throw or log warning
      console.warn(`[TokenStore] Could not read credentials for ${sanitizeId(ownerId)}:`, readErr);
    }
  }

  // 2. Check legacy storage path for backward compatibility
  try {
    const legacyPath = getLegacyFilePath(ownerId);
    const rawLegacy = await fs.readFile(legacyPath, "utf8");
    const payload = JSON.parse(rawLegacy) as EncryptedPayload;
    const decryptedJson = decryptText(payload);
    const parsed = JSON.parse(decryptedJson);
    const normalized = normalizeUserData(ownerId, parsed);

    // Migrate to durable location immediately
    if (Object.keys(normalized.accounts).length > 0) {
      await writeUserData(ownerId, normalized).catch((migErr) => {
        console.warn("[TokenStore] Failed to migrate legacy credentials:", migErr);
      });
    }

    return normalized;
  } catch {
    // No credentials found
    return { ownerId, accounts: {}, updatedAt: new Date().toISOString() };
  }
}

/**
 * Encrypts and atomically writes Google account data to durable storage.
 * Explicitly throws StorageUnavailableError if persistent write fails.
 */
async function writeUserData(ownerId: string, data: StoredUserGoogleData): Promise<void> {
  const payload = encryptText(JSON.stringify(data));
  const filePath = getCredentialsFilePath(ownerId);
  await atomicWriteFile(filePath, JSON.stringify(payload));
}

/**
 * Save or update encrypted Google credentials for a user/session.
 */
export async function saveEncryptedCredentials(
  ownerId: string,
  credentials: StoredGoogleCredentials,
  targetAccountId?: string
): Promise<void> {
  const current = await loadUserData(ownerId);
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
    connectedAt: credentials.connectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPrimary,
  };

  current.accounts[accountId] = account;
  if (isPrimary || !current.primaryAccountId) {
    current.primaryAccountId = accountId;
  }
  current.updatedAt = new Date().toISOString();

  await writeUserData(ownerId, current);
}

/**
 * Retrieve decrypted credentials for a specific account or the primary account.
 */
export async function getDecryptedCredentials(
  ownerId: string,
  targetAccountId?: string
): Promise<StoredGoogleCredentials | null> {
  const data = await loadUserData(ownerId);
  const accounts = data.accounts;
  const accountKeys = Object.keys(accounts);

  if (accountKeys.length === 0) {
    return null;
  }

  let selectedAccount: StoredGoogleAccount | undefined;

  if (targetAccountId && accounts[targetAccountId]) {
    selectedAccount = accounts[targetAccountId];
  } else if (data.primaryAccountId && accounts[data.primaryAccountId]) {
    selectedAccount = accounts[data.primaryAccountId];
  } else {
    selectedAccount = accounts[accountKeys[0]];
  }

  if (!selectedAccount) {
    return null;
  }

  return {
    sessionId: ownerId,
    userId: ownerId,
    accountId: selectedAccount.accountId,
    userEmail: selectedAccount.userEmail,
    userName: selectedAccount.userName,
    userPicture: selectedAccount.userPicture,
    accessToken: selectedAccount.accessToken,
    refreshToken: selectedAccount.refreshToken,
    expiresAt: selectedAccount.expiresAt,
    scope: selectedAccount.scope,
    connectedAt: selectedAccount.connectedAt,
    updatedAt: selectedAccount.updatedAt,
    isPrimary: selectedAccount.isPrimary,
  };
}

/**
 * Retrieve all connected Google accounts for a user/session.
 */
export async function getAllConnectedAccounts(ownerId: string): Promise<StoredGoogleAccount[]> {
  const data = await loadUserData(ownerId);
  return Object.values(data.accounts);
}

/**
 * Delete credentials for a specific account, or disconnect all accounts.
 */
export async function deleteCredentials(ownerId: string, targetAccountId?: string): Promise<void> {
  const data = await loadUserData(ownerId);

  if (!targetAccountId) {
    // Delete all credentials for this user
    const filePath = getCredentialsFilePath(ownerId);
    await fs.unlink(filePath).catch(() => {});
    const legacyPath = getLegacyFilePath(ownerId);
    await fs.unlink(legacyPath).catch(() => {});

    // Clear sync meta as well
    const metaPath = getSyncMetaFilePath(ownerId);
    await fs.unlink(metaPath).catch(() => {});
    return;
  }

  // Delete specific account
  if (data.accounts[targetAccountId]) {
    delete data.accounts[targetAccountId];

    // Reassign primary account if needed
    if (data.primaryAccountId === targetAccountId) {
      const remainingKeys = Object.keys(data.accounts);
      data.primaryAccountId = remainingKeys[0] || undefined;
      if (data.primaryAccountId && data.accounts[data.primaryAccountId]) {
        data.accounts[data.primaryAccountId].isPrimary = true;
      }
    }

    data.updatedAt = new Date().toISOString();
    await writeUserData(ownerId, data);
  }
}

/**
 * Migrate stored credentials and sync metadata when an anonymous guest session
 * logs in to a verified Firebase account.
 */
export async function migrateSessionOwnership(guestSessionId: string, targetUserId: string): Promise<void> {
  if (!guestSessionId || !targetUserId || guestSessionId === targetUserId) {
    return;
  }

  // 1. Load guest data
  const guestData = await loadUserData(guestSessionId);
  if (Object.keys(guestData.accounts).length === 0) {
    return; // Nothing to migrate
  }

  // 2. Load target user data
  const targetData = await loadUserData(targetUserId);

  // 3. Merge accounts atomically
  for (const [accId, acc] of Object.entries(guestData.accounts)) {
    if (!targetData.accounts[accId]) {
      targetData.accounts[accId] = acc;
    }
  }

  if (!targetData.primaryAccountId) {
    targetData.primaryAccountId = guestData.primaryAccountId;
  }

  targetData.updatedAt = new Date().toISOString();
  await writeUserData(targetUserId, targetData);

  // 4. Migrate sync meta
  const guestMeta = await getSyncMeta(guestSessionId);
  if (Object.keys(guestMeta.syncTokens || {}).length > 0) {
    const targetMeta = await getSyncMeta(targetUserId);
    targetMeta.syncTokens = { ...guestMeta.syncTokens, ...(targetMeta.syncTokens || {}) };
    targetMeta.lastSyncedAt = targetMeta.lastSyncedAt || guestMeta.lastSyncedAt;
    await saveSyncMeta(targetUserId, targetMeta);
  }

  // 5. Clean up guest store
  await deleteCredentials(guestSessionId);
}

/**
 * Format sync token storage key: scoped by account and calendar.
 */
export function formatSyncTokenKey(accountId: string | undefined, calendarId: string): string {
  return accountId ? `${accountId}:${calendarId}` : calendarId;
}

/**
 * Save sync metadata for a user, using atomic writes.
 */
export async function saveSyncMeta(ownerId: string, meta: StoredCalendarSyncMeta): Promise<void> {
  const filePath = getSyncMetaFilePath(ownerId);
  await atomicWriteFile(filePath, JSON.stringify(meta, null, 2));
}

/**
 * Convenience helper to save a sync token scoped by account and calendar.
 */
export async function saveSyncToken(
  ownerId: string,
  syncToken: string,
  calendarId: string,
  accountId?: string
): Promise<void> {
  const meta = await getSyncMeta(ownerId);
  if (!meta.syncTokens) meta.syncTokens = {};
  const key = accountId ? formatSyncTokenKey(accountId, calendarId) : calendarId;
  meta.syncTokens[key] = syncToken;
  await saveSyncMeta(ownerId, meta);
}

/**
 * Convenience helper to get a sync token scoped by account and calendar.
 */
export async function getSyncToken(
  ownerId: string,
  calendarId: string,
  accountId?: string
): Promise<string | null> {
  const meta = await getSyncMeta(ownerId);
  if (!meta.syncTokens) return null;
  if (accountId) {
    const key = formatSyncTokenKey(accountId, calendarId);
    if (meta.syncTokens[key]) return meta.syncTokens[key];
  }
  return meta.syncTokens[calendarId] || null;
}

/**
 * Convenience helper to clear a sync token scoped by account and calendar.
 */
export async function clearSyncToken(
  ownerId: string,
  calendarId: string,
  accountId?: string
): Promise<void> {
  const meta = await getSyncMeta(ownerId);
  if (!meta.syncTokens) return;
  if (accountId) {
    const key = formatSyncTokenKey(accountId, calendarId);
    delete meta.syncTokens[key];
  }
  delete meta.syncTokens[calendarId];
  await saveSyncMeta(ownerId, meta);
}

/**
 * Load sync metadata for a user, with legacy migration fallback.
 */
export async function getSyncMeta(ownerId: string): Promise<StoredCalendarSyncMeta> {
  const filePath = getSyncMetaFilePath(ownerId);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as StoredCalendarSyncMeta;
  } catch (readErr: unknown) {
    const nodeErr = readErr as { code?: string };
    if (nodeErr.code !== "ENOENT") {
      console.warn(`[TokenStore] Could not read sync meta for ${sanitizeId(ownerId)}:`, readErr);
    }
  }

  // Check legacy meta path
  try {
    const legacyPath = getLegacyMetaFilePath(ownerId);
    const rawLegacy = await fs.readFile(legacyPath, "utf8");
    const meta = JSON.parse(rawLegacy) as StoredCalendarSyncMeta;
    // Migrate to durable location
    await saveSyncMeta(ownerId, meta).catch(() => {});
    return meta;
  } catch {
    return { syncTokens: {} };
  }
}

/**
 * In-flight sync lock (concurrency / race condition protection across tabs and requests).
 * Returns true if lock was successfully acquired, false if a sync is already running.
 */
export async function acquireSyncLock(ownerId: string, timeoutMs = 60000): Promise<boolean> {
  const now = Date.now();
  const existingLockExpiry = syncLocks.get(ownerId);

  if (existingLockExpiry && existingLockExpiry > now) {
    return false; // Still locked
  }

  syncLocks.set(ownerId, now + timeoutMs);
  return true;
}

/**
 * Releases an in-flight sync lock for a user.
 */
export async function releaseSyncLock(ownerId: string): Promise<void> {
  syncLocks.delete(ownerId);
}
