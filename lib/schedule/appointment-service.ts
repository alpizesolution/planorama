import type {
  AppointmentSchedule,
  NewAppointmentSchedule,
  GeneratedBookingSlot,
} from "./appointment-types";
import type { PlannerTask } from "./types";
import { generateId } from "./id";

const APPOINTMENT_STORE_KEY = "planorama:appointment_schedules:v1";

let inMemorySchedules: AppointmentSchedule[] = [];

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function validateAppointmentSchedule(input: unknown): AppointmentSchedule {
  if (!input || typeof input !== "object") {
    throw new Error("Appointment schedule must be an object.");
  }
  const s = input as Partial<AppointmentSchedule>;

  if (typeof s.id !== "string" || !s.id.trim()) {
    throw new Error("Schedule ID is required.");
  }

  const title = (s.title ?? "").trim();
  if (!title || title.length > 240) {
    throw new Error("Schedule title must be between 1 and 240 characters.");
  }

  if (typeof s.durationMinutes !== "number" || s.durationMinutes <= 0) {
    throw new Error("Duration must be a positive number of minutes.");
  }

  if (!Array.isArray(s.days) || s.days.length === 0) {
    throw new Error("Availability days are required.");
  }

  const hasEnabledDay = s.days.some((d) => d.enabled);
  if (!hasEnabledDay) {
    throw new Error("At least one day of the week must be enabled.");
  }

  for (const day of s.days) {
    if (day.enabled) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.endTime)) {
        throw new Error("Valid start and end times (HH:mm) are required for enabled days.");
      }
      if (day.startTime >= day.endTime) {
        throw new Error("Start time must be strictly before end time.");
      }
    }
  }

  return {
    id: s.id,
    title,
    description: typeof s.description === "string" ? s.description.trim() : "",
    durationMinutes: Math.floor(s.durationMinutes),
    days: s.days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      enabled: Boolean(d.enabled),
      startTime: d.startTime,
      endTime: d.endTime,
    })),
    timeZone: typeof s.timeZone === "string" && s.timeZone ? s.timeZone : "Asia/Manila",
    schedulingWindowDays: typeof s.schedulingWindowDays === "number" && s.schedulingWindowDays > 0 ? s.schedulingWindowDays : 30,
    bufferMinutes: typeof s.bufferMinutes === "number" && s.bufferMinutes >= 0 ? s.bufferMinutes : 0,
    meetingMethod: s.meetingMethod ?? "google_meet",
    locationDetails: typeof s.locationDetails === "string" ? s.locationDetails.trim() : undefined,
    calendarId: typeof s.calendarId === "string" ? s.calendarId : "none",
    minNoticeHours: typeof s.minNoticeHours === "number" && s.minNoticeHours >= 0 ? s.minNoticeHours : 2,
    maxBookingsPerDay: typeof s.maxBookingsPerDay === "number" && s.maxBookingsPerDay >= 0 ? s.maxBookingsPerDay : 0,
    createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : new Date().toISOString(),
  };
}

export async function getAppointmentSchedules(): Promise<AppointmentSchedule[]> {
  try {
    const storage = getStorage();
    if (!storage) return [...inMemorySchedules];
    const raw = storage.getItem(APPOINTMENT_STORE_KEY);
    if (!raw) return [...inMemorySchedules];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...inMemorySchedules];
    const validated = parsed.map(validateAppointmentSchedule);
    inMemorySchedules = validated;
    return validated;
  } catch {
    return [...inMemorySchedules];
  }
}

export async function saveAppointmentSchedule(
  input: NewAppointmentSchedule & { id?: string }
): Promise<AppointmentSchedule> {
  const now = new Date().toISOString();
  const scheduleId = input.id && input.id.trim() ? input.id : generateId();

  const schedule: AppointmentSchedule = validateAppointmentSchedule({
    ...input,
    id: scheduleId,
    createdAt: now,
    updatedAt: now,
  });

  const existing = await getAppointmentSchedules();
  const filtered = existing.filter((s) => s.id !== schedule.id);
  const updatedList = [schedule, ...filtered];

  inMemorySchedules = updatedList;
  try {
    const storage = getStorage();
    storage?.setItem(APPOINTMENT_STORE_KEY, JSON.stringify(updatedList));
  } catch {
    // fallback
  }

  return schedule;
}

