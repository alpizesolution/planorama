# Planorama — Google Calendar Integration Setup Guide

This guide provides step-by-step instructions to configure Google Cloud Platform (GCP) and integrate Google Calendar with Planorama for Virtual Assistants and personal scheduling.

---

## 1. Create a Google Cloud Project

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top of the page and select **New Project**.
3. Enter a Project Name (e.g., `Planorama Calendar Integration`).
4. Select your Organization or Billing Account if prompted, and click **Create**.
5. Ensure the newly created project is selected in the top project dropdown.

---

## 2. Enable the Google Calendar API

1. In the Google Cloud Console, open the navigation menu (≡) and select **APIs & Services → Enabled APIs & Services**.
2. Click **+ ENABLE APIS AND SERVICES** at the top.
3. Search for **Google Calendar API**.
4. Click **Google Calendar API** in the results, then click **Enable**.

---

## 3. Configure the OAuth Consent Screen

1. In the left navigation menu, go to **APIs & Services → OAuth consent screen**.
2. Select **User Type**:
   - **Internal**: If you are using Google Workspace and only users within your organization will connect.
   - **External**: Recommended for virtual assistants and personal accounts connecting authorized client calendars.
3. Click **Create**.
4. Fill in the **App Information**:
   - **App name**: `Planorama`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **Save and Continue**.
6. On the **Scopes** step, click **Add or Remove Scopes**:
   - Select or filter for:
     - `.../auth/calendar.events` (View and edit events on authorized calendars)
     - `.../auth/calendar.readonly` (View calendar metadata and read-only calendars)
     - `.../auth/userinfo.email` (Display connected account email)
   - Click **Update**, then **Save and Continue**.
7. On the **Test Users** step:
   - While the app is in "Testing" publishing status, add the Google email addresses of the accounts you plan to connect (e.g., your personal account and client accounts).
   - Click **Save and Continue**.

---

## 4. Create OAuth 2.0 Credentials

1. In the left navigation menu, go to **APIs & Services → Credentials**.
2. Click **+ CREATE CREDENTIALS** at the top and select **OAuth client ID**.
3. For **Application type**, choose **Web application**.
4. Enter a Name (e.g., `Planorama Web Client`).
5. Under **Authorized JavaScript origins**, add:
   - For local development: `http://localhost:3000`
   - For production: `https://your-domain.com`
6. Under **Authorized redirect URIs**, add:
   - For local development: `http://localhost:3000/api/auth/google/callback`
   - For production: `https://your-domain.com/api/auth/google/callback`
7. Click **Create**.
8. A modal will display your **Client ID** and **Client Secret**. Keep these secure and do not share them publicly.

---

## 5. Configure Environment Variables in Planorama

1. In the root directory of the Planorama project, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Populate the required environment variables in `.env.local`:
   ```env
   # Google OAuth 2.0 Credentials
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret

   # Authorized OAuth Redirect URI
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

   # 32-byte encryption key for AES-256-GCM token encryption at rest
   # Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   GOOGLE_ENCRYPTION_SECRET=your_32_byte_hex_secret_here

   # Public App URL
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

---

## 6. Virtual Assistant & Multi-Client Scheduling Workflows

Planorama supports two complementary patterns for Virtual Assistants managing multiple client calendars:

### Pattern A: Multi-Account Direct Connection (Recommended for VAs with delegated Google accounts)
1. In Planorama, open **Settings → Google Calendar Integration**.
2. Click **Connect Google Calendar** to authorize your primary account.
3. Under **Connected Google Accounts**, click **+ Add Another Google Account**.
4. In the Google OAuth account picker, select or sign into the client's Google Account.
5. Grant Calendar authorization.
6. Planorama registers the account alongside your primary account with clear badge identifiers (e.g. `Primary` vs `Client Account`).
7. All calendars across all connected accounts are aggregated with their respective account emails.
8. Each client account can be disconnected independently without affecting other connected accounts.

### Pattern B: Calendar Sharing / Delegation (Recommended when clients share specific calendars)
1. **Client Shares Calendar with VA's Google Account**:
   - The client opens [Google Calendar](https://calendar.google.com/) on desktop.
   - In the left sidebar under "My calendars", the client hovers over the calendar they want to share and clicks the three vertical dots (⋮) → **Settings and sharing**.
   - Under **Share with specific people or groups**, the client clicks **+ Add people and groups**.
   - The client enters the virtual assistant's Google email address.
   - The client selects permissions:
     - **See only free/busy (hide details)**: For availability-only scheduling.
     - **See all event details**: For viewing client appointments.
     - **Make changes to events**: For full two-way scheduling.
   - The client clicks **Send**.

2. **Virtual Assistant Manages in Planorama**:
   - In Planorama **Settings → Google Calendar**, the shared calendar appears automatically.
   - The VA can designate custom colors, toggle sync on/off, or designate a default calendar for new events.
   - The VA can filter views by calendar using the **Calendar** filter dropdown in the toolbar to isolate a single client's events across the Yearline, Month, Week, and Kanban views.

---

## 7. Two-Way Sync, Queueing & Conflict Resolution

Planorama implements an enterprise-grade synchronization engine:

- **Two-Way Synchronization**:
  - Creating, editing, or deleting an event in Planorama pushes changes to the designated Google Calendar.
  - Changes made in Google Calendar (titles, notes, dates, start times, locations, attendees, and recurrence) sync down into Planorama.
- **Durable Client Sync Queue**:
  - Local edits and deletions are persisted to an offline-resilient sync queue (`planorama:sync_queue:v1`).
  - Redundant actions coalesce automatically (e.g., creating and quickly deleting an event cancels before hitting Google API; multiple edits merge into a single update).
  - Automatically drains when the browser comes online or upon manual refresh.
- **Tombstones & Resurrection Prevention**:
  - When an event is removed locally but deletion on Google is disabled, a tombstone records the unlinked Google Event ID.
  - Subsequent incremental syncs will not re-import the deleted event.
- **Safe Conflict Resolution**:
  - If both Planorama and Google Calendar modify the same event between sync intervals, timestamps and pending queue states are compared.
  - If the change is unambiguous, the newer change applies cleanly.
  - If a genuine concurrent conflict occurs, the newer version is preserved and the task is tagged with a `⚠️ Conflict` indicator.
- **Recurrence Support**:
  - Supports Daily, Weekly, Monthly, and Yearly recurrence rules (RFC 5545 `RRULE`).
- **Exponential Backoff**:
  - API rate limits (HTTP 429) and server errors (HTTP 5xx) retry automatically with exponential backoff and jitter.

---

## 8. Security & Data Isolation

- **Zero Client-Side Token Exposure**: Access tokens and refresh tokens are strictly handled server-side and never exposed to browser storage or JavaScript bundles.
- **Encrypted at Rest**: Refresh tokens are stored encrypted using AES-256-GCM authenticated encryption.
- **CSRF Protection**: OAuth requests use HMAC-SHA256 signed `state` parameters bound to the user's authenticated session with expiration timestamps.
- **Read-Only Protection**: Planorama will never attempt write or delete operations on client calendars marked as read-only.
- **Selective Disconnect & Token Revocation**: Disconnecting an account immediately revokes OAuth tokens with Google's API and deletes stored credentials for that account.
