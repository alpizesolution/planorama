import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PLANORAMA — Calendar Workspace Headers Across All Mobile Views", () => {
  const headerPath = path.resolve(__dirname, "../../app/components/calendar/calendar-workspace-header.tsx");
  const headerContent = fs.readFileSync(headerPath, "utf-8");

  it("1. Shared CalendarWorkspaceHeader Component Structure", () => {
    // Verifies the contract of CalendarWorkspaceHeader
    expect(headerContent).toContain("export function CalendarWorkspaceHeader");
    expect(headerContent).toContain("cal-workspace-header");
    expect(headerContent).toContain("cal-ws-info-row");
    expect(headerContent).toContain("cal-ws-controls-row");
    expect(headerContent).toContain("cal-ws-title-group");
    expect(headerContent).toContain("cal-ws-kicker");
    expect(headerContent).toContain("cal-ws-heading");
    expect(headerContent).toContain("cal-ws-heading-compact");
    expect(headerContent).toContain("cal-ws-nav-cluster");
    expect(headerContent).toContain("cal-ws-picker-wrap");
    expect(headerContent).toContain("cal-ws-picker-input");
  });

  it("2. DayView integrates CalendarWorkspaceHeader and compact All-Day layout", () => {
    const dayViewPath = path.resolve(__dirname, "../../app/components/calendar/day-view.tsx");
    const content = fs.readFileSync(dayViewPath, "utf-8");

    expect(content).toContain("<CalendarWorkspaceHeader");
    expect(content).toContain('kicker="DAILY WORKSPACE"');
    expect(content).toContain("formattedDayTitle");
    expect(content).toContain("formattedDayTitleCompact");
    expect(content).toContain("onNavigateDay(-1)");
    expect(content).toContain("onNavigateDay(1)");
    expect(content).toContain("onResetToToday");
    expect(content).toContain("datePickerValue={currentDateKey}");

    // Compact All-Day section
    expect(content).toContain("allday-add-compact");
    expect(content).toContain("allday-add-full");
    expect(content).toContain("day-allday-container");
    expect(content).toContain("day-allday-label-col");
  });

  it("3. WeekView integrates CalendarWorkspaceHeader with 7-Day and Work Weeks modes", () => {
    const weekViewPath = path.resolve(__dirname, "../../app/components/calendar/week-view.tsx");
    const content = fs.readFileSync(weekViewPath, "utf-8");

    expect(content).toContain("<CalendarWorkspaceHeader");
    expect(content).toContain('isWorkWeek ? "WORK WEEKS CALENDAR" : "WEEKLY WORKSPACE"');
    expect(content).toContain("formattedWeekRangeStr");
    expect(content).toContain("onNavigateWeek(-1)");
    expect(content).toContain("onNavigateWeek(1)");
    expect(content).toContain("onResetToToday");
    expect(content).toContain("week-layout-segmented");

    // All-day grid
    expect(content).toContain("week-allday-row");
    expect(content).toContain("week-allday-label-cell");
  });

  it("4. MonthView integrates CalendarWorkspaceHeader", () => {
    const monthViewPath = path.resolve(__dirname, "../../app/components/calendar/month-view.tsx");
    const content = fs.readFileSync(monthViewPath, "utf-8");

    expect(content).toContain("<CalendarWorkspaceHeader");
    expect(content).toContain('kicker="MONTH WORKSPACE"');
    expect(content).toContain("month-header-badge");
    expect(content).toContain("onNavigateMonth(-1)");
    expect(content).toContain("onNavigateMonth(1)");
    expect(content).toContain("onResetToToday");
    expect(content).toContain("datePickerAriaLabel=\"Jump to month\"");
  });

  it("5. YearView integrates CalendarWorkspaceHeader", () => {
    const yearViewPath = path.resolve(__dirname, "../../app/components/calendar/year-view.tsx");
    const content = fs.readFileSync(yearViewPath, "utf-8");

    expect(content).toContain("<CalendarWorkspaceHeader");
    expect(content).toContain('kicker="FULL YEAR CALENDAR"');
    expect(content).toContain("Yearly Planner");
    expect(content).toContain("onYearChange(-1)");
    expect(content).toContain("onYearChange(1)");
    expect(content).toContain('onYearChange("current")');
  });

  it("6. Yearline in page.tsx integrates CalendarWorkspaceHeader with horizontal scroll controls", () => {
    const pagePath = path.resolve(__dirname, "../../app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    expect(content).toContain("import { CalendarWorkspaceHeader }");
    expect(content).toContain('kicker="UNIFIED ANNUAL PLANNER · ALL 12 MONTHS"');
    expect(content).toContain("scrollYearline(-480)");
    expect(content).toContain("scrollYearline(480)");
    expect(content).toContain("handleYearChange(-1)");
    expect(content).toContain("handleYearChange(1)");
  });

  it("7. AgendaView integrates CalendarWorkspaceHeader with search & filter controls", () => {
    const agendaViewPath = path.resolve(__dirname, "../../app/components/calendar/agenda-view.tsx");
    const content = fs.readFileSync(agendaViewPath, "utf-8");

    expect(content).toContain("<CalendarWorkspaceHeader");
    expect(content).toContain('kicker="CHRONOLOGICAL SCHEDULE"');
    expect(content).toContain("agenda-filter-toolbar");
    expect(content).toContain("agenda-search-box");
    expect(content).toContain("agenda-type-filter-tabs");
  });

  it("8. globals.css contains unified styles and responsive mobile rules for CalendarWorkspaceHeader", () => {
    const cssPath = path.resolve(__dirname, "../../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    expect(cssContent).toContain(".cal-workspace-header");
    expect(cssContent).toContain(".cal-ws-info-row");
    expect(cssContent).toContain(".cal-ws-controls-row");
    expect(cssContent).toContain(".cal-ws-nav-cluster");
    expect(cssContent).toContain(".cal-ws-picker-wrap");
    expect(cssContent).toContain(".allday-add-compact");
    expect(cssContent).toContain(".allday-add-full");

    // Check media queries for mobile and ultra-narrow
    expect(cssContent).toContain("@media (max-width: 768px)");
    expect(cssContent).toContain("@media (max-width: 360px)");
  });
});
