# DayFlow

A mobile app that converts natural language daily to-do prompts into structured, time-blocked schedules using AI.

Type what you need to get done — *"gym at 7am, deep work session, lunch, study 2 hours"* — and DayFlow builds a realistic hour-by-hour plan for your day.

---

## Features

- **Natural language scheduling** — Describe your day in plain English and AI parses tasks, assigns durations, and builds a conflict-free schedule
- **Smart decomposition** — Automatically splits multi-part tasks (e.g. "pray all 5 prayers" → 5 separate prayer blocks at correct times)
- **Visual timeline** — Scrollable hour-by-hour schedule with color-coded category blocks (work, health, learning, social, rest, etc.)
- **Adjust on the fly** — Tap "Adjust" and describe changes in plain English; AI modifies the schedule without touching locked tasks
- **Drag & drop rescheduling** — Long-press any block and drag it to a new time slot (snaps to 5-min intervals)
- **Task completion & learning engine** — Check off tasks; the app learns your actual durations and preferred times (exponential moving average) to improve future schedules
- **Date navigation** — Browse and view schedules for any day, past or future
- **Calendar home** — Week strip + expandable full-month calendar; plan any date, not just today
- **Schedule history** — All schedules saved to PostgreSQL; persists across sessions
- **Push notifications** — 15-minute reminders before each task
- **Add/remove tasks manually** — FAB button to add tasks, trash icon in edit modal to remove

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile frontend | Expo (React Native) with expo-router |
| Backend | Express.js + TypeScript |
| AI | OpenAI GPT API (natural language parsing) |
| Database | PostgreSQL |
| State management | React Context + AsyncStorage (local cache) |
| Styling | React Native StyleSheet — dark theme, DM Sans / DM Mono fonts |

---

## Project Structure

```
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # Today tab — calendar + prompt input
│   │   ├── schedule.tsx       # Schedule tab — timeline + editing
│   │   ├── history.tsx        # History tab — past schedules
│   │   └── _layout.tsx        # Tab layout
│   └── _layout.tsx            # Root layout with providers
├── context/
│   └── ScheduleContext.tsx    # Global state — schedule, settings, learned tasks
├── server/
│   ├── index.ts               # Express server setup
│   ├── routes.ts              # API routes — AI parsing, CRUD endpoints
│   ├── storage.ts             # PostgreSQL storage layer
│   └── db.ts                  # Database connection pool
├── types/
│   └── schedule.ts            # TypeScript interfaces
├── lib/
│   ├── query-client.ts        # API fetch helpers
│   └── notifications.ts       # Push notification scheduling
├── constants/
│   └── colors.ts              # Theme colors and category palette
└── .env.example               # Environment variable template
```

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- PostgreSQL database
- OpenAI API key (with available credits)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/dayflow.git
cd dayflow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
OPENAI_API_KEY=sk-...          # Your OpenAI API key
DATABASE_URL=postgresql://...  # PostgreSQL connection string
SESSION_SECRET=...             # Random secret for sessions
PORT=5000                      # Backend port (default: 5000)
```

### 4. Set up the database

Run the following SQL to create the required tables:

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(255) PRIMARY KEY,
  date VARCHAR(20) NOT NULL,
  prompt TEXT NOT NULL,
  generated_at VARCHAR(50) NOT NULL,
  wake_minutes INTEGER NOT NULL,
  sleep_minutes INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_blocks (
  id VARCHAR(255) PRIMARY KEY,
  schedule_id VARCHAR(255) NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  task_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'other',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  start_minutes INTEGER NOT NULL,
  end_minutes INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_buffer BOOLEAN NOT NULL DEFAULT FALSE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  flexibility VARCHAR(20) NOT NULL DEFAULT 'medium',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  wake_time VARCHAR(10) NOT NULL DEFAULT '07:00',
  sleep_time VARCHAR(10) NOT NULL DEFAULT '23:00',
  buffer_minutes INTEGER NOT NULL DEFAULT 10,
  timezone VARCHAR(50) NOT NULL DEFAULT 'auto',
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learned_tasks (
  signature VARCHAR(500) PRIMARY KEY,
  typical_duration_minutes INTEGER NOT NULL,
  preferred_start_minutes INTEGER,
  sample_count INTEGER NOT NULL DEFAULT 1,
  last_used VARCHAR(50) NOT NULL
);

INSERT INTO user_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
```

### 5. Run the app

Start the backend:

```bash
npm run server:dev
```

Start the Expo frontend (in a separate terminal):

```bash
npm run expo:dev
```

Open the Expo Go app on your phone and scan the QR code, or press `w` to open in a browser.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/parse-schedule` | Parse prompt → AI tasks → schedule blocks |
| POST | `/api/modify-schedule` | Adjust existing schedule with natural language |
| GET | `/api/schedules` | Fetch all schedule history |
| GET | `/api/schedules/:date` | Fetch schedule for a specific date (YYYY-MM-DD) |
| POST | `/api/schedules` | Save/update a schedule |
| DELETE | `/api/schedules/:id` | Delete a specific schedule |
| DELETE | `/api/schedules` | Clear all schedule history |
| GET | `/api/settings` | Fetch user settings |
| PUT | `/api/settings` | Update user settings |
| GET | `/api/learned-tasks` | Fetch learned task patterns |
| POST | `/api/learned-tasks` | Upsert a learned task |
| DELETE | `/api/learned-tasks/:signature` | Remove a specific learned task |
| DELETE | `/api/learned-tasks` | Clear all learned tasks |

---

## Security

- `helmet` middleware for HTTP security headers
- `express-rate-limit` — 10 requests/minute on AI endpoints
- Input validation on all endpoints (prompt length, time format, required fields)
- Prompt sanitization (strips `<>` characters)
- All secrets via environment variables — never hardcoded
- `.env` excluded from version control via `.gitignore`

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for session signing |
| `PORT` | No | Backend port (default: 5000) |

---

## License

MIT
