import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSessionSigningKey,
  signString,
  verifySignature,
  MissingSecretError,
  createSignedOAuthState,
  verifySignedOAuthState,
  clearOAuthNoncesForTesting,
} from "./crypto";
import {
  encodeSignedSession,
  decodeSignedSession,
  createSignedSessionToken,
  verifySignedSessionToken,
  type SessionData,
} from "./session";

describe("SESSION_SECRET Validation & Cryptographic Session Security", () => {
  const originalEnv = process.env;

  function setNodeEnv(val: string | undefined) {
    (process.env as Record<string, string | undefined>).NODE_ENV = val;
  }

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    clearOAuthNoncesForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Production Strict Secret Validation", () => {
    it("throws MissingSecretError when SESSION_SECRET is undefined in production", () => {
      setNodeEnv("production");
      delete process.env.SESSION_SECRET;

      expect(() => getSessionSigningKey()).toThrow(MissingSecretError);
      expect(() => getSessionSigningKey()).toThrow(
        "SESSION_SECRET must be configured and at least 32 characters in production."
      );
    });

    it("throws MissingSecretError when SESSION_SECRET is empty string in production", () => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = "";

      expect(() => getSessionSigningKey()).toThrow(MissingSecretError);
      expect(() => getSessionSigningKey()).toThrow(
        "SESSION_SECRET must be configured and at least 32 characters in production."
      );
    });

    it("throws MissingSecretError when SESSION_SECRET is shorter than 32 characters in production", () => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = "too-short-secret-1234567890"; // 27 chars

      expect(() => getSessionSigningKey()).toThrow(MissingSecretError);
      expect(() => getSessionSigningKey()).toThrow(
        "SESSION_SECRET must be at least 32 characters long in production."
      );
    });

    it("succeeds when SESSION_SECRET is at least 32 characters in production", () => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = "production_secure_secret_with_more_than_32_characters_12345";

      const key = getSessionSigningKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // SHA-256 derived key is always 32 bytes
    });

    it("allows development fallback secret when NODE_ENV is development", () => {
      setNodeEnv("development");
      delete process.env.SESSION_SECRET;

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const key = getSessionSigningKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("HMAC Signing and Verification with Secret Rotation", () => {
    const primarySecret = "primary_session_secret_that_is_32_chars_or_more_12345";
    const oldSecret = "previous_session_secret_for_rotation_minimum_32_chars";

    beforeEach(() => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = primarySecret;
      delete process.env.SESSION_SECRET_FALLBACK;
    });

    it("signs data with primary secret and verifies successfully", () => {
      const data = "user_session_payload_12345";
      const signature = signString(data);

      expect(typeof signature).toBe("string");
      expect(signature.length).toBeGreaterThan(0);
      expect(verifySignature(data, signature)).toBe(true);
    });

    it("rejects tampered data", () => {
      const data = "user_session_payload_12345";
      const signature = signString(data);

      expect(verifySignature("tampered_data_67890", signature)).toBe(false);
    });

    it("rejects tampered signature", () => {
      const data = "user_session_payload_12345";
      const signature = signString(data);
      const tamperedSig = signature.slice(0, -2) + (signature.endsWith("a") ? "b" : "a");

      expect(verifySignature(data, tamperedSig)).toBe(false);
    });

    it("supports zero-downtime key rotation via SESSION_SECRET_FALLBACK", () => {
      // 1. Sign data with old secret
      process.env.SESSION_SECRET = oldSecret;
      const data = "active_session_before_rotation";
      const oldSignature = signString(data);

      // 2. Rotate to primary secret without fallback -> verification fails
      process.env.SESSION_SECRET = primarySecret;
      delete process.env.SESSION_SECRET_FALLBACK;
      expect(verifySignature(data, oldSignature)).toBe(false);

      // 3. Configure SESSION_SECRET_FALLBACK with old secret -> verification succeeds
      process.env.SESSION_SECRET_FALLBACK = oldSecret;
      expect(verifySignature(data, oldSignature)).toBe(true);

      // 4. Data signed with primary secret also still verifies
      const newSignature = signString(data);
      expect(verifySignature(data, newSignature)).toBe(true);
    });
  });

  describe("Session Token Encoding and Decoding", () => {
    beforeEach(() => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = "production_secure_secret_with_more_than_32_characters_12345";
    });

    it("encodes and decodes valid session data successfully", () => {
      const sessionData: SessionData = {
        sessionId: "sess_abc1234567890def",
        userId: "user_firebase_uid_987",
        isGuest: false,
        email: "user@example.com",
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const token = encodeSignedSession(sessionData);
      expect(token).toContain(".");

      const decoded = decodeSignedSession(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sessionId).toBe(sessionData.sessionId);
      expect(decoded?.userId).toBe(sessionData.userId);
      expect(decoded?.email).toBe(sessionData.email);
    });

    it("returns null for malformed tokens", () => {
      expect(decodeSignedSession("")).toBeNull();
      expect(decodeSignedSession("invalid-token-without-dot")).toBeNull();
      expect(decodeSignedSession("invalid.signature.extra")).toBeNull();
    });

    it("returns null for expired session tokens", () => {
      const expiredSession: SessionData = {
        sessionId: "sess_expired123456789",
        userId: "user_expired_123",
        isGuest: false,
        createdAt: Date.now() - 100000,
        expiresAt: Date.now() - 1000, // In the past
      };

      const token = encodeSignedSession(expiredSession);
      const decoded = decodeSignedSession(token);
      expect(decoded).toBeNull();
    });

    it("createSignedSessionToken creates valid token verifiable by verifySignedSessionToken", () => {
      const token = createSignedSessionToken("sess_quick_check_123456", "user_quick_uid");
      const verified = verifySignedSessionToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.sessionId).toBe("sess_quick_check_123456");
      expect(verified?.userId).toBe("user_quick_uid");
      expect(verified?.isGuest).toBe(false);
    });
  });

  describe("OAuth State Nonce & Session Binding", () => {
    beforeEach(() => {
      setNodeEnv("production");
      process.env.SESSION_SECRET = "production_secure_secret_with_more_than_32_characters_12345";
    });

    it("creates tamper-proof OAuth state bound to session ID and user ID", () => {
      const sessionId = "sess_oauth_test_12345";
      const userId = "user_oauth_test_6789";
      const returnUrl = "/settings";

      const state = createSignedOAuthState(sessionId, returnUrl, userId);
      expect(typeof state).toBe("string");

      const verification = verifySignedOAuthState(state, sessionId, undefined, userId);
      expect(verification.valid).toBe(true);
      expect(verification.returnUrl).toBe(returnUrl);
    });

    it("rejects guest OAuth state if session ID does not match", () => {
      const state = createSignedOAuthState("sess_guest_original", "/");
      const verification = verifySignedOAuthState(state, "sess_guest_attacker");

      expect(verification.valid).toBe(false);
      expect(verification.error).toBe("State session does not match authenticated user.");
    });

    it("rejects OAuth state if user ID does not match", () => {
      const state = createSignedOAuthState("sess_original_12345", "/", "user_original");
      const verification = verifySignedOAuthState(state, "sess_original_12345", undefined, "user_imposter");

      expect(verification.valid).toBe(false);
      expect(verification.error).toBe("State user identity does not match authenticated user.");
    });

    it("prevents replay attacks using single-use nonces", () => {
      const sessionId = "sess_replay_test";
      const state = createSignedOAuthState(sessionId, "/");

      const firstAttempt = verifySignedOAuthState(state, sessionId);
      expect(firstAttempt.valid).toBe(true);

      const replayAttempt = verifySignedOAuthState(state, sessionId);
      expect(replayAttempt.valid).toBe(false);
      expect(replayAttempt.error).toBe("OAuth state parameter has already been used (replay attack prevented).");
    });
  });
});
