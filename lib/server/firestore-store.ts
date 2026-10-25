import crypto from "node:crypto";

/**
 * Custom error indicating a persistent storage failure or outage.
 */
export class StorageUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Resolves Firebase/Google Service Account credentials from environment variables.
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  // Check if emulator is active
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return {
      clientEmail: "emulator@example.com",
      privateKey: "dummy-key",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "planoramaph",
    };
  }

  // 1. Full JSON service account key
  const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (jsonKey) {
    try {
      const parsed = JSON.parse(jsonKey);
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: (parsed.private_key as string).replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
          projectId: parsed.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "planoramaph",
        };
      }
    } catch {
      console.warn("[FirestoreStore] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON.");
    }
  }

  // 2. Individual environment variables
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "planoramaph";

  if (clientEmail && privateKey) {
    return {
      clientEmail,
      privateKey: privateKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
      projectId,
    };
  }

  return null;
}

/**
 * Checks whether Firestore service account credentials or emulator are configured.
 */
export function isFirestoreConfigured(): boolean {
  if (Boolean(process.env.FIRESTORE_EMULATOR_HOST)) return true;
  return Boolean(getServiceAccountCredentials());
}

/**
 * Clears the in-memory cached OAuth2 access token for Firestore REST calls.
 */
export function clearFirestoreTokenCache(): void {
  cachedAccessToken = null;
}

/**
 * Generates an OAuth2 access token for Firestore REST API using Google Service Account RSA-SHA256 JWT.
 * Caches token until 60 seconds before expiration. Supports forceRefresh on 401 re-authentication.
 */
export async function getFirestoreAccessToken(forceRefresh = false): Promise<string> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new StorageUnavailableError(
      "Firestore service account credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return "owner"; // Standard emulator dummy bearer token
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cachedAccessToken && cachedAccessToken.expiresAt > nowSec + 60) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.clientEmail,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase",
    aud: "https://oauth2.googleapis.com/token",
    exp: nowSec + 3600,
    iat: nowSec,
  };

  const encHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  let signature: string;
  try {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${encHeader}.${encPayload}`);
    signature = sign.sign(creds.privateKey, "base64url");
  } catch (signErr) {
    throw new StorageUnavailableError("Failed to sign Google Service Account JWT with FIREBASE_PRIVATE_KEY", signErr);
  }

  const assertion = `${encHeader}.${encPayload}.${signature}`;

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch (netErr) {
    throw new StorageUnavailableError("Network error while exchanging Service Account JWT for access token", netErr);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new StorageUnavailableError(`Google OAuth2 token endpoint rejected Service Account JWT: ${res.status} ${errText}`);
  }

  const tokenData = await res.json();
  const token = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  cachedAccessToken = {
    token,
    expiresAt: nowSec + expiresIn,
  };

  return token;
}

/**
 * Safe retry wrapper with exponential backoff for transient network or 5xx database outages.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;
      attempt++;

      // Do not retry permanent client errors (e.g. 400 Bad Request, 401 Unauthorized, 404 Not Found)
      if (err instanceof Error && "status" in err) {
        const status = (err as { status: number }).status;
        if (status >= 400 && status < 500 && status !== 429) {
          throw err;
        }
      }

      if (attempt >= maxRetries) {
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError instanceof StorageUnavailableError) {
    throw lastError;
  }
  throw new StorageUnavailableError(`Storage operation failed after ${maxRetries} attempts`, lastError);
}

/**
 * Converts a JavaScript value to a Firestore REST API typed value.
 */
export function jsToFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(jsToFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = jsToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Converts a Firestore REST API typed value back to a plain JavaScript value.
 */
export function firestoreValueToJs(valObj: Record<string, unknown>): unknown {
  if (!valObj) return null;
  if ("nullValue" in valObj) return null;
  if ("booleanValue" in valObj) return valObj.booleanValue;
  if ("integerValue" in valObj) return parseInt(valObj.integerValue as string, 10);
  if ("doubleValue" in valObj) return valObj.doubleValue;
  if ("stringValue" in valObj) return valObj.stringValue;
  if ("timestampValue" in valObj) return valObj.timestampValue;
  if ("arrayValue" in valObj) {
    const arr = (valObj.arrayValue as { values?: Record<string, unknown>[] })?.values || [];
    return arr.map(firestoreValueToJs);
  }
  if ("mapValue" in valObj) {
    const res: Record<string, unknown> = {};
    const fields = (valObj.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = firestoreValueToJs(v);
    }
    return res;
  }
  return null;
}

export function firestoreDocumentToJs(doc: { fields?: Record<string, Record<string, unknown>> }): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    res[k] = firestoreValueToJs(v);
  }
  return res;
}

function getFirestoreBaseUrl(projectId: string): string {
  const databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/${databaseId}/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

/**
 * Executes an HTTP fetch with Firestore Service Account OAuth2 Bearer token,
 * retrying transient errors and automatically refreshing token if 401 Unauthorized is returned.
 */
async function fetchWithFirestoreAuth(
  url: string,
  options: RequestInit,
  docPath: string
): Promise<Response> {
  return executeWithRetry(async () => {
    let token = await getFirestoreAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (netErr) {
      throw new StorageUnavailableError(`Network connection error accessing Firestore document ${docPath}`, netErr);
    }

    if (res.status === 401) {
      // Access token may have expired or been revoked: clear cache, force refresh, and retry once
      clearFirestoreTokenCache();
      token = await getFirestoreAccessToken(true);
      headers.set("Authorization", `Bearer ${token}`);
      try {
        res = await fetch(url, { ...options, headers });
      } catch (retryNetErr) {
        throw new StorageUnavailableError(
          `Network connection error accessing Firestore document ${docPath} after token refresh`,
          retryNetErr
        );
      }
    }

    return res;
  });
}

/**
 * Fetches a Firestore document via REST API. Returns null if document does not exist.
 */
export async function getFirestoreDocument(
  docPath: string
): Promise<{ data: Record<string, unknown>; updateTime?: string } | null> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new StorageUnavailableError("Firestore credentials not configured");
  }

  const url = `${getFirestoreBaseUrl(creds.projectId)}/${docPath}`;
  const res = await fetchWithFirestoreAuth(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    docPath
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new StorageUnavailableError(`Firestore GET failed for ${docPath}: ${res.status} ${errText}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  const docJson = await res.json();
  return {
    data: firestoreDocumentToJs(docJson),
    updateTime: docJson.updateTime,
  };
}

