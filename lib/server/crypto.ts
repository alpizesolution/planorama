import crypto from "node:crypto";

/**
 * Server-side cryptographic helper for Planorama.
 *
 * Implements:
 * 1. Authenticated AES-256-GCM encryption at rest for sensitive OAuth tokens.
 * 2. Separate cryptographic keys for token encryption vs. session & OAuth state signing.
 * 3. Enforced environment variable checks in production (no hardcoded fallbacks).
 * 4. Safe secret rotation support with backward-compatible fallback keys.
 * 5. OAuth state signature verification with strict timestamp, session binding, and replay protection.
 * 6. Safe URL redirect validation preventing open redirect vulnerabilities.
 */

export class MissingSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingSecretError";
  }
}

export interface EncryptedPayload {
  iv: string; // Hex-encoded 12-byte initialization vector
  ciphertext: string; // Hex-encoded ciphertext
  tag: string; // Hex-encoded 16-byte authentication tag
  v?: number; // Key version for rotation
}

// Development fallback keys (STRICTLY FORBIDDEN IN PRODUCTION)
const DEV_TOKEN_SECRET = "planorama-dev-token-encryption-secret-32-chars-minimum";
const DEV_SESSION_SECRET = "planorama-dev-session-signing-secret-32-chars-minimum";

let devSecretWarned = false;
function warnDevSecret(secretName: string) {
  if (!devSecretWarned && process.env.NODE_ENV !== "test") {
    console.warn(`[Security Warning] ${secretName} is not set. Using dev secret. Do not run in production!`);
    devSecretWarned = true;
  }
}

/**
 * Derive 32-byte key for token encryption at rest.
 * Throws MissingSecretError in production if GOOGLE_ENCRYPTION_SECRET is missing.
 */
export function getTokenEncryptionKey(fallback = false): Buffer {
  const envKey = fallback ? process.env.GOOGLE_ENCRYPTION_SECRET_FALLBACK : process.env.GOOGLE_ENCRYPTION_SECRET;

  if (!envKey) {
    if (fallback) {
      return Buffer.alloc(0); // No fallback configured
    }
    if (process.env.NODE_ENV === "production") {
      throw new MissingSecretError(
        "GOOGLE_ENCRYPTION_SECRET must be configured and at least 32 characters in production."
      );
    }
    warnDevSecret("GOOGLE_ENCRYPTION_SECRET");
    return crypto.createHash("sha256").update(DEV_TOKEN_SECRET).digest();
  }

  if (process.env.NODE_ENV === "production" && envKey.length < 32) {
    throw new MissingSecretError(
      "GOOGLE_ENCRYPTION_SECRET must be at least 32 characters long in production."
    );
  }

  return crypto.createHash("sha256").update(envKey).digest();
}

/**
 * Derive 32-byte key for session and OAuth state signing.
 * Throws MissingSecretError in production if SESSION_SECRET is missing.
 */
export function getSessionSigningKey(fallback = false): Buffer {
  const envKey = fallback ? process.env.SESSION_SECRET_FALLBACK : process.env.SESSION_SECRET;

  if (!envKey) {
    if (fallback) {
      return Buffer.alloc(0);
    }
    if (process.env.NODE_ENV === "production") {
      throw new MissingSecretError(
        "SESSION_SECRET must be configured and at least 32 characters in production."
      );
    }
    warnDevSecret("SESSION_SECRET");
    return crypto.createHash("sha256").update(DEV_SESSION_SECRET).digest();
  }

  if (process.env.NODE_ENV === "production" && envKey.length < 32) {
    throw new MissingSecretError(
      "SESSION_SECRET must be at least 32 characters long in production."
    );
  }

  return crypto.createHash("sha256").update(envKey).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 */
export function encryptText(plaintext: string): EncryptedPayload {
  const key = getTokenEncryptionKey(false);
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    ciphertext: encrypted.toString("hex"),
    tag: tag.toString("hex"),
    v: 1,
  };
}

/**
 * Decrypt an AES-256-GCM payload.
 * Supports backward-compatible secret rotation via GOOGLE_ENCRYPTION_SECRET_FALLBACK.
 */
