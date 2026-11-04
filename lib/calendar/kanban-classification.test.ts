import { describe, it, expect } from "vitest";
import type { PlannerTask } from "../schedule/types";
import type { GoogleCalendarConfig } from "../google-calendar/types";
import { isTaskItem, isEventItem, isHolidayItem, sanitizePlannerTasks } from "./item-classifier";
import {
  filterKanbanTasks,
  groupKanbanTasksByStatus,
} from "./kanban-utils";

describe("PLANORAMA — Kanban Board Item Classification & Filtering", () => {
  const todayKey = "2026-11-03";
  const today = new Date(2026, 10, 3); // Tuesday Nov 3, 2026

  // Sample client & personal Google calendar configs
  const holidayCalendar: GoogleCalendarConfig = {
    id: "en.philippines#holiday@group.v.calendar.google.com",
    name: "Holidays in Philippines",
    color: "#0b8043",
    accessRole: "reader",
    enabled: true,
    isHolidayCalendar: true,
    syncDirection: "import_only",
    privacyMode: "full_details",
    accountId: "acct_personal",
    accountEmail: "va.personal@gmail.com",
  };

  const clientCalendar: GoogleCalendarConfig = {
    id: "client_marketing_cal",
    name: "Client A — Marketing",
    color: "#039be5",
    accessRole: "writer",
    enabled: true,
    syncDirection: "two_way",
    privacyMode: "full_details",
    accountId: "acct_client_a",
    accountEmail: "client.a@company.com",
  };

  const clientReadOnlyCalendar: GoogleCalendarConfig = {
    id: "client_executive_cal",
    name: "Client B — Exec Board",
    color: "#8e24aa",
    accessRole: "reader",
    enabled: true,
    syncDirection: "import_only",
    privacyMode: "full_details",
    accountId: "acct_client_b",
    accountEmail: "client.b@board.org",
  };

  const allConfigs: Record<string, GoogleCalendarConfig> = {
    [holidayCalendar.id]: holidayCalendar,
    [clientCalendar.id]: clientCalendar,
    [clientReadOnlyCalendar.id]: clientReadOnlyCalendar,
  };

  // 1. Genuine User Tasks
  const genuineUserTaskPast: PlannerTask = {
    id: "task_past_due",
    title: "Review Q3 Invoices",
    notes: "Follow up with accounting",
    status: "open",
    priority: "p1",
    projectId: "proj_client_a",
    labelIds: ["finance"],
    dueDate: "2026-10-25", // Past due date
    dueTime: "14:00",
    recurrence: "none",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskToday: PlannerTask = {
    id: "task_due_today",
    title: "Prepare Client Status Deck",
    notes: "Include KPI charts",
    status: "in_progress",
    priority: "p2",
    projectId: "proj_client_a",
    labelIds: ["reports"],
    dueDate: "2026-11-03", // Today
    dueTime: "10:30",
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskThisWeek: PlannerTask = {
    id: "task_due_this_week",
    title: "Schedule Weekly Standup",
    notes: "Internal sync",
    status: "open",
    priority: "p3",
    projectId: null, // Unassigned
    labelIds: [],
    dueDate: "2026-11-05", // Thursday this week
    dueTime: "15:00",
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskThisMonth: PlannerTask = {
    id: "task_due_this_month",
    title: "Draft Thanksgiving Campaign",
    notes: "Campaign kickoff",
    status: "open",
    priority: "none",
    projectId: "proj_client_b",
    labelIds: ["marketing"],
    dueDate: "2026-11-20", // Later this month
    dueTime: null,
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskFutureMonths: PlannerTask = {
    id: "task_scheduled_months_ahead",
    title: "Renew Annual Trademark Filing",
    notes: "Scheduled for early next year",
    status: "open",
    priority: "p4",
    projectId: null,
    labelIds: ["legal"],
    dueDate: "2027-03-15", // Months ahead
    dueTime: null,
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskNoDueDate: PlannerTask = {
    id: "task_backlog_no_date",
    title: "Organize Desktop Folders",
    notes: "General housekeeping",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: null, // No due date
    dueTime: null,
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "task",
  };

  const genuineUserTaskCompleted: PlannerTask = {
    id: "task_completed_item",
    title: "Submit Expense Reimbursements",
    notes: "Approved by manager",
    status: "completed",
    priority: "p3",
    projectId: "proj_client_a",
    labelIds: ["finance"],
    dueDate: "2026-10-31",
    dueTime: "17:00",
    recurrence: "none",
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-31T00:00:00Z",
    itemType: "task",
  };

  // 2. Calendar Items that MUST NEVER appear in Kanban
  const googleEventRegular: PlannerTask = {
    id: "gcal-client_marketing-evt1",
    title: "Client Strategy Call",
    notes: "Zoom link: https://zoom.us/j/12345",
    status: "open", // Google events default to open status in DB
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-11-03", // Today
    dueTime: "11:00",
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    isGoogleEvent: true,
    googleCalendarId: clientCalendar.id,
    googleCalendarName: clientCalendar.name,
    googleAccountId: clientCalendar.accountId,
    googleAccountEmail: clientCalendar.accountEmail,
    source: "google",
    itemType: "event",
  };

  const googleEventHolidayNYE: PlannerTask = {
    id: "gcal-ph-holiday-nye-2026",
    title: "New Year's Eve",
    notes: "Special working holiday",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-12-31",
    dueTime: null,
    isAllDay: true,
    recurrence: "none",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isHoliday: true,
    isGoogleEvent: true,
    googleCalendarId: holidayCalendar.id,
    googleCalendarName: holidayCalendar.name,
    googleAccountId: holidayCalendar.accountId,
    source: "google",
    itemType: "event",
  };

  const googleEventHolidayNationalDay: PlannerTask = {
    id: "gcal-ph-holiday-nov30",
    title: "Bonifacio Day",
    notes: "Regular public holiday",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-11-30",
    dueTime: null,
    isAllDay: true,
    recurrence: "none",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isHoliday: true,
    isGoogleEvent: true,
    googleCalendarId: holidayCalendar.id,
    source: "google",
    itemType: "event",
  };

  const allDayClientConference: PlannerTask = {
    id: "gcal-client_marketing-conf",
    title: "Global Marketing Summit 2026",
    notes: "All-day keynote conference",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-11-04",
    dueTime: null,
    isAllDay: true,
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    isGoogleEvent: true,
    googleCalendarId: clientCalendar.id,
    source: "google",
    itemType: "event",
  };

  const appointmentScheduleItem: PlannerTask = {
    id: "sched_office_hours_tue",
    title: "Availability: VA Office Hours",
    notes: "30 min booking slot",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-11-03",
    dueTime: "09:00",
    recurrence: "weekly",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    itemType: "appointment",
  };

  const readOnlyCalendarRecord: PlannerTask = {
    id: "gcal-client_b_ro-board_meeting",
    title: "Board of Directors Q4 Session",
    notes: "Read-only client calendar event",
    status: "open",
    priority: "none",
    projectId: null,
    labelIds: [],
    dueDate: "2026-11-03",
    dueTime: "13:00",
    recurrence: "none",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    isReadOnlyCalendar: true,
    isGoogleEvent: true,
    googleCalendarId: clientReadOnlyCalendar.id,
    source: "google",
    itemType: "event",
  };

  const allSampleItems: PlannerTask[] = [
    genuineUserTaskPast,
    genuineUserTaskToday,
    genuineUserTaskThisWeek,
    genuineUserTaskThisMonth,
    genuineUserTaskFutureMonths,
    genuineUserTaskNoDueDate,
    genuineUserTaskCompleted,
    googleEventRegular,
    googleEventHolidayNYE,
    googleEventHolidayNationalDay,
    allDayClientConference,
    appointmentScheduleItem,
    readOnlyCalendarRecord,
  ];

  describe("1. Strict Task vs Calendar Event Classification", () => {
    it("correctly identifies genuine tasks and rejects all calendar events", () => {
      // Genuine tasks return true
      expect(isTaskItem(genuineUserTaskPast)).toBe(true);
      expect(isTaskItem(genuineUserTaskToday)).toBe(true);
      expect(isTaskItem(genuineUserTaskThisWeek)).toBe(true);
      expect(isTaskItem(genuineUserTaskThisMonth)).toBe(true);
      expect(isTaskItem(genuineUserTaskFutureMonths)).toBe(true);
      expect(isTaskItem(genuineUserTaskNoDueDate)).toBe(true);
      expect(isTaskItem(genuineUserTaskCompleted)).toBe(true);

      // Calendar events return false
      expect(isTaskItem(googleEventRegular)).toBe(false);
      expect(isTaskItem(googleEventHolidayNYE)).toBe(false);
      expect(isTaskItem(googleEventHolidayNationalDay)).toBe(false);
      expect(isTaskItem(allDayClientConference)).toBe(false);
      expect(isTaskItem(appointmentScheduleItem)).toBe(false);
      expect(isTaskItem(readOnlyCalendarRecord)).toBe(false);
    });

    it("does not classify an event as a task simply because it has a title, date, or open status", () => {
      const eventWithOpenStatus: PlannerTask = {
        id: "gcal-misleading-event",
        title: "Finish Budget Plan Event", // sounds like a task
        notes: "Has a date and open status",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: "2026-11-03",
        dueTime: "10:00",
        recurrence: "none",
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
        source: "google",
        isGoogleEvent: true,
        itemType: "event",
      };

      expect(isTaskItem(eventWithOpenStatus)).toBe(false);
      expect(isEventItem(eventWithOpenStatus)).toBe(true);
    });

    it("maintains calendar event visibility in Agenda and Month views without polluting Kanban", () => {
      // In Calendar/Agenda views, events are valid items
      expect(isEventItem(googleEventRegular)).toBe(true);
      expect(isHolidayItem(googleEventHolidayNYE, holidayCalendar)).toBe(true);

      // In Kanban, they are completely filtered out
      const kanbanTasks = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        todayKey,
        today,
      });

      const kanbanIds = kanbanTasks.map((t) => t.id);
      expect(kanbanIds.includes(googleEventRegular.id)).toBe(false);
      expect(kanbanIds.includes(googleEventHolidayNYE.id)).toBe(false);
      expect(kanbanIds.includes(googleEventHolidayNationalDay.id)).toBe(false);
      expect(kanbanIds.includes(allDayClientConference.id)).toBe(false);
      expect(kanbanIds.includes(appointmentScheduleItem.id)).toBe(false);
      expect(kanbanIds.includes(readOnlyCalendarRecord.id)).toBe(false);
    });
  });

  describe("2. Kanban Date Filters", () => {
    it("Filter 'all': includes genuine tasks of any date, future months, no due date, and completed tasks", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        todayKey,
        today,
      });

      const ids = result.map((t) => t.id);
      // Genuine tasks across all dates are present
      expect(ids).toContain(genuineUserTaskPast.id);
      expect(ids).toContain(genuineUserTaskToday.id);
      expect(ids).toContain(genuineUserTaskThisWeek.id);
      expect(ids).toContain(genuineUserTaskThisMonth.id);
      expect(ids).toContain(genuineUserTaskFutureMonths.id);
      expect(ids).toContain(genuineUserTaskNoDueDate.id);
      expect(ids).toContain(genuineUserTaskCompleted.id);

      // Zero calendar events or holidays
      expect(ids.some((id) => id.startsWith("gcal-"))).toBe(false);
      expect(result.length).toBe(7);
    });

    it("Filter 'today': strictly includes genuine tasks due today", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "today",
        todayKey,
        today,
      });

      const ids = result.map((t) => t.id);
      expect(ids).toEqual([genuineUserTaskToday.id]);
    });

    it("Filter 'this_week': strictly includes genuine tasks due within current week", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "this_week",
        todayKey,
        today,
        weekStartsOn: 1, // Monday
      });

      const ids = result.map((t) => t.id);
      // Today (Tue Nov 3) and Thursday (Nov 5) are in this week (Nov 2 - Nov 8)
      expect(ids).toContain(genuineUserTaskToday.id);
      expect(ids).toContain(genuineUserTaskThisWeek.id);
      expect(ids).not.toContain(genuineUserTaskPast.id); // Oct 25 is last week
      expect(ids).not.toContain(genuineUserTaskThisMonth.id); // Nov 20 is future week
    });

    it("Filter 'this_month': strictly includes genuine tasks due within current month", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "this_month",
        todayKey,
        today,
      });

      const ids = result.map((t) => t.id);
      expect(ids).toContain(genuineUserTaskToday.id);
      expect(ids).toContain(genuineUserTaskThisWeek.id);
      expect(ids).toContain(genuineUserTaskThisMonth.id);
      expect(ids).not.toContain(genuineUserTaskPast.id); // October
      expect(ids).not.toContain(genuineUserTaskFutureMonths.id); // March 2027
    });

    it("Filter 'overdue': strictly includes uncompleted genuine tasks with past due dates", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "overdue",
        todayKey,
        today,
      });

      const ids = result.map((t) => t.id);
      // genuineUserTaskPast (dueDate: 2026-10-25, status: open) is overdue
      expect(ids).toContain(genuineUserTaskPast.id);
      // Completed past tasks are NOT overdue
      expect(ids).not.toContain(genuineUserTaskCompleted.id);
      // Past Google events or holidays are NOT overdue tasks
      expect(ids).not.toContain(googleEventRegular.id);
      expect(result.length).toBe(1);
    });

    it("Filter 'completed': strictly includes genuine tasks marked completed", () => {
      const result = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "completed",
        todayKey,
        today,
      });

      const ids = result.map((t) => t.id);
      expect(ids).toEqual([genuineUserTaskCompleted.id]);
    });
  });

  describe("3. Client & Project Task Management", () => {
    it("filters tasks by specific client/project without mixing Google account identity", () => {
      // Filter for Client A
      const clientATasks = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        projectFilter: "proj_client_a",
        todayKey,
        today,
      });

      expect(clientATasks.every((t) => t.projectId === "proj_client_a")).toBe(true);
      expect(clientATasks.map((t) => t.id)).toEqual([
        genuineUserTaskPast.id,
        genuineUserTaskToday.id,
        genuineUserTaskCompleted.id,
      ]);

      // Filter for Client B
      const clientBTasks = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        projectFilter: "proj_client_b",
        todayKey,
        today,
      });
      expect(clientBTasks.map((t) => t.id)).toEqual([genuineUserTaskThisMonth.id]);

      // Filter for Unassigned
      const unassignedTasks = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        projectFilter: "__unassigned",
        todayKey,
        today,
      });
      expect(unassignedTasks.every((t) => !t.projectId)).toBe(true);
    });

    it("does not mix calendar account identity with task ownership", () => {
      // Task with project proj_client_a does NOT share googleAccountId
      expect(genuineUserTaskToday.projectId).toBe("proj_client_a");
      expect(genuineUserTaskToday.googleAccountId).toBeUndefined();

      // Google Calendar account is for syncing, not task ownership
      expect(googleEventRegular.googleAccountId).toBe("acct_client_a");
      expect(isTaskItem(googleEventRegular)).toBe(false);
    });
  });

  describe("4. Kanban Status Grouping and Task Movement", () => {
    it("groups tasks accurately into To Do, In Progress, and Done columns", () => {
      const filtered = filterKanbanTasks({
        tasks: allSampleItems,
        dateFilter: "all",
        todayKey,
        today,
      });

      const grouped = groupKanbanTasksByStatus(filtered);
      expect(grouped.open.length).toBe(5); // past, this_week, this_month, future, no_date
      expect(grouped.in_progress.length).toBe(1); // today
      expect(grouped.completed.length).toBe(1); // completed
    });

    it("updates actual task status when moving tasks between columns", () => {
      const task = genuineUserTaskToday; // initially "in_progress"
      const movedToDone: PlannerTask = { ...task, status: "completed" };
      const movedToDo: PlannerTask = { ...task, status: "open" };

      expect(movedToDone.status).toBe("completed");
      expect(movedToDo.status).toBe("open");

      // Verify status grouping reflects the move
      const updatedList = [
        ...allSampleItems.filter((t) => t.id !== task.id),
        movedToDone,
      ];

      const grouped = groupKanbanTasksByStatus(
        filterKanbanTasks({ tasks: updatedList, dateFilter: "all", todayKey, today })
      );

      expect(grouped.in_progress.map((t) => t.id)).not.toContain(task.id);
      expect(grouped.completed.map((t) => t.id)).toContain(task.id);
    });
  });

  describe("5. Data Integrity & Legacy Import Repair", () => {
    it("safely sanitizes legacy records stored without itemType or explicit flags", () => {
      const legacyImportedGoogleEvent: PlannerTask = {
        id: "gcal-legacy-holiday-raw",
        title: "People Power Anniversary",
        notes: "Public Holiday in Philippines",
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        dueDate: "2026-02-25",
        dueTime: null,
        recurrence: "none",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        googleCalendarId: holidayCalendar.id,
        googleCalendarName: holidayCalendar.name,
        // Missing itemType: "event", missing isHoliday: true, missing isGoogleEvent
      };

      const { sanitized, correctedCount } = sanitizePlannerTasks(
        [legacyImportedGoogleEvent, genuineUserTaskToday],
        allConfigs
      );

      expect(correctedCount).toBe(1);
      const repaired = sanitized.find((t) => t.id === legacyImportedGoogleEvent.id);
      expect(repaired?.itemType).toBe("event");
      expect(repaired?.isHoliday).toBe(true);
      expect(repaired?.isGoogleEvent).toBe(true);

      // User task remains untouched
      const userTaskAfter = sanitized.find((t) => t.id === genuineUserTaskToday.id);
      expect(userTaskAfter?.title).toBe(genuineUserTaskToday.title);
      expect(isTaskItem(userTaskAfter)).toBe(true);

      // After sanitization, the legacy holiday is completely absent from Kanban
      const kanbanAfter = filterKanbanTasks({
        tasks: sanitized,
        dateFilter: "all",
        todayKey,
        today,
      });

      expect(kanbanAfter.some((t) => t.id === legacyImportedGoogleEvent.id)).toBe(false);
    });
  });
});
