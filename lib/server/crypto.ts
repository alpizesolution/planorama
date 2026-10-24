import crypto from "node:crypto";

/**
 * Server-side cryptographic helper for Planorama.
 *
 * Implements authenticated AES-256-GCM encryption at rest for sensitive tokens,
 * and HMAC-SHA256 signature verification for OAuth state parameters (CSRF prevention).
 */

export interface EncryptedPayload {
  iv: string; // Hex-encoded 12-byte initialization vector
  ciphertext: string; // Hex-encoded ciphertext
  tag: string; // Hex-encoded 16-byte authentication tag
}

// Derive a fixed 32-byte key from the configured secret (or fallback dev secret)
function getDerivedKey(): Buffer {
  const secret = process.env.GOOGLE_ENCRYPTION_SECRET || process.env.SESSION_SECRET || "planorama-default-dev-secret-change-in-production-32b";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 */
export function encryptText(plaintext: string): EncryptedPayload {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    ciphertext: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypt an AES-256-GCM payload.
 * Throws an Error if the ciphertext has been altered, the key is wrong, or the tag fails.
 */
export function decryptText(payload: EncryptedPayload): string {
  const key = getDerivedKey();
  const iv = Buffer.from(payload.iv, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const tag = Buffer.from(payload.tag, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

export interface OAuthStatePayload {
  sessionId: string;
  timestamp: number;
  nonce: string;
  returnUrl?: string;
}

/**
 * Create a signed, tamper-proof OAuth state token.
 * Contains session binding and a timestamp with a maximum lifetime of 10 minutes.
 */
export function createSignedOAuthState(sessionId: string, returnUrl = "/"): string {
  const key = getDerivedKey();
  const payload: OAuthStatePayload = {
    sessionId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
    returnUrl,
  };

  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json, "utf8").toString("base64url");
  const hmac = crypto.createHmac("sha256", key).update(dataB64).digest("base64url");

  return `${dataB64}.${hmac}`;
}

/**
 * Verify an incoming OAuth state parameter against the user's active session.
 */
export function verifySignedOAuthState(
  state: string,
  expectedSessionId: string,
  maxAgeMs = 10 * 60 * 1000 // 10 minutes
): { valid: boolean; returnUrl?: string; error?: string } {
  if (!state || !state.includes(".")) {
    return { valid: false, error: "Malformed OAuth state parameter." };
  }

  const [dataB64, signature] = state.split(".");
  const key = getDerivedKey();
  const expectedSig = crypto.createHmac("sha256", key).update(dataB64).digest("base64url");

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: "Invalid OAuth state signature." };
  }

  try {
    const raw = Buffer.from(dataB64, "base64url").toString("utf8");
    const parsed: OAuthStatePayload = JSON.parse(raw);

    if (parsed.sessionId !== expectedSessionId) {
      return { valid: false, error: "State session does not match authenticated user." };
    }

    if (Date.now() - parsed.timestamp > maxAgeMs) {
      return { valid: false, error: "OAuth authorization request has expired. Please try again." };
    }

    return { valid: true, returnUrl: parsed.returnUrl || "/" };
  } catch {
    return { valid: false, error: "Could not parse OAuth state payload." };
  }
}
