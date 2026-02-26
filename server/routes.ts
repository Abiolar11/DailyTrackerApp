import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
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

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/parse-schedule", async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        wakeTime,
        sleepTime,
        bufferMinutes,
        learnedTasks = {},
      }: ParseTasksRequest = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

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
      "fixedStartTime": "HH:MM (24h, only if user specified an exact time)",
      "earliestStart": "HH:MM (optional)",
      "latestEnd": "HH:MM (optional)",
      "notes": "optional notes"
    }
  ]
}

Rules:
- Infer duration from context (gym = 60min, quick coffee = 15min, deep work = 90-120min)
- Set flexibility to "fixed" only when user specifies an exact time ("at 2pm", "3:30pm meeting")
- Set flexibility "low" for tasks with loose time windows, "high" for fully flexible tasks
- Set priority based on urgency/importance signals in the prompt
- Categories: work=professional tasks, health=exercise/wellness, personal=errands/chores, learning=studying, social=meetings/calls, rest=breaks/sleep, other=misc`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
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

  const httpServer = createServer(app);
  return httpServer;
}
