import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const usePersonalKey = !!process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: usePersonalKey ? process.env.OPENAI_API_KEY : process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  ...(!usePersonalKey && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
    : {}),
});

interface ParseTasksRequest {
  prompt: string;
  wakeTime: string;
  sleepTime: string;
  bufferMinutes: number;
  learnedTasks?: Record<string, { typicalDurationMinutes: number; preferredStartMinutes?: number }>;
}

interface ParsedTaskRaw {
  id: string;
  title: string;
  category: string;
  priority: string;
  durationMinutes: number;
  flexibility: string;
  fixedStartTime?: string;
  earliestStart?: string;
  latestEnd?: string;
  notes?: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateSchedule(
  tasks: ParsedTaskRaw[],
  wakeMinutes: number,
  sleepMinutes: number,
  bufferMinutes: number
) {
  const blocks: Array<{
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
    flexibility: string;
  }> = [];

  // Separate fixed and flexible tasks
  const fixedTasks = tasks.filter(
    (t) => t.flexibility === "fixed" && t.fixedStartTime
  );
  const flexTasks = tasks.filter(
    (t) => t.flexibility !== "fixed" || !t.fixedStartTime
  );

  // Priority order
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  flexTasks.sort(
    (a, b) =>
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2)
  );

  // Place fixed tasks first
  for (const task of fixedTasks) {
    const start = timeToMinutes(task.fixedStartTime!);
    const end = start + task.durationMinutes;
    if (start >= wakeMinutes && end <= sleepMinutes) {
      blocks.push({
        id: `block_${task.id}`,
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        startMinutes: start,
        endMinutes: end,
        durationMinutes: task.durationMinutes,
        isLocked: false,
        isBuffer: false,
        flexibility: task.flexibility,
      });
    }
  }

  // Sort fixed blocks
  blocks.sort((a, b) => a.startMinutes - b.startMinutes);

  // Place flexible tasks into available slots
  let cursor = wakeMinutes;

  for (const task of flexTasks) {
    // Find earliest valid slot
    const earliestStart = task.earliestStart
      ? Math.max(cursor, timeToMinutes(task.earliestStart))
      : cursor;
    const latestEnd = task.latestEnd
      ? Math.min(sleepMinutes, timeToMinutes(task.latestEnd))
      : sleepMinutes;

    let placed = false;
    let tryStart = earliestStart;

    while (tryStart + task.durationMinutes <= latestEnd && !placed) {
      const tryEnd = tryStart + task.durationMinutes;

      // Check if this slot is free from existing blocks
      const conflicts = blocks.filter(
        (b) =>
          !b.isBuffer &&
          ((tryStart >= b.startMinutes && tryStart < b.endMinutes) ||
            (tryEnd > b.startMinutes && tryEnd <= b.endMinutes) ||
            (tryStart <= b.startMinutes && tryEnd >= b.endMinutes))
      );

      if (conflicts.length === 0) {
        blocks.push({
          id: `block_${task.id}`,
          taskId: task.id,
          title: task.title,
          category: task.category,
          priority: task.priority,
          startMinutes: tryStart,
          endMinutes: tryEnd,
          durationMinutes: task.durationMinutes,
          isLocked: false,
          isBuffer: false,
          flexibility: task.flexibility,
        });
        // Add buffer after if room
        if (tryEnd + bufferMinutes <= sleepMinutes && bufferMinutes > 0) {
          cursor = tryEnd + bufferMinutes;
        } else {
          cursor = tryEnd;
        }
        placed = true;
      } else {
        // Jump past the conflict
        tryStart = Math.max(...conflicts.map((c) => c.endMinutes)) + bufferMinutes;
      }
    }
  }

  // Sort all blocks by start time
  blocks.sort((a, b) => a.startMinutes - b.startMinutes);

  return blocks;
}

const parseScheduleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

function sanitize(input: string): string {
  return input.replace(/[<>]/g, "").trim();
}

