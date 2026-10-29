export interface DayAvailability {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  enabled: boolean;
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
}

export type MeetingMethod = "google_meet" | "in_person" | "phone" | "custom";

export interface AppointmentSchedule {
  id: string;
  title: string;
  description: string;
  durationMinutes: number; // 15, 30, 45, 60, 90
  days: DayAvailability[];
  timeZone: string;
  schedulingWindowDays: number; // e.g. 14, 30, 60, 90
  bufferMinutes: number; // 0, 5, 10, 15, 30
  meetingMethod: MeetingMethod;
  locationDetails?: string;
  calendarId: string; // "none" or Google Calendar ID
  minNoticeHours: number; // 2, 4, 12, 24
  maxBookingsPerDay: number; // 0 = unlimited
  createdAt: string;
  updatedAt: string;
}

export type NewAppointmentSchedule = Omit<AppointmentSchedule, "id" | "createdAt" | "updatedAt">;

export interface GeneratedBookingSlot {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "09:00"
  endTime: string;   // "09:30"
  durationMinutes: number;
  isAvailable: boolean;
  conflictTitle?: string;
}

export const DEFAULT_WEEKLY_AVAILABILITY: DayAvailability[] = [
  { dayOfWeek: 0, enabled: false, startTime: "09:00", endTime: "17:00" }, // Sun
  { dayOfWeek: 1, enabled: true, startTime: "09:00", endTime: "17:00" },  // Mon
  { dayOfWeek: 2, enabled: true, startTime: "09:00", endTime: "17:00" },  // Tue
  { dayOfWeek: 3, enabled: true, startTime: "09:00", endTime: "17:00" },  // Wed
  { dayOfWeek: 4, enabled: true, startTime: "09:00", endTime: "17:00" },  // Thu
  { dayOfWeek: 5, enabled: true, startTime: "09:00", endTime: "17:00" },  // Fri
  { dayOfWeek: 6, enabled: false, startTime: "09:00", endTime: "17:00" }, // Sat
];
