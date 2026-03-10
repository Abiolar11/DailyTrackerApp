import pool from "./db";

export interface TimeBlockData {
  id: string;
  taskId: string;
  title: string;
  category: string;
  priority: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isLocked: boolean;
  isBuffer: boolean;
  isCompleted: boolean;
  flexibility: string;
  notes?: string;
}

export interface ScheduleData {
  id: string;
  date: string;
  prompt: string;
  generatedAt: string;
  wakeMinutes: number;
  sleepMinutes: number;
  blocks: TimeBlockData[];
}

export interface SettingsData {
  wakeTime: string;
  sleepTime: string;
  bufferMinutes: number;
  timezone: string;
  notificationsEnabled: boolean;
}

export interface LearnedTaskData {
  signature: string;
  typicalDurationMinutes: number;
  preferredStartMinutes?: number;
  sampleCount: number;
  lastUsed: string;
}

export async function getSettings(): Promise<SettingsData> {
  const result = await pool.query("SELECT * FROM user_settings WHERE id = 1");
  if (result.rows.length === 0) {
    return { wakeTime: "07:00", sleepTime: "23:00", bufferMinutes: 10, timezone: "auto", notificationsEnabled: true };
  }
  const r = result.rows[0];
  return {
    wakeTime: r.wake_time,
    sleepTime: r.sleep_time,
    bufferMinutes: r.buffer_minutes,
    timezone: r.timezone,
    notificationsEnabled: r.notifications_enabled,
  };
}

export async function updateSettings(settings: Partial<SettingsData>): Promise<SettingsData> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await pool.query(
    `INSERT INTO user_settings (id, wake_time, sleep_time, buffer_minutes, timezone, notifications_enabled, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       wake_time = EXCLUDED.wake_time, sleep_time = EXCLUDED.sleep_time,
       buffer_minutes = EXCLUDED.buffer_minutes, timezone = EXCLUDED.timezone,
       notifications_enabled = EXCLUDED.notifications_enabled, updated_at = NOW()`,
    [merged.wakeTime, merged.sleepTime, merged.bufferMinutes, merged.timezone, merged.notificationsEnabled]
  );
  return merged;
}

export async function getScheduleByDate(date: string): Promise<ScheduleData | null> {
  const scheduleResult = await pool.query("SELECT * FROM schedules WHERE date = $1 ORDER BY created_at DESC LIMIT 1", [date]);
  if (scheduleResult.rows.length === 0) return null;
  const schedule = scheduleResult.rows[0];
  const blocksResult = await pool.query(
    "SELECT * FROM time_blocks WHERE schedule_id = $1 ORDER BY start_minutes",
    [schedule.id]
  );
  return {
    id: schedule.id,
    date: schedule.date,
    prompt: schedule.prompt,
    generatedAt: schedule.generated_at,
    wakeMinutes: schedule.wake_minutes,
    sleepMinutes: schedule.sleep_minutes,
    blocks: blocksResult.rows.map(mapBlockRow),
  };
}

export async function saveSchedule(schedule: ScheduleData) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO schedules (id, date, prompt, generated_at, wake_minutes, sleep_minutes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date, prompt = EXCLUDED.prompt, generated_at = EXCLUDED.generated_at,
         wake_minutes = EXCLUDED.wake_minutes, sleep_minutes = EXCLUDED.sleep_minutes, updated_at = NOW()`,
      [schedule.id, schedule.date, schedule.prompt, schedule.generatedAt, schedule.wakeMinutes, schedule.sleepMinutes]
    );
    await client.query("DELETE FROM time_blocks WHERE schedule_id = $1", [schedule.id]);
    for (const block of schedule.blocks) {
      await client.query(
        `INSERT INTO time_blocks (id, schedule_id, task_id, title, category, priority, start_minutes, end_minutes, duration_minutes, is_locked, is_buffer, is_completed, flexibility, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [block.id, schedule.id, block.taskId, block.title, block.category, block.priority,
         block.startMinutes, block.endMinutes, block.durationMinutes,
         block.isLocked || false, block.isBuffer || false, block.isCompleted || false,
         block.flexibility || "medium", block.notes || null]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteSchedule(id: string) {
  await pool.query("DELETE FROM schedules WHERE id = $1", [id]);
}

export async function getScheduleHistory(limit = 60): Promise<ScheduleData[]> {
  const result = await pool.query("SELECT * FROM schedules ORDER BY date DESC, created_at DESC LIMIT $1", [limit]);
  const schedules: ScheduleData[] = [];
  for (const row of result.rows) {
    const blocksResult = await pool.query(
      "SELECT * FROM time_blocks WHERE schedule_id = $1 ORDER BY start_minutes",
      [row.id]
    );
    schedules.push({
      id: row.id,
      date: row.date,
      prompt: row.prompt,
      generatedAt: row.generated_at,
      wakeMinutes: row.wake_minutes,
      sleepMinutes: row.sleep_minutes,
      blocks: blocksResult.rows.map(mapBlockRow),
    });
  }
  return schedules;
}

export async function getLearnedTasks(): Promise<Record<string, LearnedTaskData>> {
  const result = await pool.query("SELECT * FROM learned_tasks");
  const map: Record<string, LearnedTaskData> = {};
  for (const row of result.rows) {
    map[row.signature] = {
      signature: row.signature,
      typicalDurationMinutes: row.typical_duration_minutes,
      preferredStartMinutes: row.preferred_start_minutes ?? undefined,
      sampleCount: row.sample_count,
      lastUsed: row.last_used,
    };
  }
  return map;
}

export async function upsertLearnedTask(task: LearnedTaskData) {
  await pool.query(
    `INSERT INTO learned_tasks (signature, typical_duration_minutes, preferred_start_minutes, sample_count, last_used)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (signature) DO UPDATE SET
       typical_duration_minutes = EXCLUDED.typical_duration_minutes,
       preferred_start_minutes = EXCLUDED.preferred_start_minutes,
       sample_count = EXCLUDED.sample_count,
       last_used = EXCLUDED.last_used`,
    [task.signature, task.typicalDurationMinutes, task.preferredStartMinutes ?? null, task.sampleCount, task.lastUsed]
  );
}

export async function deleteLearnedTask(signature: string) {
  await pool.query("DELETE FROM learned_tasks WHERE signature = $1", [signature]);
}

export async function deleteAllLearnedTasks() {
  await pool.query("DELETE FROM learned_tasks");
}

export async function clearScheduleHistory() {
  await pool.query("DELETE FROM schedules");
}

function mapBlockRow(row: any): TimeBlockData {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    startMinutes: row.start_minutes,
    endMinutes: row.end_minutes,
    durationMinutes: row.duration_minutes,
    isLocked: row.is_locked,
    isBuffer: row.is_buffer,
    isCompleted: row.is_completed,
    flexibility: row.flexibility,
  };
}
