import type { PlannerPreferences, PlannerTask } from "./types";
import { DEFAULT_PREFERENCES } from "./types";

export type TaskOptionId =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "whenever"
  | "pinned"
  | "personal"
  | "none";

export interface TaskOptionItem {
  id: TaskOptionId;
  emoji: string;
  label: string;
  description: string;
  type: "priority" | "timing" | "pin" | "category";
}

export const TASK_OPTIONS: TaskOptionItem[] = [
  {
    id: "p1",
    emoji: "🔥",
    label: "Do This Now",
    description: "Urgent — handle immediately",
    type: "priority",
  },
  {
    id: "p2",
    emoji: "🔴",
    label: "High",
    description: "Important and time-sensitive",
    type: "priority",
  },
  {
    id: "p3",
    emoji: "🟠",
    label: "Medium",
    description: "Important, but not urgent",
    type: "priority",
  },
  {
    id: "p4",
    emoji: "🟡",
    label: "Low",
    description: "Can wait until later",
    type: "priority",
  },
  {
    id: "none",
    emoji: "⚪",
    label: "No Priority",
    description: "No priority assigned",
    type: "priority",
  },
  {
    id: "whenever",
    emoji: "🟢",
    label: "Whenever",
    description: "No specific deadline",
    type: "timing",
  },
  {
    id: "pinned",
    emoji: "📌",
    label: "Pinned",
    description: "Keep this task easy to find",
    type: "pin",
  },
  {
    id: "personal",
    emoji: "🌿",
    label: "Personal",
    description: "Optional category for life tasks",
    type: "category",
  },
];

export function getOptionLabel(id: string, prefs: PlannerPreferences = DEFAULT_PREFERENCES): string {
  const custom = prefs?.customLabels?.[id]?.trim();
  if (custom) return custom;
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.label : id;
}

export function getOptionEmoji(id: string, prefs: PlannerPreferences = DEFAULT_PREFERENCES): string {
  const custom = prefs?.customEmojis?.[id]?.trim();
  if (custom) return custom;
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.emoji : "";
}

export function getOptionDescription(id: string): string {
  const found = TASK_OPTIONS.find((opt) => opt.id === id);
  return found ? found.description : "";
}

export function priorityLabel(priority: PlannerTask["priority"] | undefined, prefs: PlannerPreferences = DEFAULT_PREFERENCES): string {
  return getOptionLabel(priority ?? "none", prefs);
}

export function priorityEmoji(priority: PlannerTask["priority"] | undefined, prefs: PlannerPreferences = DEFAULT_PREFERENCES): string {
  return getOptionEmoji(priority ?? "none", prefs);
}
