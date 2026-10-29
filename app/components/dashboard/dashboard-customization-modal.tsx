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
} from "@phosphor-icons/react";
import type { DashboardWidgetConfig, DashboardWidgetId } from "@/lib/dashboard/types";
import {
  DASHBOARD_WIDGET_METADATA,
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

  function handleToggleVisibility(id: DashboardWidgetId) {
    const next = currentWidgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
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
            <span className="dashboard-customization-kicker">WIDGET LAYOUT & VISIBILITY</span>
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

        <p className="dashboard-customization-desc">
          Show, hide, or reorder widgets on your command center. Drag cards using the handle on the
          left or use the up/down arrows to rearrange.
        </p>

        {/* Widget rows list */}
        <div
          className="dashboard-customization-list"
          role="list"
          aria-label="Dashboard widget configuration"
        >
          {currentWidgets.map((w, index) => {
            const meta = DASHBOARD_WIDGET_METADATA[w.id];
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
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="dashboard-customization-footer">
          <button
            type="button"
            className="dashboard-restore-default-btn"
            onClick={onRestoreDefaults}
            title="Restore default widget layout and visibility"
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
