export interface GoogleCalendarConfig {
  id: string;
  name: string;
  description?: string;
  color: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary?: boolean;
  enabled: boolean;
  syncDirection: "two_way" | "import_only" | "export_only";
  privacyMode: "full_details" | "availability_only";
  accountId?: string;
  accountEmail?: string;
}

export interface ConnectedGoogleAccount {
  accountId: string;
  userEmail: string;
  userName?: string;
  userPicture?: string;
  isPrimary: boolean;
  connectedAt: string;
}

export interface GoogleIntegrationStatus {
  connected: boolean;
  userEmail?: string;
  connectedAt?: string;
  lastSyncTime?: string;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string;
  calendars: GoogleCalendarConfig[];
  accounts?: ConnectedGoogleAccount[];
}

export interface GoogleCalendarSyncSettings {
  enabled: boolean;
  autoSyncTasks: boolean; // Auto-export eligible Planorama tasks to primary Google Calendar
  deleteGoogleEventOnTaskDelete: boolean; // Safety guard: prevent accidental deletion of client events
  defaultCalendarId?: string; // Target calendar for new Google events
  calendarConfigs: Record<string, GoogleCalendarConfig>;
  lastSyncTime?: string;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string;
}

export const DEFAULT_GOOGLE_SYNC_SETTINGS: GoogleCalendarSyncSettings = {
  enabled: false,
  autoSyncTasks: false,
  deleteGoogleEventOnTaskDelete: false,
  calendarConfigs: {},
};

export interface SyncResult {
  importedCount: number;
  exportedCount: number;
  updatedCount: number;
  deletedCount: number;
  conflictsResolved?: number;
  errors: string[];
  lastSyncTime: string;
}

/**
 * Event-to-Task mapping options
 */
export interface EventMappingContext {
  calendar: GoogleCalendarConfig;
}
