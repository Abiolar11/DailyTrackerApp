# DayFlow — Setup & Requirements

This is a Node.js / React Native (Expo) project. All JavaScript dependencies are managed via npm and listed in `package.json`.

## System Requirements

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| PostgreSQL | >= 14 |

## External Services

- **OpenAI API** — [platform.openai.com](https://platform.openai.com) — requires an account with available credits
- **PostgreSQL database** — local install, or hosted (e.g. Supabase, Neon, Railway)

## Mobile Testing

- **Expo Go** app on iOS or Android ([expo.dev/go](https://expo.dev/go))
- OR a physical/simulator device with a development build

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-username/dayflow.git
cd dayflow

# 2. Install all JavaScript dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your OPENAI_API_KEY, DATABASE_URL, SESSION_SECRET

# 4. Start the backend (port 5000)
npm run server:dev

# 5. Start the Expo frontend (port 8081) — in a separate terminal
npm run expo:dev
```

See `README.md` for full setup instructions including database schema.
