# PLANORAMA — Comprehensive Application-Wide UI/UX Responsive Audit

**Date:** November 2026  
**Status:** Audit Complete — Ready for Systemic Optimization  
**Target Viewports:** 320×568, 375×667, 390×844, 430×932 (Mobile) | 768×1024, 1024×768 (Tablet) | 1366×768, 1440×900, 1920×1080 (Desktop / Large Desktop)

---

## 1. Executive Summary

PLANORAMA is a feature-rich, neo-brutalist personal planning and calendar application built with Next.js, React, and Lucide/Phosphor icons. While the desktop interface boasts vibrant color schemes, clear typography, and rich scheduling tools, several layout bottlenecks, fixed dimensions, horizontal overflow risks, and touch-unfriendly controls degrade the experience on tablet and mobile viewports.

This audit categorizes issues across the 8 required core areas, establishing the blueprints for the application-wide responsive design system and view optimizations.

---

## 2. Global Layout & Navigation Audit

### Current Findings & Issues
1. **Top Header Button Squishing (< 1024px):**
   - The top header (`.sticky-header`) renders 9 view-switcher buttons side-by-side (`Dashboard`, `Day`, `Week`, `Work Weeks`, `Month`, `Year`, `Yearline`, `Agenda`, `Kanban`).
   - On screens < 1024px, these wrap into an unergonomic horizontally-scrolling strip where buttons shrink below comfortable tap sizes.
   - On mobile (320–430px), having 9 views in the top bar creates visual clutter and high cognitive load.
2. **Missing Mobile Safe-Area & Viewport Fit:**
   - `app/layout.tsx` lacks `viewportFit: "cover"` in its `Viewport` metadata, causing controls near top and bottom edges to be obscured by iOS home bars and notches.
3. **No Cohesive Mobile Bottom Navigation:**
   - Modern mobile SaaS applications use a clean bottom navigation bar for primary destinations (`Dashboard`, `Calendar`, `Tasks/Board`, `Agenda`) with an accessible **"+ Create"** action and a **More** drawer for secondary views (`Day`, `Week`, `Work Weeks`, `Year`, `Yearline`, `Settings`).

---

## 3. Calendar Sidebar & Drawer Audit

### Current Findings & Issues
1. **Sidebar Drawer Backdrop Overlay Gap:**
   - While `.calendar-sidebar-backdrop` and `.is-open-mobile` existed in styles, the overlay lacked full-screen modal behavior, allowing click-through or leaving users stuck without an intuitive way to dismiss the drawer by tapping outside.
2. **Touch Targets & Close Controls:**
   - Calendar toggle checkboxes, account rename trigger buttons, and month mini-nav buttons in the sidebar measured under 36px, below the recommended 44×44px touch target guidelines.
3. **Desktop Reflow Continuity:**
   - Collapsing the sidebar on desktop functions well, but tablet transition points (768px–1024px) occasionally produced awkward intermediate column widths (235px).

---

## 4. Planner Views Audit

### 4.1 Dashboard
- **Grid Layout:** Uses CSS grid that works on desktop, but needs responsive column wrapping: 1 column on mobile (< 768px), 2 columns on tablet (768–1023px), and multi-column on desktop (>= 1024px).
- **Drag-and-Drop:** Native desktop HTML5 drag-and-drop handles (`.dashboard-widget-direct-handle`) lack touch drag handles or quick order options for mobile touchscreens.

### 4.2 Day View
- **Hourly Timeline Axis:** Time axis and hourly event containers need responsive height and font-scaling.
- **Scroll Containment:** The timeline container needs touch scroll physics (`-webkit-overflow-scrolling: touch`) and clear time labels at 320px–375px.

### 4.3 Week & Work Weeks View
- **Severe 7-Column Cramp on Mobile:**
  - Rendering 7 hourly columns side-by-side on a 375px or 320px screen allocates only ~35–45px per day, making events illegible and impossible to tap.
  - **Solution Required:** Provide an adaptive mobile day selector pill bar (Monday ... Sunday) with quick day switching on viewports < 768px, while preserving the full 7-day (or 5-day) desktop timeline for viewports >= 768px.
  - Work Weeks needs Monday–Friday mobile navigation while ensuring weekend tasks remain accessible.

### 4.4 Month View
- **Cell Density:** Desktop cells display title text pills; mobile screens switch to dots, but **tapping a date on mobile currently does not render a selected date details card/panel**, leaving mobile users unaware of event details.
- **Solution Required:** Add a mobile selected date expansion panel below the grid to review, edit, or create events for the selected day.

### 4.5 Year & Yearline Views
- **Year Grid:** `.year-grid` was hardcoded to `repeat(3, minmax(0, 1fr))` across all viewports. On 320px screens, this squeezes each month card into 90px width, causing mini calendar dates to overlap.
  - **Solution Required:** Responsive breakpoints: 1 column on mobile (< 540px), 2 columns on tablet (540–900px), 3 columns on desktop, 4 columns on large screens.
- **Yearline:** The 12-month horizontal scroll works well on desktop, but requires smooth touch panning, snap alignment, and touch scroll cues on mobile/tablet.

### 4.6 Agenda View
- **Chronological List:** Clean structure, but date headers, event color pills, and action buttons need minimum 44px tap targets and responsive padding to prevent overflow on 320px devices.

### 4.7 Kanban View
- **3 Narrow Columns on Mobile:**
  - 3 columns side-by-side on mobile devices squeeze cards into narrow 90px strips.
  - **Solution Required:** Add a responsive mobile column selector tab bar (`To Do (N) | In Progress (N) | Done (N)`) on viewports < 768px so cards occupy full usable width, while keeping 3 columns side-by-side on viewports >= 768px.

---

## 5. Forms, Modals & Dialogs Audit

1. **Unified Create Modal (`UnifiedCreateModal`):**
   - Modal card has fixed minimum widths that cause overflow on 320px viewports.
   - On screens < 640px, modal should transition into an accessible bottom sheet (`max-height: 92vh; border-radius: 16px 16px 0 0;`) with native-feeling touch scroll.
2. **Task / Event Detail Modal:**
   - Uses grid for fields that should stack vertically on small screens.
   - Form inputs and action buttons need 16px font-size to prevent iOS Safari auto-zooming on focus.
3. **Touch Targets & Validation:**
   - Touch buttons need minimum 44×44px touch targets.
   - Error banners must remain visible within viewport bounds without getting pushed off-screen.

---

## 6. Implementation Action Plan

- **Phase 2:** Responsive Design System tokens, safe-area variables, typography scales, touch target minimums.
- **Phase 3:** Responsive Navigation (Desktop top nav preserved; Mobile compact bottom nav bar + More sheet + slide-over calendar drawer).
- **Phase 4:** Optimize all 8 views (Dashboard grid, Day timeline, Week/Work Weeks mobile day selector, Month mobile selected date drawer, Year adaptive grid, Yearline touch scroll, Agenda responsive list, Kanban mobile column tabs).
- **Phase 5:** Forms and Modals bottom-sheet styling and touch accessibility.
- **Phase 6:** Calendar Sidebar drawer polish with backdrop and touch targets.
- **Phase 7:** Neo-brutalist visual polish, hierarchy, contrast, and animations.
- **Phase 8:** Comprehensive verification across 9 viewports and build testing.
