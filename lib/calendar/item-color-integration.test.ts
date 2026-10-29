import { describe, it, expect } from "vitest";
import {
  DEFAULT_ITEM_COLORS,
  resolveItemColorPreferences,
  resolveItemStylesPreferences,
  getItemTileStyle,
  getItemTextColor,
  getItemType,
  getItemColor,
  type ItemColorPreferences,
} from "./item-color";
import { DEFAULT_PREFERENCES, type PlannerPreferences, type PlannerTask } from "../schedule/types";
import { validateTask } from "../schedule/validation";

describe("PLANORAMA — Item Colors Integration & Synchronization", () => {
  describe("Preferences Integration & Persistence Lifecycle", () => {
    it("DEFAULT_PREFERENCES includes itemColors with default values", () => {
      expect(DEFAULT_PREFERENCES.itemColors).toBeDefined();
      expect(DEFAULT_PREFERENCES.itemColors?.eventColor).toBe(DEFAULT_ITEM_COLORS.eventColor);
      expect(DEFAULT_PREFERENCES.itemColors?.taskColor).toBe(DEFAULT_ITEM_COLORS.taskColor);
      expect(DEFAULT_PREFERENCES.itemColors?.scheduleColor).toBe(DEFAULT_ITEM_COLORS.scheduleColor);
    });

    it("serializes to JSON and recovers fully intact", () => {
      const customPreferences: PlannerPreferences = {
        ...DEFAULT_PREFERENCES,
        itemColors: {
          eventColor: "#ec4899",
          taskColor: "#8b5cf6",
          scheduleColor: "#14b8a6",
        },
      };

      const jsonStr = JSON.stringify(customPreferences);
      const parsed = JSON.parse(jsonStr) as Partial<PlannerPreferences>;
      const recoveredColors = resolveItemColorPreferences(parsed.itemColors);

      expect(recoveredColors.eventColor).toBe("#ec4899");
      expect(recoveredColors.taskColor).toBe("#8b5cf6");
      expect(recoveredColors.scheduleColor).toBe("#14b8a6");
    });

    it("handles legacy backups or missing itemColors gracefully", () => {
      const legacyPreferences = {
        weekStartsOn: 1,
        defaultSort: "due",
      };

      const recoveredColors = resolveItemColorPreferences(
        (legacyPreferences as Partial<PlannerPreferences>).itemColors
      );

      expect(recoveredColors.eventColor).toBe(DEFAULT_ITEM_COLORS.eventColor);
      expect(recoveredColors.taskColor).toBe(DEFAULT_ITEM_COLORS.taskColor);
      expect(recoveredColors.scheduleColor).toBe(DEFAULT_ITEM_COLORS.scheduleColor);
    });

    it("replaces invalid hex codes from corrupted storage with defaults", () => {
      const corruptedColors = {
        eventColor: "not-a-hex",
        taskColor: "#12",
        scheduleColor: "rgb(255, 0, 0)",
      };

      const resolved = resolveItemColorPreferences(corruptedColors);
      expect(resolved.eventColor).toBe(DEFAULT_ITEM_COLORS.eventColor);
      expect(resolved.taskColor).toBe(DEFAULT_ITEM_COLORS.taskColor);
      expect(resolved.scheduleColor).toBe(DEFAULT_ITEM_COLORS.scheduleColor);
    });
  });

  describe("Google Calendar Color Preservation Architecture", () => {
    const customUserColors: ItemColorPreferences = {
      eventColor: "#ec4899", // User changed default event color to Pink
      taskColor: "#8b5cf6", // User changed default task color to Purple
      scheduleColor: "#06b6d4", // User changed default schedule color to Cyan
    };

    const googleCalendars = {
      cal_work: {
        id: "cal_work",
        name: "Work Calendar",
        color: "#4285F4", // Google Blue
        accessRole: "owner" as const,
        enabled: true,
      },
      cal_personal: {
        id: "cal_personal",
        name: "Personal Google",
        color: "#34A853", // Google Green
        accessRole: "owner" as const,
        enabled: true,
      },
    };

    it("strictly preserves native Google Calendar event color when task.googleCalendarColor is present", () => {
      const syncedEvent: Partial<PlannerTask> = {
        id: "event_1",
        title: "Q3 Strategy Meeting",
        isGoogleEvent: true,
        googleCalendarColor: "#ea4335", // Native Google Flamingo Red
        googleCalendarId: "cal_work",
      };

      const resolvedColor = getItemColor(syncedEvent, customUserColors, googleCalendars);
      // Must NOT overwrite with user's pink (#ec4899)
      expect(resolvedColor).toBe("#ea4335");
    });

    it("falls back to Google Calendar feed color if individual event color is absent", () => {
      const syncedEvent: Partial<PlannerTask> = {
        id: "event_2",
        title: "Sync with Team",
        isGoogleEvent: true,
        googleCalendarId: "cal_work",
      };

      const resolvedColor = getItemColor(syncedEvent, customUserColors, googleCalendars);
      // Preserves Google Calendar's #4285F4 color
      expect(resolvedColor).toBe("#4285F4");
    });

    it("applies the user's custom event color to local events without Google sync", () => {
      const localEvent: Partial<PlannerTask> = {
        id: "event_3",
        title: "Coffee with Sarah",
        itemType: "event",
        durationMinutes: 60,
      };

      const resolvedColor = getItemColor(localEvent, customUserColors, googleCalendars);
      expect(resolvedColor).toBe("#ec4899");
    });

    it("applies the user's custom task color to Planorama tasks without confusing with events", () => {
      const localTask: Partial<PlannerTask> = {
        id: "task_1",
        title: "Complete Tax Filing",
        itemType: "task",
        status: "open",
        priority: "p1",
      };

      const resolvedColor = getItemColor(localTask, customUserColors, googleCalendars);
      expect(resolvedColor).toBe("#8b5cf6");
      expect(getItemType(localTask)).toBe("task");
    });

    it("applies the user's custom schedule color to appointment scheduling blocks", () => {
      const appointmentBlock: Partial<PlannerTask> = {
        id: "appt_1",
        title: "Availability: 30 Min Consultation",
        itemType: "appointment",
      };

      const resolvedColor = getItemColor(appointmentBlock, customUserColors, googleCalendars);
      expect(resolvedColor).toBe("#06b6d4");
      expect(getItemType(appointmentBlock)).toBe("appointment");
    });
  });

  describe("Task Validation and Data Integrity", () => {
    it("validateTask preserves itemType and color properties without loss", () => {
      const rawTask: Partial<PlannerTask> = {
        id: "task_full",
        title: "Review Pull Request",
        itemType: "task",
        color: "#10b981",
        status: "open",
        priority: "p2",
        dueDate: "2026-10-30",
        createdAt: "2026-10-29T10:00:00.000Z",
        updatedAt: "2026-10-29T10:00:00.000Z",
      };

      const validated = validateTask(rawTask);
      expect(validated.itemType).toBe("task");
      expect(validated.color).toBe("#10b981");
    });
  });

  describe("Text Color Persistence & Cross-View Consistency", () => {
    it("serializes and deserializes independent text and border colors in PlannerPreferences", () => {
      const preferencesWithCustomText: PlannerPreferences = {
        ...DEFAULT_PREFERENCES,
        itemStyles: {
          globalStyle: "soft_pastel",
          event: {
            color: "#3b82f6",
            textColor: "#111827",
            borderColor: "#1d4ed8",
          },
          task: {
            color: "#10b981",
            textColor: "#064e3b",
            borderColor: "#047857",
          },
          schedule: {
            color: "#ea580c",
            textColor: "#ffffff",
            borderColor: "#c2410c",
          },
        },
        itemColors: {
          eventColor: "#3b82f6",
          taskColor: "#10b981",
          scheduleColor: "#ea580c",
          eventTextColor: "#111827",
          taskTextColor: "#064e3b",
          scheduleTextColor: "#ffffff",
          eventBorderColor: "#1d4ed8",
          taskBorderColor: "#047857",
          scheduleBorderColor: "#c2410c",
        },
      };

      const json = JSON.stringify(preferencesWithCustomText);
      const parsed = JSON.parse(json) as PlannerPreferences;

      const restoredStyles = resolveItemStylesPreferences(parsed.itemStyles, parsed.itemColors);
      const restoredColors = resolveItemColorPreferences(parsed.itemColors);

      expect(restoredStyles.globalStyle).toBe("soft_pastel");
      expect(restoredStyles.event.color).toBe("#3b82f6");
      expect(restoredStyles.event.textColor).toBe("#111827");
      expect(restoredStyles.event.borderColor).toBe("#1d4ed8");

      expect(restoredStyles.task.color).toBe("#10b981");
      expect(restoredStyles.task.textColor).toBe("#064e3b");
      expect(restoredStyles.task.borderColor).toBe("#047857");

      expect(restoredStyles.schedule.color).toBe("#ea580c");
      expect(restoredStyles.schedule.textColor).toBe("#ffffff");
      expect(restoredStyles.schedule.borderColor).toBe("#c2410c");

      expect(restoredColors.eventTextColor).toBe("#111827");
      expect(restoredColors.taskTextColor).toBe("#064e3b");
      expect(restoredColors.scheduleTextColor).toBe("#ffffff");
    });

    it("verifies category color isolation: updating Event text color does not change Task or Schedule text colors", () => {
      const initialStyles = resolveItemStylesPreferences({
        event: { textColor: "#ffffff" },
        task: { textColor: "#ffffff" },
        schedule: { textColor: "#ffffff" },
      });

      // Update only event text color
      const updatedStyles = resolveItemStylesPreferences({
        ...initialStyles,
        event: { ...initialStyles.event, textColor: "#fef08a" },
      });

      expect(updatedStyles.event.textColor).toBe("#fef08a");
      // Tasks and schedules must remain untouched
      expect(updatedStyles.task.textColor).toBe("#ffffff");
      expect(updatedStyles.schedule.textColor).toBe("#ffffff");
    });

    it("applies category-specific text color consistently to items across views", () => {
      const styles = resolveItemStylesPreferences({
        globalStyle: "vibrant_solid",
        event: { color: "#0284c7", textColor: "#fef08a" },
        task: { color: "#10b981", textColor: "#1e293b" },
        schedule: { color: "#f59e0b", textColor: "#ffffff" },
      });

      const eventTask: Partial<PlannerTask> = { itemType: "event", title: "All-Hands Meeting" };
      const todoTask: Partial<PlannerTask> = { itemType: "task", title: "Write Release Notes" };
      const appointment: Partial<PlannerTask> = { itemType: "appointment", title: "Office Hours" };

      const eventStyle = getItemTileStyle(eventTask, styles);
      const todoStyle = getItemTileStyle(todoTask, styles);
      const apptStyle = getItemTileStyle(appointment, styles);

      expect(eventStyle.textColor).toBe("#fef08a");
      expect(todoStyle.textColor).toBe("#1e293b");
      expect(apptStyle.textColor).toBe("#ffffff");

      expect(getItemTextColor(eventTask, styles)).toBe("#fef08a");
      expect(getItemTextColor(todoTask, styles)).toBe("#1e293b");
      expect(getItemTextColor(appointment, styles)).toBe("#ffffff");

      // Verify style objects set CSS custom property
      expect((eventStyle.style as Record<string, unknown>)["--tile-text-color"]).toBe("#fef08a");
      expect((todoStyle.style as Record<string, unknown>)["--tile-text-color"]).toBe("#1e293b");
      expect((apptStyle.style as Record<string, unknown>)["--tile-text-color"]).toBe("#ffffff");
    });
  });
});