/**
 * Saves a Firestore document via REST API PATCH (upsert).
 * Supports preconditions for atomic concurrency control.
 */
export async function setFirestoreDocument(
  docPath: string,
  fields: Record<string, unknown>,
  precondition?: { exists?: boolean; updateTime?: string }
): Promise<{ updateTime?: string }> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new StorageUnavailableError("Firestore credentials not configured");
  }

  let url = `${getFirestoreBaseUrl(creds.projectId)}/${docPath}`;

  const queryParams: string[] = [];
  if (precondition?.exists !== undefined) {
    queryParams.push(`currentDocument.exists=${precondition.exists}`);
  }
  if (precondition?.updateTime) {
    queryParams.push(`currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`);
  }

  if (queryParams.length > 0) {
    url += `?${queryParams.join("&")}`;
  }

  const firestoreFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      firestoreFields[k] = jsToFirestoreValue(v);
    }
  }

  const res = await fetchWithFirestoreAuth(
    url,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: firestoreFields }),
    },
    docPath
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new StorageUnavailableError(`Firestore PATCH failed for ${docPath}: ${res.status} ${errText}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  const docJson = await res.json().catch(() => ({}));
  return { updateTime: docJson.updateTime };
}

/**
 * Deletes a Firestore document via REST API.
 * Supports preconditions to prevent race conditions during deletion.
 */
export async function deleteFirestoreDocument(
  docPath: string,
  precondition?: { exists?: boolean; updateTime?: string }
): Promise<void> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new StorageUnavailableError("Firestore credentials not configured");
  }

  let url = `${getFirestoreBaseUrl(creds.projectId)}/${docPath}`;

  const queryParams: string[] = [];
  if (precondition?.exists !== undefined) {
    queryParams.push(`currentDocument.exists=${precondition.exists}`);
  }
  if (precondition?.updateTime) {
    queryParams.push(`currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`);
  }

  if (queryParams.length > 0) {
    url += `?${queryParams.join("&")}`;
  }

  const res = await fetchWithFirestoreAuth(
    url,
    {
      method: "DELETE",
    },
    docPath
  );

  if (res.status === 404) {
    return; // Already deleted
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new StorageUnavailableError(`Firestore DELETE failed for ${docPath}: ${res.status} ${errText}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
}

