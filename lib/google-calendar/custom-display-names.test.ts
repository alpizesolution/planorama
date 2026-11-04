import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveEncryptedCredentials,
  getAllConnectedAccounts,
  updateAccountCustomDisplayName,
  updateCalendarCustomDisplayName,
  getSyncMeta,
  deleteCredentials,
} from "../server/google-token-store";
import type { StoredGoogleCredentials } from "../server/google-token-store";
import type { GoogleCalendarConfig, ConnectedGoogleAccount } from "./types";

let mockSessionUserId: string | null = null;

vi.mock("@/lib/server/session", () => ({
  getVerifiedSession: vi.fn(async () => {
    if (!mockSessionUserId) return null;
    return {
      sessionId: "mock_session_1234567890123456",
      userId: mockSessionUserId,
      isGuest: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
  }),
}));

describe("PLANORAMA — Custom Calendar & Account Display Names", () => {
  let testOwnerId: string;
  let personalAccount: StoredGoogleCredentials;
  let clientAAccount: StoredGoogleCredentials;
  let clientBAccount: StoredGoogleCredentials;

  beforeEach(async () => {
    testOwnerId = `va_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    personalAccount = {
      sessionId: testOwnerId,
      accountId: "google_sub_1001",
      userEmail: "charizza.montero@gmail.com",
      userName: "Charizza Montero",
      accessToken: "ya29.personal_access_token",
      refreshToken: "personal_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: true,
    };

    clientAAccount = {
      sessionId: testOwnerId,
      accountId: "google_sub_2002",
      userEmail: "client.marketing@brand.com",
      userName: "Brand Client A",
      accessToken: "ya29.client_a_access_token",
      refreshToken: "client_a_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: false,
    };

    clientBAccount = {
      sessionId: testOwnerId,
      accountId: "google_sub_3003",
      userEmail: "ops.clientb@enterprises.org",
      userName: "Enterprise Client B",
      accessToken: "ya29.client_b_access_token",
      refreshToken: "client_b_refresh_token",
      expiresAt: Date.now() + 3600000,
      scope: "https://www.googleapis.com/auth/calendar",
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPrimary: false,
    };

    // Setup test accounts
    await saveEncryptedCredentials(testOwnerId, personalAccount);
    await saveEncryptedCredentials(testOwnerId, clientAAccount);
    await saveEncryptedCredentials(testOwnerId, clientBAccount);
  });

  afterEach(async () => {
    // Clean up
    await deleteCredentials(testOwnerId);
  });

  describe("1. Custom Account Display Names & Multi-Client VA Isolation", () => {
    it("allows users to assign custom display names to connected Google accounts by accountId", async () => {
      const updated = await updateAccountCustomDisplayName(
        testOwnerId,
        "google_sub_1001",
        "My Personal Calendar"
      );

      expect(updated).not.toBeNull();
      expect(updated?.customDisplayName).toBe("My Personal Calendar");
      expect(updated?.userEmail).toBe("charizza.montero@gmail.com");
      expect(updated?.userName).toBe("Charizza Montero");

      // Verify persistent retrieval
      const accounts = await getAllConnectedAccounts(testOwnerId);
      const personal = accounts.find((a) => a.accountId === "google_sub_1001");
      expect(personal?.customDisplayName).toBe("My Personal Calendar");
      expect(personal?.userEmail).toBe("charizza.montero@gmail.com");
    });

    it("supports multi-client virtual assistant workflow with independent display names", async () => {
      // VA renames each client account independently
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_1001", "My Personal Calendar");
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Marketing");
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_3003", "Client B – Operations");

      const accounts = await getAllConnectedAccounts(testOwnerId);
      expect(accounts).toHaveLength(3);

      const personal = accounts.find((a) => a.accountId === "google_sub_1001");
      const clientA = accounts.find((a) => a.accountId === "google_sub_2002");
      const clientB = accounts.find((a) => a.accountId === "google_sub_3003");

      // Verify independent custom display names
      expect(personal?.customDisplayName).toBe("My Personal Calendar");
      expect(clientA?.customDisplayName).toBe("Client A – Marketing");
      expect(clientB?.customDisplayName).toBe("Client B – Operations");

      // Verify original emails and Google identities were NOT overwritten
      expect(personal?.userEmail).toBe("charizza.montero@gmail.com");
      expect(personal?.userName).toBe("Charizza Montero");

      expect(clientA?.userEmail).toBe("client.marketing@brand.com");
      expect(clientA?.userName).toBe("Brand Client A");

      expect(clientB?.userEmail).toBe("ops.clientb@enterprises.org");
      expect(clientB?.userName).toBe("Enterprise Client B");
    });

    it("renaming one client account never alters another client account", async () => {
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Marketing");

      // Now rename client A to a new quarter focus
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Q4 Launch");

      const accounts = await getAllConnectedAccounts(testOwnerId);
      const clientA = accounts.find((a) => a.accountId === "google_sub_2002");
      const clientB = accounts.find((a) => a.accountId === "google_sub_3003");

      expect(clientA?.customDisplayName).toBe("Client A – Q4 Launch");
      expect(clientB?.customDisplayName).toBeUndefined(); // client B was untouched
    });
  });

  describe("2. Persistence Across OAuth Credential Refreshes & Reconnections", () => {
    it("preserves custom display names when Google credentials refresh or reconnect", async () => {
      // 1. Assign custom name
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Marketing");

      // 2. Simulate Google token refresh or reconnecting credentials (new access token, updated expiry)
      const refreshedCredentials = {
        ...clientAAccount,
        accessToken: "ya29.new_refreshed_access_token_999",
        expiresAt: Date.now() + 7200000,
        // Incoming OAuth payload does NOT have customDisplayName
      };

      await saveEncryptedCredentials(testOwnerId, refreshedCredentials);

      // 3. Verify custom display name was preserved!
      const accounts = await getAllConnectedAccounts(testOwnerId);
      const clientA = accounts.find((a) => a.accountId === "google_sub_2002");
      expect(clientA?.customDisplayName).toBe("Client A – Marketing");
      expect(clientA?.accessToken).toBe("ya29.new_refreshed_access_token_999");
    });
  });

  describe("3. Reset to Original Name Fallback", () => {
    it("restores original Google account fallback when resetting custom name", async () => {
      // 1. Set custom name
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_1001", "Custom Name To Remove");
      let accounts = await getAllConnectedAccounts(testOwnerId);
      expect(accounts.find((a) => a.accountId === "google_sub_1001")?.customDisplayName).toBe("Custom Name To Remove");

      // 2. Reset custom name by passing null or empty string
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_1001", null);

      accounts = await getAllConnectedAccounts(testOwnerId);
      const personal = accounts.find((a) => a.accountId === "google_sub_1001");
      expect(personal?.customDisplayName).toBeUndefined();
      expect(personal?.userEmail).toBe("charizza.montero@gmail.com");
      expect(personal?.userName).toBe("Charizza Montero");
    });
  });

  describe("4. Calendar-Level Custom Display Names", () => {
    it("persists and resets calendar-level custom display names in sync metadata", async () => {
      const calendarId = "project_cal_444@group.calendar.google.com";

      // Save custom name for calendar
      const updatedMeta = await updateCalendarCustomDisplayName(
        testOwnerId,
        calendarId,
        "Quarterly Roadmap"
      );

      expect(updatedMeta.customCalendarNames?.[calendarId]).toBe("Quarterly Roadmap");

      // Retrieve via getSyncMeta
      const fetchedMeta = await getSyncMeta(testOwnerId);
      expect(fetchedMeta.customCalendarNames?.[calendarId]).toBe("Quarterly Roadmap");

      // Reset calendar custom name
      const resetMeta = await updateCalendarCustomDisplayName(
        testOwnerId,
        calendarId,
        ""
      );
      expect(resetMeta.customCalendarNames?.[calendarId]).toBeUndefined();
    });
  });

  describe("5. Sidebar Label Resolution & Search Query Matching", () => {
    it("resolves custom account display name as primary label and email as secondary label", () => {
      const primaryCal: Partial<GoogleCalendarConfig> = {
        id: "charizza.montero@gmail.com",
        name: "charizza.montero@gmail.com",
        primary: true,
        accessRole: "owner",
        accountId: "google_sub_1001",
        accountEmail: "charizza.montero@gmail.com",
        accountCustomDisplayName: "My Personal Calendar",
      };

      const clientPrimaryCal: Partial<GoogleCalendarConfig> = {
        id: "client.marketing@brand.com",
        name: "client.marketing@brand.com",
        primary: true,
        accessRole: "writer",
        accountId: "google_sub_2002",
        accountEmail: "client.marketing@brand.com",
        accountCustomDisplayName: "Client A – Marketing",
      };

      const clientSubCal: Partial<GoogleCalendarConfig> = {
        id: "editorial_cal@group.calendar.google.com",
        name: "Editorial Calendar",
        primary: false,
        accessRole: "writer",
        accountId: "google_sub_2002",
        accountEmail: "client.marketing@brand.com",
        accountCustomDisplayName: "Client A – Marketing",
      };

      const customRenamedCal: Partial<GoogleCalendarConfig> = {
        id: "custom_cal@group.calendar.google.com",
        name: "Old Team Sync",
        customDisplayName: "Client A – Weekly Standups",
        primary: false,
        accessRole: "writer",
        accountId: "google_sub_2002",
        accountEmail: "client.marketing@brand.com",
      };

      function resolveLabels(cal: Partial<GoogleCalendarConfig>, matchingAccount?: Partial<ConnectedGoogleAccount>) {
        const accountCustomName = matchingAccount?.customDisplayName || cal.accountCustomDisplayName;
        const calendarCustomName = cal.customDisplayName;

        let primaryLabel = cal.name || "";
        const secondaryLabel = cal.accountEmail;

        if (calendarCustomName) {
          primaryLabel = calendarCustomName;
        } else if (accountCustomName) {
          if (
            cal.primary ||
            !cal.name ||
            cal.name.toLowerCase() === cal.accountEmail?.toLowerCase() ||
            cal.name.toLowerCase() === matchingAccount?.userEmail?.toLowerCase() ||
            cal.name.toLowerCase() === matchingAccount?.userName?.toLowerCase()
          ) {
            primaryLabel = accountCustomName;
          } else {
            primaryLabel = `${accountCustomName} – ${cal.name}`;
          }
        }
        return { primaryLabel, secondaryLabel };
      }

      // 1. Primary personal calendar becomes "My Personal Calendar"
      const res1 = resolveLabels(primaryCal, {
        accountId: "google_sub_1001",
        userEmail: "charizza.montero@gmail.com",
        customDisplayName: "My Personal Calendar",
      });
      expect(res1.primaryLabel).toBe("My Personal Calendar");
      expect(res1.secondaryLabel).toBe("charizza.montero@gmail.com");

      // 2. Client primary calendar replaces raw email with custom account name
      const res2 = resolveLabels(clientPrimaryCal, {
        accountId: "google_sub_2002",
        userEmail: "client.marketing@brand.com",
        customDisplayName: "Client A – Marketing",
      });
      expect(res2.primaryLabel).toBe("Client A – Marketing");
      expect(res2.secondaryLabel).toBe("client.marketing@brand.com");

      // 3. Client secondary calendar prefixes with client account name
      const res3 = resolveLabels(clientSubCal, {
        accountId: "google_sub_2002",
        userEmail: "client.marketing@brand.com",
        customDisplayName: "Client A – Marketing",
      });
      expect(res3.primaryLabel).toBe("Client A – Marketing – Editorial Calendar");
      expect(res3.secondaryLabel).toBe("client.marketing@brand.com");

      // 4. Custom renamed calendar takes precedence over default name
      const res4 = resolveLabels(customRenamedCal);
      expect(res4.primaryLabel).toBe("Client A – Weekly Standups");
    });

    it("filters and matches search query by custom display names as well as email and original name", () => {
      const cals: Partial<GoogleCalendarConfig>[] = [
        {
          id: "cal1",
          name: "charizza.montero@gmail.com",
          primary: true,
          accountEmail: "charizza.montero@gmail.com",
          accountCustomDisplayName: "My Personal Calendar",
        },
        {
          id: "cal2",
          name: "client.marketing@brand.com",
          primary: true,
          accountEmail: "client.marketing@brand.com",
          accountCustomDisplayName: "Client A – Marketing",
        },
        {
          id: "cal3",
          name: "ops.clientb@enterprises.org",
          primary: true,
          accountEmail: "ops.clientb@enterprises.org",
          accountCustomDisplayName: "Client B – Operations",
        },
      ];

      function searchCalendars(query: string) {
        const q = query.toLowerCase().trim();
        return cals.filter((cal) => {
          const matchesName = Boolean(cal.name?.toLowerCase().includes(q));
          const matchesEmail = Boolean(cal.accountEmail?.toLowerCase().includes(q));
          const matchesId = Boolean(cal.id?.toLowerCase().includes(q));
          const matchesAccountCustom = Boolean(cal.accountCustomDisplayName?.toLowerCase().includes(q));
          const matchesCalendarCustom = Boolean(cal.customDisplayName?.toLowerCase().includes(q));
          return matchesName || matchesEmail || matchesId || matchesAccountCustom || matchesCalendarCustom;
        });
      }

      // Search by custom display name "Marketing"
      const matchMarketing = searchCalendars("Marketing");
      expect(matchMarketing).toHaveLength(1);
      expect(matchMarketing[0].id).toBe("cal2");

      // Search by custom display name "Personal"
      const matchPersonal = searchCalendars("Personal");
      expect(matchPersonal).toHaveLength(1);
      expect(matchPersonal[0].id).toBe("cal1");

      // Search by original email "enterprises.org"
      const matchEmail = searchCalendars("enterprises.org");
      expect(matchEmail).toHaveLength(1);
      expect(matchEmail[0].id).toBe("cal3");
    });
  });

  describe("6. Disconnect & Selective Account Reconnection", () => {
    it("preserves other client accounts when disconnecting one client, and re-linking respects new credentials", async () => {
      // Name both clients
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Marketing");
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_3003", "Client B – Operations");

      // Disconnect Client A only
      await deleteCredentials(testOwnerId, "google_sub_2002");

      let accounts = await getAllConnectedAccounts(testOwnerId);
      expect(accounts.find((a) => a.accountId === "google_sub_2002")).toBeUndefined();
      expect(accounts.find((a) => a.accountId === "google_sub_3003")?.customDisplayName).toBe("Client B – Operations");

      // Reconnect Client A with new authorization
      const newClientA: StoredGoogleCredentials = {
        ...clientAAccount,
        accessToken: "ya29.brand_new_token_after_reconnect",
      };
      await saveEncryptedCredentials(testOwnerId, newClientA);

      // Client A is reconnected
      accounts = await getAllConnectedAccounts(testOwnerId);
      expect(accounts.find((a) => a.accountId === "google_sub_2002")?.accessToken).toBe("ya29.brand_new_token_after_reconnect");

      // Re-assign name
      await updateAccountCustomDisplayName(testOwnerId, "google_sub_2002", "Client A – Reconnected");
      accounts = await getAllConnectedAccounts(testOwnerId);
      expect(accounts.find((a) => a.accountId === "google_sub_2002")?.customDisplayName).toBe("Client A – Reconnected");
      expect(accounts.find((a) => a.accountId === "google_sub_3003")?.customDisplayName).toBe("Client B – Operations");
    });
  });

  describe("7. HTTP POST /api/integrations/google/rename Route Handler", () => {
    it("handles account renaming and validation via route handler", async () => {
      const { POST } = await import("../../app/api/integrations/google/rename/route");

      // 1. Unauthenticated request returns 401
      mockSessionUserId = null;
      const unauthReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "google_sub_1001", customDisplayName: "New Name" }),
      });
      const unauthRes = await POST(unauthReq);
      expect(unauthRes.status).toBe(401);

      // Authenticate session for subsequent tests
      mockSessionUserId = testOwnerId;

      // 2. Missing body properties (no accountId and no calendarId)
      const badReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDisplayName: "New Name" }),
      });
      const badRes = await POST(badReq);
      expect(badRes.status).toBe(400);

      // 3. Invalid JSON body
      const invalidJsonReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json{",
      });
      const invalidJsonRes = await POST(invalidJsonReq);
      expect(invalidJsonRes.status).toBe(400);

      // 4. Unauthorized / non-existent account returns 404
      const notFoundReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "unknown_account_999", customDisplayName: "Brand Name" }),
      });
      const notFoundRes = await POST(notFoundReq);
      expect(notFoundRes.status).toBe(404);

      // 5. Successful account rename
      const renameReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "google_sub_2002", customDisplayName: "Client A – Marketing" }),
      });
      const renameRes = await POST(renameReq);
      expect(renameRes.status).toBe(200);
      const renameData = await renameRes.json();
      expect(renameData.success).toBe(true);
      expect(renameData.account?.customDisplayName).toBe("Client A – Marketing");
      expect(renameData.account?.userEmail).toBe("client.marketing@brand.com");

      // 6. Reset account custom display name to original via API
      const resetReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "google_sub_2002", customDisplayName: "" }),
      });
      const resetRes = await POST(resetReq);
      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);
      expect(resetData.account?.customDisplayName).toBeUndefined();

      // 7. Successful calendar rename
      const calReq = new Request("http://localhost/api/integrations/google/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: "cal_marketing_tasks", customDisplayName: "Marketing Tasks" }),
      });
      const calRes = await POST(calReq);
      expect(calRes.status).toBe(200);
      const calData = await calRes.json();
      expect(calData.success).toBe(true);
      expect(calData.calendar?.id).toBe("cal_marketing_tasks");
      expect(calData.calendar?.customDisplayName).toBe("Marketing Tasks");
    });
  });
});


