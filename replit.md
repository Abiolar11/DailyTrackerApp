# DayFlow

A mobile Expo React Native app that converts natural language daily to-do prompts into time-blocked schedules.

## Architecture

- **Frontend**: Expo (React Native) with file-based routing via expo-router, running on port 8081
- **Backend**: Express + TypeScript server on port 5000, handles `/api/parse-schedule` route
- **AI**: GPT-5.2 via Replit AI Integrations (OpenAI-compatible) for task parsing
- **State**: React Context (`ScheduleContext`) with AsyncStorage persistence
- **Styling**: Dark theme, DM Sans/DM Mono fonts, blue/amber palette

## Key Files

- `app/(tabs)/index.tsx` — Today tab: natural language input, settings, schedule generation
- `app/(tabs)/schedule.tsx` — Schedule tab: visual timeline with hour markers, task completion checkboxes, edit modal, lock/regenerate
- `app/(tabs)/history.tsx` — History tab: past schedules list, completion stats, learned patterns info, detail modal
- `app/(tabs)/_layout.tsx` — Tab layout with 3 tabs (Today, Schedule, History)
- `context/ScheduleContext.tsx` — Global state: schedule, settings, learned tasks, history (up to 60 days)
- `server/routes.ts` — Backend API routes, LLM task parsing
- `types/schedule.ts` — TypeScript types (TimeBlock, Schedule, UserSettings, etc.)
- `lib/notifications.ts` — Local push notification scheduling (15-min reminders)
- `constants/colors.ts` — Theme colors and category color mapping

## Features

- Natural language prompt → AI-parsed tasks → deterministic scheduling algorithm
- Visual hour-by-hour timeline with color-coded category blocks
- Task completion with checkboxes (auto-learns from completions)
- Drag-and-drop to reschedule: long-press a block then drag to move it to a new time (snaps to 5-min intervals)
- Lock individual blocks, regenerate schedule preserving locked blocks
- Tap any block to open edit modal (change duration, lock/unlock)
- Learning engine: exponential moving average (α=0.3) for duration and preferred time
- Schedule history with completion progress tracking
- Local push notifications (15-min before each task)
- Busy/free time summary bar with completion counter

## Drag-and-Drop Details

- Long-press (300ms) on an unlocked block to activate drag mode
- Drag vertically to move the block to a new time slot
- Block snaps to 5-minute intervals and is clamped within wake/sleep bounds
- During drag: elevated shadow, 1.03x scale, time tooltip shows new position
- Locked blocks cannot be dragged (show lock icon instead of move icon)
- PanResponder from react-native handles the gesture; ScrollView disabled during drag

## Important Notes

- Do NOT use `expo-crypto` — crashes in Expo Go. Use `Date.now().toString(36) + Math.random().toString(36).slice(2, 10)` for IDs
- Do NOT hardcode domain-specific knowledge in system prompt — let LLM use world knowledge
- AsyncStorage keys: `dayflow_settings`, `dayflow_current_schedule`, `dayflow_learned_tasks`, `dayflow_schedule_history`
- Environment secrets: `SESSION_SECRET`, AI integration env vars (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