export function decryptText(payload: EncryptedPayload): string {
  if (!payload || !payload.iv || !payload.ciphertext || !payload.tag) {
    throw new Error("Invalid encrypted payload structure.");
  }

  const iv = Buffer.from(payload.iv, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const tag = Buffer.from(payload.tag, "hex");

  // 1. Try primary key
  try {
    const key = getTokenEncryptionKey(false);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (primaryErr) {
    // 2. Try rotation fallback key if configured
    const fallbackKey = getTokenEncryptionKey(true);
    if (fallbackKey.length > 0) {
      try {
        const decipherFallback = crypto.createDecipheriv("aes-256-gcm", fallbackKey, iv);
        decipherFallback.setAuthTag(tag);
        const decrypted = Buffer.concat([decipherFallback.update(ciphertext), decipherFallback.final()]);
        return decrypted.toString("utf8");
      } catch {
        // Fallback also failed
      }
    }
    throw primaryErr;
  }
}

/**
 * HMAC-SHA256 signature for session and state data.
 */
export function signString(data: string, useFallback = false): string {
  const key = getSessionSigningKey(useFallback);
  return crypto.createHmac("sha256", key).update(data).digest("base64url");
}

/**
 * Constant-time verification of HMAC-SHA256 signature.
 */
export function verifySignature(data: string, signature: string): boolean {
  if (!data || !signature) return false;

  const expectedSig = signString(data, false);
  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");

  if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return true;
  }

  // Check fallback key for rotation
  const fallbackKey = getSessionSigningKey(true);
  if (fallbackKey.length > 0) {
    const fallbackSig = signString(data, true);
    const fallbackBuffer = Buffer.from(fallbackSig, "utf8");
    if (sigBuffer.length === fallbackBuffer.length && crypto.timingSafeEqual(sigBuffer, fallbackBuffer)) {
      return true;
    }
  }

  return false;
}

/**
 * Strict validation and sanitization of redirect URLs to prevent open redirect vulnerabilities.
 * Allows safe internal paths (e.g. "/" or "/settings") or matching configured origin.
 */
export function validateRedirectUrl(url: string | null | undefined, allowedBaseUrl?: string): string {
  if (!url || typeof url !== "string") {
    return "/";
  }

  const trimmed = url.trim();

  // Prevent CRLF injection and control characters
  if (/[\r\n\t\x00-\x1f]/.test(trimmed)) {
    return "/";
  }

  // Prevent javascript:, data:, vbscript: pseudo-protocols
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return "/";
  }

  // Safe relative paths: must start with single "/" and not "//" (protocol-relative) or "/\"
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    // Whitelist valid URL characters in path
    if (/^\/[a-zA-Z0-9_\-.~%!$&'()*+,;=:@/?#]*$/.test(trimmed)) {
      return trimmed;
    }
    return "/";
  }

  // Absolute URLs: only allowed if matching the app's own origin
  try {
    const parsed = new URL(trimmed);
    const appBase = allowedBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const allowedOrigin = new URL(appBase).origin.toLowerCase();

    if (parsed.origin.toLowerCase() === allowedOrigin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Malformed URL
  }

  return "/";
}

export interface OAuthStatePayload {
  sessionId: string;
  userId?: string;
  timestamp: number;
  nonce: string;
  returnUrl?: string;
}

// Durable in-memory nonce store for replay protection with TTL cleanup
const usedNonces = new Map<string, number>();

/**
 * Consume an OAuth nonce to prevent replay attacks.
 * Returns true if nonce is fresh and consumed; returns false if already used.
 */
export function consumeOAuthNonce(nonce: string, expiresAt: number): boolean {
  const now = Date.now();

  // Prune expired nonces
  if (usedNonces.size > 2000) {
    for (const [n, exp] of usedNonces.entries()) {
      if (exp <= now) {
        usedNonces.delete(n);
      }
    }
  }

  if (usedNonces.has(nonce)) {
    return false; // Replay attack detected!
  }

  usedNonces.set(nonce, expiresAt);
  return true;
}

/**
 * Clear nonces (useful for test isolation).
 */
export function clearOAuthNoncesForTesting(): void {
  usedNonces.clear();
}

/**
 * Create a signed, tamper-proof OAuth state token.
 * Contains session binding, safe return URL, and a cryptographic nonce for replay protection.
 */
export function createSignedOAuthState(
  sessionId: string,
  returnUrl = "/",
  userId?: string
): string {
  const sanitizedReturnUrl = validateRedirectUrl(returnUrl);
  const payload: OAuthStatePayload = {
    sessionId,
    userId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
    returnUrl: sanitizedReturnUrl,
  };

  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json, "utf8").toString("base64url");
  const signature = signString(dataB64);

  return `${dataB64}.${signature}`;
}

/**
 * Verify an incoming OAuth state parameter against the user's active session.
 * Enforces signature validity, session binding, timestamp expiration, and replay protection.
 */
export function verifySignedOAuthState(
  state: string,
  expectedSessionId: string,
  maxAgeMs = 10 * 60 * 1000, // 10 minutes
  expectedUserId?: string
): { valid: boolean; returnUrl?: string; userId?: string; error?: string } {
  if (!state || !state.includes(".")) {
    return { valid: false, error: "Malformed OAuth state parameter." };
  }

  const [dataB64, signature] = state.split(".");
  if (!verifySignature(dataB64, signature)) {
    return { valid: false, error: "Invalid OAuth state signature." };
  }

  try {
    const raw = Buffer.from(dataB64, "base64url").toString("utf8");
    const parsed: OAuthStatePayload = JSON.parse(raw);

    // 1. Cross-user rejection check: If state has a bound userId and expectedUserId is specified, they must match
    if (expectedUserId && parsed.userId && parsed.userId !== expectedUserId) {
      return { valid: false, error: "State user identity does not match authenticated user." };
    }

    // 2. Session / user binding check:
    // If both state and session are bound to the same verified user ID, verify user identity;
    // otherwise require exact session ID match (essential for unauthenticated guest sessions).
    const isUserMatch = Boolean(expectedUserId && parsed.userId && parsed.userId === expectedUserId);
    const isSessionMatch = Boolean(expectedSessionId && parsed.sessionId === expectedSessionId);

    if (!isSessionMatch && !isUserMatch) {
      return { valid: false, error: "State session does not match authenticated user." };
    }

    const now = Date.now();
    // Allow up to 60s future clock drift
    if (parsed.timestamp > now + 60 * 1000) {
      return { valid: false, error: "State timestamp is in the future." };
    }

    if (now - parsed.timestamp > maxAgeMs) {
      return { valid: false, error: "OAuth authorization request has expired. Please try again." };
    }

    // Replay protection check
    const isFresh = consumeOAuthNonce(parsed.nonce, parsed.timestamp + maxAgeMs);
    if (!isFresh) {
      return { valid: false, error: "OAuth state parameter has already been used (replay attack prevented)." };
    }

    const safeUrl = validateRedirectUrl(parsed.returnUrl);
    return { valid: true, returnUrl: safeUrl, userId: parsed.userId };
  } catch {
    return { valid: false, error: "Could not parse OAuth state payload." };
  }
}