/**
 * Firestore path helpers scoped strictly by authenticated user ownership.
 */
function sanitizeOwnerId(ownerId: string): string {
  return encodeURIComponent(ownerId.replace(/[\/\\]/g, "_").slice(0, 128));
}

export function getFirestoreCredentialsPath(ownerId: string): string {
  return `users/${sanitizeOwnerId(ownerId)}/integrations/google`;
}

export function getFirestoreSyncMetaPath(ownerId: string): string {
  return `users/${sanitizeOwnerId(ownerId)}/integrations/google_sync_meta`;
}

export function getFirestoreSyncLockPath(ownerId: string): string {
  return `users/${sanitizeOwnerId(ownerId)}/integrations/google_sync_lock`;
}

/**
 * Atomic sync lock acquisition in Firestore across distributed serverless instances.
 * Uses Firestore precondition checks to guarantee zero race conditions.
 */
export async function acquireFirestoreSyncLock(
  ownerId: string,
  timeoutMs = 60000,
  instanceId: string = crypto.randomUUID()
): Promise<boolean> {
  const lockPath = getFirestoreSyncLockPath(ownerId);
  const now = Date.now();
  const lockedUntil = now + timeoutMs;

  const existing = await getFirestoreDocument(lockPath);

  if (!existing) {
    // Attempt atomic create (currentDocument.exists = false)
    try {
      await setFirestoreDocument(
        lockPath,
        {
          lockedUntil,
          lockedBy: instanceId,
          acquiredAt: now,
        },
        { exists: false }
      );
      return true;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 400 || status === 409) {
        return false; // Another instance raced and created the lock first
      }
      throw err;
    }
  }

  // Lock document exists. Check if previous lock expired.
  const existingUntil = typeof existing.data.lockedUntil === "number" ? existing.data.lockedUntil : 0;
  if (existingUntil > now) {
    return false; // Lock is currently held and unexpired
  }

  // Lock is expired. Attempt atomic replacement using updateTime precondition.
  try {
    await setFirestoreDocument(
      lockPath,
      {
        lockedUntil,
        lockedBy: instanceId,
        acquiredAt: now,
      },
      { updateTime: existing.updateTime }
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 409) {
      return false; // Another instance raced and acquired the expired lock first
    }
    throw err;
  }
}

/**
 * Renews an existing sync lock held by the same instance before it expires.
 * Uses updateTime precondition to guarantee atomic renewal across serverless instances.
 */
export async function renewFirestoreSyncLock(
  ownerId: string,
  extensionMs = 60000,
  instanceId: string = crypto.randomUUID()
): Promise<boolean> {
  const lockPath = getFirestoreSyncLockPath(ownerId);
  const existing = await getFirestoreDocument(lockPath);

  if (!existing || existing.data.lockedBy !== instanceId) {
    return false; // Not held by this instance
  }

  const now = Date.now();
  const lockedUntil = now + extensionMs;

  try {
    await setFirestoreDocument(
      lockPath,
      {
        lockedUntil,
        lockedBy: instanceId,
        acquiredAt: existing.data.acquiredAt || now,
        renewedAt: now,
      },
      { updateTime: existing.updateTime }
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 409) {
      return false; // Lock was overtaken or modified
    }
    throw err;
  }
}

/**
 * Releases the sync lock in Firestore.
 * Ensures an instance only releases its own un-overtaken lock using updateTime precondition.
 */
export async function releaseFirestoreSyncLock(
  ownerId: string,
  instanceId?: string
): Promise<void> {
  const lockPath = getFirestoreSyncLockPath(ownerId);

  if (instanceId) {
    const existing = await getFirestoreDocument(lockPath);
    if (!existing || existing.data.lockedBy !== instanceId) {
      return; // Do not release if held by another instance or already gone
    }
    await deleteFirestoreDocument(lockPath, { updateTime: existing.updateTime }).catch(() => {});
    return;
  }

  await deleteFirestoreDocument(lockPath).catch(() => {});
}

