import type { SettingsSectionId } from "@/app/components/settings/settings-workspace";

export type AppView =
  | "dashboard"
  | "day"
  | "month"
  | "year"
  | "yearline"
  | "agenda"
  | "week"
  | "workWeek"
  | "kanban"
  | "settings";

export const DEFAULT_VIEW: AppView = "dashboard";

export const NAV_VIEWS: { id: AppView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "workWeek", label: "Work Weeks" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "yearline", label: "Yearline" },
  { id: "agenda", label: "Agenda" },
  { id: "kanban", label: "Board" },
];

/**
 * Validates whether a given string is a supported application view.
 */
export function isValidView(view: unknown): view is AppView {
  if (typeof view !== "string") return false;
  return NAV_VIEWS.some((v) => v.id === view) || view === "settings";
}

/**
 * Resolves the application view and settings section from a URL query string or URLSearchParams.
 * If no view or an invalid view is provided, safely defaults to "dashboard".
 */
export function resolveViewFromUrl(
  search: string | URLSearchParams | null | undefined
): { view: AppView; section?: SettingsSectionId } {
  if (!search) {
    return { view: DEFAULT_VIEW };
  }
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const rawView = params.get("view");
  const rawSection = params.get("section") as SettingsSectionId | null;

  if (isValidView(rawView)) {
    return {
      view: rawView,
      section: rawSection || undefined,
    };
  }

  return {
    view: DEFAULT_VIEW,
    section: rawSection || undefined,
  };
}

/**
 * Builds the URL search parameters string or relative URL path for a target view.
 * Default view ("dashboard") removes the redundant ?view parameter to keep the root URL clean ("/").
 */
export function buildViewRelativeUrl(
  view: AppView,
  options?: {
    section?: SettingsSectionId;
    currentSearch?: string;
    pathname?: string;
  }
): string {
  const basePath = options?.pathname || "/";
  const params = new URLSearchParams(options?.currentSearch || "");

  if (view === DEFAULT_VIEW) {
    params.delete("view");
  } else {
    params.set("view", view);
  }

  if (view === "settings" && options?.section) {
    params.set("section", options.section);
  } else {
    params.delete("section");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
