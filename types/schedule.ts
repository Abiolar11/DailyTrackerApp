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
  fixedStartTime?: string;
  earliestStart?: string;
  latestEnd?: string;
  notes?: string;
}

export interface TimeBlock {
  id: string;
  taskId: string;
  title: string;
  category: Category;
  priority: Priority;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isLocked: boolean;
  isBuffer: boolean;
  isCompleted: boolean;
  flexibility: Flexibility;
}

export interface Schedule {
  id: string;
  date: string;
  prompt: string;
  blocks: TimeBlock[];
  generatedAt: string;
  wakeMinutes: number;
  sleepMinutes: number;
}

export interface UserSettings {
  wakeTime: string;
  sleepTime: string;
  bufferMinutes: number;
  timezone: string;
  notificationsEnabled: boolean;
}

export interface LearnedTask {
  signature: string;
  typicalDurationMinutes: number;
  preferredStartMinutes?: number;
  sampleCount: number;
  lastUsed: string;
}
