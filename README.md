# AI Voice Agent

Full-stack SaaS MVP for creating custom AI voice agents and connecting them to Dograh workflows.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express
- Database: MongoDB
- Auth: JWT with bcrypt password hashing
- API integration: Dograh workflow API

## Local Setup

1. Copy `.env.example` to `backend/.env` and fill in `MONGODB_URI`, `JWT_SECRET`, and Dograh values when available.
2. Install dependencies:

```bash
npm run install:all
```

3. Start the backend and frontend in two terminals:

```bash
# Terminal 1 — backend (http://localhost:5000)
cd backend
npm run dev
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000`

## Local Performance Checklist

Local dev is tuned to feel fast: background workers are off, external AI/voice providers are
only called on user actions, and the terminal stays quiet by default.

**`backend/.env`**

```
NODE_ENV=development
PORT=5000
RUN_WORKERS=false          # background jobs OFF locally (campaign/follow-up/scheduled-call/email-sync/telegram/pipeline)
DEBUG_LOGS=false           # quiet terminal; set true for per-request timing to find slow routes
ENABLE_GEMINI_KEEPWARM=false  # no Gemini warmup call on startup locally
CLIENT_URL=http://localhost:5173
```

**`frontend/.env`**

```
VITE_API_URL=http://localhost:5000/api
```

### Starting each app

- Backend: `cd backend && npm run dev` (nodemon, watches `src/` only — it will not restart when
  files under `uploads/`, `logs/`, or the frontend change; see `backend/nodemon.json`).
- Frontend: `cd frontend && npm run dev` (Vite on port 5173, deps pre-bundled via `optimizeDeps`).

### Enabling workers only when needed

Background workers do **not** run automatically. To run them locally (e.g. to test a campaign):

```bash
# backend terminal
RUN_WORKERS=true npm run dev        # macOS/Linux
```

On Windows PowerShell: `$env:RUN_WORKERS="true"; npm run dev`.
In production, set `RUN_WORKERS=true` on the dedicated Background Worker instance only.

### Debugging slow API routes

Turn on request timing without restarting your workflow:

```bash
# backend terminal
DEBUG_LOGS=true npm run dev
```

Each request prints `METHOD /path status - <ms>` so you can see which route is slow. Turn it back
off (`DEBUG_LOGS=false`) for a quiet terminal. External providers (Gemini, Vapi, Deepgram,
ElevenLabs, Brevo, SerpAPI, Stripe, etc.) are only called when you trigger an action
(start call, test voice, sync assistant, generate AI, send email, run lead finder, start campaign)
— never during normal dashboard load.

## Demo Admin

Create a user normally, then update that user's `role` field to `admin` in MongoDB to access `/admin`.

## Dograh Integration

Dograh calls are made only from the backend through `backend/src/services/dograh.service.js` using `X-API-Key`.

Supported backend flows:

- Fetch Dograh workflows
- Connect a local agent to a Dograh workflow UUID
- Trigger Dograh test calls
- Trigger Dograh outbound calls
- Receive Dograh webhooks and store call logs/leads

API keys are read only from environment variables and are never exposed to the frontend.
