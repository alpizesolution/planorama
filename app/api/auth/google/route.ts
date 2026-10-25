import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/server/session";
import { createSignedOAuthState } from "@/lib/server/crypto";
import { buildGoogleAuthUrl } from "@/lib/server/google-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 authorization flow.
 * Supports connecting primary and client accounts with account selection prompt.
 */
export async function GET(request: Request) {
  try {
    const sessionId = await getOrCreateSessionId();
    const { searchParams } = new URL(request.url);
    const returnUrl = searchParams.get("returnUrl") || "/";

    // Generate signed, tamper-proof state containing sessionId and returnUrl
    const state = createSignedOAuthState(sessionId, returnUrl);
    const authUrl = buildGoogleAuthUrl(state, true);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate Google authorization.";
    console.error("[Auth/Google] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
