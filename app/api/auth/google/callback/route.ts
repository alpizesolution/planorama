import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { verifySignedOAuthState } from "@/lib/server/crypto";
import { exchangeOAuthCode } from "@/lib/server/google-calendar";
import { saveEncryptedCredentials } from "@/lib/server/google-token-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback
 * Handles the redirect from Google OAuth consent screen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;

  // 1. Handle user decline or Google error
  if (error) {
    console.warn("[Auth/GoogleCallback] Google returned error:", error);
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code || !state) {
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", "missing_code_or_state");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // 2. Verify authenticated session
  const sessionId = await getVerifiedSessionId();
  if (!sessionId) {
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", "session_not_found");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // 3. Verify signed OAuth state (CSRF and session fixation protection)
  const stateVerification = verifySignedOAuthState(state, sessionId);
  if (!stateVerification.valid) {
    console.error("[Auth/GoogleCallback] State verification failed:", stateVerification.error);
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", stateVerification.error || "invalid_state");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // 4. Exchange authorization code for tokens
  try {
    const tokenResult = await exchangeOAuthCode(code);
    const now = new Date().toISOString();

    await saveEncryptedCredentials(sessionId, {
      sessionId,
      userEmail: tokenResult.userEmail,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: Date.now() + tokenResult.expiresIn * 1000,
      scope: tokenResult.scope,
      connectedAt: now,
      updatedAt: now,
    });

    const destination = stateVerification.returnUrl || "/";
    const redirectUrl = new URL(destination, baseUrl);
    redirectUrl.searchParams.set("gcal_status", "connected");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed.";
    console.error("[Auth/GoogleCallback] Exchange failed:", message);
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
