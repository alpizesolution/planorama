import {
  getDecryptedCredentials,
  saveEncryptedCredentials,
  deleteCredentials,
  getAllConnectedAccounts,
  type StoredGoogleCredentials,
} from "./google-token-store";

// Required OAuth Scopes for Planorama
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
  accountId?: string;
  accountEmail?: string;
}

export interface GoogleEventDateTime {
  date?: string; // "YYYY-MM-DD" for all-day events
  dateTime?: string; // ISO 8601 string for timed events
  timeZone?: string;
}

export interface GoogleEventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
}

export interface GoogleCalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  attendees?: GoogleEventAttendee[];
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  updated?: string;
  etag?: string;
  visibility?: "default" | "public" | "private" | "confidential";
}

export interface GoogleEventsListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export class ReadOnlyCalendarError extends Error {
  constructor(calendarName: string) {
    super(`Cannot modify events on read-only calendar: "${calendarName}".`);
    this.name = "ReadOnlyCalendarError";
  }
}

export class GoogleAuthError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/**
 * Robust fetch wrapper with exponential backoff for temporary rate limits (429) and server errors (5xx).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, init);
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        attempt++;
        const retryAfterHeader = response.headers.get("Retry-After");
        let delayMs = 300 * Math.pow(2, attempt) + Math.random() * 150;
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed)) {
            delayMs = Math.min(parsed * 1000, 10000);
          }
        }
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        const delayMs = 300 * Math.pow(2, attempt) + Math.random() * 150;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Builds the Google OAuth 2.0 authorization URL.
 */
export function buildGoogleAuthUrl(state: string, promptSelectAccount = true): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is missing.");
  }

  const promptValue = promptSelectAccount ? "consent select_account" : "consent";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline", // Request refresh token
    prompt: promptValue, // Force consent screen to guarantee refresh token is returned
    include_granted_scopes: "true",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for access and refresh tokens.
 */
export async function exchangeOAuthCode(
  code: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
  userEmail?: string;
  userName?: string;
  userPicture?: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.");
  }

  const response = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new GoogleAuthError(`Failed to exchange code for tokens: ${errorBody}`, response.status);
  }

  const data = await response.json();
  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string | undefined;
  const expiresIn = (data.expires_in as number) || 3600;
  const scope = (data.scope as string) || "";

  // Query user info for connected email and profile details
  let userEmail: string | undefined;
  let userName: string | undefined;
  let userPicture: string | undefined;

  try {
    const userRes = await fetchWithRetry("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userRes.ok) {
      const userInfo = await userRes.json();
      userEmail = userInfo.email;
      userName = userInfo.name;
      userPicture = userInfo.picture;
    }
  } catch {
    // Non-fatal if userinfo fails
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
    scope,
    userEmail,
    userName,
    userPicture,
  };
}

/**
 * Retrieve a valid access token for the given session and optional accountId.
 * Automatically refreshes the token using the refresh token if expired.
 */
export async function getValidAccessToken(sessionId: string, accountId?: string): Promise<string> {
  const creds = await getDecryptedCredentials(sessionId, accountId);
  if (!creds) {
    throw new GoogleAuthError("No Google Calendar credentials found for this session.", 401);
  }

  // Refresh if within 5 minutes of expiring
  const fiveMinutesMs = 5 * 60 * 1000;
  if (Date.now() + fiveMinutesMs < creds.expiresAt) {
    return creds.accessToken;
  }

  if (!creds.refreshToken) {
    throw new GoogleAuthError("Access token expired and no refresh token is stored. Please reconnect Google Calendar.", 401);
  }

  // Refresh the token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.");
  }

  const response = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 400 || response.status === 401) {
      // Refresh token was likely revoked by user in Google account settings
      await deleteCredentials(sessionId, accountId || creds.accountId);
      throw new GoogleAuthError("Google Calendar access was revoked or expired. Please reconnect.", 401);
    }
    throw new GoogleAuthError(`Failed to refresh token: ${errorBody}`, response.status);
  }

  const data = await response.json();
  const newAccessToken = data.access_token as string;
  const expiresIn = (data.expires_in as number) || 3600;

  const updatedCreds: StoredGoogleCredentials = {
    ...creds,
    accessToken: newAccessToken,
    // Google occasionally issues a new refresh token during refresh
    refreshToken: (data.refresh_token as string) || creds.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    updatedAt: new Date().toISOString(),
  };

  await saveEncryptedCredentials(sessionId, updatedCreds, accountId || creds.accountId);
  return newAccessToken;
}

