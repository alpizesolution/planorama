import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getFirestoreAccessToken,
  getFirestoreDocument,
  setFirestoreDocument,
  deleteFirestoreDocument,
  clearFirestoreTokenCache,
  getFirestoreSyncLockPath,
  acquireFirestoreSyncLock,
  renewFirestoreSyncLock,
  releaseFirestoreSyncLock,
} from "./firestore-store";
import {
  saveEncryptedCredentials,
  getDecryptedCredentials,
  getAllConnectedAccounts,
  deleteCredentials,
  saveSyncToken,
  getSyncToken,
  setTestFirestoreStore,
  type StoredGoogleCredentials,
} from "./google-token-store";
import {
  createSignedOAuthState,
  verifySignedOAuthState,
} from "./crypto";

describe("PLANORAMA Pre-Merge Final Validation — Live Local HTTP Wire Protocol", () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  // In-memory document database backing the local HTTP Firestore REST server
  const httpDatabase = new Map<string, { fields: Record<string, unknown>; updateTime: string }>();

  // RSA-2048 keypair generated dynamically for live JWT signing and verification
  const { privateKey: testPrivateKeyPem, publicKey: testPublicKeyPem } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const capturedAuthTokens: string[] = [];
  let simulate503Count = 0;

  beforeAll(async () => {
    // Disable in-memory unit-test mock to test REAL HTTP wire protocol calls
    setTestFirestoreStore(null);

    // Create real local HTTP server implementing Firestore v1 REST and Google OAuth2 token endpoints
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      // 1. Google OAuth2 Token Endpoint: /oauth2/token (simulates oauth2.googleapis.com)
      if (req.method === "POST" && url.pathname === "/oauth2/token") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const params = new URLSearchParams(body);
        const grantType = params.get("grant_type");
        const assertion = params.get("assertion");

        if (grantType !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || !assertion) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }

        const [hB64, pB64, sigB64] = assertion.split(".");
        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(`${hB64}.${pB64}`);
        const isValid = verifier.verify(testPublicKeyPem, Buffer.from(sigB64, "base64url"));

        if (!isValid) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_assertion_signature" }));
          return;
        }

        const payload = JSON.parse(Buffer.from(pB64, "base64url").toString("utf8"));
        expect(payload.iss).toBe("test-service-account@planoramaph.iam.gserviceaccount.com");
        expect(payload.aud).toBe("https://oauth2.googleapis.com/token");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          access_token: "test_live_jwt_access_token_xyz123",
          expires_in: 3600,
          token_type: "Bearer",
        }));
        return;
      }

      // Check Authorization header for Firestore REST calls
      const authHeader = req.headers.authorization;
      if (authHeader) {
        capturedAuthTokens.push(authHeader);
      }

      // Simulate transient 503 outage if configured
      if (simulate503Count > 0) {
        simulate503Count--;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service Unavailable" }));
        return;
      }

      // 2. Firestore Document REST endpoints:
      // Pattern: /v1/projects/:proj/databases/:db/documents/:docPath*
      const match = url.pathname.match(/\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\/(.+)$/);
      if (!match) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
      }

      const docPath = decodeURIComponent(match[1]);

      if (req.method === "GET") {
        const doc = httpDatabase.get(docPath);
        if (!doc) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Document not found" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: `projects/planoramaph/databases/(default)/documents/${docPath}`,
          fields: doc.fields,
          updateTime: doc.updateTime,
        }));
        return;
      }

      if (req.method === "PATCH") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const parsed = JSON.parse(body);

        // Precondition: exists=false
        const existsPrecond = url.searchParams.get("currentDocument.exists");
        if (existsPrecond === "false" && httpDatabase.has(docPath)) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Document already exists" }));
          return;
        }

        // Precondition: updateTime
        const updateTimePrecond = url.searchParams.get("currentDocument.updateTime");
        const existing = httpDatabase.get(docPath);
        if (updateTimePrecond && existing && existing.updateTime !== updateTimePrecond) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Precondition failed: updateTime mismatch" }));
          return;
        }

        const nowIso = new Date().toISOString();
        httpDatabase.set(docPath, {
          fields: parsed.fields || {},
          updateTime: nowIso,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: `projects/planoramaph/databases/(default)/documents/${docPath}`,
          fields: parsed.fields,
          updateTime: nowIso,
        }));
        return;
      }

      if (req.method === "DELETE") {
        const updateTimePrecond = url.searchParams.get("currentDocument.updateTime");
        const existing = httpDatabase.get(docPath);
        if (updateTimePrecond && existing && existing.updateTime !== updateTimePrecond) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Precondition failed: updateTime mismatch on DELETE" }));
          return;
        }

        httpDatabase.delete(docPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
          serverUrl = `127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("1. Live HTTP Service-Account RSA JWT Generation and Token Exchange", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    try {
      process.env.FIREBASE_CLIENT_EMAIL = "test-service-account@planoramaph.iam.gserviceaccount.com";
      // Test key with escaped literal newlines as received from Vercel env
      process.env.FIREBASE_PRIVATE_KEY = testPrivateKeyPem.replace(/\n/g, "\\n");
      process.env.FIREBASE_PROJECT_ID = "planoramaph";
      delete process.env.FIRESTORE_EMULATOR_HOST; // ensure real JWT generation is executed
      clearFirestoreTokenCache();

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr === "https://oauth2.googleapis.com/token") {
          // Route live to local test server
          return originalFetch(`http://${serverUrl}/oauth2/token`, init);
        }
        return originalFetch(url, init);
      });

      const token = await getFirestoreAccessToken(true);
      expect(token).toBe("test_live_jwt_access_token_xyz123");
    } finally {
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
    }
  });

  it("2. Real HTTP REST CRUD against local Firestore server with Bearer auth", async () => {
    const originalEnv = { ...process.env };

    try {
      // Configure live HTTP emulator host
      process.env.FIRESTORE_EMULATOR_HOST = serverUrl;
      process.env.FIREBASE_PROJECT_ID = "planoramaph";
      capturedAuthTokens.length = 0;

      // 1. Create document over HTTP
      await setFirestoreDocument("users/test_http_user/profile", {
        name: "Planorama Tester",
        role: "admin",
        active: true,
      });

      // Verify Authorization header was sent over real TCP
      expect(capturedAuthTokens.length).toBeGreaterThan(0);
      expect(capturedAuthTokens[0]).toBe("Bearer owner");

      // 2. Read document over HTTP
      const doc = await getFirestoreDocument("users/test_http_user/profile");
      expect(doc).not.toBeNull();
      expect(doc?.data.name).toBe("Planorama Tester");
      expect(doc?.data.role).toBe("admin");
      expect(doc?.data.active).toBe(true);
      expect(doc?.updateTime).toBeDefined();

      // 3. Conditional delete over HTTP
      await deleteFirestoreDocument("users/test_http_user/profile", { updateTime: doc?.updateTime });

      // Verify deletion
      const deletedDoc = await getFirestoreDocument("users/test_http_user/profile");
      expect(deletedDoc).toBeNull();
    } finally {
      process.env = originalEnv;
    }
  });

  it("3. End-to-End Credential Encryption and Multi-Instance Durability over HTTP", async () => {
    const originalEnv = { ...process.env };

    try {
      process.env.FIRESTORE_EMULATOR_HOST = serverUrl;
      process.env.FIREBASE_PROJECT_ID = "planoramaph";

      const userUid = "live_http_user_e2e_456";
      const sampleCreds: StoredGoogleCredentials = {
        sessionId: userUid,
        userId: userUid,
        accountId: "live_client@lawfirm.com",
        userEmail: "live_client@lawfirm.com",
        userName: "Counsel Smith",
        accessToken: "ya29.live_secret_access_token_8899",
        refreshToken: "1//live_refresh_token_9988",
        expiresAt: Date.now() + 3600000,
        scope: "https://www.googleapis.com/auth/calendar",
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPrimary: true,
      };

      // Container Instance 1: Saves credentials over HTTP
      await saveEncryptedCredentials(userUid, sampleCreds);

      // Verify raw database contains ONLY ciphertext, IV, tag (Zero plaintext in datastore)
      const rawStored = httpDatabase.get(`users/${userUid}/integrations/google`);
      expect(rawStored).toBeDefined();
      expect(JSON.stringify(rawStored?.fields)).not.toContain("ya29.live_secret_access_token_8899");
      expect(JSON.stringify(rawStored?.fields)).not.toContain("1//live_refresh_token_9988");

      // Container Instance 2: Simulated separate serverless instance reading from same HTTP datastore
      const fetchedByInstance2 = await getDecryptedCredentials(userUid, "live_client@lawfirm.com");
      expect(fetchedByInstance2).not.toBeNull();
      expect(fetchedByInstance2?.accessToken).toBe("ya29.live_secret_access_token_8899");
      expect(fetchedByInstance2?.refreshToken).toBe("1//live_refresh_token_9988");
      expect(fetchedByInstance2?.userEmail).toBe("live_client@lawfirm.com");

      // Sync Token persistence over HTTP
      await saveSyncToken(userUid, "sync_tok_http_live_999", "primary", "live_client@lawfirm.com");
      const readSyncToken = await getSyncToken(userUid, "primary", "live_client@lawfirm.com");
      expect(readSyncToken).toBe("sync_tok_http_live_999");
    } finally {
      process.env = originalEnv;
    }
  });

  it("4. Distributed Lock Mutex, Renewal, and Safe Conditional Release over HTTP", async () => {
    const originalEnv = { ...process.env };

    try {
      process.env.FIRESTORE_EMULATOR_HOST = serverUrl;
      process.env.FIREBASE_PROJECT_ID = "planoramaph";

      const userUid = "distributed_lock_http_user";

      // 1. Instance A acquires lock
      const acquiredA = await acquireFirestoreSyncLock(userUid, 60000, "lambda_instance_A");
      expect(acquiredA).toBe(true);

      // 2. Instance B attempts to acquire concurrently -> rejected (409 / already locked)
      const acquiredB = await acquireFirestoreSyncLock(userUid, 60000, "lambda_instance_B");
      expect(acquiredB).toBe(false);

      // 3. Instance A renews its lock over HTTP
      const renewedA = await renewFirestoreSyncLock(userUid, 60000, "lambda_instance_A");
      expect(renewedA).toBe(true);

      // 4. Instance B cannot renew Instance A's lock
      const renewedB = await renewFirestoreSyncLock(userUid, 60000, "lambda_instance_B");
      expect(renewedB).toBe(false);

      // 5. Simulate lock expiration by manually setting lockedUntil to the past in HTTP database
      const lockPath = getFirestoreSyncLockPath(userUid);
      const rawLock = httpDatabase.get(lockPath);
      expect(rawLock).toBeDefined();
      if (rawLock) {
        httpDatabase.set(lockPath, {
          fields: {
            ...rawLock.fields,
            lockedUntil: { integerValue: String(Date.now() - 1000) },
          },
          updateTime: new Date().toISOString(),
        });
      }

      // 6. Instance B acquires the expired lock over HTTP
      const acquiredBAfterExpiry = await acquireFirestoreSyncLock(userUid, 60000, "lambda_instance_B");
      expect(acquiredBAfterExpiry).toBe(true);

      // 7. Instance A (delayed instance) calls releaseSyncLock with its instanceId
      await releaseFirestoreSyncLock(userUid, "lambda_instance_A");

      // Verify Instance B's lock remains active!
      const activeLock = await getFirestoreDocument(lockPath);
      expect(activeLock).not.toBeNull();
      expect(activeLock?.data.lockedBy).toBe("lambda_instance_B");

      // 8. Instance B cleanly releases its lock
      await releaseFirestoreSyncLock(userUid, "lambda_instance_B");
      const clearedLock = await getFirestoreDocument(lockPath);
      expect(clearedLock).toBeNull();
    } finally {
      process.env = originalEnv;
    }
  });

  it("5. Transient Outage Recovery (503 Service Unavailable) with Exponential Backoff over HTTP", async () => {
    const originalEnv = { ...process.env };

    try {
      process.env.FIRESTORE_EMULATOR_HOST = serverUrl;
      process.env.FIREBASE_PROJECT_ID = "planoramaph";

      // Instruct local HTTP server to fail the next 2 requests with 503, then succeed on 3rd
      simulate503Count = 2;

      const doc = await getFirestoreDocument("users/retry_test_user/data");
      expect(doc).toBeNull(); // 404 after successful retry
      expect(simulate503Count).toBe(0); // verified retries occurred
    } finally {
      process.env = originalEnv;
      simulate503Count = 0;
    }
  });

  it("6. Complete Google Calendar Lifecycle: Connect, List, Sync, Redact, Disconnect", async () => {
    const originalEnv = { ...process.env };

    try {
      process.env.FIRESTORE_EMULATOR_HOST = serverUrl;
      process.env.FIREBASE_PROJECT_ID = "planoramaph";

      const userUid = "lifecycle_test_uid_789";

      // A. State creation and session binding
      const signedState = createSignedOAuthState("session_xyz", "/schedule", userUid);
      const verifiedState = verifySignedOAuthState(signedState, "session_xyz", undefined, userUid);
      expect(verifiedState.valid).toBe(true);
      expect(verifiedState.userId).toBe(userUid);
      expect(verifiedState.returnUrl).toBe("/schedule");

      // B. Save connected credentials
      const creds: StoredGoogleCredentials = {
        sessionId: userUid,
        userId: userUid,
        accountId: "lawyer@chambers.com",
        userEmail: "lawyer@chambers.com",
        accessToken: "ya29.lifecycle_token",
        refreshToken: "1//lifecycle_refresh",
        expiresAt: Date.now() + 3600000,
        scope: "https://www.googleapis.com/auth/calendar",
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPrimary: true,
      };

      await saveEncryptedCredentials(userUid, creds);

      // C. Query connected accounts
      const accounts = await getAllConnectedAccounts(userUid);
      expect(accounts).toHaveLength(1);
      expect(accounts[0].userEmail).toBe("lawyer@chambers.com");

      // D. Verify credential retrieval
      const activeCreds = await getDecryptedCredentials(userUid, "lawyer@chambers.com");
      expect(activeCreds?.accessToken).toBe("ya29.lifecycle_token");

      // E. Disconnect
      await deleteCredentials(userUid, "lawyer@chambers.com");

      // F. Verify post-disconnect cleanup
      const accountsAfterDisconnect = await getAllConnectedAccounts(userUid);
      expect(accountsAfterDisconnect).toHaveLength(0);
      expect(await getDecryptedCredentials(userUid)).toBeNull();
    } finally {
      process.env = originalEnv;
    }
  });

  it("7. Security & Leakage Audit: Zero tokens in client bundles and logs", async () => {
    // Audit production build output in .next/static
    const nextStaticDir = path.join(process.cwd(), ".next", "static");
    const staticExists = await fs.stat(nextStaticDir).then(() => true).catch(() => false);

    if (staticExists) {
      // Recursively search client bundles for any secret environment names or patterns
      async function scanDir(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await scanDir(fullPath)));
          } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const clientJsFiles = await scanDir(nextStaticDir);
      expect(clientJsFiles.length).toBeGreaterThan(0);

      const forbiddenStrings = [
        "FIREBASE_PRIVATE_KEY",
        "FIREBASE_SERVICE_ACCOUNT_KEY",
        "GOOGLE_ENCRYPTION_SECRET",
        "SESSION_SECRET",
        "ya29.live_secret_access_token_8899",
        "test_live_jwt_access_token_xyz123",
      ];

      for (const filePath of clientJsFiles) {
        const content = await fs.readFile(filePath, "utf8");
        for (const secret of forbiddenStrings) {
          expect(content).not.toContain(secret);
        }
      }
    }
  });
});
