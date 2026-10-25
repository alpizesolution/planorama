import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import { signString, verifySignature } from "./crypto";
import { verifyFirebaseIdToken, type VerifiedFirebaseUser } from "./firebase-verify";

export const SIGNED_SESSION_COOKIE_NAME = "planorama_session";
export const LEGACY_SESSION_COOKIE_NAME = "planorama_session_id";

// 14 days session duration
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export interface SessionData {
  sessionId: string;
  userId: string; // Verified Firebase UID, or "guest_<sessionId>"
  isGuest: boolean;
  firebaseUid?: string;
  email?: string;
  name?: string;
  picture?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Validates a session ID format (hex or UUID or base64url).
 */
export function isValidSessionId(id: string): boolean {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

/**
 * Serializes and cryptographically signs a session payload.
 */
export function encodeSignedSession(data: SessionData): string {
  const json = JSON.stringify(data);
  const dataB64 = Buffer.from(json, "utf8").toString("base64url");
  const signature = signString(dataB64);
  return `${dataB64}.${signature}`;
}

/**
 * Creates a signed session token string for a session ID and user ID.
 */
export function createSignedSessionToken(sessionId: string, userId: string): string {
  const now = Date.now();
  return encodeSignedSession({
    sessionId,
    userId,
    isGuest: userId.startsWith("guest_"),
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  });
}

/**
 * Decodes and cryptographically verifies a signed session token.
 */
export function decodeSignedSession(token: string): SessionData | null {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [dataB64, signature] = token.split(".");
  if (!verifySignature(dataB64, signature)) {
    return null;
  }

  try {
    const raw = Buffer.from(dataB64, "base64url").toString("utf8");
    const data: SessionData = JSON.parse(raw);

    if (!data.sessionId || !isValidSessionId(data.sessionId) || !data.userId) {
      return null;
    }

    const now = Date.now();
    if (data.expiresAt && data.expiresAt <= now) {
      return null; // Expired session
    }

    return data;
  } catch {
    return null;
  }
}

export function verifySignedSessionToken(token: string): SessionData | null {
  return decodeSignedSession(token);
}

/**
 * Creates a new guest session object.
 */
function createNewGuestSession(): SessionData {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  return {
    sessionId,
    userId: `guest_${sessionId}`,
    isGuest: true,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

/**
 * Sets the signed session cookie with strict security flags.
 */
async function writeSessionCookie(session: SessionData): Promise<void> {
  const token = encodeSignedSession(session);
  try {
    const cookieStore = await cookies();
    cookieStore.set(SIGNED_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  } catch {
    // Read-only server component contexts or test environments
  }
}

/**
 * Retrieves the current user's session data from:
 * 1. Authorization: Bearer <firebaseIdToken> header (if present)
 * 2. Signed session cookie (planorama_session)
 * 3. Legacy session cookie (planorama_session_id) with automatic migration to signed cookie
 *
 * If no session exists, creates and persists a new guest session.
 */
export async function getOrCreateSession(): Promise<SessionData> {
  const verified = await getVerifiedSession();
  if (verified) {
    return verified;
  }

  const newSession = createNewGuestSession();
  await writeSessionCookie(newSession);
  return newSession;
}

/**
 * Retrieves and verifies the active session.
 * Returns null if no valid, unexpired session exists.
 */
export async function getVerifiedSession(): Promise<SessionData | null> {
  // 1. Check Authorization Bearer header for direct Firebase ID token verification
  try {
    const reqHeaders = await headers();
    const authHeader = reqHeaders.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const bearerToken = authHeader.slice(7).trim();

      // Check if it's a signed session token first
      const sessionFromBearer = decodeSignedSession(bearerToken);
      if (sessionFromBearer) {
        return sessionFromBearer;
      }

      // Check if it's a Firebase ID token
      try {
        const verifiedFirebase = await verifyFirebaseIdToken(bearerToken);
        const now = Date.now();
        return {
          sessionId: `fb_${verifiedFirebase.uid}`,
          userId: verifiedFirebase.uid,
          isGuest: false,
          firebaseUid: verifiedFirebase.uid,
          email: verifiedFirebase.email,
          name: verifiedFirebase.name,
          picture: verifiedFirebase.picture,
          createdAt: now,
          expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
        };
      } catch {
        // Bearer token was neither a valid session token nor a valid Firebase ID token
      }
    }
  } catch {
    // Headers unavailable in context
  }

  // 2. Check signed cookie
  try {
    const cookieStore = await cookies();
    const signedCookie = cookieStore.get(SIGNED_SESSION_COOKIE_NAME)?.value;
    if (signedCookie) {
      const decoded = decodeSignedSession(signedCookie);
      if (decoded) {
        return decoded;
      }
    }

    // 3. Backward-compatibility: Check legacy unsigned session cookie and migrate
    const legacyCookie = cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;
    if (legacyCookie && isValidSessionId(legacyCookie)) {
      const now = Date.now();
      const migratedSession: SessionData = {
        sessionId: legacyCookie,
        userId: `guest_${legacyCookie}`,
        isGuest: true,
        createdAt: now,
        expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
      };
      await writeSessionCookie(migratedSession);
      return migratedSession;
    }
  } catch {
    // Cookies unavailable in context (e.g. test environment)
  }

  return null;
}

/**
 * Upgrades the current session by verifying a client-supplied Firebase ID token.
 * Protects against session fixation by generating a new session ID while preserving state.
 */
export async function bindSessionToFirebaseUser(idToken: string): Promise<SessionData> {
  const verifiedUser: VerifiedFirebaseUser = await verifyFirebaseIdToken(idToken);
  const now = Date.now();

  // Get previous guest session ID if any for data migration
  const previousSession = await getVerifiedSession();
  const previousSessionId = previousSession?.sessionId;

  // New session ID on auth transition (session fixation protection)
  const newSessionId = crypto.randomUUID();

  const upgradedSession: SessionData = {
    sessionId: newSessionId,
    userId: verifiedUser.uid,
    isGuest: false,
    firebaseUid: verifiedUser.uid,
    email: verifiedUser.email,
    name: verifiedUser.name,
    picture: verifiedUser.picture,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  };

  await writeSessionCookie(upgradedSession);

  // If previous guest session had connected Google accounts, migrate them to the Firebase UID
  if (previousSessionId && previousSessionId !== newSessionId) {
    try {
      const { migrateSessionOwnership } = await import("./google-token-store");
      await migrateSessionOwnership(previousSessionId, upgradedSession.userId);
    } catch (err) {
      console.warn("[Session] Non-fatal: guest token migration failed:", err);
    }
  }

  return upgradedSession;
}

/**
 * Revokes the session and clears cookies on logout.
 */
export async function revokeSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SIGNED_SESSION_COOKIE_NAME);
    cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
  } catch {
    // Server component context or test context
  }
}

/**
 * Legacy compatibility helper for existing code expecting a single string session ID.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const session = await getOrCreateSession();
  return session.sessionId;
}

export async function getVerifiedSessionId(): Promise<string | null> {
  const session = await getVerifiedSession();
  return session ? session.sessionId : null;
}
