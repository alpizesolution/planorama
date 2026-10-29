"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Sliders,
  Palette,
  PaintBrushBroad,
  SquaresFour,
  CalendarCheck,
  Database,
  CaretUp,
  CaretDown,
  Eye,
  EyeSlash,
  ArrowCounterClockwise,
  DownloadSimple,
  UploadSimple,
  Trash,
  Plus,
} from "@phosphor-icons/react";
import type {
  PlannerPreferences,
  PlannerTask,
} from "@/lib/schedule/types";
import {
  TASK_OPTIONS,
  getOptionEmoji,
  getOptionLabel,
} from "@/lib/schedule/task-options";
import type {
  CalendarThemeSettings,
  CalendarThemePreset,
  MonthColorMode,
} from "@/lib/calendar/calendar-themes";
import {
  THEME_PRESET_METADATA,
  DEFAULT_CALENDAR_THEME,
  getResolvedTheme,
  getMonthColor,
  resetToThemeDefault,
  restorePlanoramaDefaults,
} from "@/lib/calendar/calendar-themes";
import { ItemColorsSettings } from "@/app/components/calendar/item-colors-settings";
import {
  DEFAULT_ITEM_COLORS,
  DEFAULT_ITEM_STYLES,
} from "@/lib/calendar/item-color";
import { GoogleCalendarSettings } from "@/app/components/google-calendar-settings";
import type { DashboardWidgetId } from "@/lib/dashboard/types";
import {
  DASHBOARD_WIDGET_METADATA,
  DEFAULT_DASHBOARD_WIDGETS,
  resolveDashboardWidgets,
} from "@/lib/dashboard/types";
import type { TaskLabel } from "@/app/page";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "item_styles"
  | "dashboard"
  | "calendar_sync"
  | "data_backup";

export interface TaskTemplateItem {
  id: string;
  name: string;
  title: string;
  notes: string;
  priority: PlannerTask["priority"];
  recurrence: PlannerTask["recurrence"];
}

