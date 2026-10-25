"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  CheckCircle,
  Eye,
  EyeSlash,
  Lock,
  Plugs,
  PlugsConnected,
  Plus,
  ShieldCheck,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import type { PlannerPreferences } from "@/lib/schedule/types";
import type {
  GoogleCalendarConfig,
  GoogleCalendarSyncSettings,
  GoogleIntegrationStatus,
} from "@/lib/google-calendar/types";
import {
  DEFAULT_GOOGLE_SYNC_SETTINGS,
} from "@/lib/google-calendar/types";
import {
  disconnectGoogleAccount,
  fetchGoogleCalendars,
  fetchGoogleIntegrationStatus,
} from "@/lib/google-calendar/sync-service";

interface GoogleCalendarSettingsProps {
  preferences: PlannerPreferences;
  onSavePreferences: (next: PlannerPreferences) => void;
  onSyncNow: () => Promise<void>;
  isSyncing: boolean;
  showToast: (msg: string) => void;
  onError: (err: string) => void;
}

const PRESET_CALENDAR_COLORS = [
  "#4285F4", // Google Blue
  "#EA4335", // Red
  "#FBBC05", // Amber
  "#34A853", // Green
  "#9C27B0", // Purple
  "#E91E63", // Pink
  "#00BCD4", // Cyan
  "#FF9800", // Orange
  "#607D8B", // Slate
  "#009688", // Teal
];

