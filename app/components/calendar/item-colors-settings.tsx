"use client";

import React, { useState, useMemo } from "react";
import {
  Palette,
  CalendarBlank,
  CheckSquare,
  Clock,
  ArrowCounterClockwise,
  Check,
  Sparkle,
  Warning,
  Lightbulb,
} from "@phosphor-icons/react";
import {
  type ItemStylesPreferences,
  type ItemColorPreferences,
  type TileStylePreset,
  DEFAULT_ITEM_STYLES,
  DEFAULT_ITEM_COLORS,
  TILE_STYLE_PRESETS,
  EVENT_COLOR_PRESETS,
  TASK_COLOR_PRESETS,
  SCHEDULE_COLOR_PRESETS,
  TEXT_COLOR_PRESETS,
  BORDER_COLOR_PRESETS,
  computeTileStyle,
  isValidHexColor,
  normalizeHexColor,
  resolveItemStylesPreferences,
  getContrastRatio,
  isLowContrast,
  getSuggestedTextColor,
  getEffectiveTileBackground,
} from "@/lib/calendar/item-color";

export interface CalendarItemStylesSettingsProps {
  itemStyles: ItemStylesPreferences;
  itemColors?: ItemColorPreferences;
  onChange: (nextStyles: ItemStylesPreferences, nextColors: ItemColorPreferences) => void;
  onApply?: () => void;
}

interface CategoryConfigMeta {
  id: "event" | "task" | "schedule";
  label: string;
  sublabel: string;
  icon: React.ElementType;
  presets: { hex: string; label: string }[];
}

const CATEGORY_METAS: CategoryConfigMeta[] = [
  {
    id: "event",
    label: "Events",
    sublabel: "Meetings, timed calendar items, and appointments",
    icon: CalendarBlank,
    presets: EVENT_COLOR_PRESETS,
  },
  {
    id: "task",
    label: "Tasks",
    sublabel: "To-dos, deadlines, and actionable planner tasks",
    icon: CheckSquare,
    presets: TASK_COLOR_PRESETS,
  },
  {
    id: "schedule",
    label: "Appointment Schedules",
    sublabel: "Booking availability windows and open consultation slots",
    icon: Clock,
    presets: SCHEDULE_COLOR_PRESETS,
  },
];