export interface SettingsWorkspaceProps {
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
  onReturnToPlanner: () => void;
  preferences: PlannerPreferences;
  onSavePreferences: (next: PlannerPreferences) => void;
  labels: TaskLabel[];
  onAddLabel: () => void;
  onDeleteLabel: (id: string) => void;
  onRestoreDefaults: () => void;
  onSyncGoogle: () => Promise<void>;
  isSyncingGoogle: boolean;
  showToast: (msg: string) => void;
  onError: (err: string) => void;
  onExportBackup?: () => Promise<void> | void;
  onImportBackup?: (file: File) => Promise<void> | void;
  taskTemplates?: TaskTemplateItem[];
  onDeleteTemplate?: (id: string) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SECTIONS_CONFIG: {
  id: SettingsSectionId;
  label: string;
  shortDesc: string;
  icon: typeof Sliders;
}[] = [
  {
    id: "general",
    label: "General",
    shortDesc: "Defaults, priorities & labels",
    icon: Sliders,
  },
  {
    id: "appearance",
    label: "Appearance & Themes",
    shortDesc: "Themes, headers & calendar colors",
    icon: Palette,
  },
  {
    id: "item_styles",
    label: "Calendar Item Styles",
    shortDesc: "Tile styles & category colors",
    icon: PaintBrushBroad,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    shortDesc: "Widget layout & visibility",
    icon: SquaresFour,
  },
  {
    id: "calendar_sync",
    label: "Calendar & Sync",
    shortDesc: "Google Calendar & 2-way sync",
    icon: CalendarCheck,
  },
  {
    id: "data_backup",
    label: "Data & Backup",
    shortDesc: "Export, import & templates",
    icon: Database,
  },
];

export function SettingsWorkspace({
  activeSection,
  onSelectSection,
  onReturnToPlanner,
  preferences,
  onSavePreferences,
  labels,
  onAddLabel,
  onDeleteLabel,
  onRestoreDefaults,
  onSyncGoogle,
  isSyncingGoogle,
  showToast,
  onError,
  onExportBackup,
  onImportBackup,
  taskTemplates = [],
  onDeleteTemplate,
}: SettingsWorkspaceProps) {
  const [showCustomThemeColors, setShowCustomThemeColors] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const disabled = preferences.disabledOptions ?? [];
  const customLabels = preferences.customLabels ?? {};

  function handleLabelChange(id: string, newLabel: string) {
    onSavePreferences({
      ...preferences,
      customLabels: {
        ...customLabels,
        [id]: newLabel,
      },
    });
  }

  function handleToggleDisabled(id: string) {
    const isCurrentlyDisabled = disabled.includes(id);
    let nextDisabled: string[];
    if (isCurrentlyDisabled) {
      nextDisabled = disabled.filter((item) => item !== id);
    } else {
      nextDisabled = [...disabled, id];
    }
    let nextDefaultPriority = preferences.defaultPriority ?? "none";
    if (id === nextDefaultPriority && !isCurrentlyDisabled) {
      nextDefaultPriority = "none";
    }
    onSavePreferences({
      ...preferences,
      disabledOptions: nextDisabled,
      defaultPriority: nextDefaultPriority,
    });
  }

  const priorityItems = TASK_OPTIONS.filter((opt) => opt.type === "priority");
  const focusItems = TASK_OPTIONS.filter((opt) => opt.type === "timing" || opt.type === "pin");
  const categoryItems = TASK_OPTIONS.filter((opt) => opt.type === "category");

  const currentCalendarTheme = preferences.calendarTheme ?? DEFAULT_CALENDAR_THEME;
  const resolvedModalTheme = getResolvedTheme(currentCalendarTheme);

  function handleSelectPreset(preset: CalendarThemePreset) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        preset,
      },
    });
    showToast(`Switched theme to ${THEME_PRESET_METADATA[preset].name}`);
  }

  function handleSelectMode(mode: MonthColorMode) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        mode,
      },
    });
  }

  function handleUpdateCustomThemeField(field: keyof CalendarThemeSettings, val: string) {
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        [field]: val,
      },
    });
  }

  function handleUpdateMonthColor(mIdx: number, newBg: string) {
    const currentMonth = getMonthColor(resolvedModalTheme, mIdx);
    const custom = { ...(currentCalendarTheme.customMonthColors ?? {}) };
    custom[mIdx] = {
      ...currentMonth,
      bg: newBg,
      tileBg: newBg,
      border: newBg,
    };
    onSavePreferences({
      ...preferences,
      calendarTheme: {
        ...currentCalendarTheme,
        customMonthColors: custom,
      },
    });
  }

  function handleResetTheme() {
    onSavePreferences({
      ...preferences,
      calendarTheme: resetToThemeDefault(currentCalendarTheme.preset, currentCalendarTheme.mode),
    });
    showToast(`Reset theme to ${THEME_PRESET_METADATA[resolvedModalTheme.preset].name} defaults`);
  }

  function handleRestoreDefaultsTheme() {
    onSavePreferences({
      ...preferences,
      calendarTheme: restorePlanoramaDefaults(),
    });
    showToast("Restored Planorama theme defaults");
  }

  // Dashboard widgets manipulation
  const currentWidgets = resolveDashboardWidgets(preferences.dashboardWidgets);

  function handleToggleWidgetVisibility(id: DashboardWidgetId) {
    const next = currentWidgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    onSavePreferences({
      ...preferences,
      dashboardWidgets: next,
    });
  }

  function handleMoveWidget(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentWidgets.length) return;

    const next = [...currentWidgets];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onSavePreferences({
      ...preferences,
      dashboardWidgets: next,
    });
  }

  function handleRestoreDefaultWidgets() {
    onSavePreferences({
      ...preferences,
      dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS.map((w) => ({ ...w })),
    });
    showToast("Restored default dashboard layout!");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImportBackup) return;
    try {
      setIsImporting(true);
      await onImportBackup(file);
      showToast("Backup restored successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import backup.";
      onError(msg);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="settings-workspace-page" role="region" aria-label="Settings Workspace">
      {/* Top Banner on Mobile/Tablet */}
      <div className="settings-mobile-header">
        <button
          type="button"
          className="settings-back-btn"
          onClick={onReturnToPlanner}
          aria-label="Back to planner"
        >
          <ArrowLeft size={16} weight="bold" />
          <span>Back to Planner</span>
        </button>
        <span className="settings-mobile-title">Preferences</span>
      </div>

      <div className="settings-workspace-layout">
        {/* ===== PERSISTENT LEFT SIDEBAR ===== */}
        <aside className="settings-sidebar" aria-label="Settings navigation sidebar">
          <div className="settings-sidebar-top">
            <button
              type="button"
              className="settings-back-btn desktop-only"
              onClick={onReturnToPlanner}
              aria-label="Return to planner"
            >
              <ArrowLeft size={16} weight="bold" />
              <span>Back to Planner</span>
            </button>
            <div className="settings-sidebar-heading">
              <h2 className="settings-sidebar-title">Preferences</h2>
              <p className="settings-sidebar-desc">Personalize your workspace</p>
            </div>
          </div>

          <nav className="settings-nav" aria-label="Preferences sections">
            {SECTIONS_CONFIG.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`settings-nav-item ${isActive ? "is-active" : ""}`}
                  onClick={() => onSelectSection(sec.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="settings-nav-icon-wrap">
                    <Icon size={18} weight={isActive ? "fill" : "bold"} />
                  </span>
                  <div className="settings-nav-label-group">
                    <span className="settings-nav-label">{sec.label}</span>
                    <span className="settings-nav-sub">{sec.shortDesc}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="settings-sidebar-footer">
            <div className="settings-storage-badge">
              <span className="storage-dot" />
              <span>Local & Cloud Sync Active</span>
            </div>
          </div>
        </aside>

        {/* ===== MAIN SETTINGS CONTENT AREA ===== */}
        <main className="settings-main-content">
          <div className="settings-content-container">
            {/* SECTION 1: GENERAL */}
            {activeSection === "general" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <Sliders size={18} weight="bold" />
                    <span>General Preferences</span>
                  </div>
                  <h1 className="settings-section-title">General & Defaults</h1>
                  <p className="settings-section-description">
                    Configure default task priority, week start day, task sorting, priority levels, focus timing, and labels.
                  </p>
                </header>

                {/* Sub-Card: Defaults */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Planner Defaults</h3>
                    <p className="settings-card-sub">
                      Default settings applied when creating new tasks and viewing calendars.
                    </p>
                  </div>
                  <div className="settings-fields-grid">
                    <label className="settings-field-group">
                      <span className="settings-field-label">Default priority for new tasks</span>
                      <select
                        aria-label="Default priority for new tasks"
                        className="settings-select"
                        value={preferences.defaultPriority ?? "none"}
                        onChange={(e) =>
                          onSavePreferences({
                            ...preferences,
                            defaultPriority: e.target.value as PlannerTask["priority"],
                          })
                        }
                      >
                        {priorityItems.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {getOptionEmoji(opt.id, preferences)} {getOptionLabel(opt.id, preferences)}
                            {disabled.includes(opt.id) ? " (disabled)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="settings-field-group">
                      <span className="settings-field-label">Week starts on</span>
                      <select
                        aria-label="Week starts on"
                        className="settings-select"
                        value={preferences.weekStartsOn}
                        onChange={(e) =>
                          onSavePreferences({
                            ...preferences,
                            weekStartsOn: Number(e.target.value) as PlannerPreferences["weekStartsOn"],
                          })
                        }
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={6}>Saturday</option>
                      </select>
                    </label>

                    <label className="settings-field-group">
                      <span className="settings-field-label">Default task sorting</span>
                      <select
                        aria-label="Default task sorting"
                        className="settings-select"
                        value={preferences.defaultSort}
                        onChange={(e) =>
                          onSavePreferences({
                            ...preferences,
                            defaultSort: e.target.value as PlannerPreferences["defaultSort"],
                          })
                        }
                      >
                        <option value="due">Due date</option>
                        <option value="priority">Priority</option>
                        <option value="newest">Newest first</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* Sub-Card: Priority Levels */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Priority Levels</h3>
                    <p className="settings-card-sub">
                      Customize labels or disable levels from task creation. Historical tasks retain their priority.
                    </p>
                  </div>
                  <div className="settings-items-list">
                    {priorityItems.map((opt) => {
                      const isDisabled = disabled.includes(opt.id);
                      const labelValue = customLabels[opt.id] ?? opt.label;
                      return (
                        <div key={opt.id} className={`settings-item-row ${isDisabled ? "is-disabled" : ""}`}>
                          <div className="settings-item-main">
                            <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                            <div className="settings-item-info">
                              <input
                                type="text"
                                className="preference-label-input"
                                value={labelValue}
                                maxLength={30}
                                onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                                placeholder={opt.label}
                                aria-label={`Label for ${opt.label}`}
                              />
                              <span className="preference-desc-text">{opt.description}</span>
                            </div>
                          </div>
                          <div className="settings-item-actions">
                            <button
                              type="button"
                              className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                              onClick={() => handleToggleDisabled(opt.id)}
                              aria-pressed={!isDisabled}
                              title={isDisabled ? "Enable this priority" : "Disable this priority"}
                            >
                              {isDisabled ? "Disabled" : "Active"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-Card: Focus Options */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Focus & Timing Options</h3>
                    <p className="settings-card-sub">
                      Timing preferences and persistent pin options operating independently from priority.
                    </p>
                  </div>
                  <div className="settings-items-list">
                    {focusItems.map((opt) => {
                      const isDisabled = disabled.includes(opt.id);
                      const labelValue = customLabels[opt.id] ?? opt.label;
                      return (
                        <div key={opt.id} className={`settings-item-row ${isDisabled ? "is-disabled" : ""}`}>
                          <div className="settings-item-main">
                            <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                            <div className="settings-item-info">
                              <input
                                type="text"
                                className="preference-label-input"
                                value={labelValue}
                                maxLength={30}
                                onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                                placeholder={opt.label}
                                aria-label={`Label for ${opt.label}`}
                              />
                              <span className="preference-desc-text">{opt.description}</span>
                            </div>
                          </div>
                          <div className="settings-item-actions">
                            <button
                              type="button"
                              className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                              onClick={() => handleToggleDisabled(opt.id)}
                              aria-pressed={!isDisabled}
                              title={isDisabled ? "Enable this focus option" : "Disable this focus option"}
                            >
                              {isDisabled ? "Disabled" : "Active"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-Card: Categories & Project Labels */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Categories & Project Labels</h3>
                    <p className="settings-card-sub">
                      Organize personal life tasks and manage custom categories for your workspace.
                    </p>
                  </div>
                  <div className="settings-items-list" style={{ marginBottom: "16px" }}>
                    {categoryItems.map((opt) => {
                      const isDisabled = disabled.includes(opt.id);
                      const labelValue = customLabels[opt.id] ?? opt.label;
                      return (
                        <div key={opt.id} className={`settings-item-row ${isDisabled ? "is-disabled" : ""}`}>
                          <div className="settings-item-main">
                            <span className="preference-emoji-badge" aria-hidden="true">{opt.emoji}</span>
                            <div className="settings-item-info">
                              <input
                                type="text"
                                className="preference-label-input"
                                value={labelValue}
                                maxLength={30}
                                onChange={(e) => handleLabelChange(opt.id, e.target.value)}
                                placeholder={opt.label}
                                aria-label={`Label for ${opt.label}`}
                              />
                              <span className="preference-desc-text">{opt.description}</span>
                            </div>
                          </div>
                          <div className="settings-item-actions">
                            <button
                              type="button"
                              className={`preference-toggle-btn ${isDisabled ? "is-disabled" : "is-active"}`}
                              onClick={() => handleToggleDisabled(opt.id)}
                              aria-pressed={!isDisabled}
                              title={isDisabled ? "Enable this category" : "Disable this category"}
                            >
                              {isDisabled ? "Disabled" : "Active"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="label-manager-subgroup">
                    <div className="label-manager-heading">
                      <div>
                        <strong>Custom Project Labels</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#78716c" }}>
                          Tag and filter tasks across your planner views.
                        </p>
                      </div>
                      <button type="button" className="task-action" onClick={onAddLabel}>
                        <Plus size={14} weight="bold" />
                        <span>Add label</span>
                      </button>
                    </div>
                    {labels.length > 0 ? (
                      <div className="label-chip-list">
                        {labels.map((label) => (
                          <span className="label-management-chip" key={label.id}>
                            {label.name}
                            <button
                              type="button"
                              aria-label={`Delete ${label.name} label`}
                              onClick={() => onDeleteLabel(label.id)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "#78716c", margin: 0 }}>
                        No custom labels created yet. Click &quot;Add label&quot; to create your first tag.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: APPEARANCE & THEMES */}
            {activeSection === "appearance" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <Palette size={18} weight="bold" />
                    <span>Visual Identity</span>
                  </div>
                  <h1 className="settings-section-title">Appearance & Themes</h1>
                  <p className="settings-section-description">
                    Customize calendar tiles, month headers, weekend highlights, and color themes across all calendar views.
                  </p>
                </header>

                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Theme Presets</h3>
                    <p className="settings-card-sub">
                      Select a cohesive color personality for your calendar experience.
                    </p>
                  </div>
                  <div className="calendar-theme-presets-grid">
                    {(["colorful", "bold_pop", "soft_pastel", "minimal"] as CalendarThemePreset[]).map((presetId) => {
                      const meta = THEME_PRESET_METADATA[presetId];
                      const isSelected = currentCalendarTheme.preset === presetId;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          className={`theme-preset-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelectPreset(presetId)}
                          aria-pressed={isSelected}
                        >
                          <div className="theme-preset-card-top">
                            <span className="theme-preset-name">
                              {meta.name}
                              {meta.badge && <span className="theme-preset-badge">{meta.badge}</span>}
                            </span>
                            {isSelected && <span className="theme-preset-check">✓ Active</span>}
                          </div>
                          <p className="theme-preset-desc">{meta.description}</p>
                          <div className="theme-preset-palette-preview">
                            {meta.previewColors.map((color, i) => (
                              <span key={i} className="theme-preset-swatch" style={{ backgroundColor: color }} />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Month Tile Appearance</h3>
                    <p className="settings-card-sub">
                      Choose between pastel month headers or fully tinted calendar month tiles.
                    </p>
                  </div>
                  <div className="theme-mode-selector-wrap">
                    <div className="segmented theme-mode-segmented" role="radiogroup" aria-label="Month Tile Appearance">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={currentCalendarTheme.mode === "headers"}
                        className={currentCalendarTheme.mode === "headers" ? "selected" : ""}
                        onClick={() => handleSelectMode("headers")}
                      >
                        🎨 Colorful Headers
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={currentCalendarTheme.mode === "tiles"}
                        className={currentCalendarTheme.mode === "tiles" ? "selected" : ""}
                        onClick={() => handleSelectMode("tiles")}
                      >
                        🌈 Colorful Tiles
                      </button>
                    </div>
                    <span className="theme-mode-hint">
                      {currentCalendarTheme.mode === "headers"
                        ? "Each month has a distinct pastel header while calendar days stay neutral."
                        : "Each month tile and header are subtly tinted with matching colors."}
                    </span>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Individual Color Customization</h3>
                    <p className="settings-card-sub">
                      Fine-tune individual accents or override the 12 monthly header colors.
                    </p>
                  </div>
                  <div className="theme-customization-accordion">
                    <button
                      type="button"
                      className="theme-customization-toggle"
                      onClick={() => setShowCustomThemeColors((prev) => !prev)}
                      aria-expanded={showCustomThemeColors}
                    >
                      <span>⚙ Customize Individual Theme Colors</span>
                      <span>{showCustomThemeColors ? "▲ Hide Colors" : "▼ Show Colors"}</span>
                    </button>

                    {showCustomThemeColors && (
                      <div className="theme-customization-panel">
                        <div className="theme-custom-group">
                          <strong className="theme-custom-group-title">Global Calendar Accents</strong>
                          <div className="theme-custom-pickers-grid">
                            <label className="theme-color-picker-item">
                              <span>Calendar Background</span>
                              <div className="theme-picker-input-wrap">
                                <input
                                  type="color"
                                  value={resolvedModalTheme.calendarBg}
                                  onChange={(e) => handleUpdateCustomThemeField("calendarBg", e.target.value)}
                                />
                                <code>{resolvedModalTheme.calendarBg}</code>
                              </div>
                            </label>
                            <label className="theme-color-picker-item">
                              <span>Weekend Highlight</span>
                              <div className="theme-picker-input-wrap">
                                <input
                                  type="color"
                                  value={resolvedModalTheme.weekendBg}
                                  onChange={(e) => handleUpdateCustomThemeField("weekendBg", e.target.value)}
                                />
                                <code>{resolvedModalTheme.weekendBg}</code>
                              </div>
                            </label>
                            <label className="theme-color-picker-item">
                              <span>Today Highlight</span>
                              <div className="theme-picker-input-wrap">
                                <input
                                  type="color"
                                  value={resolvedModalTheme.todayBg}
                                  onChange={(e) => handleUpdateCustomThemeField("todayBg", e.target.value)}
                                />
                                <code>{resolvedModalTheme.todayBg}</code>
                              </div>
                            </label>
                            <label className="theme-color-picker-item">
                              <span>Selected Date Highlight</span>
                              <div className="theme-picker-input-wrap">
                                <input
                                  type="color"
                                  value={resolvedModalTheme.selectedBg}
                                  onChange={(e) => handleUpdateCustomThemeField("selectedBg", e.target.value)}
                                />
                                <code>{resolvedModalTheme.selectedBg}</code>
                              </div>
                            </label>
                            <label className="theme-color-picker-item">
                              <span>Task Activity Indicator</span>
                              <div className="theme-picker-input-wrap">
                                <input
                                  type="color"
                                  value={resolvedModalTheme.taskDotColor}
                                  onChange={(e) => handleUpdateCustomThemeField("taskDotColor", e.target.value)}
                                />
                                <code>{resolvedModalTheme.taskDotColor}</code>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="theme-custom-group">
                          <strong className="theme-custom-group-title">12 Monthly Header Colors</strong>
                          <div className="theme-months-pickers-grid">
                            {MONTH_NAMES.map((name, mIdx) => {
                              const mColor = getMonthColor(resolvedModalTheme, mIdx);
                              return (
                                <div key={mIdx} className="theme-month-picker-cell" style={{ borderLeftColor: mColor.border }}>
                                  <div className="theme-month-picker-header">
                                    <span className="theme-month-picker-name">{name.slice(0, 3)}</span>
                                    <span className="theme-month-picker-sample" style={{ backgroundColor: mColor.bg, color: mColor.text }}>
                                      {String(mIdx + 1).padStart(2, "0")}
                                    </span>
                                  </div>
                                  <div className="theme-picker-input-wrap">
                                    <input
                                      type="color"
                                      aria-label={`${name} header color`}
                                      value={mColor.bg}
                                      onChange={(e) => handleUpdateMonthColor(mIdx, e.target.value)}
                                    />
                                    <code>{mColor.bg}</code>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="theme-custom-actions">
                          <button
                            type="button"
                            className="theme-reset-btn"
                            onClick={handleResetTheme}
                          >
                            ↺ Reset to {THEME_PRESET_METADATA[resolvedModalTheme.preset].name} Defaults
                          </button>
                          <button
                            type="button"
                            className="theme-restore-defaults-btn"
                            onClick={handleRestoreDefaultsTheme}
                          >
                            ★ Restore Planorama Defaults
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: CALENDAR ITEM STYLES */}
            {activeSection === "item_styles" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <PaintBrushBroad size={18} weight="bold" />
                    <span>Item Aesthetics</span>
                  </div>
                  <h1 className="settings-section-title">Calendar Item Styles</h1>
                  <p className="settings-section-description">
                    Choose one global tile style for Events, Tasks, and Appointment Schedules, while retaining independent category colors.
                  </p>
                </header>

                <div className="settings-card no-padding">
                  <ItemColorsSettings
                    itemStyles={preferences.itemStyles ?? DEFAULT_ITEM_STYLES}
                    itemColors={preferences.itemColors ?? DEFAULT_ITEM_COLORS}
                    onChange={(nextStyles, nextColors) => {
                      onSavePreferences({
                        ...preferences,
                        itemStyles: nextStyles,
                        itemColors: nextColors || {
                          eventColor: nextStyles.event.primaryColor || nextStyles.event.color || DEFAULT_ITEM_COLORS.eventColor,
                          taskColor: nextStyles.task.primaryColor || nextStyles.task.color || DEFAULT_ITEM_COLORS.taskColor,
                          scheduleColor: nextStyles.schedule.primaryColor || nextStyles.schedule.color || DEFAULT_ITEM_COLORS.scheduleColor,
                          eventTextColor: nextStyles.event.textColor,
                          taskTextColor: nextStyles.task.textColor,
                          scheduleTextColor: nextStyles.schedule.textColor,
                          eventBorderColor: nextStyles.event.borderColor,
                          taskBorderColor: nextStyles.task.borderColor,
                          scheduleBorderColor: nextStyles.schedule.borderColor,
                        },
                      });
                      showToast("Calendar tile styles updated!");
                    }}
                  />
                </div>
              </div>
            )}

            {/* SECTION 4: DASHBOARD */}
            {activeSection === "dashboard" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <SquaresFour size={18} weight="bold" />
                    <span>Command Center</span>
                  </div>
                  <h1 className="settings-section-title">Dashboard Customization</h1>
                  <p className="settings-section-description">
                    Reorder and toggle visibility of widgets on your personal planning command center.
                  </p>
                </header>

                <div className="settings-card">
                  <div className="settings-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 className="settings-card-title">Active Widgets</h3>
                      <p className="settings-card-sub">
                        Use the arrow controls to reorder widgets, and eye icons to show or hide cards.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-action-btn secondary"
                      onClick={handleRestoreDefaultWidgets}
                    >
                      <ArrowCounterClockwise size={14} weight="bold" />
                      <span>Restore Default Layout</span>
                    </button>
                  </div>

                  <div className="dashboard-widget-list" role="list" aria-label="Dashboard widgets order and visibility">
                    {currentWidgets.map((widget, index) => {
                      const meta = DASHBOARD_WIDGET_METADATA[widget.id];
                      return (
                        <div
                          key={widget.id}
                          className={`dashboard-widget-item-row ${widget.visible ? "is-visible" : "is-hidden"}`}
                          role="listitem"
                        >
                          <div className="dashboard-widget-reorder-btns">
                            <button
                              type="button"
                              className="widget-move-btn"
                              disabled={index === 0}
                              onClick={() => handleMoveWidget(index, "up")}
                              aria-label={`Move ${meta.name} up`}
                              title="Move up"
                            >
                              <CaretUp size={14} weight="bold" />
                            </button>
                            <button
                              type="button"
                              className="widget-move-btn"
                              disabled={index === currentWidgets.length - 1}
                              onClick={() => handleMoveWidget(index, "down")}
                              aria-label={`Move ${meta.name} down`}
                              title="Move down"
                            >
                              <CaretDown size={14} weight="bold" />
                            </button>
                          </div>

                          <div className="dashboard-widget-icon" aria-hidden="true">
                            {meta.icon}
                          </div>

                          <div className="dashboard-widget-info">
                            <div className="dashboard-widget-name-row">
                              <span className="dashboard-widget-name">{meta.name}</span>
                              {meta.badge && <span className="dashboard-widget-badge">{meta.badge}</span>}
                            </div>
                            <span className="dashboard-widget-desc">{meta.description}</span>
                          </div>

                          <div className="dashboard-widget-toggle-wrap">
                            <button
                              type="button"
                              className={`widget-visibility-toggle ${widget.visible ? "is-active" : "is-hidden"}`}
                              onClick={() => handleToggleWidgetVisibility(widget.id)}
                              aria-label={widget.visible ? `Hide ${meta.name}` : `Show ${meta.name}`}
                              title={widget.visible ? "Hide from dashboard" : "Show on dashboard"}
                            >
                              {widget.visible ? (
                                <>
                                  <Eye size={15} weight="bold" />
                                  <span>Visible</span>
                                </>
                              ) : (
                                <>
                                  <EyeSlash size={15} weight="bold" />
                                  <span>Hidden</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: CALENDAR & SYNC */}
            {activeSection === "calendar_sync" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <CalendarCheck size={18} weight="bold" />
                    <span>External Calendars</span>
                  </div>
                  <h1 className="settings-section-title">Calendar & Synchronization</h1>
                  <p className="settings-section-description">
                    Connect Google Calendar accounts, configure two-way synchronization, and manage connected calendars.
                  </p>
                </header>

                <div className="settings-card no-padding">
                  <GoogleCalendarSettings
                    preferences={preferences}
                    onSavePreferences={onSavePreferences}
                    onSyncNow={onSyncGoogle}
                    isSyncing={isSyncingGoogle}
                    showToast={showToast}
                    onError={onError}
                  />
                </div>
              </div>
            )}

            {/* SECTION 6: DATA & BACKUP */}
            {activeSection === "data_backup" && (
              <div className="settings-section-view">
                <header className="settings-section-header">
                  <div className="settings-section-badge">
                    <Database size={18} weight="bold" />
                    <span>Data Management</span>
                  </div>
                  <h1 className="settings-section-title">Data & Backup</h1>
                  <p className="settings-section-description">
                    Export complete planner backups, import existing data, manage saved task templates, or restore defaults.
                  </p>
                </header>

                {/* Sub-Card: Backup & Restore */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Backup & Restore</h3>
                    <p className="settings-card-sub">
                      Export your data to a secure JSON file or restore from a previous backup.
                    </p>
                  </div>

                  <div className="backup-action-grid">
                    <div className="backup-action-box">
                      <div className="backup-box-icon">
                        <DownloadSimple size={24} weight="bold" />
                      </div>
                      <div className="backup-box-content">
                        <strong>Export Planner Backup</strong>
                        <p>
                          Download a single JSON file containing all tasks, habits, labels, projects, templates, and preferences.
                        </p>
                        <button
                          type="button"
                          className="settings-action-btn primary"
                          onClick={() => {
                            if (onExportBackup) {
                              void onExportBackup();
                              showToast("Backup export started!");
                            }
                          }}
                        >
                          <DownloadSimple size={16} weight="bold" />
                          <span>Export Backup File</span>
                        </button>
                      </div>
                    </div>

                    <div className="backup-action-box">
                      <div className="backup-box-icon">
                        <UploadSimple size={24} weight="bold" />
                      </div>
                      <div className="backup-box-content">
                        <strong>Restore from Backup</strong>
                        <p>
                          Import and merge tasks, preferences, and labels from a previously saved Planorama JSON file.
                        </p>
                        <label className={`settings-action-btn secondary upload-label ${isImporting ? "is-disabled" : ""}`}>
                          <UploadSimple size={16} weight="bold" />
                          <span>{isImporting ? "Importing…" : "Select Backup JSON"}</span>
                          <input
                            type="file"
                            accept=".json,application/json"
                            style={{ display: "none" }}
                            disabled={isImporting}
                            onChange={handleImportFile}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Card: Task Templates */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Saved Task Templates</h3>
                    <p className="settings-card-sub">
                      Reusable blueprints for quickly creating recurring or structured tasks.
                    </p>
                  </div>

                  {taskTemplates.length > 0 ? (
                    <div className="settings-items-list">
                      {taskTemplates.map((template) => (
                        <div key={template.id} className="settings-item-row">
                          <div className="settings-item-main">
                            <span className="preference-emoji-badge" aria-hidden="true">📋</span>
                            <div className="settings-item-info">
                              <strong style={{ fontSize: "14px", color: "var(--ink)" }}>{template.name}</strong>
                              <span className="preference-desc-text">
                                Title: &ldquo;{template.title}&rdquo; &bull; Priority: {template.priority.toUpperCase()} &bull; Repeat: {template.recurrence}
                              </span>
                            </div>
                          </div>
                          {onDeleteTemplate && (
                            <button
                              type="button"
                              className="task-action delete"
                              onClick={() => {
                                onDeleteTemplate(template.id);
                                showToast(`Deleted template "${template.name}"`);
                              }}
                              aria-label={`Delete template ${template.name}`}
                              title="Delete template"
                            >
                              <Trash size={15} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="settings-empty-state">
                      <p>No saved task templates found. You can save tasks as reusable templates when creating or editing tasks.</p>
                    </div>
                  )}
                </div>

                {/* Sub-Card: Factory Defaults */}
                <div className="settings-card danger-card">
                  <div className="settings-card-header">
                    <h3 className="settings-card-title">Reset Preferences</h3>
                    <p className="settings-card-sub">
                      Reset all custom options, calendar theme colors, and layout configurations to default Planorama settings.
                    </p>
                  </div>
                  <div className="settings-danger-row">
                    <p className="settings-danger-warning">
                      This will reset your default priority, week start day, item colors, and theme back to default. Your tasks and events will NOT be deleted.
                    </p>
                    <button
                      type="button"
                      className="settings-restore-btn"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to restore all preferences to their default settings?")) {
                          onRestoreDefaults();
                        }
                      }}
                    >
                      <ArrowCounterClockwise size={16} weight="bold" />
                      <span>Restore Default Options</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