export function GoogleCalendarSettings({
  preferences,
  onSavePreferences,
  onSyncNow,
  isSyncing,
  showToast,
  onError,
}: GoogleCalendarSettingsProps) {
  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarConfig[]>([]);

  const syncSettings: GoogleCalendarSyncSettings =
    preferences.googleCalendarSync ?? DEFAULT_GOOGLE_SYNC_SETTINGS;

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const integrationStatus = await fetchGoogleIntegrationStatus();
      setStatus(integrationStatus);

      if (integrationStatus.connected) {
        try {
          const fetchedCalendars = await fetchGoogleCalendars();
          setCalendars(fetchedCalendars);

          // Merge fetched calendars with any existing configs in preferences
          const currentConfigs = { ...(syncSettings.calendarConfigs || {}) };
          let changed = false;

          for (const cal of fetchedCalendars) {
            if (!currentConfigs[cal.id]) {
              currentConfigs[cal.id] = cal;
              changed = true;
            } else {
              // Update name or access role if changed on Google side
              currentConfigs[cal.id] = {
                ...cal,
                ...currentConfigs[cal.id],
                name: cal.name,
                accessRole: cal.accessRole,
                primary: cal.primary,
                accountId: cal.accountId,
                accountEmail: cal.accountEmail,
              };
            }
          }

          if (changed) {
            onSavePreferences({
              ...preferences,
              googleCalendarSync: {
                ...syncSettings,
                enabled: true,
                calendarConfigs: currentConfigs,
              },
            });
          }
        } catch (calErr) {
          console.error("Failed to fetch calendars:", calErr);
        }
      }
    } catch {
      // Integration not connected or server offline
      setStatus({ connected: false, calendars: [] });
    } finally {
      setIsLoading(false);
    }
  }, [preferences, syncSettings, onSavePreferences]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function handleConnect() {
    // Initiate OAuth flow with account selection
    window.location.href = "/api/auth/google";
  }

  async function handleDisconnectAccount(accountId?: string, email?: string) {
    const isMultiple = (status?.accounts?.length ?? 0) > 1;
    const confirmMsg = email && isMultiple
      ? `Disconnect Google account "${email}"? This will stop synchronizing its calendars. Other connected accounts will remain active.`
      : "Are you sure you want to disconnect Google Calendar? This will stop synchronization and revoke stored tokens. Existing imported tasks in Planorama will be preserved.";

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsDisconnecting(true);
    try {
      await disconnectGoogleAccount(accountId);
      await loadStatus();

      // Clean up calendars belonging to this account from preferences
      if (accountId) {
        const remainingConfigs = { ...syncSettings.calendarConfigs };
        for (const [id, cfg] of Object.entries(remainingConfigs)) {
          if (cfg.accountId === accountId || cfg.accountEmail === email) {
            delete remainingConfigs[id];
          }
        }
        onSavePreferences({
          ...preferences,
          googleCalendarSync: {
            ...syncSettings,
            calendarConfigs: remainingConfigs,
          },
        });
      } else {
        onSavePreferences({
          ...preferences,
          googleCalendarSync: {
            ...syncSettings,
            enabled: false,
          },
        });
      }

      showToast(email && isMultiple ? `Account "${email}" disconnected.` : "Google Calendar disconnected.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to disconnect.";
      onError(msg);
    } finally {
      setIsDisconnecting(false);
    }
  }

  function handleToggleCalendar(calendarId: string) {
    const current = syncSettings.calendarConfigs[calendarId];
    const targetCalendar = calendars.find((c) => c.id === calendarId);
    if (!targetCalendar && !current) return;

    const base = current || targetCalendar;
    const isNowEnabled = !(base?.enabled ?? true);

    const updatedConfigs = {
      ...syncSettings.calendarConfigs,
      [calendarId]: {
        ...(base as GoogleCalendarConfig),
        enabled: isNowEnabled,
      },
    };

    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        calendarConfigs: updatedConfigs,
      },
    });
  }

  function handleUpdateCalendarColor(calendarId: string, color: string) {
    const current = syncSettings.calendarConfigs[calendarId];
    if (!current) return;

    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        calendarConfigs: {
          ...syncSettings.calendarConfigs,
          [calendarId]: {
            ...current,
            color,
          },
        },
      },
    });
  }

  function handleTogglePrivacyMode(calendarId: string) {
    const current = syncSettings.calendarConfigs[calendarId];
    if (!current) return;

    const nextMode =
      current.privacyMode === "availability_only"
        ? "full_details"
        : "availability_only";

    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        calendarConfigs: {
          ...syncSettings.calendarConfigs,
          [calendarId]: {
            ...current,
            privacyMode: nextMode,
          },
        },
      },
    });
  }

  function handleUpdateSyncDirection(
    calendarId: string,
    direction: "two_way" | "import_only" | "export_only"
  ) {
    const current = syncSettings.calendarConfigs[calendarId];
    if (!current) return;

    // Safety guard: read-only calendars can only be import_only
    if (
      (current.accessRole === "reader" || current.accessRole === "freeBusyReader") &&
      direction !== "import_only"
    ) {
      onError("Read-only client calendars cannot export tasks to Google.");
      return;
    }

    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        calendarConfigs: {
          ...syncSettings.calendarConfigs,
          [calendarId]: {
            ...current,
            syncDirection: direction,
          },
        },
      },
    });
  }

  function handleUpdateDefaultCalendar(calendarId: string) {
    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        defaultCalendarId: calendarId === "none" ? undefined : calendarId,
      },
    });
  }

  function handleToggleAutoSyncTasks() {
    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        autoSyncTasks: !syncSettings.autoSyncTasks,
      },
    });
  }

  function handleToggleDeleteGoogleEvent() {
    onSavePreferences({
      ...preferences,
      googleCalendarSync: {
        ...syncSettings,
        deleteGoogleEventOnTaskDelete: !syncSettings.deleteGoogleEventOnTaskDelete,
      },
    });
  }

  const formatLastSync = (timestamp?: string) => {
    if (!timestamp) return "Never synced";
    try {
      const d = new Date(timestamp);
      return `Last synced ${d.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      })} at ${d.toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    } catch {
      return "Recently synced";
    }
  };

  const writableCalendars = calendars.filter(
    (c) => c.accessRole !== "reader" && c.accessRole !== "freeBusyReader"
  );

  return (
    <section className="preferences-section google-integration-section">
      <div className="preferences-section-kicker">
        <PlugsConnected size={16} weight="bold" style={{ marginRight: 6, verticalAlign: "-2px" }} />
        Integrations &rarr; Google Calendar
      </div>
      <p className="preferences-section-desc">
        Connect your Google account and authorized client calendars to synchronize appointments and meetings
        seamlessly with Planorama tasks.
      </p>

      {isLoading ? (
        <div className="google-sync-loading-card">
          <ArrowClockwise size={20} className="spinning-icon" />
          <span>Checking Google Calendar connection status&hellip;</span>
        </div>
      ) : !status?.connected ? (
        /* DISCONNECTED STATE */
        <div className="google-connect-card">
          <div className="google-connect-hero">
            <div className="google-connect-icon-wrapper">
              <CalendarBlank size={36} weight="duotone" color="#4285F4" />
            </div>
            <div className="google-connect-info">
              <h4>Connect Google Calendar</h4>
              <p>
                Seamlessly import client meetings, personal appointments, and deadlines. Designed specifically
                for Virtual Assistants managing multiple client schedules.
              </p>
            </div>
          </div>

          <div className="google-va-highlights">
            <div className="va-highlight-item">
              <ShieldCheck size={18} weight="fill" color="#16a34a" />
              <span><strong>Client Permission Safety:</strong> Read-only client calendars are strictly safeguarded against unauthorized writes or deletes.</span>
            </div>
            <div className="va-highlight-item">
              <EyeSlash size={18} weight="fill" color="#2563eb" />
              <span><strong>Confidentiality Protection:</strong> Display private client appointments as &ldquo;Busy&rdquo; availability blocks.</span>
            </div>
            <div className="va-highlight-item">
              <CheckCircle size={18} weight="fill" color="#9333ea" />
              <span><strong>Multi-Account &amp; Client Delegation:</strong> Connect your personal account and separately authorized client accounts without mixing schedules.</span>
            </div>
          </div>

          <div className="google-connect-action-row">
            <button
              type="button"
              className="google-oauth-connect-btn"
              onClick={handleConnect}
              id="google-connect-button"
            >
              <svg className="google-logo-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Connect Google Calendar</span>
            </button>
            <span className="google-oauth-note">
              OAuth 2.0 consent with least-privilege calendar scopes. Tokens encrypted at rest.
            </span>
          </div>
        </div>
      ) : (
        /* CONNECTED STATE */
        <div className="google-connected-dashboard">
          {/* Top Banner & Global Sync Action */}
          <div className="google-account-banner">
            <div className="google-account-info">
              <div className="google-account-header-line">
                <span className="google-badge-connected">
                  <Plugs size={14} weight="bold" /> Connected
                </span>
                <span className="google-user-email">
                  {status.accounts && status.accounts.length > 1
                    ? `${status.accounts.length} Google Accounts Connected`
                    : status.userEmail || "Google Account"}
                </span>
              </div>
              <span className="google-sync-timestamp">
                {formatLastSync(status.lastSyncTime || syncSettings.lastSyncTime)}
              </span>
            </div>

            <div className="google-account-actions">
              <button
                type="button"
                className="google-sync-now-btn"
                onClick={onSyncNow}
                disabled={isSyncing}
                title="Synchronize events and eligible tasks now"
              >
                <ArrowClockwise
                  size={15}
                  weight="bold"
                  className={isSyncing ? "spinning-icon" : ""}
                />
                <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
              </button>
            </div>
          </div>

          {status.lastSyncError && (
            <div className="google-sync-error-banner" role="alert">
              <WarningCircle size={18} weight="fill" color="#dc2626" />
              <span>{status.lastSyncError}</span>
            </div>
          )}

          {/* Connected Accounts Manager (Virtual Assistant Multi-Account Support) */}
          <div className="google-accounts-manager-card" style={{
            background: "#fffdfa",
            border: "2px solid #1c1917",
            borderRadius: "10px",
            padding: "14px",
            boxShadow: "3px 3px 0 #1c1917",
            marginBottom: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h5 style={{ margin: 0, fontSize: "13.5px", fontWeight: 800, color: "#1c1917" }}>
                  Connected Accounts ({status.accounts?.length || 1})
                </h5>
                <span style={{ fontSize: "11.5px", color: "#78716c" }}>
                  Virtual assistants can connect personal and client Google accounts separately.
                </span>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 10px",
                  background: "#fff",
                  border: "1.5px solid #1c1917",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  boxShadow: "1.5px 1.5px 0 #1c1917",
                  cursor: "pointer",
                }}
                title="Connect an authorized client or additional Google Calendar"
              >
                <Plus size={14} weight="bold" />
                <span>Add Google Account</span>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(status.accounts && status.accounts.length > 0 ? status.accounts : [
                { accountId: "primary", userEmail: status.userEmail || "Connected Account", isPrimary: true, connectedAt: status.connectedAt || "" }
              ]).map((acc) => (
                <div
                  key={acc.accountId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#fbf8f2",
                    border: "1.5px solid #e7e0d3",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: acc.isPrimary ? "#ffd84d" : "#7cc4ff",
                        border: "1.5px solid #1c1917",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {acc.userName ? acc.userName[0].toUpperCase() : <User size={14} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {acc.userEmail}
                        </span>
                        {acc.isPrimary ? (
                          <span style={{ fontSize: "10px", background: "#fef08a", border: "1px solid #ca8a04", padding: "1px 6px", borderRadius: "999px", fontWeight: 800 }}>
                            Primary
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", background: "#e0f2fe", border: "1px solid #0284c7", padding: "1px 6px", borderRadius: "999px", fontWeight: 800, color: "#0369a1" }}>
                            Client Account
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDisconnectAccount(acc.accountId, acc.userEmail)}
                    disabled={isDisconnecting}
                    style={{
                      padding: "4px 8px",
                      background: "#fee2e2",
                      border: "1.5px solid #ef4444",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#991b1b",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    title={`Disconnect ${acc.userEmail}`}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Default Calendar for Newly Created Events */}
          <div style={{
            background: "#fffdfa",
            border: "2px solid #1c1917",
            borderRadius: "10px",
            padding: "12px 14px",
            boxShadow: "3px 3px 0 #1c1917",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}>
            <div>
              <strong style={{ fontSize: "12.5px", color: "#1c1917" }}>Default Calendar for New Events:</strong>
              <div style={{ fontSize: "11.5px", color: "#78716c" }}>
                Newly created tasks with Google sync enabled will be saved to this calendar by default.
              </div>
            </div>
            <select
              value={syncSettings.defaultCalendarId || "none"}
              onChange={(e) => handleUpdateDefaultCalendar(e.target.value)}
              className="google-select-sm"
              style={{ padding: "6px 10px", fontSize: "12px", minWidth: "180px" }}
              aria-label="Default calendar for new events"
            >
              <option value="none">Planorama (Local Only)</option>
              {writableCalendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name} {cal.accountEmail ? `(${cal.accountEmail})` : ""} {cal.primary ? "· Primary" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Calendars Configuration Table */}
          <div className="google-calendars-list-container">
            <div className="google-calendars-header">
              <div>
                <h5>Client &amp; Personal Calendars</h5>
                <p>Choose which calendars to display in your views and configure sync permissions.</p>
              </div>
              <button
                type="button"
                className="google-refresh-calendars-btn"
                onClick={loadStatus}
                title="Refresh calendar list from Google"
              >
                <ArrowClockwise size={13} weight="bold" /> Refresh list
              </button>
            </div>

            {calendars.length === 0 ? (
              <p className="google-empty-cals">No Google Calendars found for this account.</p>
            ) : (
              <div className="google-calendars-grid" role="list">
                {calendars.map((cal) => {
                  const savedConfig = syncSettings.calendarConfigs[cal.id];
                  const isEnabled = savedConfig ? savedConfig.enabled : cal.enabled;
                  const activeColor = savedConfig?.color || cal.color || "#4285F4";
                  const isReadOnly =
                    cal.accessRole === "reader" || cal.accessRole === "freeBusyReader";
                  const privacyMode = savedConfig?.privacyMode || "full_details";
                  const syncDirection = savedConfig?.syncDirection || "two_way";

                  return (
                    <div
                      key={cal.id}
                      className={`google-calendar-card ${isEnabled ? "is-active" : "is-disabled"}`}
                      style={{ borderLeftColor: activeColor }}
                    >
                      <div className="google-calendar-card-top">
                        <label className="google-calendar-checkbox-label">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => handleToggleCalendar(cal.id)}
                            aria-label={`Toggle synchronization for ${cal.name}`}
                          />
                          <span
                            className="google-cal-color-dot"
                            style={{ backgroundColor: activeColor }}
                            aria-hidden="true"
                          />
                          <div style={{ display: "inline-flex", flexDirection: "column" }}>
                            <strong className="google-cal-name">{cal.name}</strong>
                            {cal.accountEmail && (
                              <span style={{ fontSize: "10.5px", color: "#78716c", fontWeight: 500 }}>
                                {cal.accountEmail}
                              </span>
                            )}
                          </div>
                          {cal.primary && (
                            <span className="google-cal-primary-chip">Primary</span>
                          )}
                        </label>

                        <div className="google-cal-role-chip">
                          {isReadOnly ? (
                            <span className="role-chip readonly" title="Shared with read-only access. Planorama will not attempt writes.">
                              <Lock size={12} weight="bold" /> Read-only
                            </span>
                          ) : (
                            <span className="role-chip writable" title="You have edit access to this calendar.">
                              Can edit
                            </span>
                          )}
                        </div>
                      </div>

                      {isEnabled && (
                        <div className="google-calendar-controls">
                          {/* Color Palette Selector */}
                          <div className="google-cal-control-item">
                            <span className="cal-control-label">Color:</span>
                            <div className="google-color-swatches" role="radiogroup" aria-label={`Color for ${cal.name}`}>
                              {PRESET_CALENDAR_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`color-swatch-circle ${activeColor.toLowerCase() === c.toLowerCase() ? "selected" : ""}`}
                                  style={{ backgroundColor: c }}
                                  onClick={() => handleUpdateCalendarColor(cal.id, c)}
                                  title={`Set calendar color to ${c}`}
                                  aria-label={`Color ${c}`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Sync Direction */}
                          <div className="google-cal-control-item">
                            <span className="cal-control-label">Sync:</span>
                            <select
                              value={isReadOnly ? "import_only" : syncDirection}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                handleUpdateSyncDirection(
                                  cal.id,
                                  e.target.value as "two_way" | "import_only" | "export_only"
                                )
                              }
                              className="google-select-sm"
                              aria-label={`Sync direction for ${cal.name}`}
                            >
                              <option value="two_way">Two-way (Import &amp; Export)</option>
                              <option value="import_only">Import only (View in Planorama)</option>
                              <option value="export_only">Export only</option>
                            </select>
                          </div>

                          {/* Privacy Mode */}
                          <div className="google-cal-control-item">
                            <span className="cal-control-label">Privacy:</span>
                            <button
                              type="button"
                              className={`google-privacy-toggle ${privacyMode === "availability_only" ? "busy-mode" : ""}`}
                              onClick={() => handleTogglePrivacyMode(cal.id)}
                              title={
                                privacyMode === "availability_only"
                                  ? "Events from this calendar are displayed as 'Busy' to protect client privacy."
                                  : "Display full event titles and details."
                              }
                            >
                              {privacyMode === "availability_only" ? (
                                <>
                                  <EyeSlash size={13} weight="bold" />
                                  <span>Busy only</span>
                                </>
                              ) : (
                                <>
                                  <Eye size={13} weight="bold" />
                                  <span>Full details</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Task Export & Sync Rules */}
          <div className="google-sync-options-box">
            <h6>Planorama Task &rarr; Google Calendar Rules</h6>

            <label className="google-sync-checkbox-row">
              <input
                type="checkbox"
                checked={syncSettings.autoSyncTasks}
                onChange={handleToggleAutoSyncTasks}
              />
              <div className="sync-checkbox-text">
                <strong>Automatically export eligible Planorama tasks</strong>
                <span>
                  When enabled, tasks with scheduled due dates created in Planorama will be exported as events
                  to your default Google Calendar.
                </span>
              </div>
            </label>

            <label className="google-sync-checkbox-row">
              <input
                type="checkbox"
                checked={syncSettings.deleteGoogleEventOnTaskDelete}
                onChange={handleToggleDeleteGoogleEvent}
              />
              <div className="sync-checkbox-text">
                <strong>Delete Google Calendar event when related Planorama task is deleted</strong>
                <span>
                  Safety protection: when disabled, deleting a task in Planorama simply unlinks it, preventing
                  accidental deletions on client calendars.
                </span>
              </div>
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
