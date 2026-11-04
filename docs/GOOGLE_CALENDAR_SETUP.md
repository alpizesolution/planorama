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

## 6. Virtual Assistant Workflow: Sharing Client Calendars

To manage client calendars without requiring clients to share sensitive passwords:

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

2. **Virtual Assistant Connects in Planorama**:
   - The VA logs into Planorama and opens **Settings → Integrations → Google Calendar**.
   - Clicks **Connect Google Calendar** and grants authorization.
   - All shared client calendars automatically appear under **Select Calendars to Sync**.
   - The VA can assign distinct colors (e.g. Blue for Personal, Pink for Client A, Emerald for Client B) and select whether to sync in two directions or view as read-only.

---

## 7. Security Best Practices

- **Zero Client-Side Token Exposure**: Access tokens and refresh tokens are strictly handled server-side and never exposed to the browser.
- **Encrypted at Rest**: Refresh tokens are stored encrypted using AES-256-GCM.
- **CSRF Protection**: OAuth requests use HMAC-SHA256 signed `state` parameters bound to the user's authenticated session.
- **Read-Only Protection**: Planorama will never attempt write or delete operations on client calendars marked as read-only.
- **Revocation on Disconnect**: Clicking **Disconnect** in Settings immediately revokes OAuth tokens with Google's API and deletes stored credentials.
