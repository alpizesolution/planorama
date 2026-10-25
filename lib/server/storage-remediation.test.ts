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
});
