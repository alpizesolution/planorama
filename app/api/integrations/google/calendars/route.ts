import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/server/session";
import { fetchCalendarList, GoogleAuthError } from "@/lib/server/google-calendar";
import { getAllConnectedAccounts, getSyncMeta, saveSyncMeta } from "@/lib/server/google-token-store";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";
import { isHolidayCalendar } from "@/lib/calendar/item-classifier";

export const dynamic = "force-dynamic";

const PLANORAMA_ACCENT_COLORS = [
  "#3b5bff", // Blue
  "#ff3d8b", // Pink
  "#b8f04a", // Lime
  "#ffe14d", // Yellow
  "#b98cff", // Purple
  "#7cc4ff", // Sky
  "#ff7a1a", // Orange
  "#10b981", // Emerald
];

/**
 * GET /api/integrations/google/calendars
 * Fetches user-accessible calendars from Google across all connected accounts
 * (personal, secondary, and shared client calendars).
 * Strictly enforces user authorization and account ownership on the server.
 */
export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!session) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedAccountId = searchParams.get("accountId")?.trim() || undefined;

    // Verify requested account belongs to this user
    if (requestedAccountId) {
      const userAccounts = await getAllConnectedAccounts(session.userId);
      const isOwned = userAccounts.some((a) => a.accountId === requestedAccountId);
      if (!isOwned) {
        return NextResponse.json(
          { error: "Account not found or not authorized for this session." },
          { status: 403 }
        );
      }
    }

    const items = await fetchCalendarList(session.userId, requestedAccountId);

    let customNames: Record<string, string> = {};
    try {
      const meta = await getSyncMeta(session.userId);
      meta.verifiedCalendars = {
        items,
        cachedAt: Date.now(),
      };
      await saveSyncMeta(session.userId, meta);
      customNames = meta.customCalendarNames || {};
    } catch {
      // Non-fatal cache failure
    }

    const userAccounts = await getAllConnectedAccounts(session.userId);
    const accountsById = new Map(userAccounts.map((a) => [a.accountId, a]));
    const accountsByEmail = new Map(userAccounts.map((a) => [a.userEmail.toLowerCase(), a]));

    const calendars: GoogleCalendarConfig[] = items.map((cal, idx) => {
      const acc =
        (cal.accountId ? accountsById.get(cal.accountId) : undefined) ||
        (cal.accountEmail ? accountsByEmail.get(cal.accountEmail.toLowerCase()) : undefined);

      return {
        id: cal.id,
        name: cal.summary,
        customDisplayName: customNames[cal.id] || undefined,
        accountCustomDisplayName: acc?.customDisplayName,
        description: cal.description,
        primary: cal.primary,
        accessRole: cal.accessRole,
        color: cal.backgroundColor || PLANORAMA_ACCENT_COLORS[idx % PLANORAMA_ACCENT_COLORS.length],
        enabled: Boolean(cal.primary), // default primary calendar to enabled
        syncDirection: cal.accessRole === "reader" || cal.accessRole === "freeBusyReader" ? "import_only" : "two_way",
        privacyMode: cal.accessRole === "freeBusyReader" ? "availability_only" : "full_details",
        accountId: cal.accountId || acc?.accountId,
        accountEmail: cal.accountEmail || acc?.userEmail,
        isHolidayCalendar: isHolidayCalendar(cal),
      };
    });

    return NextResponse.json({ calendars });
  } catch (error) {
    if (error instanceof GoogleAuthError && error.statusCode === 401) {
      return NextResponse.json({ error: "Google Calendar authorization expired. Please reconnect." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Failed to load calendars.";
    console.error("[Integrations/Google/Calendars] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
