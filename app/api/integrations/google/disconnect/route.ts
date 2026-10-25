import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { revokeAndDisconnect } from "@/lib/server/google-calendar";

export const dynamic = "force-dynamic";

interface DisconnectBody {
  accountId?: string;
}

/**
 * POST /api/integrations/google/disconnect
 * Revokes Google OAuth tokens and cleans up stored credentials.
 * Supports selective single-account disconnect for virtual assistants.
 */
export async function POST(request: Request) {
  try {
    const sessionId = await getVerifiedSessionId();
    if (sessionId) {
      let accountId: string | undefined;
      try {
        const body = (await request.json()) as DisconnectBody;
        accountId = body.accountId;
      } catch {
        // No body provided, disconnect all
      }

      await revokeAndDisconnect(sessionId, accountId);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Google Calendar.";
    console.error("[Integrations/Google/Disconnect] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
