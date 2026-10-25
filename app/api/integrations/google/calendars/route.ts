import { NextResponse } from "next/server";
import { getVerifiedSessionId } from "@/lib/server/session";
import { fetchCalendarList, GoogleAuthError } from "@/lib/server/google-calendar";
import type { GoogleCalendarConfig } from "@/lib/google-calendar/types";

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
 */
export async function GET(request: Request) {
  try {
    const sessionId = await getVerifiedSessionId();
    if (!sessionId) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") || undefined;

    const items = await fetchCalendarList(sessionId, accountId);

    const calendars: GoogleCalendarConfig[] = items.map((cal, idx) => ({
      id: cal.id,
      name: cal.summary,
      description: cal.description,
      primary: cal.primary,
      accessRole: cal.accessRole,
      color: cal.backgroundColor || PLANORAMA_ACCENT_COLORS[idx % PLANORAMA_ACCENT_COLORS.length],
      enabled: Boolean(cal.primary), // default primary calendar to enabled
      syncDirection: cal.accessRole === "reader" || cal.accessRole === "freeBusyReader" ? "import_only" : "two_way",
      privacyMode: cal.accessRole === "freeBusyReader" ? "availability_only" : "full_details",
      accountId: cal.accountId,
      accountEmail: cal.accountEmail,
    }));

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
