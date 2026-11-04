import { describe, it, expect } from "vitest";
import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";
import type { GoogleCalendarEvent } from "../server/google-calendar";
import {
  isHolidayCalendar,
  isHolidayGoogleEvent,
  isTaskItem,
  isEventItem,
  isAppointmentItem,
  sanitizePlannerTasks,
} from "../calendar/item-classifier";
import {
  calculateDailyOverview,
  getUpcomingDateGroups,
  sortTodaysFocusTasks,
} from "./dashboard-utils";
import { googleEventToPlannerTask } from "../google-calendar/sync-service";

describe("PLANORAMA — Google Calendar Holidays & Task Classification", () => {
  const holidayCalendar: GoogleCalendarConfig = {
    id: "en.philippines#holiday@group.v.calendar.google.com",
    accountId: "acct_google_user_1",
    accountEmail: "user@gmail.com",
    name: "Holidays in Philippines",
    color: "#0b8043",
    accessRole: "reader",
    enabled: true,
    syncDirection: "two_way",
    privacyMode: "full_details",
    isHolidayCalendar: true,
  };

  const clientCalendar: GoogleCalendarConfig = {
    id: "primary",
    accountId: "acct_client_alpha",
    accountEmail: "alpha.client@corporate.com",
    name: "Client Alpha Work",
    color: "#4285F4",
    accessRole: "reader",
    enabled: true,
    syncDirection: "two_way",
    privacyMode: "full_details",
  };

  const personalCalendar: GoogleCalendarConfig = {
    id: "primary",
    accountId: "acct_personal_va",
    accountEmail: "va.personal@gmail.com",
    name: "VA Schedule",
    color: "#9333ea",
    accessRole: "owner",
    enabled: true,
    syncDirection: "two_way",
    privacyMode: "full_details",
  };

  const allConfigs: Record<string, GoogleCalendarConfig> = {
    [holidayCalendar.id]: holidayCalendar,
    [clientCalendar.id]: clientCalendar,
  };

  const todayKey = "2026-11-03";

  describe("1. Identification & Classification Logic", () => {
    it("reliably detects holiday calendars without hardcoded title lists", () => {
      expect(isHolidayCalendar(holidayCalendar)).toBe(true);
      expect(
        isHolidayCalendar({
          id: "en.usa#holiday@group.v.calendar.google.com",
          name: "Holidays in United States",
        })
      ).toBe(true);
      expect(
        isHolidayCalendar({
          id: "en.uk#holiday@group.calendar.google.com",
          name: "Holidays in United Kingdom",
        })
      ).toBe(true);
      expect(
        isHolidayCalendar({
          id: "some_cal_id",
          description: "Public holidays and observances in Japan",
        })
      ).toBe(true);
      // Non-holiday calendars
      expect(isHolidayCalendar(clientCalendar)).toBe(false);
      expect(isHolidayCalendar(personalCalendar)).toBe(false);
      expect(isHolidayCalendar({ id: "work_calendar", name: "Team Sprint" })).toBe(false);
    });

    it("reliably detects Google holiday events from official API metadata", () => {
      const gEventHoliday: GoogleCalendarEvent = {
        id: "holiday_nye_2025",
        summary: "New Year's Eve",
        status: "confirmed",
        eventType: "holiday",
        start: { date: "2025-12-31" },
        end: { date: "2026-01-01" },
      };
      expect(isHolidayGoogleEvent(gEventHoliday, clientCalendar)).toBe(true);

      const gEventRegular: GoogleCalendarEvent = {
        id: "meeting_strategy",
        summary: "Quarterly Strategy Review",
        status: "confirmed",
        eventType: "default",
        start: { dateTime: "2026-11-04T10:00:00Z" },
        end: { dateTime: "2026-11-04T11:00:00Z" },
      };
      expect(isHolidayGoogleEvent(gEventRegular, clientCalendar)).toBe(false);
      // Even if eventType is default, if parent calendar is holiday calendar, it is a holiday event
      expect(isHolidayGoogleEvent(gEventRegular, holidayCalendar)).toBe(true);
    });

    it("correctly syncs Google Calendar holiday events as itemType 'event' with isHoliday: true", () => {
      const event: GoogleCalendarEvent = {
        id: "event_people_power",
        summary: "People Power Anniversary",
        status: "confirmed",
        eventType: "holiday",
        start: { date: "2026-02-25" },
        end: { date: "2026-02-26" },
      };
      const plannerTask = googleEventToPlannerTask(event, holidayCalendar);

      expect(plannerTask.itemType).toBe("event");
      expect(plannerTask.isHoliday).toBe(true);
      expect(plannerTask.isGoogleEvent).toBe(true);
      expect(plannerTask.source).toBe("google");
      expect(plannerTask.dueDate).toBe("2026-02-25");
      expect(plannerTask.isAllDay).toBe(true);

      // Must be classified as event, NOT task
      expect(isTaskItem(plannerTask)).toBe(false);
      expect(isEventItem(plannerTask)).toBe(true);
    });

    it("correctly classifies regular Google Calendar events as itemType 'event'", () => {
      const regularEvent: GoogleCalendarEvent = {
        id: "event_sync_alpha",
        summary: "Weekly Client Sync",
        status: "confirmed",
        eventType: "default",
        start: { dateTime: "2026-11-04T14:00:00Z" },
        end: { dateTime: "2026-11-04T15:00:00Z" },
      };
      const plannerTask = googleEventToPlannerTask(regularEvent, clientCalendar);

      expect(plannerTask.itemType).toBe("event");
      expect(plannerTask.isHoliday).toBe(false);
      expect(plannerTask.isGoogleEvent).toBe(true);
      expect(isTaskItem(plannerTask)).toBe(false);
      expect(isEventItem(plannerTask)).toBe(true);
    });

    it("strictly preserves genuine user tasks as tasks", () => {
      const userTask: PlannerTask = {
        id: "task_1001",
        title: "Draft Q4 Marketing Proposal",
        notes: "Detailed draft for review",
        priority: "p2",
        status: "open",
        dueDate: "2026-11-05",
        dueTime: null,
        recurrence: "none",
        labelIds: [],
        projectId: null,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      };

      expect(isTaskItem(userTask)).toBe(true);
      expect(isEventItem(userTask)).toBe(false);
      expect(isAppointmentItem(userTask)).toBe(false);
    });
  });

  describe("2. Dashboard Upcoming Widget & Overdue Calculations", () => {
    // Past holidays (e.g. New Year's Eve 2025-12-31, New Year's Day 2026-01-01, People Power 2026-02-25)
    const pastHolidayNewYear: PlannerTask = {
      id: "gcal-holiday-new-years-day",
      title: "New Year's Day",
      notes: "Public Holiday",
      priority: "none",
      status: "open",
      dueDate: "2026-01-01",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2025-12-01T00:00:00Z",
      updatedAt: "2025-12-01T00:00:00Z",
      itemType: "event",
      isHoliday: true,
      isGoogleEvent: true,
      googleCalendarId: holidayCalendar.id,
      googleCalendarName: "Holidays in Philippines",
    };

    const pastHolidayPeoplePower: PlannerTask = {
      id: "gcal-holiday-people-power",
      title: "People Power Anniversary",
      notes: "Special non-working holiday",
      priority: "none",
      status: "open",
      dueDate: "2026-02-25",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      itemType: "event",
      isHoliday: true,
      isGoogleEvent: true,
      googleCalendarId: holidayCalendar.id,
      googleCalendarName: "Holidays in Philippines",
    };

    // Past regular Google event
    const pastClientMeeting: PlannerTask = {
      id: "gcal-meeting-past",
      title: "Client Kickoff Meeting",
      notes: "Initial discovery call",
      priority: "none",
      status: "open",
      dueDate: "2026-10-15",
      dueTime: "10:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      itemType: "event",
      isHoliday: false,
      isGoogleEvent: true,
      googleCalendarId: clientCalendar.id,
    };

    // Legitimate overdue user task
    const overdueUserTask: PlannerTask = {
      id: "task_overdue_1",
      title: "File Monthly Tax Returns",
      notes: "Must be filed before deadline",
      priority: "p1",
      status: "open",
      dueDate: "2026-10-20",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      itemType: "task",
    };

    // Completed past task
    const completedPastTask: PlannerTask = {
      id: "task_completed_past",
      title: "Renew Domain Registration",
      notes: "Done last month",
      priority: "p3",
      status: "completed",
      dueDate: "2026-10-10",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-10T00:00:00Z",
      itemType: "task",
    };

    // Upcoming holiday tomorrow (2026-11-04)
    const upcomingHoliday: PlannerTask = {
      id: "gcal-holiday-upcoming",
      title: "National Day of Observance",
      notes: "Public Holiday",
      priority: "none",
      status: "open",
      dueDate: "2026-11-04",
      dueTime: null,
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      itemType: "event",
      isHoliday: true,
      isGoogleEvent: true,
      googleCalendarId: holidayCalendar.id,
      googleCalendarName: "Holidays in Philippines",
    };

    // Upcoming genuine user task tomorrow (2026-11-04)
    const upcomingUserTask: PlannerTask = {
      id: "task_upcoming_tomorrow",
      title: "Finalize Presentation Slides",
      notes: "Prepare for board meeting",
      priority: "p1",
      status: "open",
      dueDate: "2026-11-04",
      dueTime: "11:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      itemType: "task",
    };

    // Upcoming regular Google event in 2 days (2026-11-05)
    const upcomingGoogleMeeting: PlannerTask = {
      id: "gcal-meeting-upcoming",
      title: "Client Strategic Review",
      notes: "Zoom call with executives",
      priority: "none",
      status: "open",
      dueDate: "2026-11-05",
      dueTime: "15:00",
      recurrence: "none",
      labelIds: [],
      projectId: null,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      itemType: "event",
      isHoliday: false,
      isGoogleEvent: true,
      googleCalendarId: clientCalendar.id,
    };

    const allItems: PlannerTask[] = [
      pastHolidayNewYear,
      pastHolidayPeoplePower,
      pastClientMeeting,
      overdueUserTask,
      completedPastTask,
      upcomingHoliday,
      upcomingUserTask,
      upcomingGoogleMeeting,
    ];

    it("strictly excludes Google Calendar holidays from Overdue Tasks list", () => {
      const summary = getUpcomingDateGroups(allItems, todayKey, 7);

      expect(summary.overdueGroup).not.toBeNull();
      // Only genuine overdue user tasks should appear
      expect(summary.overdueGroup?.tasks).toHaveLength(1);
      expect(summary.overdueGroup?.tasks[0].id).toBe("task_overdue_1");
      expect(summary.overdueGroup?.tasks[0].title).toBe("File Monthly Tax Returns");

      // Verify no holidays appear in overdue tasks
      const overdueIds = summary.overdueGroup?.tasks.map((t) => t.id) || [];
      expect(overdueIds.includes(pastHolidayNewYear.id)).toBe(false);
      expect(overdueIds.includes(pastHolidayPeoplePower.id)).toBe(false);
      expect(overdueIds.includes(pastClientMeeting.id)).toBe(false);
    });

    it("excludes Google Calendar holidays and events from overdue task statistics", () => {
      const stats = calculateDailyOverview(allItems, todayKey);

      // Only the 1 genuine incomplete user task should be counted as overdue
      expect(stats.overdueCount).toBe(1);
    });

    it("separates upcoming holidays into group.events without mixing with task checkboxes", () => {
      const summary = getUpcomingDateGroups(allItems, todayKey, 7);

      // Tomorrow is 2026-11-04
      const tomorrowGroup = summary.dateGroups.find((g) => g.dateKey === "2026-11-04");
      expect(tomorrowGroup).toBeDefined();

      // Tasks array must only contain the genuine task
      expect(tomorrowGroup?.tasks).toHaveLength(1);
      expect(tomorrowGroup?.tasks[0].id).toBe("task_upcoming_tomorrow");

      // Events array contains the holiday
      expect(tomorrowGroup?.events).toHaveLength(1);
      expect(tomorrowGroup?.events[0].id).toBe(upcomingHoliday.id);
      expect(tomorrowGroup?.events[0].isHoliday).toBe(true);

      // In 2 days (2026-11-05), regular client meeting is in events
      const day2Group = summary.dateGroups.find((g) => g.dateKey === "2026-11-05");
      expect(day2Group?.tasks).toHaveLength(0);
      expect(day2Group?.events).toHaveLength(1);
      expect(day2Group?.events[0].id).toBe(upcomingGoogleMeeting.id);
    });

    it("does not count upcoming holidays or events towards totalUpcomingTasks count", () => {
      const summary = getUpcomingDateGroups(allItems, todayKey, 7);

      // totalUpcomingTasks should strictly count upcoming genuine tasks (only 1: task_upcoming_tomorrow)
      expect(summary.totalUpcomingTasks).toBe(1);
    });

    it("excludes holidays from Today's Focus task list", () => {
      const todayHoliday: PlannerTask = {
        id: "gcal-today-holiday",
        title: "All Saints' Day Observance",
        notes: "Public Holiday",
        priority: "none",
        status: "open",
        dueDate: todayKey,
        dueTime: null,
        recurrence: "none",
        labelIds: [],
        projectId: null,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
        itemType: "event",
        isHoliday: true,
      };

      const todayTask: PlannerTask = {
        id: "task_today_genuine",
        title: "Submit Client Invoice",
        notes: "Billing cycle 1",
        priority: "p1",
        status: "open",
        dueDate: todayKey,
        dueTime: null,
        recurrence: "none",
        labelIds: [],
        projectId: null,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
        itemType: "task",
      };

      const focusTasks = sortTodaysFocusTasks([todayHoliday, todayTask], todayKey);
      expect(focusTasks).toHaveLength(1);
      expect(focusTasks[0].id).toBe("task_today_genuine");
    });
  });

  describe("3. Multi-Account Isolation & Legacy Data Repair", () => {
    it("maintains distinct event IDs across multiple connected accounts", () => {
      const sharedGoogleEvent: GoogleCalendarEvent = {
        id: "recurring_standup_shared",
        summary: "Daily Coordination Standup",
        status: "confirmed",
        eventType: "default",
        start: { dateTime: "2026-11-04T09:00:00Z" },
        end: { dateTime: "2026-11-04T09:30:00Z" },
      };

      const taskAccountA = googleEventToPlannerTask(sharedGoogleEvent, personalCalendar);
      const taskAccountB = googleEventToPlannerTask(sharedGoogleEvent, clientCalendar);

      expect(taskAccountA.id).not.toBe(taskAccountB.id);
      expect(taskAccountA.googleAccountId).toBe("acct_personal_va");
      expect(taskAccountB.googleAccountId).toBe("acct_client_alpha");
    });

    it("safely sanitizes legacy records stored without itemType or isHoliday flag", () => {
      // Emulate existing legacy records in localStorage before the fix:
      // itemType was undefined, isHoliday was undefined, but was synced from Google holiday calendar
      const legacyHolidayRecord: PlannerTask = {
        id: "gcal-holiday-legacy-1",
        title: "New Year's Eve",
        notes: "Public Holiday",
        priority: "none",
        status: "open",
        dueDate: "2025-12-31",
        dueTime: null,
        recurrence: "none",
        labelIds: [],
        projectId: null,
        createdAt: "2025-12-01T00:00:00Z",
        updatedAt: "2025-12-01T00:00:00Z",
        googleCalendarId: "en.philippines#holiday@group.v.calendar.google.com",
        googleCalendarName: "Holidays in Philippines",
        isGoogleEvent: true,
        source: "google",
      };

      const legacyUserTask: PlannerTask = {
        id: "task_legacy_user",
        title: "Buy Groceries",
        notes: "User task",
        priority: "p3",
        status: "open",
        dueDate: "2026-11-04",
        dueTime: null,
        recurrence: "none",
        labelIds: [],
        projectId: null,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
        itemType: "task",
      };

      const { sanitized, correctedCount } = sanitizePlannerTasks(
        [legacyHolidayRecord, legacyUserTask],
        allConfigs
      );
      expect(correctedCount).toBe(1);

      // The legacy holiday should be repaired to itemType = "event", isHoliday = true
      const repairedHoliday = sanitized.find((t) => t.id === legacyHolidayRecord.id);
      expect(repairedHoliday?.itemType).toBe("event");
      expect(repairedHoliday?.isHoliday).toBe(true);
      expect(repairedHoliday?.isGoogleEvent).toBe(true);
      // Original title, notes, dueDate must be completely preserved
      expect(repairedHoliday?.title).toBe("New Year's Eve");
      expect(repairedHoliday?.dueDate).toBe("2025-12-31");

      // User task remains untouched as a task
      const userTaskAfter = sanitized.find((t) => t.id === legacyUserTask.id);
      expect(userTaskAfter?.title).toBe("Buy Groceries");
      expect(isTaskItem(userTaskAfter)).toBe(true);

      // After sanitization, the repaired holiday must NOT be an overdue task
      const summary = getUpcomingDateGroups(sanitized, todayKey, 7);
      const overdueIds = summary.overdueGroup?.tasks.map((t) => t.id) || [];
      expect(overdueIds.includes(legacyHolidayRecord.id)).toBe(false);
    });

    it("handles all-day, multi-day, and recurring Google Calendar events safely", () => {
      const allDayHoliday: GoogleCalendarEvent = {
        id: "holiday_labor_day",
        summary: "Labor Day",
        status: "confirmed",
        eventType: "holiday",
        start: { date: "2026-05-01" },
        end: { date: "2026-05-02" },
      };

      const recurringEvent: GoogleCalendarEvent = {
        id: "recurring_team_sync",
        summary: "Weekly Alignment",
        status: "confirmed",
        eventType: "default",
        start: { dateTime: "2026-11-09T10:00:00Z" },
        end: { dateTime: "2026-11-09T11:00:00Z" },
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
      };

      const task1 = googleEventToPlannerTask(allDayHoliday, holidayCalendar);
      const task2 = googleEventToPlannerTask(recurringEvent, clientCalendar);

      expect(task1.isAllDay).toBe(true);
      expect(task1.isHoliday).toBe(true);
      expect(task1.itemType).toBe("event");

      expect(task2.recurrence).toBe("weekly");
      expect(task2.itemType).toBe("event");
      expect(task2.isHoliday).toBe(false);

      expect(isTaskItem(task1)).toBe(false);
      expect(isTaskItem(task2)).toBe(false);
    });
  });
});
