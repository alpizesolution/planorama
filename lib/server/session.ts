import { cookies } from "next/headers";
import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "planorama_session_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Retrieves the current user's session ID from the HTTP-only cookie,
 * or generates and assigns a new cryptographically secure session ID.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (existing && isValidSessionId(existing)) {
    return existing;
  }

  const newSessionId = crypto.randomUUID();
  try {
    cookieStore.set(SESSION_COOKIE_NAME, newSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  } catch {
    // In Server Components or route contexts where set is prohibited, return the ID
  }

  return newSessionId;
}

/**
 * Retrieves the verified session ID from request headers or cookies.
 * Throws an error or returns null if no valid session exists.
 */
export async function getVerifiedSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (existing && isValidSessionId(existing)) {
    return existing;
  }
  return null;
}

export function isValidSessionId(id: string): boolean {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}