/**
 * Revoke stored Google tokens and delete credentials for a specific account or the whole session.
 */
export async function revokeAndDisconnect(sessionId: string, accountId?: string): Promise<void> {
  const accountsToRevoke = accountId
    ? [await getDecryptedCredentials(sessionId, accountId)].filter(Boolean)
    : await getAllConnectedAccounts(sessionId);

  for (const acc of accountsToRevoke) {
    if (!acc) continue;
    const tokenToRevoke = acc.refreshToken || acc.accessToken;
    if (tokenToRevoke) {
      try {
        await fetchWithRetry(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Non-fatal if revoke endpoint is unreachable
      }
    }
  }

  await deleteCredentials(sessionId, accountId);
}

/**
 * Fetch list of user's accessible Google Calendars across all connected accounts or for a specific account.
 */
export async function fetchCalendarList(sessionId: string, accountId?: string): Promise<GoogleCalendarItem[]> {
  const allAccounts = await getAllConnectedAccounts(sessionId);
  if (allAccounts.length === 0) {
    // If no multi-account data, try legacy single-account fallback
    const legacyCreds = await getDecryptedCredentials(sessionId);
    if (!legacyCreds) return [];
    allAccounts.push({
      accountId: legacyCreds.accountId || legacyCreds.userEmail || "primary",
      userEmail: legacyCreds.userEmail || "primary@google.com",
      userName: legacyCreds.userName,
      userPicture: legacyCreds.userPicture,
      accessToken: legacyCreds.accessToken,
      refreshToken: legacyCreds.refreshToken,
      expiresAt: legacyCreds.expiresAt,
      scope: legacyCreds.scope,
      connectedAt: legacyCreds.connectedAt,
      updatedAt: legacyCreds.updatedAt,
      isPrimary: true,
    });
  }

  const targetAccounts = accountId
    ? allAccounts.filter((a) => a.accountId === accountId)
    : allAccounts;

  const combinedItems: GoogleCalendarItem[] = [];
  const errors: string[] = [];

  for (const account of targetAccounts) {
    try {
      const accessToken = await getValidAccessToken(sessionId, account.accountId);
      const response = await fetchWithRetry("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GoogleAuthError(`Failed to fetch calendar list for ${account.userEmail}: ${errText}`, response.status);
      }

      const data = await response.json();
      const items = (data.items || []) as Array<{
        id: string;
        summary: string;
        description?: string;
        primary?: boolean;
        accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
        backgroundColor?: string;
        foregroundColor?: string;
        timeZone?: string;
      }>;

      for (const item of items) {
        combinedItems.push({
          id: item.id,
          summary: item.summary || "Untitled Calendar",
          description: item.description,
          primary: Boolean(item.primary),
          accessRole: item.accessRole || "reader",
          backgroundColor: item.backgroundColor,
          foregroundColor: item.foregroundColor,
          timeZone: item.timeZone,
          accountId: account.accountId,
          accountEmail: account.userEmail,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to load calendars for ${account.userEmail}`;
      console.warn(`[GoogleCalendar] Error fetching calendars for ${account.userEmail}:`, msg);
      errors.push(msg);
    }
  }

  if (combinedItems.length === 0 && errors.length > 0) {
    throw new GoogleAuthError(errors.join("; "));
  }

  return combinedItems;
}

export interface FetchEventsOptions {
  syncToken?: string;
  pageToken?: string;
  timeMin?: string;
  timeMax?: string;
  singleEvents?: boolean;
  maxResults?: number;
  accountId?: string;
}

/**
 * Fetch events from a specific Google Calendar.
 * Supports incremental sync via syncToken, pagination, time ranges, and deleted events.
 */
export async function fetchCalendarEvents(
  sessionId: string,
  calendarId: string,
  options: FetchEventsOptions = {}
): Promise<GoogleEventsListResponse & { fullSyncRequired?: boolean }> {
  const accessToken = await getValidAccessToken(sessionId, options.accountId);

  const queryParams = new URLSearchParams();
  queryParams.set("maxResults", String(options.maxResults || 250));

  if (options.syncToken) {
    // Incremental sync
    queryParams.set("syncToken", options.syncToken);
  } else {
    // Full sync window
    queryParams.set("singleEvents", options.singleEvents !== false ? "true" : "false");
    queryParams.set("showDeleted", "true");

    // Default to 1 year back and 2 years forward if not specified
    const now = new Date();
    const defaultMin = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const defaultMax = new Date(now.getFullYear() + 2, 11, 31).toISOString();

    queryParams.set("timeMin", options.timeMin || defaultMin);
    queryParams.set("timeMax", options.timeMax || defaultMax);
    queryParams.set("orderBy", "startTime");
  }

  if (options.pageToken) {
    queryParams.set("pageToken", options.pageToken);
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${queryParams.toString()}`;
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Handle 410 Gone: syncToken has expired or is invalid. Google requires a full re-sync.
  if (response.status === 410) {
    console.warn(`[GoogleCalendar] syncToken expired for calendar "${calendarId}". Requesting full sync.`);
    return fetchCalendarEvents(sessionId, calendarId, {
      ...options,
      syncToken: undefined, // Clear invalid sync token
    }).then((res) => ({ ...res, fullSyncRequired: true }));
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new GoogleAuthError(`Failed to fetch events for calendar "${calendarId}": ${errText}`, response.status);
  }

  const data = await response.json();
  return {
    items: (data.items || []) as GoogleCalendarEvent[],
    nextPageToken: data.nextPageToken,
    nextSyncToken: data.nextSyncToken,
  };
}

export interface GoogleEventPayload {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  recurrence?: string[];
}

/**
 * Insert an event into a Google Calendar.
 * Respects calendar permissions and rejects writes to read-only calendars.
 */
export async function insertCalendarEvent(
  sessionId: string,
  calendarId: string,
  event: GoogleEventPayload,
  accountId?: string
): Promise<GoogleCalendarEvent> {
  const accessToken = await getValidAccessToken(sessionId, accountId);

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (response.status === 403) {
    throw new ReadOnlyCalendarError(calendarId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Google Calendar event: ${errText}`);
  }

  return (await response.json()) as GoogleCalendarEvent;
}

/**
 * Update an existing event in a Google Calendar.
 */
export async function updateCalendarEvent(
  sessionId: string,
  calendarId: string,
  eventId: string,
  event: GoogleEventPayload,
  accountId?: string
): Promise<GoogleCalendarEvent> {
  const accessToken = await getValidAccessToken(sessionId, accountId);

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (response.status === 403) {
    throw new ReadOnlyCalendarError(calendarId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to update Google Calendar event: ${errText}`);
  }

  return (await response.json()) as GoogleCalendarEvent;
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteCalendarEvent(
  sessionId: string,
  calendarId: string,
  eventId: string,
  accountId?: string
): Promise<void> {
  const accessToken = await getValidAccessToken(sessionId, accountId);

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetchWithRetry(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 404 or 410 means event is already gone, which counts as success
  if (response.status === 404 || response.status === 410) {
    return;
  }

  if (response.status === 403) {
    throw new ReadOnlyCalendarError(calendarId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to delete Google Calendar event: ${errText}`);
  }
}
