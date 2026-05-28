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

3. Start both apps:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000`

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