/**
 * Mock Firestore Store interface used for deterministic unit testing of distributed persistence.
 */
export class MockFirestoreStore {
  private docs = new Map<string, { data: Record<string, unknown>; updateTime: string }>();

  async getDocument(docPath: string): Promise<{ data: Record<string, unknown>; updateTime: string } | null> {
    const doc = this.docs.get(docPath);
    if (!doc) return null;
    return { data: JSON.parse(JSON.stringify(doc.data)), updateTime: doc.updateTime };
  }

  async setDocument(
    docPath: string,
    fields: Record<string, unknown>,
    precondition?: { exists?: boolean; updateTime?: string }
  ): Promise<void> {
    const existing = this.docs.get(docPath);

    if (precondition?.exists === false && existing) {
      const err = new StorageUnavailableError(`Precondition failed: document ${docPath} already exists.`);
      (err as { status?: number }).status = 409;
      throw err;
    }

    if (precondition?.updateTime && existing && existing.updateTime !== precondition.updateTime) {
      const err = new StorageUnavailableError(`Precondition failed: document ${docPath} updateTime mismatch.`);
      (err as { status?: number }).status = 409;
      throw err;
    }

    const nowIso = new Date().toISOString();
    this.docs.set(docPath, {
      data: JSON.parse(JSON.stringify(fields)),
      updateTime: nowIso,
    });
  }

  async deleteDocument(
    docPath: string,
    precondition?: { exists?: boolean; updateTime?: string }
  ): Promise<void> {
    const existing = this.docs.get(docPath);
    if (precondition?.updateTime && existing && existing.updateTime !== precondition.updateTime) {
      const err = new StorageUnavailableError(`Precondition failed: document ${docPath} updateTime mismatch.`);
      (err as { status?: number }).status = 409;
      throw err;
    }
    this.docs.delete(docPath);
  }

  async acquireLock(ownerId: string, timeoutMs: number, instanceId: string): Promise<boolean> {
    const lockPath = getFirestoreSyncLockPath(ownerId);
    const now = Date.now();
    const lockedUntil = now + timeoutMs;
    const existing = await this.getDocument(lockPath);

    if (!existing) {
      try {
        await this.setDocument(lockPath, { lockedUntil, lockedBy: instanceId, acquiredAt: now }, { exists: false });
        return true;
      } catch {
        return false;
      }
    }

    const existingUntil = typeof existing.data.lockedUntil === "number" ? existing.data.lockedUntil : 0;
    if (existingUntil > now) {
      return false;
    }

    try {
      await this.setDocument(lockPath, { lockedUntil, lockedBy: instanceId, acquiredAt: now }, { updateTime: existing.updateTime });
      return true;
    } catch {
      return false;
    }
  }

  async renewLock(ownerId: string, extensionMs: number, instanceId: string): Promise<boolean> {
    const lockPath = getFirestoreSyncLockPath(ownerId);
    const existing = await this.getDocument(lockPath);
    if (!existing || existing.data.lockedBy !== instanceId) {
      return false;
    }
    const now = Date.now();
    const lockedUntil = now + extensionMs;
    try {
      await this.setDocument(
        lockPath,
        { lockedUntil, lockedBy: instanceId, acquiredAt: existing.data.acquiredAt || now, renewedAt: now },
        { updateTime: existing.updateTime }
      );
      return true;
    } catch {
      return false;
    }
  }

  async releaseLock(ownerId: string, instanceId?: string): Promise<void> {
    const lockPath = getFirestoreSyncLockPath(ownerId);
    if (instanceId) {
      const doc = await this.getDocument(lockPath);
      if (!doc || doc.data.lockedBy !== instanceId) return;
      await this.deleteDocument(lockPath, { updateTime: doc.updateTime }).catch(() => {});
      return;
    }
    await this.deleteDocument(lockPath).catch(() => {});
  }

  clear(): void {
    this.docs.clear();
  }
}
