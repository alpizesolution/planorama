"use client";

import { useEffect, useState } from "react";
import {
  X,
  Gear,
  DotsSixVertical,
  CaretUp,
  CaretDown,
  Eye,
  EyeSlash,
  ArrowClockwise,
  Check,
  Desktop,
  DeviceMobile,
} from "@phosphor-icons/react";
import type {
  DashboardWidgetConfig,
  DashboardWidgetId,
  DashboardWidgetHeight,
} from "@/lib/dashboard/types";
import {
  DASHBOARD_WIDGET_METADATA,
  WIDGET_WIDTH_LABELS,
  WIDGET_HEIGHT_LABELS,
  getWidgetColSpan,
  resolveDashboardWidgets,
} from "@/lib/dashboard/types";

export interface DashboardCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgetConfigs?: DashboardWidgetConfig[];
  onSaveWidgets: (nextWidgets: DashboardWidgetConfig[]) => void;
  onRestoreDefaults: () => void;
}

export function DashboardCustomizationModal({
  isOpen,
  onClose,
  widgetConfigs,
  onSaveWidgets,
  onRestoreDefaults,
}: DashboardCustomizationModalProps) {
  const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Close on Escape key and prevent background scroll
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentWidgets = resolveDashboardWidgets(widgetConfigs);
  const activeDesktopWidgets = currentWidgets.filter((w) => w.visible);

  function handleToggleVisibility(id: DashboardWidgetId) {
    const next = currentWidgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    onSaveWidgets(next);
  }

  function handleToggleMobileVisibility(id: DashboardWidgetId) {
    const next = currentWidgets.map((w) => {
      if (w.id === id) {
        const currentMobile = w.mobileVisible !== false;
        return { ...w, mobileVisible: !currentMobile };
      }
      return w;
    });
    onSaveWidgets(next);
  }

  function handleUpdateMobileHeight(id: DashboardWidgetId, mobileHeight: DashboardWidgetHeight) {
    const meta = DASHBOARD_WIDGET_METADATA[id];
    if (!meta.allowedHeights.includes(mobileHeight)) return;
    const next = currentWidgets.map((w) =>
      w.id === id ? { ...w, mobileHeight } : w
    );
    onSaveWidgets(next);
  }

  function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentWidgets.length) return;

    const next = [...currentWidgets];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onSaveWidgets(next);
  }

  function handleDragStart(index: number, e: React.DragEvent) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  }

  function handleDragOver(index: number, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(targetIndex: number, e: React.DragEvent) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const next = [...currentWidgets];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);

    setDraggedIndex(null);
    setDragOverIndex(null);
    onSaveWidgets(next);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div
      className="dashboard-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-customization-title"
    >
      <div
        className="dashboard-customization-modal neo-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="dashboard-customization-header">
          <div className="dashboard-customization-title-group">
            <span className="dashboard-customization-kicker">WIDGET ORDER & VISIBILITY</span>
            <div className="dashboard-customization-title-row">
              <span className="dashboard-customization-icon-wrap" aria-hidden="true">
                <Gear size={20} weight="bold" />
              </span>
              <h2 id="dashboard-customization-title" className="dashboard-customization-title">
                Customize Dashboard
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="dashboard-modal-close-btn"
            onClick={onClose}
            aria-label="Close dashboard customization"
            title="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tab switcher: Desktop vs Mobile */}
        <div className="dashboard-customization-tabs" role="tablist" aria-label="Device layout mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "desktop"}
            className={`dashboard-tab-btn ${activeTab === "desktop" ? "is-active" : ""}`}
            onClick={() => setActiveTab("desktop")}
          >
            <Desktop size={16} weight="bold" />
            <span>Desktop Layout</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "mobile"}
            className={`dashboard-tab-btn ${activeTab === "mobile" ? "is-active" : ""}`}
            onClick={() => setActiveTab("mobile")}
          >
            <DeviceMobile size={16} weight="bold" />
            <span>Mobile Layout</span>
          </button>
        </div>

        {activeTab === "desktop" ? (
          <>
            <p className="dashboard-customization-desc">
              Manage visible widgets and their order. On the dashboard, drag the edges or corner of any widget to resize it directly.
            </p>

            {/* Visual Mini-Dashboard Preview Bar */}
            <div className="dashboard-visual-preview-box">
              <div className="dashboard-visual-preview-header">
                <span>Layout Preview (12 Columns)</span>
                <span>{activeDesktopWidgets.length} Visible Widgets</span>
              </div>
              <div className="dashboard-visual-preview-grid">
                {activeDesktopWidgets.map((w) => {
                  const meta = DASHBOARD_WIDGET_METADATA[w.id];
                  const colSpan = getWidgetColSpan(w);
                  return (
                    <div
                      key={w.id}
                      className={`dashboard-preview-cell cell-cols-${colSpan}`}
                      title={`${meta.name} (${colSpan} columns)`}
                    >
                      <span className="dashboard-preview-cell-name">
                        {meta.icon} {meta.name}
                      </span>
                      <span className="dashboard-preview-cell-tag">
                        {colSpan} cols
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Widget rows list */}
            <div
              className="dashboard-customization-list"
              role="list"
              aria-label="Dashboard widget configuration"
            >
              {currentWidgets.map((w, index) => {
                const meta = DASHBOARD_WIDGET_METADATA[w.id];
                const height = w.height || meta.defaultHeight;
                const colSpan = getWidgetColSpan(w);
                const isFirst = index === 0;
                const isLast = index === currentWidgets.length - 1;
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={w.id}
                    className={`dashboard-customization-row ${
                      w.visible ? "is-visible" : "is-hidden"
                    } ${isDragging ? "is-dragging" : ""} ${
                      isDragOver ? "is-drag-over" : ""
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragOver={(e) => handleDragOver(index, e)}
                    onDrop={(e) => handleDrop(index, e)}
                    onDragEnd={handleDragEnd}
                    role="listitem"
                  >
                    <div className="dashboard-row-main-content">
                      {/* Left section: Drag handle, Icon, Name, Badge, Description */}
                      <div className="dashboard-row-left">
                        <span
                          className="dashboard-row-drag-handle"
                          title="Drag to reorder"
                          aria-label={`Drag to reorder ${meta.name}`}
                        >
                          <DotsSixVertical size={18} weight="bold" />
                        </span>

                        <span className="dashboard-row-icon" aria-hidden="true">
                          {meta.icon}
                        </span>

                        <div className="dashboard-row-info">
                          <div className="dashboard-row-name-row">
                            <strong className="dashboard-row-name">{meta.name}</strong>
                            {meta.badge && (
                              <span className="dashboard-row-badge">{meta.badge}</span>
                            )}
                            {meta.minWidth !== "small" && (
                              <span
                                className="dashboard-row-constraint-badge"
                                title={`Minimum width is ${WIDGET_WIDTH_LABELS[meta.minWidth].label}`}
                              >
                                Min {WIDGET_WIDTH_LABELS[meta.minWidth].short}
                              </span>
                            )}
                          </div>
                          <span className="dashboard-row-desc">{meta.description}</span>
                        </div>
                      </div>

                      {/* Right section: Reorder arrows & Visibility toggle */}
                      <div className="dashboard-row-actions">
                        <div className="dashboard-row-order-btns">
                          <button
                            type="button"
                            className="pref-order-btn"
                            onClick={() => handleMove(index, "up")}
                            disabled={isFirst}
                            aria-label={`Move ${meta.name} up`}
                            title="Move up"
                          >
                            <CaretUp size={14} weight="bold" />
                          </button>
                          <button
                            type="button"
                            className="pref-order-btn"
                            onClick={() => handleMove(index, "down")}
                            disabled={isLast}
                            aria-label={`Move ${meta.name} down`}
                            title="Move down"
                          >
                            <CaretDown size={14} weight="bold" />
                          </button>
                        </div>

                        <button
                          type="button"
                          className={`widget-visibility-btn ${
                            w.visible ? "is-active" : "is-hidden"
                          }`}
                          onClick={() => handleToggleVisibility(w.id)}
                          aria-pressed={w.visible}
                          title={w.visible ? `Hide ${meta.name}` : `Show ${meta.name}`}
                        >
                          {w.visible ? (
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

                    {/* Current dimension summary & drag-to-resize tip */}
                    {w.visible && (
                      <div className="dashboard-row-dimensions">
                        <span className="dashboard-dim-summary-tag">
                          Current: {colSpan} Columns {colSpan === meta.recommendedCols ? "(Recommended)" : ""} · {WIDGET_HEIGHT_LABELS[height].label}
                        </span>
                        <span className="dashboard-dim-tip-text">
                          💡 Drag edges on dashboard to resize
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="dashboard-customization-desc">
              On mobile phones, widgets adapt to a single-column layout. Configure widget visibility and vertical height preferences for mobile screens.
            </p>

            <div
              className="dashboard-customization-list"
              role="list"
              aria-label="Mobile widget preferences"
            >
              {currentWidgets.map((w) => {
                const meta = DASHBOARD_WIDGET_METADATA[w.id];
                const isMobileVisible = w.mobileVisible !== false;
                const mobileHeight = w.mobileHeight || w.height || meta.defaultHeight;

                return (
                  <div
                    key={w.id}
                    className={`dashboard-customization-row ${
                      isMobileVisible ? "is-visible" : "is-hidden"
                    }`}
                    role="listitem"
                  >
                    <div className="dashboard-row-main-content">
                      <div className="dashboard-row-left">
                        <span className="dashboard-row-icon" aria-hidden="true">
                          {meta.icon}
                        </span>
                        <div className="dashboard-row-info">
                          <div className="dashboard-row-name-row">
                            <strong className="dashboard-row-name">{meta.name}</strong>
                            {meta.badge && (
                              <span className="dashboard-row-badge">{meta.badge}</span>
                            )}
                          </div>
                          <span className="dashboard-row-desc">
                            {isMobileVisible ? "Visible on mobile" : "Hidden on mobile"}
                          </span>
                        </div>
                      </div>

                      <div className="dashboard-row-actions">
                        <button
                          type="button"
                          className={`widget-visibility-btn ${
                            isMobileVisible ? "is-active" : "is-hidden"
                          }`}
                          onClick={() => handleToggleMobileVisibility(w.id)}
                          aria-pressed={isMobileVisible}
                          title={isMobileVisible ? `Hide ${meta.name} on mobile` : `Show ${meta.name} on mobile`}
                        >
                          {isMobileVisible ? (
                            <>
                              <Eye size={15} weight="bold" />
                              <span>Mobile On</span>
                            </>
                          ) : (
                            <>
                              <EyeSlash size={15} weight="bold" />
                              <span>Mobile Off</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {isMobileVisible && (
                      <div className="dashboard-row-dimensions">
                        <div className="dashboard-dim-group">
                          <span className="dashboard-dim-label">Mobile Height:</span>
                          <div className="dashboard-dim-pills" role="radiogroup" aria-label={`${meta.name} mobile height`}>
                            {(["compact", "standard", "tall"] as DashboardWidgetHeight[]).map((opt) => {
                              const isAllowed = meta.allowedHeights.includes(opt);
                              const isSelected = mobileHeight === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`dashboard-dim-pill ${isSelected ? "is-active" : ""}`}
                                  disabled={!isAllowed}
                                  onClick={() => handleUpdateMobileHeight(w.id, opt)}
                                  title={WIDGET_HEIGHT_LABELS[opt].label}
                                  aria-pressed={isSelected}
                                >
                                  {WIDGET_HEIGHT_LABELS[opt].label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer actions */}
        <div className="dashboard-customization-footer">
          <button
            type="button"
            className="dashboard-restore-default-btn"
            onClick={onRestoreDefaults}
            title="Restore default widget layout and dimensions"
          >
            <ArrowClockwise size={14} weight="bold" />
            <span>Restore Default Layout</span>
          </button>

          <button
            type="button"
            className="dashboard-customization-done-btn neo-btn"
            onClick={onClose}
          >
            <Check size={16} weight="bold" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
