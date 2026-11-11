import { NextResponse } from "next/server";
import { getVerifiedSession, encodeSignedSession, SIGNED_SESSION_COOKIE_NAME } from "@/lib/server/session";
import { verifySignedOAuthState } from "@/lib/server/crypto";
import { exchangeOAuthCode } from "@/lib/server/google-calendar";
import { saveEncryptedCredentials } from "@/lib/server/google-token-store";
import { resolveAppBaseUrl } from "@/lib/server/app-url";
import { classifyOAuthCallbackError } from "@/lib/server/oauth-callback-error";
import { isFirestoreConfigured } from "@/lib/server/firestore-store";

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

  // Never throws: a malformed NEXT_PUBLIC_APP_URL falls back to the request origin.
  const baseUrl = resolveAppBaseUrl(url);

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

  let stage: "exchange" | "save" = "exchange";
  try {
    // 2. Verify authenticated session
    const session = await getVerifiedSession();
    if (!session) {
      const redirectUrl = new URL("/", baseUrl);
      redirectUrl.searchParams.set("gcal_error", "session_not_found");
      return NextResponse.redirect(redirectUrl.toString());
    }

    // 3. Verify signed OAuth state (CSRF and session fixation protection)
    const stateVerification = verifySignedOAuthState(state, session.sessionId, undefined, session.userId);
    if (!stateVerification.valid) {
      console.error("[Auth/GoogleCallback] State verification failed:", stateVerification.error);
      const redirectUrl = buildRedirectUrl(stateVerification.returnUrl, baseUrl);
      redirectUrl.searchParams.set("gcal_error", stateVerification.error || "invalid_state");
      return NextResponse.redirect(redirectUrl.toString());
    }

    // 4. Exchange authorization code for tokens
    const tokenResult = await exchangeOAuthCode(code);
    stage = "save";
    const now = new Date().toISOString();
    const accountId = tokenResult.userEmail || "primary";

    // Persist credentials scoped strictly under the verified Firebase UID / user ID
    await saveEncryptedCredentials(
      session.userId,
      {
        sessionId: session.sessionId,
        userId: session.userId,
        accountId,
        userEmail: tokenResult.userEmail,
        userName: tokenResult.userName,
        userPicture: tokenResult.userPicture,
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt: Date.now() + tokenResult.expiresIn * 1000,
        scope: tokenResult.scope,
        connectedAt: now,
        updatedAt: now,
      },
      accountId
    );

    const redirectUrl = buildRedirectUrl(stateVerification.returnUrl, baseUrl);
    redirectUrl.searchParams.set("gcal_status", "connected");
    if (tokenResult.userEmail) {
      redirectUrl.searchParams.set("gcal_account", tokenResult.userEmail);
    }
    const response = NextResponse.redirect(redirectUrl.toString());
    const token = encodeSignedSession(session);
    response.cookies.set(SIGNED_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed.";
    const code = classifyOAuthCallbackError(err, stage, isFirestoreConfigured());
    console.error(`[Auth/GoogleCallback] ${stage} failed (${code}):`, message, err);
    const redirectUrl = new URL("/", baseUrl);
    redirectUrl.searchParams.set("gcal_error", code);
    return NextResponse.redirect(redirectUrl.toString());
  }
}

/**
 * Builds the post-OAuth redirect target. returnUrl comes from the verified,
 * signed state and is already restricted to same-origin relative paths; if it
 * still cannot be parsed, fall back to the app root instead of throwing.
 */
function buildRedirectUrl(returnUrl: string | undefined, baseUrl: string): URL {
  try {
    return new URL(returnUrl || "/", baseUrl);
  } catch {
    return new URL("/", baseUrl);
  }
}
