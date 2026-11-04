import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { revokeAndDisconnect } from "@/lib/server/google-calendar";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/google/disconnect
 * Revokes Google OAuth tokens and cleans up stored credentials.
 */
export async function POST() {
  try {
    const sessionId = await getVerifiedSessionId();
    if (sessionId) {
      await revokeAndDisconnect(sessionId);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Google Calendar.";
    console.error("[Integrations/Google/Disconnect] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
