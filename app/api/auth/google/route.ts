import { NextResponse } from "next/server";
import { getOrCreateSession, encodeSignedSession, SIGNED_SESSION_COOKIE_NAME } from "@/lib/server/session";
import { createSignedOAuthState, validateRedirectUrl } from "@/lib/server/crypto";
import { buildGoogleAuthUrl } from "@/lib/server/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 authorization flow.
 * Supports connecting primary and client accounts with account selection prompt.
 * Enforces safe redirect validation and session-bound state with replay protection.
 */
export async function GET(request: Request) {
  try {
    const session = await getOrCreateSession();
    const { searchParams } = new URL(request.url);

    // Validate returnUrl strictly to prevent open redirects
    const rawReturnUrl = searchParams.get("returnUrl");
    const returnUrl = validateRedirectUrl(rawReturnUrl);

    // Generate signed, tamper-proof state containing sessionId, userId, returnUrl, and fresh nonce
    const state = createSignedOAuthState(session.sessionId, returnUrl, session.userId);
    const authUrl = buildGoogleAuthUrl(state, true);

    const response = NextResponse.redirect(authUrl);
    const token = encodeSignedSession(session);
    response.cookies.set(SIGNED_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate Google authorization.";
    console.error("[Auth/Google] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
