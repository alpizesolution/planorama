import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  saveEncryptedCredentials,
  getDecryptedCredentials,
  getAllConnectedAccounts,
  deleteCredentials,
  saveSyncToken,
  getSyncToken,
  acquireSyncLock,
  renewSyncLock,
  releaseSyncLock,
  setTestFirestoreStore,
  StorageUnavailableError,
  type StoredGoogleCredentials,
} from "./google-token-store";
import {
  MockFirestoreStore,
  executeWithRetry,
  jsToFirestoreValue,
  firestoreValueToJs,
  getFirestoreDocument,
  setFirestoreDocument,
  deleteFirestoreDocument,
  clearFirestoreTokenCache,
  getFirestoreSyncLockPath,
} from "./firestore-store";
import { GoogleAuthError, getValidAccessToken } from "./google-calendar";

describe("Vercel Production Storage Remediation - Distributed Datastore", () => {
  let mockStore: MockFirestoreStore;

  beforeEach(() => {
    mockStore = new MockFirestoreStore();
    setTestFirestoreStore(mockStore);
  });

  afterEach(() => {
    setTestFirestoreStore(null);
    vi.restoreAllMocks();
  });

  it("1. Persistence across separate service instances: simulates separate Vercel lambda containers", async () => {
    const userId = "shared_user_lambda_test";
    const sampleCredentials: StoredGoogleCredentials = {
      sessionId: userId,
      userId,
      accountId: "assistant@va-agency.com",
      userEmail: "assistant@va-agency.com",
      userName: "Alex VA",
      accessToken: "ya29.instance_A_access_token",
      refreshToken: "instance_A_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: true,
    };

    // Container Instance 1: Saves credentials to shared Firestore datastore
    await saveEncryptedCredentials(userId, sampleCredentials);

    // Save sync token in Instance 1
    await saveSyncToken(userId, "sync_tok_inst_1", "primary", "assistant@va-agency.com");

    // Container Instance 2: Simulated separate serverless instance accessing same datastore
    const instance2Store = mockStore; // same shared remote database
    setTestFirestoreStore(instance2Store);

    const fetchedByInstance2 = await getDecryptedCredentials(userId, "assistant@va-agency.com");
    expect(fetchedByInstance2).not.toBeNull();
    expect(fetchedByInstance2?.userEmail).toBe("assistant@va-agency.com");
    expect(fetchedByInstance2?.accessToken).toBe("ya29.instance_A_access_token");
    expect(fetchedByInstance2?.refreshToken).toBe("instance_A_refresh_token");

    const syncTokenInInstance2 = await getSyncToken(userId, "primary", "assistant@va-agency.com");
    expect(syncTokenInInstance2).toBe("sync_tok_inst_1");
  });

  it("2. Cross-user credential isolation: strictly enforces user boundaries and authorization", async () => {
    const userAlice = "firebase_uid_alice_123";
    const userBob = "firebase_uid_bob_456";

    const aliceCreds: StoredGoogleCredentials = {
      sessionId: userAlice,
      userId: userAlice,
      accountId: "alice@client-corp.com",
      userEmail: "alice@client-corp.com",
      accessToken: "ya29.alice_secret_token",
      refreshToken: "alice_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bobCreds: StoredGoogleCredentials = {
      sessionId: userBob,
      userId: userBob,
      accountId: "bob@personal-gmail.com",
      userEmail: "bob@personal-gmail.com",
      accessToken: "ya29.bob_secret_token",
      refreshToken: "bob_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveEncryptedCredentials(userAlice, aliceCreds);
    await saveEncryptedCredentials(userBob, bobCreds);

    // Verify Alice cannot see Bob's account
    const aliceAccounts = await getAllConnectedAccounts(userAlice);
    expect(aliceAccounts).toHaveLength(1);
    expect(aliceAccounts[0].userEmail).toBe("alice@client-corp.com");

    // Verify Bob cannot see Alice's account
    const bobAccounts = await getAllConnectedAccounts(userBob);
    expect(bobAccounts).toHaveLength(1);
    expect(bobAccounts[0].userEmail).toBe("bob@personal-gmail.com");

    // Verify querying Bob's scope for Alice's accountId returns null
    const crossAccess = await getDecryptedCredentials(userBob, "alice@client-corp.com");
    expect(crossAccess).toBeNull();

    // Verify deleting Bob's account leaves Alice's data completely intact
    await deleteCredentials(userBob);
    expect(await getDecryptedCredentials(userBob)).toBeNull();
    expect(await getDecryptedCredentials(userAlice)).not.toBeNull();
  });

  it("3. Concurrent sync locks: atomic mutual exclusion across distributed serverless instances", async () => {
    const userId = "concurrent_sync_user_test";

    // Lambda Instance A acquires lock
    const lockedByA = await acquireSyncLock(userId, 60000, "lambda_instance_A");
    expect(lockedByA).toBe(true);

    // Lambda Instance B tries to acquire lock concurrently on same user -> rejected!
    const lockedByB = await acquireSyncLock(userId, 60000, "lambda_instance_B");
    expect(lockedByB).toBe(false);

    // Instance B cannot release Instance A's lock
    await releaseSyncLock(userId, "lambda_instance_B");
    const stillLockedByA = await acquireSyncLock(userId, 60000, "lambda_instance_C");
    expect(stillLockedByA).toBe(false);

    // Instance A completes sync and releases lock
    await releaseSyncLock(userId, "lambda_instance_A");

    // Now Instance B can acquire the lock cleanly
    const lockedByBAfterRelease = await acquireSyncLock(userId, 60000, "lambda_instance_B");
    expect(lockedByBAfterRelease).toBe(true);

    await releaseSyncLock(userId, "lambda_instance_B");
  });

  it("4. Expired lock recovery: allows new instance to acquire lock after timeout expires", async () => {
    const userId = "expired_lock_user_test";

    // Acquire lock with negative timeout (immediately expired)
    await acquireSyncLock(userId, -100, "lambda_instance_old");

    // New instance attempts to acquire expired lock -> succeeds via atomic replacement
    const acquiredNew = await acquireSyncLock(userId, 60000, "lambda_instance_new");
    expect(acquiredNew).toBe(true);

    await releaseSyncLock(userId, "lambda_instance_new");
  });

  it("5. Expired OAuth credentials and refresh failures: throws 401 when token is expired and cannot be refreshed", async () => {
    const userId = "user_expired_tokens_test";

    // Case A: Expired access token with NO refresh token stored
    const expiredCredsNoRefresh: StoredGoogleCredentials = {
      sessionId: userId,
      userId,
      accountId: "expired@test.com",
      userEmail: "expired@test.com",
      accessToken: "ya29.expired_token",
      expiresAt: Date.now() - 60000, // Expired 1 minute ago
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveEncryptedCredentials(userId, expiredCredsNoRefresh);

    await expect(getValidAccessToken(userId, "expired@test.com")).rejects.toThrow(GoogleAuthError);
    await expect(getValidAccessToken(userId, "expired@test.com")).rejects.toThrow("no refresh token is stored");

    // Case B: Expired access token with a revoked refresh token
    const expiredCredsWithRevokedRefresh: StoredGoogleCredentials = {
      sessionId: userId,
      userId,
      accountId: "revoked@test.com",
      userEmail: "revoked@test.com",
      accessToken: "ya29.expired_token",
      refreshToken: "revoked_refresh_token_xyz",
      expiresAt: Date.now() - 60000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveEncryptedCredentials(userId, expiredCredsWithRevokedRefresh);

    // Mock Google token endpoint returning 400 (invalid_grant: token revoked)
    const originalFetch = globalThis.fetch;
    const origClientId = process.env.GOOGLE_CLIENT_ID;
    const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "mock-client-id-123";
    process.env.GOOGLE_CLIENT_SECRET = "mock-client-secret-456";

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url);
    });

    try {
      await expect(getValidAccessToken(userId, "revoked@test.com")).rejects.toThrow("revoked or expired");
      // Check credentials were automatically purged upon revocation to prevent repeated failures
      const remainingCreds = await getDecryptedCredentials(userId, "revoked@test.com");
      expect(remainingCreds).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      if (origClientId) process.env.GOOGLE_CLIENT_ID = origClientId;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (origClientSecret) process.env.GOOGLE_CLIENT_SECRET = origClientSecret;
      else delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it("6. Partial migration failure: preserves filesystem source file when datastore write fails", async () => {
    const userId = `mig_fail_test_${Date.now()}`;
    const testDir = path.join(process.cwd(), ".planorama", "storage", "users", userId);
    const testFile = path.join(testDir, "credentials.enc");

    const sampleCreds: StoredGoogleCredentials = {
      sessionId: userId,
      userId,
      accountId: "mig@test.com",
      userEmail: "mig@test.com",
      accessToken: "ya29.local_file_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Create source file on disk
    setTestFirestoreStore(null); // use filesystem mode to create source file
    await saveEncryptedCredentials(userId, sampleCreds);

    // Verify source file exists
    const sourceExistsBefore = await fs.stat(testFile).then(() => true).catch(() => false);
    expect(sourceExistsBefore).toBe(true);

    // 2. Simulate partial migration failure: Firestore setDocument throws error
    const failingStore = new MockFirestoreStore();
    vi.spyOn(failingStore, "setDocument").mockRejectedValue(
      new StorageUnavailableError("Simulated Firestore outage during migration write")
    );
    setTestFirestoreStore(failingStore);

    // Attempt to load -> triggers migration which fails
    const result = await getDecryptedCredentials(userId);
    // Since migration failed, returned empty, and source file was NOT touched
    expect(result).toBeNull();

    // Verify source file is STILL on disk (requirement 9: never delete source until migration verified)
    const sourceExistsAfterFailure = await fs.stat(testFile).then(() => true).catch(() => false);
    expect(sourceExistsAfterFailure).toBe(true);

    // Verify .migrated marker was NOT written
    const markerExists = await fs.stat(`${testFile}.migrated`).then(() => true).catch(() => false);
    expect(markerExists).toBe(false);

    // Clean up test file
    await fs.unlink(testFile).catch(() => {});
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("7. Database outages and retry behavior: retries transient errors and fails safely on persistent outages", async () => {
    let callCount = 0;

    // Transient failure: fails twice with 503, succeeds on 3rd attempt
    const transientOperation = async () => {
      callCount++;
      if (callCount < 3) {
        const err = new StorageUnavailableError("503 Service Unavailable");
        (err as { status?: number }).status = 503;
        throw err;
      }
      return "success_after_retries";
    };

    const res = await executeWithRetry(transientOperation, 3, 10);
    expect(res).toBe("success_after_retries");
    expect(callCount).toBe(3);

    // Persistent failure: fails past maxRetries -> throws StorageUnavailableError (never reports false success)
    let persistentCallCount = 0;
    const persistentOutage = async () => {
      persistentCallCount++;
      const err = new StorageUnavailableError("503 Service Unavailable - Database down");
      (err as { status?: number }).status = 503;
      throw err;
    };

    await expect(executeWithRetry(persistentOutage, 3, 10)).rejects.toThrow(StorageUnavailableError);
    expect(persistentCallCount).toBe(3);
  });

  it("8. Firestore typed field serialization: converts JS values to Firestore REST representation accurately", () => {
    const jsObj = {
      stringValue: "hello",
      numValue: 42,
      floatValue: 3.14,
      boolValue: true,
      nullValue: null,
      arrayValue: ["a", "b"],
      nested: { key: "val" },
    };

    const firestoreVal = jsToFirestoreValue(jsObj);
    expect(firestoreVal).toHaveProperty("mapValue");

    const backToJs = firestoreValueToJs(firestoreVal) as typeof jsObj;
    expect(backToJs.stringValue).toBe("hello");
    expect(backToJs.numValue).toBe(42);
    expect(backToJs.boolValue).toBe(true);
    expect(backToJs.nullValue).toBeNull();
    expect(backToJs.arrayValue).toEqual(["a", "b"]);
    expect(backToJs.nested.key).toBe("val");
  });

  it("9. Lock renewal and atomic safe release: allows instance renewal and prevents stale release from deleting overtaken lock", async () => {
    const userId = "lock_renewal_test_user";

    // Instance A acquires lock
    const acquiredA = await acquireSyncLock(userId, 60000, "instance_A");
    expect(acquiredA).toBe(true);

    // Instance A successfully renews its lock
    const renewedA = await renewSyncLock(userId, 60000, "instance_A");
    expect(renewedA).toBe(true);

    // Instance B cannot renew Instance A's lock
    const renewedByB = await renewSyncLock(userId, 60000, "instance_B");
    expect(renewedByB).toBe(false);

    // Simulate expiration of Instance A's lock
    const lockPath = getFirestoreSyncLockPath(userId);
    const lockDoc = await mockStore.getDocument(lockPath);
    expect(lockDoc).not.toBeNull();
    if (lockDoc) {
      await mockStore.setDocument(
        lockPath,
        { ...lockDoc.data, lockedUntil: Date.now() - 1000 },
        { updateTime: lockDoc.updateTime }
      );
    }

    // Instance B acquires the expired lock
    const acquiredB = await acquireSyncLock(userId, 60000, "instance_B");
    expect(acquiredB).toBe(true);

    // Instance A (slow instance waking up late) attempts to release lock with its instanceId
    await releaseSyncLock(userId, "instance_A");

    // CRITICAL: Instance B's lock MUST NOT be deleted by Instance A
    const activeDocAfterA = await mockStore.getDocument(lockPath);
    expect(activeDocAfterA).not.toBeNull();
    expect(activeDocAfterA?.data.lockedBy).toBe("instance_B");

    // Instance B cleanly releases its lock
    await releaseSyncLock(userId, "instance_B");
    const activeDocAfterB = await mockStore.getDocument(lockPath);
    expect(activeDocAfterB).toBeNull();
  });

  it("10. Encryption key rotation: backward-compatible decryption with fallback key and re-encryption with primary key", async () => {
    const userId = "key_rotation_user";
    const oldKey = "old-secret-key-that-was-rotated-32chars";
    const newKey = "new-brand-fresh-production-secret-key-32ch";

    const originalEnv = { ...process.env };

    try {
      // 1. Initial state: data encrypted with old key
      process.env.GOOGLE_ENCRYPTION_SECRET = oldKey;
      delete process.env.GOOGLE_ENCRYPTION_SECRET_FALLBACK;

      const sampleCreds: StoredGoogleCredentials = {
        sessionId: userId,
        userId,
        accountId: "rotation@planorama.app",
        userEmail: "rotation@planorama.app",
        accessToken: "ya29.old_key_token",
        refreshToken: "refresh_old_key",
        expiresAt: Date.now() + 3600000,
        scope: "https://www.googleapis.com/auth/calendar",
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveEncryptedCredentials(userId, sampleCreds);

      // 2. Secret Rotation: new key becomes primary, old key becomes fallback
      process.env.GOOGLE_ENCRYPTION_SECRET = newKey;
      process.env.GOOGLE_ENCRYPTION_SECRET_FALLBACK = oldKey;

      // Able to decrypt with fallback key!
      const decryptedWithFallback = await getDecryptedCredentials(userId, "rotation@planorama.app");
      expect(decryptedWithFallback).not.toBeNull();
      expect(decryptedWithFallback?.accessToken).toBe("ya29.old_key_token");

      // 3. Re-saving re-encrypts with new primary key
      await saveEncryptedCredentials(userId, decryptedWithFallback!);

      // 4. Decommission fallback key
      delete process.env.GOOGLE_ENCRYPTION_SECRET_FALLBACK;

      // Able to decrypt with new primary key alone
      const decryptedWithNewOnly = await getDecryptedCredentials(userId, "rotation@planorama.app");
      expect(decryptedWithNewOnly).not.toBeNull();
      expect(decryptedWithNewOnly?.accessToken).toBe("ya29.old_key_token");
    } finally {
      process.env = originalEnv;
    }
  });

  it("11. Firestore REST wire protocol: verifies endpoints, headers, preconditions, and 401 token refresh", async () => {
    // Switch to real Firestore mode for wire protocol tests
    setTestFirestoreStore(null);

    const originalEnv = { ...process.env };
    const originalFetch = globalThis.fetch;

    try {
      process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
      process.env.FIREBASE_PROJECT_ID = "test-project-123";
      process.env.FIREBASE_DATABASE_ID = "custom-db";
      clearFirestoreTokenCache();

      const capturedRequests: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
      let return401Once = true;

      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const headers: Record<string, string> = {};
        if (init?.headers) {
          const h = new Headers(init.headers);
          h.forEach((val, key) => {
            headers[key] = val;
          });
        }

        capturedRequests.push({
          url: urlStr,
          method: init?.method || "GET",
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });

        // Test 401 token refresh: return 401 on the first call, succeed on retry
        if (return401Once && init?.method === "GET") {
          return401Once = false;
          return new Response("Unauthorized", { status: 401 });
        }

        if (init?.method === "GET") {
          return new Response(
            JSON.stringify({
              fields: {
                title: { stringValue: "Wire Protocol Test" },
              },
              updateTime: "2026-10-26T00:00:00.000000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({
              fields: {
                saved: { booleanValue: true },
              },
              updateTime: "2026-10-26T00:00:01.000000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (init?.method === "DELETE") {
          return new Response("", { status: 200 });
        }

        return new Response("Not Found", { status: 404 });
      });

      // 1. GET with 401 recovery
      const doc = await getFirestoreDocument("users/test-uid/test-doc");
      expect(doc).not.toBeNull();
      expect(doc?.data.title).toBe("Wire Protocol Test");

      // Verify URL used custom database ID and emulator host
      expect(capturedRequests[0].url).toContain(
        "http://localhost:8080/v1/projects/test-project-123/databases/custom-db/documents/users/test-uid/test-doc"
      );
      expect(capturedRequests[0].headers.authorization).toBe("Bearer owner");
      // 401 caused a retry
      expect(capturedRequests).toHaveLength(2);

      // 2. PATCH with precondition
      capturedRequests.length = 0;
      await setFirestoreDocument("users/test-uid/test-doc", { count: 10 }, { updateTime: "2026-10-26T00:00:00.000000Z" });

      expect(capturedRequests[0].method).toBe("PATCH");
      expect(capturedRequests[0].url).toContain("currentDocument.updateTime=2026-10-26T00%3A00%3A00.000000Z");
      expect(capturedRequests[0].headers["content-type"]).toBe("application/json");

      // 3. DELETE with precondition
      capturedRequests.length = 0;
      await deleteFirestoreDocument("users/test-uid/test-doc", { updateTime: "2026-10-26T00:00:01.000000Z" });

      expect(capturedRequests[0].method).toBe("DELETE");
      expect(capturedRequests[0].url).toContain("currentDocument.updateTime=2026-10-26T00%3A00%3A01.000000Z");
    } finally {
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
    }
  });
});

