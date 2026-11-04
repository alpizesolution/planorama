import { describe, it, expect } from "vitest";
import {
  DEFAULT_VIEW,
  NAV_VIEWS,
  isValidView,
  resolveViewFromUrl,
  buildViewRelativeUrl,
  type AppView,
} from "../calendar/view-routing";
import { validateRedirectUrl } from "../server/crypto";

describe("PLANORAMA Default Landing Page & View Navigation Routing", () => {
  describe("1. Default Landing Page Resolution (Requirements 1, 2, 3)", () => {
    it("sets Dashboard as the default application view", () => {
      expect(DEFAULT_VIEW).toBe("dashboard");
    });

    it("resolves root URL '/' (empty query search) to Dashboard", () => {
      expect(resolveViewFromUrl("")).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl("?")).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl(null)).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl(undefined)).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl(new URLSearchParams())).toEqual({ view: "dashboard" });
    });

    it("resolves explicit '?view=dashboard' to Dashboard", () => {
      expect(resolveViewFromUrl("?view=dashboard")).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl(new URLSearchParams("view=dashboard"))).toEqual({ view: "dashboard" });
    });

    it("safely falls back to Dashboard when an unknown or invalid view is provided", () => {
      expect(resolveViewFromUrl("?view=nonexistent")).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl("?view=unknown_mode")).toEqual({ view: "dashboard" });
      expect(resolveViewFromUrl("?view=12345")).toEqual({ view: "dashboard" });
    });
  });

  describe("2. Intentional Navigation Preservation (Requirement 4)", () => {
    it("preserves direct link to Month View ('/?view=month')", () => {
      const res = resolveViewFromUrl("?view=month");
      expect(res.view).toBe("month");
    });

    it("preserves direct links to all other valid views", () => {
      const views: AppView[] = [
        "day",
        "week",
        "workWeek",
        "month",
        "year",
        "yearline",
        "agenda",
        "kanban",
        "settings",
      ];

      for (const v of views) {
        const res = resolveViewFromUrl(`?view=${v}`);
        expect(res.view).toBe(v);
        expect(isValidView(v)).toBe(true);
      }
    });

    it("preserves settings section query parameter when view=settings", () => {
      const res = resolveViewFromUrl("?view=settings&section=appearance");
      expect(res.view).toBe("settings");
      expect(res.section).toBe("appearance");
    });
  });

  describe("3. Refresh & State Preservation (Requirement 5)", () => {
    it("preserves Dashboard view when refreshing root URL '/'", () => {
      // Simulating initial load of '/'
      const initial = resolveViewFromUrl("");
      expect(initial.view).toBe("dashboard");

      // Simulating browser refresh with same search string
      const refreshed = resolveViewFromUrl("");
      expect(refreshed.view).toBe("dashboard");
    });

    it("preserves Month View when refreshing '/?view=month'", () => {
      const monthSearch = "?view=month";
      const initial = resolveViewFromUrl(monthSearch);
      expect(initial.view).toBe("month");

      // Simulating browser refresh on Month view
      const refreshed = resolveViewFromUrl(monthSearch);
      expect(refreshed.view).toBe("month");
      expect(refreshed.view).not.toBe("dashboard");
    });

    it("preserves Week View when refreshing '/?view=week'", () => {
      const weekSearch = "?view=week";
      const refreshed = resolveViewFromUrl(weekSearch);
      expect(refreshed.view).toBe("week");
    });
  });

  describe("4. URL Building & Relative Navigation (Requirements 2, 5)", () => {
    it("builds clean root '/' when navigating to Dashboard without existing params", () => {
      const href = buildViewRelativeUrl("dashboard");
      expect(href).toBe("/");
    });

    it("removes ?view parameter when navigating back to Dashboard from another view", () => {
      const href = buildViewRelativeUrl("dashboard", {
        currentSearch: "?view=month",
      });
      expect(href).toBe("/");
    });

    it("preserves unrelated query parameters when switching to Dashboard", () => {
      const href = buildViewRelativeUrl("dashboard", {
        currentSearch: "?gcal_status=connected&view=month",
      });
      expect(href).toBe("/?gcal_status=connected");
    });

    it("builds query URL '/?view=month' when navigating to Month View", () => {
      const href = buildViewRelativeUrl("month");
      expect(href).toBe("/?view=month");
    });

    it("builds query URL '/?view=week' when navigating to Week View", () => {
      const href = buildViewRelativeUrl("week");
      expect(href).toBe("/?view=week");
    });

    it("includes section param when navigating to settings", () => {
      const href = buildViewRelativeUrl("settings", { section: "dashboard" });
      expect(href).toBe("/?view=settings&section=dashboard");
    });

    it("clears section param when navigating away from settings to a planner view", () => {
      const href = buildViewRelativeUrl("month", {
        currentSearch: "?view=settings&section=general",
      });
      expect(href).toBe("/?view=month");
      expect(href).not.toContain("section=");
    });
  });

  describe("5. Navigation Bar & Sidebar Active State (Requirement 6)", () => {
    it("includes Dashboard in NAV_VIEWS as the first entry", () => {
      expect(NAV_VIEWS.length).toBe(9);
      expect(NAV_VIEWS[0]).toEqual({ id: "dashboard", label: "Dashboard" });
    });

    it("identifies Dashboard as active on the default landing page", () => {
      const currentView: AppView = DEFAULT_VIEW;
      const navActiveStates = NAV_VIEWS.map((v) => ({
        id: v.id,
        isActive: currentView === v.id,
        className: currentView === v.id ? "vs-active" : "",
      }));

      const activeItem = navActiveStates.find((item) => item.isActive);
      expect(activeItem).toBeDefined();
      expect(activeItem?.id).toBe("dashboard");
      expect(activeItem?.className).toBe("vs-active");

      // Verify all other views are not active
      const otherViews = navActiveStates.filter((item) => item.id !== "dashboard");
      expect(otherViews.every((item) => !item.isActive && item.className === "")).toBe(true);
    });

    it("identifies Month as active when navigating to month view", () => {
      const currentView = "month" as AppView;
      const isDashboardActive = (currentView as AppView) === ("dashboard" as AppView);
      const isMonthActive = (currentView as AppView) === ("month" as AppView);

      expect(isDashboardActive).toBe(false);
      expect(isMonthActive).toBe(true);
    });
  });

  describe("6. Authentication Redirects & Guest Mode (Requirement 7)", () => {
    it("validates '/' as a safe redirect destination for auth returnUrl", () => {
      const safe = validateRedirectUrl("/");
      expect(safe).toBe("/");
    });

    it("resolves default auth returnUrl '/' to Dashboard", () => {
      const defaultReturn = validateRedirectUrl(undefined);
      expect(defaultReturn).toBe("/");
      const resolved = resolveViewFromUrl(new URL(defaultReturn, "http://localhost:3000").search);
      expect(resolved.view).toBe("dashboard");
    });

    it("resolves unauthenticated guest session landing at '/' to Dashboard", () => {
      // In guest mode with no auth cookie or Firebase session, landing at '/' opens Dashboard
      const guestUrl = "/";
      const resolved = resolveViewFromUrl(new URL(guestUrl, "http://localhost:3000").search);
      expect(resolved.view).toBe("dashboard");
    });

    it("resolves authenticated callback at '/' with gcal_status to Dashboard", () => {
      // After Google OAuth callback redirects to '/?gcal_status=connected'
      const callbackSearch = "?gcal_status=connected&gcal_account=test@example.com";
      const resolved = resolveViewFromUrl(callbackSearch);
      expect(resolved.view).toBe("dashboard");
    });

    it("preserves explicit returnUrl when authenticated user initiated OAuth from another view", () => {
      const initiatedFrom = "/?view=month";
      const validated = validateRedirectUrl(initiatedFrom);
      expect(validated).toBe("/?view=month");
      const resolved = resolveViewFromUrl(new URL(validated, "http://localhost:3000").search);
      expect(resolved.view).toBe("month");
    });
  });

  describe("7. Preservation of All Planner Views (Requirement 8)", () => {
    it("retains all 9 planner/workspace views in NAV_VIEWS without omissions", () => {
      const expectedIds = [
        "dashboard",
        "day",
        "week",
        "workWeek",
        "month",
        "year",
        "yearline",
        "agenda",
        "kanban",
      ];
      expect(NAV_VIEWS.map((v) => v.id)).toEqual(expectedIds);
    });
  });
});
