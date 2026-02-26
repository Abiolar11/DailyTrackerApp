export type Priority = "high" | "medium" | "low";
export type Flexibility = "fixed" | "high" | "medium" | "low";
export type Category =
  | "work"
  | "health"
  | "personal"
  | "learning"
  | "social"
  | "rest"
  | "other";

export interface ParsedTask {
  id: string;
  title: string;
  category: Category;
  priority: Priority;
  durationMinutes: number;
  flexibility: Flexibility;
  fixedStartTime?: string; // "HH:MM" 24h format
  earliestStart?: string; // "HH:MM"
  latestEnd?: string; // "HH:MM"
  notes?: string;
}

export interface TimeBlock {
  id: string;
  taskId: string;
  title: string;
  category: Category;
  priority: Priority;
  startMinutes: number; // minutes from midnight
  endMinutes: number;
  durationMinutes: number;
  isLocked: boolean;
  isBuffer: boolean;
  flexibility: Flexibility;
}

export interface Schedule {
  id: string;
  date: string; // "YYYY-MM-DD"
  prompt: string;
  blocks: TimeBlock[];
  generatedAt: string; // ISO string
  wakeMinutes: number;
  sleepMinutes: number;
}

export interface UserSettings {
  wakeTime: string; // "HH:MM"
  sleepTime: string; // "HH:MM"
  bufferMinutes: number;
  timezone: string;
}

export interface LearnedTask {
  signature: string; // normalized task name
  typicalDurationMinutes: number;
  preferredStartMinutes?: number; // preferred time of day
  sampleCount: number;
  lastUsed: string; // ISO string
}
