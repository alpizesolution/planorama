import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { getAllConnectedAccounts, getSyncMeta } from "@/lib/server/google-token-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/status
 * Returns the current Google Calendar connection status for the authenticated session,
 * including all connected accounts for Virtual Assistants managing multiple clients.
 * Never exposes access tokens or refresh tokens.
 */
export async function GET() {
  try {
    const sessionId = await getVerifiedSessionId();
    if (!sessionId) {
      return NextResponse.json({
        connected: false,
        calendars: [],
        accounts: [],
      });
    }

    const accounts = await getAllConnectedAccounts(sessionId);
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        connected: false,
        calendars: [],
        accounts: [],
      });
    }

    const primaryAccount = accounts.find((a) => a.isPrimary) || accounts[0];
    const syncMeta = await getSyncMeta(sessionId);

    return NextResponse.json({
      connected: true,
      userEmail: primaryAccount?.userEmail || "Connected Google Account",
      connectedAt: primaryAccount?.connectedAt,
      lastSyncTime: syncMeta.lastSyncedAt,
      lastSyncStatus: syncMeta.lastSyncStatus || "idle",
      lastSyncError: syncMeta.lastSyncError,
      accounts: accounts.map((acc) => ({
        accountId: acc.accountId,
        userEmail: acc.userEmail,
        userName: acc.userName,
        userPicture: acc.userPicture,
        isPrimary: Boolean(acc.isPrimary),
        connectedAt: acc.connectedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve status.";
    console.error("[Integrations/Google/Status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
