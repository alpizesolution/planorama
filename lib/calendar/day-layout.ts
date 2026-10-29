import type { PlannerTask } from "@/lib/schedule/types";

export interface PositionedDayEvent {
  task: PlannerTask;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  column: number;
  totalColumns: number;
}

/**
 * Parses time string (e.g. "09:30", "14:15") to total minutes from midnight (0..1440).
 * Returns null if invalid or missing.
 */
export function parseMinutesFromTime(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim().toLowerCase();
  if (trimmed === "all_day" || trimmed === "allday") return null;

  const parts = trimmed.split(":");
  if (parts.length < 2) return null;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Determines whether a PlannerTask is an all-day item or dated daily task
 * (no specific start hour/minute).
 */
export function isAllDayItem(task: PlannerTask): boolean {
  if (task.isAllDay) return true;
  if (!task.dueTime) return true;
  const trimmed = task.dueTime.trim().toLowerCase();
  return trimmed === "" || trimmed === "all_day" || trimmed === "allday";
}

/**
 * Formats a given Date for the Day View main heading.
 * e.g. "Monday, October 26, 2026"
 */
export function formatDayTitle(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats start and end minutes (e.g. 540, 630) to human-readable 12-hour range.
 * e.g. "9:00 AM – 10:30 AM"
 */
export function formatTimeRange(startMin: number, endMin: number): string {
  const formatMin = (m: number) => {
    const clamped = Math.max(0, Math.min(1440, m));
    const hr = Math.floor(clamped / 60);
    const min = clamped % 60;
    const period = hr >= 12 ? "PM" : "AM";
    const displayHr = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    const displayMin = min === 0 ? ":00" : `:${min.toString().padStart(2, "0")}`;
    return `${displayHr}${displayMin} ${period}`;
  };
  return `${formatMin(startMin)} – ${formatMin(endMin)}`;
}

/**
 * Greedily positions overlapping events on a daily schedule canvas.
 * Follows the Google Calendar interval partitioning model:
 * 1. Filter timed events for the given dateKey
 * 2. Sort by startMinutes ASC, then durationMinutes DESC
 * 3. Group mutually overlapping events into connected collision clusters
 * 4. Greedily assign column slots (0, 1, ...) within each cluster
 * 5. Scale column widths: width = 100% / totalColumns, left = col * width
 */
export function layoutDayEvents(tasks: PlannerTask[], dateKey: string): PositionedDayEvent[] {
  // 1. Filter timed tasks on this date
  const dayTimedTasks = tasks.filter((t) => t.dueDate === dateKey && !isAllDayItem(t));
  if (dayTimedTasks.length === 0) return [];

  // 2. Parse start minutes and duration
  interface RawTimedItem {
    task: PlannerTask;
    startMinutes: number;
    endMinutes: number;
    durationMinutes: number;
  }

  const rawItems: RawTimedItem[] = [];
  for (const task of dayTimedTasks) {
    const start = parseMinutesFromTime(task.dueTime);
    if (start === null) continue;

    // Use durationMinutes if present, otherwise default to 60 minutes
    const dur = task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : 60;
    const end = Math.min(1440, start + dur);

    rawItems.push({
      task,
      startMinutes: start,
      endMinutes: end,
      durationMinutes: dur,
    });
  }

  if (rawItems.length === 0) return [];

  // 3. Sort by startMinutes ASC, then durationMinutes DESC
  rawItems.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return b.durationMinutes - a.durationMinutes;
  });

  // 4. Group items into connected overlap clusters
  const clusters: RawTimedItem[][] = [];
  let currentCluster: RawTimedItem[] = [];
  let clusterEnd = -1;

  for (const item of rawItems) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.endMinutes;
    } else {
      // If current item starts strictly before the cluster's current maximum end time, it overlaps
      if (item.startMinutes < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
      } else {
        // Disjoint event: start a new cluster
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMinutes;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 5. Greedily assign columns within each cluster
  const result: PositionedDayEvent[] = [];

  for (const cluster of clusters) {
    // Array of column end-times
    const columnEnds: number[] = [];
    const clusterAssignments: { item: RawTimedItem; column: number }[] = [];

    for (const item of cluster) {
      let placedColumn = -1;
      for (let col = 0; col < columnEnds.length; col++) {
        // Can be placed in column if previous event in this column ended before or at startMinutes
        if (columnEnds[col] <= item.startMinutes) {
          placedColumn = col;
          columnEnds[col] = item.endMinutes;
          break;
        }
      }

      // If no existing column can take it without overlap, allocate a new column
      if (placedColumn === -1) {
        placedColumn = columnEnds.length;
        columnEnds.push(item.endMinutes);
      }

      clusterAssignments.push({ item, column: placedColumn });
    }

    const totalColumns = columnEnds.length;
    for (const { item, column } of clusterAssignments) {
      result.push({
        task: item.task,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        durationMinutes: item.durationMinutes,
        column,
        totalColumns,
      });
    }
  }

  return result;
}
