import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/server/session";
import {
  getAllConnectedAccounts,
  updateAccountCustomDisplayName,
  updateCalendarCustomDisplayName,
} from "@/lib/server/google-token-store";

export const dynamic = "force-dynamic";

interface RenameRequestBody {
  accountId?: string;
  calendarId?: string;
  customDisplayName?: string | null;
}

/**
 * POST /api/integrations/google/rename
 * Allows users to customize the display name of a connected Google Calendar account
 * or individual calendar.
 *
 * Persists the custom display name in Firestore associated with the account ID,
 * without overwriting Google's original email or profile information.
 * Passing an empty string or null resets to the original name fallback.
 */
export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!session) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    let body: RenameRequestBody;
    try {
      body = (await request.json()) as RenameRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { accountId, calendarId, customDisplayName } = body;

    if (!accountId && !calendarId) {
      return NextResponse.json(
        { error: "Either accountId or calendarId must be provided." },
        { status: 400 }
      );
    }

    let updatedAccount = null;

    if (accountId) {
      const userAccounts = await getAllConnectedAccounts(session.userId);
      const isOwned = userAccounts.some(
        (a) => a.accountId === accountId || a.userEmail.toLowerCase() === accountId.toLowerCase()
      );
      if (!isOwned) {
        return NextResponse.json(
          { error: "Account not found or not authorized for this session." },
          { status: 404 }
        );
      }

      updatedAccount = await updateAccountCustomDisplayName(
        session.userId,
        accountId,
        customDisplayName
      );
    }

    if (calendarId) {
      await updateCalendarCustomDisplayName(
        session.userId,
        calendarId,
        customDisplayName
      );
    }

    return NextResponse.json({
      success: true,
      account: updatedAccount
        ? {
            accountId: updatedAccount.accountId,
            userEmail: updatedAccount.userEmail,
            userName: updatedAccount.userName,
            customDisplayName: updatedAccount.customDisplayName,
            isPrimary: Boolean(updatedAccount.isPrimary),
          }
        : undefined,
      calendar: calendarId
        ? {
            id: calendarId,
            customDisplayName: customDisplayName?.trim() || undefined,
          }
        : undefined,
      calendarId: calendarId || undefined,
      customDisplayName: customDisplayName?.trim() || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rename account or calendar.";
    console.error("[Integrations/Google/Rename] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
