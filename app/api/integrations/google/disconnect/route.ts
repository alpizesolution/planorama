import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/server/session";
import { revokeAndDisconnect } from "@/lib/server/google-calendar";
import { getAllConnectedAccounts, getSyncMeta, saveSyncMeta } from "@/lib/server/google-token-store";

export const dynamic = "force-dynamic";

interface DisconnectBody {
  accountId?: string;
}

/**
 * POST /api/integrations/google/disconnect
 * Revokes Google OAuth tokens and cleans up stored credentials.
 * Supports selective single-account disconnect for virtual assistants.
 * Verifies account ownership on the server before revoking.
 */
export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!session) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    let accountId: string | undefined;
    try {
      const body = (await request.json()) as DisconnectBody;
      if (body && typeof body.accountId === "string" && body.accountId.trim()) {
        accountId = body.accountId.trim();
      }
    } catch {
      // No body provided, disconnect all
    }

    // If specific account requested, verify it belongs to this user
    if (accountId) {
      const userAccounts = await getAllConnectedAccounts(session.userId);
      const isOwned = userAccounts.some((a) => a.accountId === accountId);
      if (!isOwned) {
        return NextResponse.json(
          { error: "Account not found or not authorized for this session." },
          { status: 404 }
        );
      }
    }

    // Revoke tokens and delete credentials
    await revokeAndDisconnect(session.userId, accountId);

    // Clean up sync tokens for the disconnected account
    if (accountId) {
      const meta = await getSyncMeta(session.userId);
      const updatedTokens: Record<string, string> = {};
      for (const [key, token] of Object.entries(meta.syncTokens || {})) {
        if (!key.startsWith(`${accountId}:`)) {
          updatedTokens[key] = token;
        }
      }
      meta.syncTokens = updatedTokens;
      await saveSyncMeta(session.userId, meta);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Google Calendar.";
    console.error("[Integrations/Google/Disconnect] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