export function ItemColorsSettings({
  itemStyles,
  itemColors: _itemColors,
  onChange,
  onApply,
}: CalendarItemStylesSettingsProps) {
  void _itemColors;

  // Working draft state to support instant live previews and explicit "Apply Changes"
  const [draftStyles, setDraftStyles] = useState<ItemStylesPreferences>(() =>
    resolveItemStylesPreferences(itemStyles)
  );
  const [appliedFeedback, setAppliedFeedback] = useState(false);

  // Sync draft when external preferences change
  React.useEffect(() => {
    setDraftStyles(resolveItemStylesPreferences(itemStyles));
  }, [itemStyles]);

  // Current active global style preset (Vibrant Solid, Soft Pastel, Color Pop, Outline, Minimal)
  const activeGlobalStyle: TileStylePreset =
    draftStyles.globalStyle ||
    draftStyles.preset ||
    draftStyles.style ||
    draftStyles.event?.preset ||
    draftStyles.event?.style ||
    "vibrant_solid";

  // Current category background colors
  const eventColor =
    draftStyles.event?.color || draftStyles.event?.primaryColor || DEFAULT_ITEM_COLORS.eventColor;
  const taskColor =
    draftStyles.task?.color || draftStyles.task?.primaryColor || DEFAULT_ITEM_COLORS.taskColor;
  const scheduleColor =
    draftStyles.schedule?.color || draftStyles.schedule?.primaryColor || DEFAULT_ITEM_COLORS.scheduleColor;

  // Current category text colors
  const eventTextColor =
    draftStyles.event?.textColor || DEFAULT_ITEM_COLORS.eventTextColor || "#ffffff";
  const taskTextColor =
    draftStyles.task?.textColor || DEFAULT_ITEM_COLORS.taskTextColor || "#ffffff";
  const scheduleTextColor =
    draftStyles.schedule?.textColor || DEFAULT_ITEM_COLORS.scheduleTextColor || "#ffffff";

  // Current category border colors
  const eventBorderColor = draftStyles.event?.borderColor;
  const taskBorderColor = draftStyles.task?.borderColor;
  const scheduleBorderColor = draftStyles.schedule?.borderColor;

  const currentColors: ItemColorPreferences = useMemo(
    () => ({
      eventColor,
      taskColor,
      scheduleColor,
      eventTextColor,
      taskTextColor,
      scheduleTextColor,
      eventBorderColor,
      taskBorderColor,
      scheduleBorderColor,
    }),
    [
      eventColor,
      taskColor,
      scheduleColor,
      eventTextColor,
      taskTextColor,
      scheduleTextColor,
      eventBorderColor,
      taskBorderColor,
      scheduleBorderColor,
    ]
  );

  // 1. Update Global Tile Style: applies uniformly to all three categories
  const handleSelectGlobalStyle = (preset: TileStylePreset) => {
    const nextDraft: ItemStylesPreferences = {
      ...draftStyles,
      globalStyle: preset,
      preset: preset,
      style: preset,
      event: {
        ...draftStyles.event,
        preset,
        style: preset,
      },
      task: {
        ...draftStyles.task,
        preset,
        style: preset,
      },
      schedule: {
        ...draftStyles.schedule,
        preset,
        style: preset,
      },
    };
    setDraftStyles(nextDraft);
    onChange(nextDraft, currentColors);
  };

  // 2. Update Category Background Color independently
  const handleCategoryColorChange = (
    category: "event" | "task" | "schedule",
    newHex: string
  ) => {
    const fallbackColor =
      category === "event" ? eventColor : category === "task" ? taskColor : scheduleColor;
    const validated = normalizeHexColor(newHex, fallbackColor);

    const nextDraft: ItemStylesPreferences = {
      ...draftStyles,
      globalStyle: activeGlobalStyle,
      preset: activeGlobalStyle,
      style: activeGlobalStyle,
      [category]: {
        ...draftStyles[category],
        color: validated,
        primaryColor: validated,
        style: activeGlobalStyle,
        preset: activeGlobalStyle,
      },
    };
    setDraftStyles(nextDraft);

    const nextColors: ItemColorPreferences = {
      ...currentColors,
      eventColor: category === "event" ? validated : eventColor,
      taskColor: category === "task" ? validated : taskColor,
      scheduleColor: category === "schedule" ? validated : scheduleColor,
    };
    onChange(nextDraft, nextColors);
  };

  // 3. Update Category Text Color independently
  const handleCategoryTextColorChange = (
    category: "event" | "task" | "schedule",
    newHex: string
  ) => {
    const fallbackColor =
      category === "event" ? eventTextColor : category === "task" ? taskTextColor : scheduleTextColor;
    const validated = normalizeHexColor(newHex, fallbackColor);

    const nextDraft: ItemStylesPreferences = {
      ...draftStyles,
      globalStyle: activeGlobalStyle,
      preset: activeGlobalStyle,
      style: activeGlobalStyle,
      [category]: {
        ...draftStyles[category],
        textColor: validated,
      },
    };
    setDraftStyles(nextDraft);

    const nextColors: ItemColorPreferences = {
      ...currentColors,
      eventTextColor: category === "event" ? validated : eventTextColor,
      taskTextColor: category === "task" ? validated : taskTextColor,
      scheduleTextColor: category === "schedule" ? validated : scheduleTextColor,
    };
    onChange(nextDraft, nextColors);
  };

  // 4. Update Category Border Color independently
  const handleCategoryBorderColorChange = (
    category: "event" | "task" | "schedule",
    newHex: string | undefined
  ) => {
    const validated = newHex && isValidHexColor(newHex) ? normalizeHexColor(newHex, "") : undefined;

    const nextDraft: ItemStylesPreferences = {
      ...draftStyles,
      globalStyle: activeGlobalStyle,
      preset: activeGlobalStyle,
      style: activeGlobalStyle,
      [category]: {
        ...draftStyles[category],
        borderColor: validated,
      },
    };
    setDraftStyles(nextDraft);

    const nextColors: ItemColorPreferences = {
      ...currentColors,
      eventBorderColor: category === "event" ? validated : eventBorderColor,
      taskBorderColor: category === "task" ? validated : taskBorderColor,
      scheduleBorderColor: category === "schedule" ? validated : scheduleBorderColor,
    };
    onChange(nextDraft, nextColors);
  };

  // 5. Reset individual category colors to default
  const handleResetCategoryColor = (category: "event" | "task" | "schedule") => {
    const defaultColor =
      category === "event"
        ? (DEFAULT_ITEM_STYLES.event.color || DEFAULT_ITEM_COLORS.eventColor)
        : category === "task"
        ? (DEFAULT_ITEM_STYLES.task.color || DEFAULT_ITEM_COLORS.taskColor)
        : (DEFAULT_ITEM_STYLES.schedule.color || DEFAULT_ITEM_COLORS.scheduleColor);

    const defaultTextColor =
      category === "event"
        ? (DEFAULT_ITEM_STYLES.event.textColor || DEFAULT_ITEM_COLORS.eventTextColor || "#ffffff")
        : category === "task"
        ? (DEFAULT_ITEM_STYLES.task.textColor || DEFAULT_ITEM_COLORS.taskTextColor || "#ffffff")
        : (DEFAULT_ITEM_STYLES.schedule.textColor || DEFAULT_ITEM_COLORS.scheduleTextColor || "#ffffff");

    const nextDraft: ItemStylesPreferences = {
      ...draftStyles,
      globalStyle: activeGlobalStyle,
      preset: activeGlobalStyle,
      style: activeGlobalStyle,
      [category]: {
        ...draftStyles[category],
        color: defaultColor,
        primaryColor: defaultColor,
        textColor: defaultTextColor,
        borderColor: undefined,
      },
    };
    setDraftStyles(nextDraft);

    const nextColors: ItemColorPreferences = {
      ...currentColors,
      eventColor: category === "event" ? defaultColor : eventColor,
      taskColor: category === "task" ? defaultColor : taskColor,
      scheduleColor: category === "schedule" ? defaultColor : scheduleColor,
      eventTextColor: category === "event" ? defaultTextColor : eventTextColor,
      taskTextColor: category === "task" ? defaultTextColor : taskTextColor,
      scheduleTextColor: category === "schedule" ? defaultTextColor : scheduleTextColor,
      eventBorderColor: category === "event" ? undefined : eventBorderColor,
      taskBorderColor: category === "task" ? undefined : taskBorderColor,
      scheduleBorderColor: category === "schedule" ? undefined : scheduleBorderColor,
    };
    onChange(nextDraft, nextColors);
  };

  // 6. Reset All to Defaults
  const handleResetAll = () => {
    setDraftStyles({ ...DEFAULT_ITEM_STYLES });
    onChange({ ...DEFAULT_ITEM_STYLES }, { ...DEFAULT_ITEM_COLORS });
  };

  // 7. Apply Changes
  const handleApply = () => {
    onChange(draftStyles, currentColors);
    onApply?.();
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2000);
  };

  // Compute live preview tokens for the 3 sample cards
  const eventPreview = useMemo(
    () =>
      computeTileStyle(
        {
          ...draftStyles.event,
          style: activeGlobalStyle,
          preset: activeGlobalStyle,
          color: eventColor,
          primaryColor: eventColor,
          textColor: eventTextColor,
          borderColor: eventBorderColor,
        },
        false,
        false
      ),
    [draftStyles.event, activeGlobalStyle, eventColor, eventTextColor, eventBorderColor]
  );

  const taskPreview = useMemo(
    () =>
      computeTileStyle(
        {
          ...draftStyles.task,
          style: activeGlobalStyle,
          preset: activeGlobalStyle,
          color: taskColor,
          primaryColor: taskColor,
          textColor: taskTextColor,
          borderColor: taskBorderColor,
        },
        false,
        false
      ),
    [draftStyles.task, activeGlobalStyle, taskColor, taskTextColor, taskBorderColor]
  );

  const schedulePreview = useMemo(
    () =>
      computeTileStyle(
        {
          ...draftStyles.schedule,
          style: activeGlobalStyle,
          preset: activeGlobalStyle,
          color: scheduleColor,
          primaryColor: scheduleColor,
          textColor: scheduleTextColor,
          borderColor: scheduleBorderColor,
        },
        false,
        false
      ),
    [draftStyles.schedule, activeGlobalStyle, scheduleColor, scheduleTextColor, scheduleBorderColor]
  );

  const activePresetName =
    TILE_STYLE_PRESETS.find((p) => p.id === activeGlobalStyle)?.name || "Vibrant Solid";

  const isAllDefault =
    activeGlobalStyle === "vibrant_solid" &&
    eventColor.toLowerCase() === (DEFAULT_ITEM_STYLES.event.color || DEFAULT_ITEM_COLORS.eventColor).toLowerCase() &&
    taskColor.toLowerCase() === (DEFAULT_ITEM_STYLES.task.color || DEFAULT_ITEM_COLORS.taskColor).toLowerCase() &&
    scheduleColor.toLowerCase() === (DEFAULT_ITEM_STYLES.schedule.color || DEFAULT_ITEM_COLORS.scheduleColor).toLowerCase() &&
    eventTextColor.toLowerCase() === (DEFAULT_ITEM_STYLES.event.textColor || "#ffffff").toLowerCase() &&
    taskTextColor.toLowerCase() === (DEFAULT_ITEM_STYLES.task.textColor || "#ffffff").toLowerCase() &&
    scheduleTextColor.toLowerCase() === (DEFAULT_ITEM_STYLES.schedule.textColor || "#ffffff").toLowerCase() &&
    !eventBorderColor &&
    !taskBorderColor &&
    !scheduleBorderColor;

  return (
    <section className="preferences-section calendar-item-styles-section">
      {/* 1. PAGE TITLE & SHORT DESCRIPTION */}
      <div className="preferences-section-header-row">
        <div>
          <div className="preferences-section-kicker">
            <Palette size={16} weight="bold" style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Appearance · Calendar Item Styles
          </div>
          <p className="preferences-section-desc">
            Customize how all calendar items look. Select a global tile style, assign independent background and text colors for Events, Tasks, and Appointment Schedules, and preview live.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!isAllDefault && (
            <button
              type="button"
              className="item-colors-reset-all-btn"
              onClick={handleResetAll}
              title="Reset all calendar item styles, background colors, and text colors to Planorama defaults"
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              <span>Reset All Item Colors</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. GLOBAL TILE STYLE SELECTOR (VERTICALLY STACKED FULL-WIDTH CARDS) */}
      <div className="settings-section-block">
        <div className="settings-block-header">
          <span className="settings-block-title">
            <span>Global Tile Style</span>
          </span>
          <span className="settings-block-subtitle">
            Choose how all calendar items look. Events, Tasks, and Appointment Schedules all follow the selected style.
          </span>
        </div>

        <div className="tile-style-vertical-list" role="radiogroup" aria-label="Tile Style Options">
          {TILE_STYLE_PRESETS.map((preset) => {
            const isSelected = activeGlobalStyle === preset.id;
            const sample = computeTileStyle(
              {
                style: preset.id,
                preset: preset.id,
                color: eventColor,
                primaryColor: eventColor,
                textColor: eventTextColor,
                borderColor: eventBorderColor,
              },
              false,
              false
            );

            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`tile-style-vertical-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleSelectGlobalStyle(preset.id)}
              >
                <div className="tile-style-card-left">
                  <div className="tile-style-radio-indicator" aria-hidden="true">
                    {isSelected && <div className="tile-style-radio-dot" />}
                  </div>

                  <div className="tile-style-card-info">
                    <div className="tile-style-card-name-row">
                      <strong className="tile-style-card-name">{preset.name}</strong>
                      <span className="tile-style-card-badge">{preset.badge}</span>
                    </div>
                    <p className="tile-style-card-desc">{preset.description}</p>
                  </div>
                </div>

                <div className={`tile-style-compact-sample ${sample.className}`} style={sample.style} aria-hidden="true">
                  <span>Sample Tile</span>
                  <span style={{ opacity: 0.85, fontSize: "10px" }}>10:00 AM</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. CATEGORY COLOR CUSTOMIZATION (INDEPENDENT BACKGROUND & TEXT COLORS) */}
      <div className="settings-section-block">
        <div className="settings-block-header">
          <span className="settings-block-title">
            <span>Category Colors & Typography</span>
          </span>
          <span className="settings-block-subtitle">
            Customize background color, text color, and border accents independently for Events, Tasks, and Appointment Schedules.
          </span>
        </div>

        <div className="category-colors-vertical-list">
          {CATEGORY_METAS.map((catMeta) => {
            const currentColor =
              catMeta.id === "event"
                ? eventColor
                : catMeta.id === "task"
                ? taskColor
                : scheduleColor;

            const currentTextColor =
              catMeta.id === "event"
                ? eventTextColor
                : catMeta.id === "task"
                ? taskTextColor
                : scheduleTextColor;

            const currentBorderColor =
              catMeta.id === "event"
                ? eventBorderColor
                : catMeta.id === "task"
                ? taskBorderColor
                : scheduleBorderColor;

            const CategoryIcon = catMeta.icon;

            // Accessibility contrast check
            const effectiveBg = getEffectiveTileBackground(activeGlobalStyle, currentColor);
            const contrastRatio = getContrastRatio(currentTextColor, effectiveBg);
            const hasLowContrast = isLowContrast(currentTextColor, effectiveBg, 4.5);
            const suggestedReadableColor = getSuggestedTextColor(effectiveBg);

            return (
              <div key={catMeta.id} className="category-color-card">
                {/* Category Card Header */}
                <div className="category-card-header">
                  <div className="category-card-header-left">
                    <div
                      className="category-type-icon-box"
                      style={{
                        backgroundColor: `${currentColor}20`,
                        color: currentColor,
                        borderColor: currentColor,
                      }}
                    >
                      <CategoryIcon size={16} weight="bold" />
                    </div>
                    <div className="category-card-title-group">
                      <strong>{catMeta.label}</strong>
                      <p>{catMeta.sublabel}</p>
                    </div>
                  </div>

                  <div className="category-card-header-right">
                    <div className="category-color-hex-tag" title="Current background color">
                      <span
                        className="category-color-swatch-dot"
                        style={{ backgroundColor: currentColor }}
                      />
                      <span>BG: {currentColor.toUpperCase()}</span>
                    </div>

                    <div className="category-color-hex-tag" title="Current text color">
                      <span
                        className="category-color-swatch-dot"
                        style={{ backgroundColor: currentTextColor }}
                      />
                      <span>TEXT: {currentTextColor.toUpperCase()}</span>
                    </div>

                    <button
                      type="button"
                      className="category-reset-btn"
                      onClick={() => handleResetCategoryColor(catMeta.id)}
                      title={`Reset ${catMeta.label} background and text colors to default`}
                    >
                      <ArrowCounterClockwise size={11} weight="bold" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Category Card Body with Tabbed / Stacked Controls */}
                <div className="category-card-body">
                  {/* SUBSECTION 1: TILE BACKGROUND COLOR */}
                  <div className="category-color-group">
                    <div className="category-color-group-header">
                      <span className="category-color-group-title">Background Color</span>
                      <span className="category-color-group-desc">Tile fill color across calendar views</span>
                    </div>

                    <div className="category-color-controls-row">
                      <div
                        className="category-swatches-row"
                        role="group"
                        aria-label={`${catMeta.label} Background Swatches`}
                      >
                        {catMeta.presets.map((swatch) => {
                          const isSelected =
                            currentColor.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              className={`category-swatch-btn ${isSelected ? "is-selected" : ""}`}
                              style={{ backgroundColor: swatch.hex }}
                              onClick={() => handleCategoryColorChange(catMeta.id, swatch.hex)}
                              title={swatch.label}
                              aria-label={`${catMeta.label} Background ${swatch.label}`}
                            >
                              {isSelected && <Check size={13} weight="bold" color="#ffffff" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="category-custom-controls">
                        <label className="category-native-picker-wrap" title="Open Color Wheel">
                          <input
                            type="color"
                            aria-label={`${catMeta.label} background color wheel`}
                            value={currentColor}
                            onChange={(e) => handleCategoryColorChange(catMeta.id, e.target.value)}
                          />
                        </label>

                        <div className="category-hex-input-wrap">
                          <span className="hex-prefix">#</span>
                          <input
                            type="text"
                            aria-label={`${catMeta.label} custom background HEX`}
                            value={currentColor.replace("#", "")}
                            maxLength={6}
                            onChange={(e) => {
                              const raw = e.target.value.trim().replace("#", "");
                              if (raw.length <= 6) {
                                handleCategoryColorChange(catMeta.id, `#${raw}`);
                              }
                            }}
                            placeholder="0284c7"
                          />
                          <span
                            className={`hex-status-dot ${isValidHexColor(currentColor) ? "is-valid" : "is-invalid"}`}
                            title={isValidHexColor(currentColor) ? "Valid HEX color" : "Invalid HEX"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SUBSECTION 2: TEXT COLOR CUSTOMIZATION */}
                  <div className="category-color-group">
                    <div className="category-color-group-header">
                      <span className="category-color-group-title">Text Color</span>
                      <span className="category-color-group-desc">Tile title, time stamps, and readable text</span>
                    </div>

                    <div className="category-color-controls-row">
                      <div
                        className="category-swatches-row"
                        role="group"
                        aria-label={`${catMeta.label} Text Color Swatches`}
                      >
                        {TEXT_COLOR_PRESETS.map((swatch) => {
                          const isSelected =
                            currentTextColor.toLowerCase() === swatch.hex.toLowerCase();
                          const checkColor = swatch.hex === "#ffffff" || swatch.hex.toLowerCase() === "#fef08a" || swatch.hex.toLowerCase() === "#bae6fd" || swatch.hex.toLowerCase() === "#bbf7d0" || swatch.hex.toLowerCase() === "#fbcfe8" || swatch.hex.toLowerCase() === "#fed7aa" ? "#111827" : "#ffffff";
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              className={`category-swatch-btn ${isSelected ? "is-selected" : ""}`}
                              style={{ backgroundColor: swatch.hex }}
                              onClick={() => handleCategoryTextColorChange(catMeta.id, swatch.hex)}
                              title={swatch.label}
                              aria-label={`${catMeta.label} Text ${swatch.label}`}
                            >
                              {isSelected && <Check size={13} weight="bold" color={checkColor} />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="category-custom-controls">
                        <label className="category-native-picker-wrap" title="Open Text Color Wheel">
                          <input
                            type="color"
                            aria-label={`${catMeta.label} text color wheel`}
                            value={currentTextColor}
                            onChange={(e) => handleCategoryTextColorChange(catMeta.id, e.target.value)}
                          />
                        </label>

                        <div className="category-hex-input-wrap">
                          <span className="hex-prefix">#</span>
                          <input
                            type="text"
                            aria-label={`${catMeta.label} custom text HEX`}
                            value={currentTextColor.replace("#", "")}
                            maxLength={6}
                            onChange={(e) => {
                              const raw = e.target.value.trim().replace("#", "");
                              if (raw.length <= 6) {
                                handleCategoryTextColorChange(catMeta.id, `#${raw}`);
                              }
                            }}
                            placeholder="ffffff"
                          />
                          <span
                            className={`hex-status-dot ${isValidHexColor(currentTextColor) ? "is-valid" : "is-invalid"}`}
                            title={isValidHexColor(currentTextColor) ? "Valid HEX color" : "Invalid HEX"}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Contrast Warning & Suggested Color Button */}
                    {hasLowContrast && (
                      <div className="contrast-warning-banner" role="alert">
                        <div className="contrast-warning-text">
                          <Warning size={15} weight="fill" className="contrast-warning-icon" />
                          <span>
                            <strong>Low contrast ({contrastRatio}:1)</strong> — Text may be difficult to read on {activePresetName}.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="suggested-text-color-btn"
                          onClick={() => handleCategoryTextColorChange(catMeta.id, suggestedReadableColor)}
                          title={`Switch text color to ${suggestedReadableColor === "#ffffff" ? "White" : "Dark Charcoal"}`}
                        >
                          <Lightbulb size={13} weight="fill" />
                          <span>Suggested readable text color ({suggestedReadableColor === "#ffffff" ? "#FFFFFF White" : "#111827 Dark"})</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SUBSECTION 3: BORDER / ACCENT COLOR */}
                  <div className="category-color-group">
                    <div className="category-color-group-header">
                      <span className="category-color-group-title">Border / Accent Color</span>
                      <span className="category-color-group-desc">Signature border accent or outline tint</span>
                    </div>

                    <div className="category-color-controls-row">
                      <div
                        className="category-swatches-row"
                        role="group"
                        aria-label={`${catMeta.label} Border Swatches`}
                      >
                        <button
                          type="button"
                          className={`category-swatch-text-btn ${!currentBorderColor ? "is-selected" : ""}`}
                          onClick={() => handleCategoryBorderColorChange(catMeta.id, undefined)}
                          title="Match background color automatically"
                        >
                          Auto
                        </button>
                        {BORDER_COLOR_PRESETS.map((swatch) => {
                          const isSelected =
                            Boolean(currentBorderColor) &&
                            currentBorderColor?.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              className={`category-swatch-btn ${isSelected ? "is-selected" : ""}`}
                              style={{ backgroundColor: swatch.hex }}
                              onClick={() => handleCategoryBorderColorChange(catMeta.id, swatch.hex)}
                              title={swatch.label}
                              aria-label={`${catMeta.label} Border ${swatch.label}`}
                            >
                              {isSelected && <Check size={13} weight="bold" color="#ffffff" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="category-custom-controls">
                        <label className="category-native-picker-wrap" title="Open Border Color Wheel">
                          <input
                            type="color"
                            aria-label={`${catMeta.label} border color wheel`}
                            value={currentBorderColor || currentColor}
                            onChange={(e) => handleCategoryBorderColorChange(catMeta.id, e.target.value)}
                          />
                        </label>

                        <div className="category-hex-input-wrap">
                          <span className="hex-prefix">#</span>
                          <input
                            type="text"
                            aria-label={`${catMeta.label} custom border HEX`}
                            value={(currentBorderColor || "").replace("#", "")}
                            maxLength={6}
                            onChange={(e) => {
                              const raw = e.target.value.trim().replace("#", "");
                              if (raw.length <= 6) {
                                handleCategoryBorderColorChange(catMeta.id, `#${raw}`);
                              }
                            }}
                            placeholder={currentColor.replace("#", "")}
                          />
                          <span
                            className={`hex-status-dot ${!currentBorderColor || isValidHexColor(currentBorderColor) ? "is-valid" : "is-invalid"}`}
                            title={!currentBorderColor ? "Auto matching" : isValidHexColor(currentBorderColor) ? "Valid HEX color" : "Invalid HEX"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. SIDE-BY-SIDE LIVE PREVIEW */}
      <div className="settings-section-block">
        <div className="settings-block-header">
          <span className="settings-block-title">
            <Sparkle size={15} weight="fill" color="#eab308" />
            <span>Side-by-Side Live Preview</span>
          </span>
          <span className="settings-block-subtitle">
            Preview Event, Task, and Schedule tiles with your customized background, text color, and border accents.
          </span>
        </div>

        <div className="live-preview-box">
          <div className="live-preview-responsive-grid">
            {/* PREVIEW TILE 1: EVENT */}
            <div className={`preview-tile-card ${eventPreview.className}`} style={eventPreview.style}>
              <div className="preview-tile-header">
                <span className="preview-tile-type" style={{ color: eventPreview.indicatorColor }}>
                  <CalendarBlank size={12} weight="bold" />
                  <span>EVENT</span>
                </span>
                <span className="preview-tile-time" style={{ color: eventPreview.textColor }}>
                  10:00 AM – 11:00 AM
                </span>
              </div>
              <div className="preview-tile-title" style={{ color: eventPreview.textColor }}>
                Q4 Strategy & Planning
              </div>
              <div className="preview-tile-footer" style={{ color: eventPreview.textColor }}>
                <span className="preview-tile-meta">📍 Room A · 4 attendees</span>
                <span
                  className="preview-tile-style-pill"
                  style={{
                    borderColor: eventPreview.borderColor,
                    color: eventPreview.textColor,
                  }}
                >
                  {activePresetName}
                </span>
              </div>
            </div>

            {/* PREVIEW TILE 2: TASK */}
            <div className={`preview-tile-card ${taskPreview.className}`} style={taskPreview.style}>
              <div className="preview-tile-header">
                <span className="preview-tile-type" style={{ color: taskPreview.indicatorColor }}>
                  <CheckSquare size={12} weight="bold" />
                  <span>TASK</span>
                </span>
                <span className="preview-tile-time" style={{ color: taskPreview.textColor }}>
                  Due Today · 5:00 PM
                </span>
              </div>
              <div className="preview-tile-title" style={{ color: taskPreview.textColor }}>
                Finalize client proposal
              </div>
              <div className="preview-tile-footer" style={{ color: taskPreview.textColor }}>
                <span className="preview-tile-meta">🏷️ Work · 🔥 Urgent</span>
                <span
                  className="preview-tile-style-pill"
                  style={{
                    borderColor: taskPreview.borderColor,
                    color: taskPreview.textColor,
                  }}
                >
                  {activePresetName}
                </span>
              </div>
            </div>

            {/* PREVIEW TILE 3: SCHEDULE */}
            <div className={`preview-tile-card ${schedulePreview.className}`} style={schedulePreview.style}>
              <div className="preview-tile-header">
                <span className="preview-tile-type" style={{ color: schedulePreview.indicatorColor }}>
                  <Clock size={12} weight="bold" />
                  <span>SCHEDULE</span>
                </span>
                <span className="preview-tile-time" style={{ color: schedulePreview.textColor }}>
                  30m Slots
                </span>
              </div>
              <div className="preview-tile-title" style={{ color: schedulePreview.textColor }}>
                Client Consultation Window
              </div>
              <div className="preview-tile-footer" style={{ color: schedulePreview.textColor }}>
                <span className="preview-tile-meta">⏱️ Open Booking · Weekdays</span>
                <span
                  className="preview-tile-style-pill"
                  style={{
                    borderColor: schedulePreview.borderColor,
                    color: schedulePreview.textColor,
                  }}
                >
                  {activePresetName}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. APPLY AND RESET CONTROLS */}
      <div className="calendar-styles-actions-bar">
        <button
          type="button"
          className="apply-styles-action-btn"
          onClick={handleApply}
        >
          {appliedFeedback ? (
            <>
              <Check size={16} weight="bold" />
              <span>✓ Changes Applied!</span>
            </>
          ) : (
            <>
              <Check size={16} weight="bold" />
              <span>Apply Changes</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="reset-all-action-btn"
          onClick={handleResetAll}
        >
          <ArrowCounterClockwise size={14} weight="bold" />
          <span>Reset All Item Colors</span>
        </button>
      </div>
    </section>
  );
}
