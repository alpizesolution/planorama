import { NextResponse } from "next/server";
import {
  getVerifiedSession,
  bindSessionToFirebaseUser,
  revokeSession,
} from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session
 * Check current verified session status.
 */
export async function GET() {
  try {
    const session = await getVerifiedSession();
    if (!session) {
      return NextResponse.json({ authenticated: false, isGuest: true });
    }

    return NextResponse.json({
      authenticated: !session.isGuest,
      isGuest: session.isGuest,
      userId: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/auth/session
 * Exchange a client-side Firebase ID token for a verified, signed backend session.
 */
export async function POST(request: Request) {
  try {
    let idToken = "";

    // Check Authorization header or JSON body
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.slice(7).trim();
    } else {
      const body = await request.json().catch(() => ({}));
      idToken = body.idToken;
    }

    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token." }, { status: 400 });
    }

    const session = await bindSessionToFirebaseUser(idToken);

    return NextResponse.json({
      success: true,
      authenticated: true,
      userId: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify session token.";
    console.error("[Auth/Session] Token verification failed:", message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * DELETE /api/auth/session
 * Revoke the current backend session and clear session cookies.
 */
export async function DELETE() {
  try {
    await revokeSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
