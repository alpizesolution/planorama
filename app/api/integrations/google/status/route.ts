import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { getDecryptedCredentials, getSyncMeta } from "@/lib/server/google-token-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/status
 * Returns the current Google Calendar connection status for the authenticated session.
 * Never exposes access tokens or refresh tokens.
 */
export async function GET() {
  try {
    const sessionId = await getVerifiedSessionId();
    if (!sessionId) {
      return NextResponse.json({
        connected: false,
        calendars: [],
      });
    }

    const creds = await getDecryptedCredentials(sessionId);
    if (!creds || (!creds.accessToken && !creds.refreshToken)) {
      return NextResponse.json({
        connected: false,
        calendars: [],
      });
    }

    const syncMeta = await getSyncMeta(sessionId);

    return NextResponse.json({
      connected: true,
      userEmail: creds.userEmail || "Connected Google Account",
      connectedAt: creds.connectedAt,
      lastSyncTime: syncMeta.lastSyncedAt,
      lastSyncStatus: syncMeta.lastSyncStatus || "idle",
      lastSyncError: syncMeta.lastSyncError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve status.";
    console.error("[Integrations/Google/Status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
