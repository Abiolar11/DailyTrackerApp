# DayFlow

A mobile Expo React Native app that converts natural language daily to-do prompts into time-blocked schedules.

## Architecture

- **Frontend**: Expo (React Native) with file-based routing via expo-router, running on port 8081
- **Backend**: Express + TypeScript server on port 5000, handles `/api/parse-schedule` route
- **AI**: GPT-5.2 via OpenAI API (user's personal key preferred, Replit AI integration as fallback) for task parsing
- **Database**: PostgreSQL — stores schedules, time blocks, settings, and learned tasks
- **State**: React Context (`ScheduleContext`) with dual persistence: AsyncStorage (local cache) + PostgreSQL (server)
- **Styling**: Dark theme, DM Sans/DM Mono fonts, blue/amber palette
- **Security**: helmet for HTTP headers, express-rate-limit (10 req/min on parse endpoint), input validation/sanitization

## Key Files

- `app/(tabs)/index.tsx` — Today tab: calendar view (week strip + expandable full month), prompt input, schedule generation for any date
- `app/(tabs)/schedule.tsx` — Schedule tab: visual timeline with hour markers, task completion checkboxes, edit modal, lock/regenerate
- `app/(tabs)/history.tsx` — History tab: past schedules list, completion stats, learned patterns info, detail modal
- `app/(tabs)/_layout.tsx` — Tab layout with 3 tabs (Today, Schedule, History)
- `context/ScheduleContext.tsx` — Global state: schedule, settings, learned tasks, history (up to 60 days); dual sync to AsyncStorage + server
- `server/routes.ts` — Backend API routes: LLM task parsing, CRUD for schedules/settings/learned-tasks, rate limiting, input validation
- `server/storage.ts` — PostgreSQL storage layer: schedules, time_blocks, user_settings, learned_tasks tables
- `server/db.ts` — PostgreSQL connection pool via DATABASE_URL
- `server/index.ts` — Express server setup with helmet, CORS, proxy trust
- `types/schedule.ts` — TypeScript types (TimeBlock, Schedule, UserSettings, etc.)
- `lib/notifications.ts` — Local push notification scheduling (15-min reminders)
- `constants/colors.ts` — Theme colors and category color mapping
- `.env.example` — Documents required environment variables for GitHub

## Features

- **Calendar Home**: Week strip (default) with expandable full month calendar; tap any date to select; supports future date planning
- Natural language prompt → AI-parsed tasks → deterministic scheduling algorithm
- Visual hour-by-hour timeline with color-coded category blocks
- Task completion with checkboxes (auto-learns from completions)
- Drag-and-drop to reschedule: long-press a block then drag to move it to a new time (snaps to 5-min intervals)
- Lock individual blocks, regenerate schedule preserving locked blocks
- Tap any block to open edit modal (change time via spinner pickers, lock/unlock, delete)
- Add Task: FAB (+) button on schedule screen to manually add tasks with title, category, priority, and time
- Remove Task: trash icon in edit modal to delete a task from the schedule
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

## Security

- `helmet` middleware for security headers (CSP and COEP disabled for Expo compatibility)
- `express-rate-limit` on `/api/parse-schedule`: 10 requests per minute per IP
- `trust proxy` set to 1 for accurate client IP behind Replit proxy
- Input validation: prompt max 2000 chars, HH:MM format with 0-23h/0-59m range checks, wake < sleep ordering
- Prompt sanitization: strips `<>` characters
- All secrets via environment variables, `.env.example` provided for GitHub

## Important Notes

- Do NOT use `expo-crypto` — crashes in Expo Go. Use `Date.now().toString(36) + Math.random().toString(36).slice(2, 10)` for IDs
- Do NOT hardcode domain-specific knowledge in system prompt — let LLM use world knowledge
- AsyncStorage keys (local cache): `dayflow_settings`, `dayflow_current_schedule`, `dayflow_learned_tasks`, `dayflow_schedule_history`
- PostgreSQL tables: `schedules`, `time_blocks`, `user_settings`, `learned_tasks`
- Environment secrets: `OPENAI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL` + PG* vars, AI integration env vars as fallback