export async function deleteAppointmentSchedule(id: string): Promise<void> {
  const existing = await getAppointmentSchedules();
  const updatedList = existing.filter((s) => s.id !== id);
  inMemorySchedules = updatedList;
  try {
    const storage = getStorage();
    storage?.setItem(APPOINTMENT_STORE_KEY, JSON.stringify(updatedList));
  } catch {
    // fallback
  }
}

/**
 * Calculates available slots for a schedule based on existing planner tasks/events.
 */
export function calculateAvailableSlots(
  schedule: AppointmentSchedule,
  existingTasks: PlannerTask[] = [],
  startDate: Date = new Date(),
  daysToPreview: number = 7
): GeneratedBookingSlot[] {
  const slots: GeneratedBookingSlot[] = [];
  const duration = schedule.durationMinutes;
  const buffer = schedule.bufferMinutes;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

  for (let d = 0; d < daysToPreview; d++) {
    const currentDay = new Date(startDate);
    currentDay.setDate(startDate.getDate() + d);

    const year = currentDay.getFullYear();
    const month = String(currentDay.getMonth() + 1).padStart(2, "0");
    const day = String(currentDay.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    const dayOfWeek = currentDay.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    const dayConfig = schedule.days.find((item) => item.dayOfWeek === dayOfWeek);
    if (!dayConfig || !dayConfig.enabled) continue;

    const [startH, startM] = dayConfig.startTime.split(":").map(Number);
    const [endH, endM] = dayConfig.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Filter tasks on this day (ignoring completed ones)
    const dayTasks = existingTasks.filter(
      (t) => t.dueDate === dateKey && t.status !== "completed"
    );

    let currentSlotStart = startMinutes;
    while (currentSlotStart + duration <= endMinutes) {
      const currentSlotEnd = currentSlotStart + duration;

      const slotStartHH = String(Math.floor(currentSlotStart / 60)).padStart(2, "0");
      const slotStartMM = String(currentSlotStart % 60).padStart(2, "0");
      const slotEndHH = String(Math.floor(currentSlotEnd / 60)).padStart(2, "0");
      const slotEndMM = String(currentSlotEnd % 60).padStart(2, "0");

      const startTimeStr = `${slotStartHH}:${slotStartMM}`;
      const endTimeStr = `${slotEndHH}:${slotEndMM}`;

      let isAvailable = true;
      let conflictTitle: string | undefined = undefined;

      // Check min advance notice if viewing today
      if (dateKey === todayKey) {
        const minNoticeThreshold = currentMinutesNow + (schedule.minNoticeHours * 60);
        if (currentSlotStart < minNoticeThreshold) {
          isAvailable = false;
          conflictTitle = "Advance notice required";
        }
      }

      // Check task & event collisions
      if (isAvailable) {
        for (const task of dayTasks) {
          if (task.isAllDay) {
            isAvailable = false;
            conflictTitle = `All-day: ${task.title}`;
            break;
          }

          if (task.dueTime) {
            const [tH, tM] = task.dueTime.split(":").map(Number);
            const taskStart = tH * 60 + tM;
            const taskDuration = task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : 60;
            const taskEnd = taskStart + taskDuration;

            // Overlap check
            const overlaps = !(currentSlotEnd <= taskStart || currentSlotStart >= taskEnd);
            if (overlaps) {
              isAvailable = false;
              conflictTitle = `Busy: ${task.title}`;
              break;
            }
          }
        }
      }

      slots.push({
        date: dateKey,
        startTime: startTimeStr,
        endTime: endTimeStr,
        durationMinutes: duration,
        isAvailable,
        conflictTitle,
      });

      currentSlotStart += duration + buffer;
    }
  }

  return slots;
}
