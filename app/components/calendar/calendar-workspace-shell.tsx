"use client";

import React, { type ComponentProps } from "react";
import { CalendarSidebar } from "./calendar-sidebar";

export interface CalendarWorkspaceShellProps {
  view: string;
  sidebarOpen: boolean;
  sidebarProps: ComponentProps<typeof CalendarSidebar>;
  children: React.ReactNode;
}

/**
 * CalendarWorkspaceShell
 *
 * Unified layout contract across all 8 Planorama workspaces:
 * Dashboard, Day, Week, Month, Year, Yearline, Agenda, and Kanban.
 *
 * Ensures:
 * 1. Single persistent CalendarSidebar instance without duplicate DOM nodes.
 * 2. Exactly one attached chevron toggle beside the sidebar right edge.
 * 3. Consistent layout reflow: workspace naturally expands when sidebar collapses.
 * 4. Shared calendar visibility, Google connection status, and date selection state.
 */
export function CalendarWorkspaceShell({
  view,
  sidebarOpen,
  sidebarProps,
  children,
}: CalendarWorkspaceShellProps) {
  return (
    <div
      className={`month-workspace-container ${view}-workspace-container ${
        sidebarOpen ? "sidebar-open" : "sidebar-collapsed"
      }`}
      id={`workspace-${view}`}
    >
      <CalendarSidebar {...sidebarProps} />
      <div className={`${view}-workspace-main workspace-main`}>
        {children}
      </div>
    </div>
  );
}
