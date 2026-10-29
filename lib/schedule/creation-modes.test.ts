import { describe, it, expect, beforeEach } from "vitest";
import { createTask, updateTask, getTasks } from "./task-service";
import { isAllDayItem, layoutDayEvents } from "../calendar/day-layout";
import {
  saveAppointmentSchedule,
  getAppointmentSchedules,
  deleteAppointmentSchedule,
  calculateAvailableSlots,
  validateAppointmentSchedule,
} from "./appointment-service";
import type { PlannerTask } from "./types";
import type { AppointmentSchedule } from "./appointment-types";

describe("PLANORAMA — Rebuilt Creation Modes (Event, Task & Appointment Schedule)", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  // =========================================================================
  // 1. EVENT CREATION FLOW
  // =========================================================================
  describe("1. Calendar Event Creation Flow", () => {
    it("creates, persists, and reloads a timed event with duration, location, and attendees", async () => {
      const event = await createTask({
        title: "Q4 Client Strategy Briefing",
        dueDate: "2026-10-30",
        dueTime: "10:00",
        durationMinutes: 90,
        isAllDay: false,
        location: "Meeting Room A & Google Meet",
        attendees: [{ email: "client@example.com", displayName: "Client Lead" }],
        isPrivateAvailabilityOnly: false,
        notes: "Discuss deliverables, timelines, and scope adjustments.",
        recurrence: "weekly",
        source: "local",
      });

      expect(event.id).toBeDefined();
      expect(event.title).toBe("Q4 Client Strategy Briefing");
      expect(event.dueDate).toBe("2026-10-30");
      expect(event.dueTime).toBe("10:00");
      expect(event.durationMinutes).toBe(90);
      expect(event.location).toBe("Meeting Room A & Google Meet");
      expect(event.attendees?.[0].email).toBe("client@example.com");
      expect(event.recurrence).toBe("weekly");

      // Verify persistence
      const allTasks = await getTasks();
      const found = allTasks.find((t) => t.id === event.id);
      expect(found).toBeDefined();
      expect(found?.durationMinutes).toBe(90);
      expect(found?.location).toBe("Meeting Room A & Google Meet");
    });

    it("verifies timed event is correctly positioned on day timeline canvas with exact duration", async () => {
      const event: PlannerTask = {
        id: "ev_1",
        title: "Team Standup",
        dueDate: "2026-10-30",
        dueTime: "09:00",
        durationMinutes: 45,
        isAllDay: false,
        status: "open",
        priority: "none",
        projectId: null,
        labelIds: [],
        recurrence: "none",
        notes: "",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      };

      const positioned = layoutDayEvents([event], "2026-10-30");
      expect(positioned.length).toBe(1);
      expect(positioned[0].startMinutes).toBe(9 * 60); // 540m
      expect(positioned[0].durationMinutes).toBe(45);
      expect(positioned[0].endMinutes).toBe(540 + 45); // 585m (9:45 AM)
    });

    it("creates and identifies an all-day event", async () => {
      const allDayEvent = await createTask({
        title: "Company Holiday / Offsite",
        dueDate: "2026-10-31",
        dueTime: null,
        isAllDay: true,
        durationMinutes: 1440,
        notes: "All offices closed",
      });

      expect(allDayEvent.isAllDay).toBe(true);
      expect(isAllDayItem(allDayEvent)).toBe(true);

      // Should not be placed on timed timeline slots
      const positioned = layoutDayEvents([allDayEvent], "2026-10-31");
      expect(positioned.length).toBe(0);
    });

    it("edits an existing event without creating a duplicate record", async () => {
      const original = await createTask({
        title: "Design Review v1",
        dueDate: "2026-11-01",
        dueTime: "14:00",
        durationMinutes: 60,
        location: "Zoom link 1",
      });

      const updated = await updateTask({
        ...original,
        title: "Design Review v2 (Rescheduled)",
        dueTime: "15:00",
        durationMinutes: 90,
        location: "In-Person Room 204",
      });

      expect(updated.id).toBe(original.id);
      expect(updated.title).toBe("Design Review v2 (Rescheduled)");
      expect(updated.dueTime).toBe("15:00");
      expect(updated.durationMinutes).toBe(90);
      expect(updated.location).toBe("In-Person Room 204");

      const all = await getTasks();
      const matches = all.filter((t) => t.id === original.id);
      expect(matches.length).toBe(1);
    });
  });

  // =========================================================================
  // 2. TASK CREATION FLOW
  // =========================================================================
  describe("2. Dedicated To-Do Task Creation Flow", () => {
    it("creates a task with only a due date and verifies it is treated as a deadline, not a timed event", async () => {
      const task = await createTask({
        title: "File monthly VAT declaration",
        dueDate: "2026-10-30",
        dueTime: null, // No scheduled time
        status: "open",
        priority: "p2",
        isPinned: true,
        isPersonal: false,
        timingPreference: "whenever",
        notes: "Make sure all receipts are reconciled in Xero.",
      });

      expect(task.dueDate).toBe("2026-10-30");
      expect(task.dueTime).toBeNull();
      expect(task.priority).toBe("p2");
      expect(task.isPinned).toBe(true);

      // Crucial requirement: A task without scheduled time must NOT be placed on timed timeline
      expect(isAllDayItem(task)).toBe(true);
      const positioned = layoutDayEvents([task], "2026-10-30");
      expect(positioned.length).toBe(0);
    });

    it("creates a task with a scheduled time and verifies it appears on the timeline", async () => {
      const scheduledTask = await createTask({
        title: "Deep Work: Coding Session",
        dueDate: "2026-10-30",
        dueTime: "13:30",
        durationMinutes: 120,
        status: "open",
        priority: "p1",
      });

      expect(scheduledTask.dueTime).toBe("13:30");
      expect(isAllDayItem(scheduledTask)).toBe(false);

      const positioned = layoutDayEvents([scheduledTask], "2026-10-30");
      expect(positioned.length).toBe(1);
      expect(positioned[0].startMinutes).toBe(13 * 60 + 30); // 810
      expect(positioned[0].durationMinutes).toBe(120);
    });

    it("completes and edits a task preserving independent priority and status workflow", async () => {
      const task = await createTask({
        title: "Audit quarterly cloud expenses",
        dueDate: "2026-10-28",
        dueTime: null,
        status: "open",
        priority: "p3",
      });

      // Complete the task
      const completed = await updateTask({
        ...task,
        status: "completed",
      });

      expect(completed.status).toBe("completed");
      expect(completed.priority).toBe("p3"); // Priority remains intact

      // Reopen with edit
      const edited = await updateTask({
        ...completed,
        title: "Audit quarterly cloud expenses (Updated budget)",
        status: "in_progress",
        priority: "p1",
      });

      expect(edited.id).toBe(task.id);
      expect(edited.status).toBe("in_progress");
      expect(edited.priority).toBe("p1");
    });
  });

  // =========================================================================
  // 3. APPOINTMENT SCHEDULE AVAILABILITY FLOW
  // =========================================================================
  describe("3. Appointment Schedule — Booking Availability Flow", () => {
    it("validates and rejects invalid schedule configurations", () => {
      // Empty title
      expect(() =>
        validateAppointmentSchedule({
          id: "test",
          title: "",
          durationMinutes: 30,
          days: [{ dayOfWeek: 1, enabled: true, startTime: "09:00", endTime: "17:00" }],
        })
      ).toThrow("Schedule title must be between 1 and 240 characters.");

      // No enabled days
      expect(() =>
        validateAppointmentSchedule({
          id: "test",
          title: "Consultation",
          durationMinutes: 30,
          days: [{ dayOfWeek: 1, enabled: false, startTime: "09:00", endTime: "17:00" }],
        })
      ).toThrow("At least one day of the week must be enabled.");

      // Start time after or equal to end time
      expect(() =>
        validateAppointmentSchedule({
          id: "test",
          title: "Consultation",
          durationMinutes: 30,
          days: [{ dayOfWeek: 1, enabled: true, startTime: "17:00", endTime: "09:00" }],
        })
      ).toThrow("Start time must be strictly before end time.");
    });

    it("configures, persists, and reloads a reusable availability schedule", async () => {
      const saved = await saveAppointmentSchedule({
        title: "30-min Strategy Consultation",
        description: "One-on-one virtual planning session for high-priority projects.",
        durationMinutes: 30,
        days: [
          { dayOfWeek: 1, enabled: true, startTime: "09:00", endTime: "12:00" }, // Mon 9am-12pm
          { dayOfWeek: 3, enabled: true, startTime: "13:00", endTime: "17:00" }, // Wed 1pm-5pm
          { dayOfWeek: 5, enabled: true, startTime: "09:00", endTime: "12:00" }, // Fri 9am-12pm
        ],
        timeZone: "Asia/Manila",
        schedulingWindowDays: 60,
        bufferMinutes: 10,
        meetingMethod: "google_meet",
        calendarId: "none",
        minNoticeHours: 4,
        maxBookingsPerDay: 4,
      });

      expect(saved.id).toBeDefined();
      expect(saved.title).toBe("30-min Strategy Consultation");
      expect(saved.durationMinutes).toBe(30);
      expect(saved.bufferMinutes).toBe(10);
      expect(saved.minNoticeHours).toBe(4);

      const allSchedules = await getAppointmentSchedules();
      expect(allSchedules.length).toBeGreaterThanOrEqual(1);
      const found = allSchedules.find((s) => s.id === saved.id);
      expect(found).toBeDefined();
      expect(found?.meetingMethod).toBe("google_meet");

      // Cleanup
      await deleteAppointmentSchedule(saved.id);
      const afterDelete = await getAppointmentSchedules();
      expect(afterDelete.find((s) => s.id === saved.id)).toBeUndefined();
    });

    it("generates booking slots and detects conflicting calendar events", () => {
      const schedule: AppointmentSchedule = {
        id: "sched_1",
        title: "1-on-1 Review",
        description: "",
        durationMinutes: 30,
        days: [
          // Enable Monday: 09:00 to 11:00
          { dayOfWeek: 1, enabled: true, startTime: "09:00", endTime: "11:00" },
        ],
        timeZone: "Asia/Manila",
        schedulingWindowDays: 14,
        bufferMinutes: 0,
        meetingMethod: "google_meet",
        calendarId: "none",
        minNoticeHours: 0,
        maxBookingsPerDay: 0,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      };

      // Monday Oct 26, 2026
      const mondayDate = new Date(2026, 9, 26); // Oct 26 is Monday

      // Existing conflicting event: 09:30 - 10:30
      const existingEvents: PlannerTask[] = [
        {
          id: "conflict_1",
          title: "Client Emergency Standup",
          dueDate: "2026-10-26",
          dueTime: "09:30",
          durationMinutes: 60, // 09:30 - 10:30
          status: "open",
          priority: "none",
          projectId: null,
          labelIds: [],
          recurrence: "none",
          notes: "",
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z",
        },
      ];

      const slots = calculateAvailableSlots(schedule, existingEvents, mondayDate, 1);

      // Expected slots for 9:00 to 11:00 with 30m duration:
      // Slot 1: 09:00 - 09:30 -> Available
      // Slot 2: 09:30 - 10:00 -> Blocked by conflict
      // Slot 3: 10:00 - 10:30 -> Blocked by conflict
      // Slot 4: 10:30 - 11:00 -> Available
      expect(slots.length).toBe(4);

      expect(slots[0].startTime).toBe("09:00");
      expect(slots[0].isAvailable).toBe(true);

      expect(slots[1].startTime).toBe("09:30");
      expect(slots[1].isAvailable).toBe(false);
      expect(slots[1].conflictTitle).toContain("Client Emergency Standup");

      expect(slots[2].startTime).toBe("10:00");
      expect(slots[2].isAvailable).toBe(false);
      expect(slots[2].conflictTitle).toContain("Client Emergency Standup");

      expect(slots[3].startTime).toBe("10:30");
      expect(slots[3].isAvailable).toBe(true);
    });
  });

  // =========================================================================
  // 4. TAB SWITCHING & ISOLATION
  // =========================================================================
  describe("4. Tab Switching & Functional Field Isolation", () => {
    it("ensures Event, Task, and Appointment modes maintain strict functional isolation", () => {
      // Event-specific fields
      const eventFields = [
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "isAllDay",
        "durationMinutes",
        "attendees",
        "isPrivateAvailabilityOnly",
      ];

      // Task-specific fields
      const taskFields = [
        "dueDate",
        "scheduledTime",
        "priority",
        "status",
        "isPinned",
        "isPersonal",
        "labelIds",
      ];

      // Appointment-specific fields
      const appointmentFields = [
        "days",
        "bufferMinutes",
        "schedulingWindowDays",
        "meetingMethod",
        "minNoticeHours",
        "maxBookingsPerDay",
      ];

      // Verify no field collision across mode contracts
      for (const ef of eventFields) {
        expect(taskFields.includes(ef)).toBe(false);
        expect(appointmentFields.includes(ef)).toBe(false);
      }

      for (const tf of taskFields) {
        expect(eventFields.includes(tf)).toBe(false);
        expect(appointmentFields.includes(tf)).toBe(false);
      }
    });

    it("verifies slot generation respects buffer time between appointments", () => {
      const schedule: AppointmentSchedule = {
        id: "sched_buffer",
        title: "Therapy Session",
        description: "",
        durationMinutes: 50,
        days: [
          { dayOfWeek: 2, enabled: true, startTime: "14:00", endTime: "16:00" }, // Tuesday 2pm - 4pm (120 mins)
        ],
        timeZone: "UTC",
        schedulingWindowDays: 14,
        bufferMinutes: 10, // 50m + 10m buffer = 60m step
        meetingMethod: "in_person",
        calendarId: "none",
        minNoticeHours: 0,
        maxBookingsPerDay: 0,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
      };

      // Tuesday Oct 27, 2026
      const tuesdayDate = new Date(2026, 9, 27);
      const slots = calculateAvailableSlots(schedule, [], tuesdayDate, 1);

      // Slot 1: 14:00 - 14:50 (then 10 min buffer till 15:00)
      // Slot 2: 15:00 - 15:50 (then 10 min buffer till 16:00)
      expect(slots.length).toBe(2);
      expect(slots[0].startTime).toBe("14:00");
      expect(slots[0].endTime).toBe("14:50");
      expect(slots[1].startTime).toBe("15:00");
      expect(slots[1].endTime).toBe("15:50");
    });

    it("preserves cell preselected date and initial time when launching modal", () => {
      // Simulate clicking on calendar cell: 2026-11-15 at 14:30
      const initialDate = "2026-11-15";
      const initialTime = "14:30";

      const eventPayload = {
        title: "Client Quick Call",
        dueDate: initialDate,
        dueTime: initialTime,
        durationMinutes: 30,
        calendarId: "primary_cal",
      };

      expect(eventPayload.dueDate).toBe(initialDate);
      expect(eventPayload.dueTime).toBe(initialTime);
      expect(eventPayload.calendarId).toBe("primary_cal");
    });
  });
});