const MAX_PROMPT_LENGTH = 2000;
const TIME_REGEX = /^\d{2}:\d{2}$/;

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/parse-schedule", parseScheduleLimiter, async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        wakeTime,
        sleepTime,
        bufferMinutes,
        learnedTasks = {},
      }: ParseTasksRequest = req.body;

      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (prompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({ error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer` });
      }

      if (wakeTime && !TIME_REGEX.test(wakeTime)) {
        return res.status(400).json({ error: "Invalid wakeTime format, expected HH:MM" });
      }

      if (sleepTime && !TIME_REGEX.test(sleepTime)) {
        return res.status(400).json({ error: "Invalid sleepTime format, expected HH:MM" });
      }

      const wakeH = parseInt((wakeTime || "07:00").split(":")[0]);
      const wakeM = parseInt((wakeTime || "07:00").split(":")[1]);
      const sleepH = parseInt((sleepTime || "23:00").split(":")[0]);
      const sleepM = parseInt((sleepTime || "23:00").split(":")[1]);
      if (wakeH < 0 || wakeH > 23 || wakeM < 0 || wakeM > 59 || sleepH < 0 || sleepH > 23 || sleepM < 0 || sleepM > 59) {
        return res.status(400).json({ error: "Invalid time values: hours must be 0-23, minutes 0-59" });
      }

      const wakeTotal = wakeH * 60 + wakeM;
      const sleepTotal = sleepH * 60 + sleepM;
      if (sleepTotal <= wakeTotal) {
        return res.status(400).json({ error: "Sleep time must be after wake time" });
      }

      if (bufferMinutes !== undefined && (typeof bufferMinutes !== "number" || bufferMinutes < 0 || bufferMinutes > 60)) {
        return res.status(400).json({ error: "bufferMinutes must be a number between 0 and 60" });
      }

      const sanitizedPrompt = sanitize(prompt);

      const wakeMinutes = timeToMinutes(wakeTime || "07:00");
      const sleepMinutes = timeToMinutes(sleepTime || "23:00");

      // Build learned context
      const learnedContext =
        Object.keys(learnedTasks).length > 0
          ? `\n\nLearned user preferences (use these durations if the task matches):\n${Object.entries(
              learnedTasks
            )
              .map(
                ([sig, data]) =>
                  `- "${sig}": ${data.typicalDurationMinutes} min${
                    data.preferredStartMinutes !== undefined
                      ? `, preferred around ${minutesToTime(data.preferredStartMinutes)}`
                      : ""
                  }`
              )
              .join("\n")}`
          : "";

      const systemPrompt = `You are a schedule planning assistant. Parse the user's prompt into structured tasks.
Available hours: ${wakeTime} to ${sleepTime}.
${learnedContext}

CRITICAL RULE — CAPTURE EVERY TASK:
You MUST include EVERY single activity the user mentions. Do NOT skip, merge, or omit any task.
- If the user lists 5 things, you MUST return at least 5 tasks
- If the user says "gym, work, lunch, meeting, study", ALL 5 must appear as separate tasks
- When in doubt, include the task rather than skip it
- Re-read the user's prompt before returning to verify every mentioned activity has a corresponding task

IMPORTANT — Use your world knowledge to expand and decompose tasks:
When a user mentions an activity that naturally consists of multiple sub-tasks with DIFFERENT times or components, you MUST break them into SEPARATE tasks, each with its own correct time. Use your real-world knowledge to assign accurate times, durations, and constraints.

Examples of when to decompose:
- "Pray all 5 prayers" → 5 separate prayer tasks at their correct times of day (dawn, midday, afternoon, sunset, night)
- "Take medications 3x daily" → 3 separate tasks (morning, afternoon, evening)
- "Walk the dog morning and evening" → 2 separate tasks at appropriate times
- "3 meals" → breakfast, lunch, dinner at standard mealtimes
- "College classes" → separate blocks if the user mentions multiple subjects

Rules for decomposition:
- If a task has well-known sub-components with distinct times, ALWAYS split them into separate tasks
- Use your knowledge of real-world timing for religious practices, meals, medications, routines, etc.
- Each sub-task gets its own fixedStartTime based on its natural/correct time
- Set flexibility to "fixed" for tasks that have a known standard time
- Set appropriate priority (religious obligations, medications = high; meals = medium, etc.)
- If the user provides a location/city, use that context to adjust times where relevant (e.g., prayer times, sunrise/sunset)

Return ONLY valid JSON with this exact shape:
{
  "tasks": [
    {
      "id": "unique string",
      "title": "Task title",
      "category": "work|health|personal|learning|social|rest|other",
      "priority": "high|medium|low",
      "durationMinutes": number,
      "flexibility": "fixed|high|medium|low",
      "fixedStartTime": "HH:MM (24h, only if user specified an exact time OR if the task has a known standard time like prayers)",
      "earliestStart": "HH:MM (optional)",
      "latestEnd": "HH:MM (optional)",
      "notes": "optional notes"
    }
  ]
}

Rules:
- Infer duration from context (gym = 60min, quick coffee = 15min, deep work = 90-120min)
- Set flexibility to "fixed" when user specifies an exact time ("at 2pm", "3:30pm meeting") OR when the task has a known standard time (like daily prayers)
- Set flexibility "low" for tasks with loose time windows, "high" for fully flexible tasks
- Set priority based on urgency/importance signals in the prompt
- Categories: work=professional tasks, health=exercise/wellness, personal=errands/chores, learning=studying, social=meetings/calls, rest=breaks/sleep, other=misc
- FINAL CHECK: Before returning, count the tasks in your response and verify it matches or exceeds the number of distinct activities in the user's prompt`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sanitizedPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const tasks: ParsedTaskRaw[] = parsed.tasks || [];

      // Apply learned durations if task signature matches
      const enrichedTasks = tasks.map((task) => {
        const sig = task.title.toLowerCase().trim();
        const learned = learnedTasks[sig];
        if (learned && !task.fixedStartTime) {
          return { ...task, durationMinutes: learned.typicalDurationMinutes };
        }
        return task;
      });

      // Generate deterministic schedule
      const blocks = generateSchedule(
        enrichedTasks,
        wakeMinutes,
        sleepMinutes,
        bufferMinutes
      );

      res.json({
        tasks: enrichedTasks,
        blocks,
        wakeMinutes,
        sleepMinutes,
      });
    } catch (error) {
      console.error("Error parsing schedule:", error);
      res.status(500).json({ error: "Failed to parse schedule" });
    }
  });

  app.post("/api/modify-schedule", parseScheduleLimiter, async (req: Request, res: Response) => {
    try {
      const { instruction, currentBlocks, wakeTime, sleepTime, bufferMinutes } = req.body;

      if (!instruction || typeof instruction !== "string") {
        return res.status(400).json({ error: "Modification instruction is required" });
      }
      if (instruction.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({ error: `Instruction must be ${MAX_PROMPT_LENGTH} characters or fewer` });
      }
      if (!currentBlocks || !Array.isArray(currentBlocks)) {
        return res.status(400).json({ error: "Current schedule blocks are required" });
      }

      const sanitizedInstruction = sanitize(instruction);
      const wakeMinutes = timeToMinutes(wakeTime || "07:00");
      const sleepMinutes = timeToMinutes(sleepTime || "23:00");

      const currentScheduleDesc = currentBlocks
        .filter((b: any) => !b.isBuffer)
        .map((b: any) => {
          const startH = Math.floor(b.startMinutes / 60);
          const startM = b.startMinutes % 60;
          const endH = Math.floor(b.endMinutes / 60);
          const endM = b.endMinutes % 60;
          const start = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
          const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          return `- ${b.title} (${start}-${end}, ${b.category}, ${b.priority} priority${b.isLocked ? ", LOCKED" : ""}${b.isCompleted ? ", COMPLETED" : ""})`;
        })
        .join("\n");

      const systemPrompt = `You are a schedule modification assistant. The user has an existing schedule and wants to modify it.

Current schedule (${wakeTime || "07:00"} to ${sleepTime || "23:00"}):
${currentScheduleDesc}

The user will describe what they want changed. Apply their modification while keeping the rest of the schedule intact.

Rules:
- LOCKED tasks must NOT be moved or removed — keep them exactly as they are
- COMPLETED tasks should generally stay in place unless the user explicitly asks to move them
- When adding new tasks, find appropriate gaps in the schedule
- When removing tasks, just exclude them from the output
- When moving tasks, adjust times accordingly and resolve any conflicts
- Keep existing task properties (category, priority) unless the user asks to change them
- Buffer of ${bufferMinutes || 10} minutes between tasks when possible

Return ONLY valid JSON with this shape:
{
  "tasks": [
    {
      "id": "unique string",
      "title": "Task title",
      "category": "work|health|personal|learning|social|rest|other",
      "priority": "high|medium|low",
      "durationMinutes": number,
      "flexibility": "fixed|high|medium|low",
      "fixedStartTime": "HH:MM (24h)",
      "notes": "optional"
    }
  ]
}

Include ALL tasks that should remain in the schedule (modified + unchanged). Every task must have a fixedStartTime.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sanitizedInstruction },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const tasks: ParsedTaskRaw[] = parsed.tasks || [];

      const blocks = generateSchedule(tasks, wakeMinutes, sleepMinutes, bufferMinutes || 10);

      res.json({
        blocks,
        wakeMinutes,
        sleepMinutes,
      });
    } catch (error) {
      console.error("Error modifying schedule:", error);
      res.status(500).json({ error: "Failed to modify schedule" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
