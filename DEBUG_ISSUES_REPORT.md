# Full Debug Issues Report

Audit date: 2026-06-23

Scope reviewed:
- Frontend React/Vite app under `frontend/src`
- Backend Express/Mongoose app under `backend/src`
- Route wiring, page wiring, visible buttons/actions, auth/permissions, webhooks, uploads, build behavior, and environment setup
- Repository inventory found 269 tracked or workspace files via file scan

Checks run:
- `npm.cmd run build --prefix frontend` passed
- `node --check backend/src/server.js` passed
- `node --check backend/src/app.js` passed
- `node --check` over all backend `*.js` files passed
- Follow-up fix pass on 2026-06-23: frontend build and backend syntax checks passed again

Important limitation:
- I did not run live end-to-end browser flows against a real MongoDB/Dograh/Brevo/Telegram/Kie setup because those external services and secrets are not available in this workspace.

## Fixed In This Debug Pass

- Super-admin feature filtering now treats `super_admin` like `admin` across the affected controllers.
- Backend startup now waits for MongoDB to connect before opening the API port, and exits on startup DB failure.
- Generated agent images now write under `backend/uploads`, matching the directory exposed by `/uploads`.
- The shared frontend API helper no longer forces JSON content type for `FormData`, `Blob`, `ArrayBuffer`, or `URLSearchParams` bodies.
- Admin campaign Pause/Cancel buttons now call admin-scoped campaign endpoints.

## Critical Issues

### 1. Super admins are treated like normal users in many feature controllers

Severity: Fixed

Affected files:
- `backend/src/controllers/appointment.controller.js`
- `backend/src/controllers/call.controller.js`
- `backend/src/controllers/dashboard.controller.js`
- `backend/src/controllers/email.controller.js`
- `backend/src/controllers/followUp.controller.js`
- `backend/src/controllers/importCalls.controller.js`
- `backend/src/controllers/knowledge.controller.js`
- `backend/src/controllers/lead.controller.js`
- `backend/src/controllers/leadFinder.controller.js`
- `backend/src/controllers/scheduledCall.controller.js`
- `backend/src/controllers/telephonyConfig.controller.js`

Evidence:
- These controllers use checks like `req.user.role === "admin" ? {} : { userId: req.user._id }`.
- `super_admin` is accepted by admin middleware and frontend admin routing, but these feature filters do not include it.

Impact:
- A `super_admin` can access `/admin`, but when using normal feature pages or shared feature endpoints, they only see their own records instead of platform-wide records.
- This creates inconsistent admin behavior and can hide production data from the highest-privilege role.

Suggested fix:
- Replace role checks with a shared helper, for example:
  `["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id }`
- Use the helper everywhere instead of duplicating role checks.

Status:
- Fixed in the affected controllers.

### 2. Public webhooks are unauthenticated and can mutate production data

Severity: Critical

Affected files:
- `backend/src/app.js`
- `backend/src/routes/email.routes.js`
- `backend/src/routes/webhook.routes.js`
- `backend/src/controllers/webhook.controller.js`
- `backend/src/controllers/email.controller.js`

Evidence:
- `app.post("/api/dograh/webhook", dograhWebhook)` and `app.post("/api/calls/webhook", dograhWebhook)` are public.
- `backend/src/routes/webhook.routes.js` exposes `POST /api/webhooks/dograh` publicly.
- `backend/src/routes/email.routes.js` exposes `POST /api/email/inbound/brevo` before `router.use(protect)`.
- The handlers store webhook payloads and can update call logs, leads, email threads, follow-ups, campaign recipients, and user minutes.

Impact:
- Anyone who can reach the backend can spoof Dograh or Brevo events.
- Fake webhooks could create leads, update call statuses, inflate usage, inject transcript/email content, or trigger downstream retry/follow-up logic.

Suggested fix:
- Require provider signature verification or a shared webhook secret for every public webhook.
- Reject unsigned requests before writing `WebhookEvent` records or mutating domain models.
- Add replay protection where supported.

### 3. Backend starts listening before the database connection succeeds

Severity: Fixed

Affected file:
- `backend/src/server.js`

Evidence:
- `app.listen(PORT)` is called before `connectDB()`.
- If `MONGODB_URI` is missing or MongoDB is unavailable, the API port still opens and logs the database failure.

Impact:
- Health checks and clients may see an apparently running backend while all database-backed features fail.
- Background workers only start after DB connection, but routes are available before the app is actually ready.

Suggested fix:
- Connect to MongoDB first, then start `app.listen`.
- Exit the process on database startup failure unless the app has an intentional degraded mode.

Status:
- Fixed. The backend now starts listening only after `connectDB()` succeeds.

## High Issues

### 4. Generated agent images may be saved outside the served upload directory

Severity: Fixed

Affected files:
- `backend/src/services/agentImage.service.js`
- `backend/src/app.js`

Evidence:
- Generated images are written to `path.resolve("uploads", "agents", String(agentId))`.
- Static files are served from `backend/uploads` using `path.join(__dirname, "..", "uploads")`.

Impact:
- If the backend process is launched from the project root with `node backend/src/server.js`, generated images are saved to `E:/AI Voice Agent/uploads/...` but the server exposes `E:/AI Voice Agent/backend/uploads/...`.
- Image URLs returned as `/uploads/agents/...` can 404 depending on how the backend is started.

Suggested fix:
- Resolve upload paths from the backend source location, not process cwd.
- Share one upload path helper between `app.js`, bio-page uploads, and generated agent images.

Status:
- Fixed for generated agent images. They now write under the backend upload root.

### 5. Image generation blocks agent creation for up to several minutes

Severity: High

Affected files:
- `backend/src/controllers/agent.controller.js`
- `backend/src/services/agentImage.service.js`

Evidence:
- Agent creation calls `tryGenerateImageForAgent`.
- `generateAgentImage` waits for Kie task completion in-process with a default timeout of 180000 ms.

Impact:
- Creating an agent can hang for up to 3 minutes before returning.
- Multiple concurrent creations can tie up Node request handlers and produce poor UX.

Suggested fix:
- Move image generation to a background job.
- Return the created agent immediately with `imageStatus: "pending"`.
- Let the frontend poll or subscribe for image completion.

### 6. Manual image generation reports failure with HTTP 200

Severity: High

Affected file:
- `backend/src/controllers/agent.controller.js`

Evidence:
- `generateAgentImageForAgent` catches failures and returns `res.json({ success: false, fallbackUsed: true, ... })`.

Impact:
- Monitoring, API clients, and retry logic see a successful HTTP response even when the operation failed.
- The frontend handles this manually, but external clients and logs can miss the failure.

Suggested fix:
- Return an appropriate 4xx/5xx status for failed generation, or standardize an explicit accepted/fallback status with separate telemetry.

### 7. Frontend API helper sends JSON content type for FormData/raw uploads unless callers override it

Severity: Fixed

Affected file:
- `frontend/src/lib/api.js`

Evidence:
- `api` and `apiBlob` default every request to `"Content-Type": "application/json"`.
- Several upload features bypass `api` and use `fetch` manually, likely because this helper is unsafe for file bodies.

Impact:
- Future file upload or `FormData` calls through `api` will be mislabeled and fail or produce confusing backend parsing behavior.
- This makes the shared API helper easy to misuse.

Suggested fix:
- Detect `FormData`, `Blob`, `ArrayBuffer`, and `URLSearchParams`, and omit the default JSON content type for those bodies.

Status:
- Fixed in the shared `api` and `apiBlob` request preparation.

### 8. Admin dashboard action buttons sometimes call non-admin endpoints

Severity: Fixed

Affected file:
- `frontend/src/pages/Admin.jsx`

Evidence:
- The admin Campaigns table uses `/campaigns/${row._id}/pause` and `/campaigns/${row._id}/cancel`.
- Those are user-scoped campaign endpoints, not `/admin/...` endpoints.

Impact:
- An admin viewing another user's campaign may be unable to pause/cancel it because the regular endpoint applies ownership filters.
- The UI suggests admin-level control but can fail for cross-user records.

Suggested fix:
- Add admin campaign mutation endpoints or use existing admin-scoped endpoints consistently.

Status:
- Fixed. Admin campaign Pause/Cancel now use `/api/admin/campaigns/:id/...` endpoints.

### 9. Telephony configuration requires external Dograh calls before saving local config

Severity: High

Affected file:
- `backend/src/controllers/telephonyConfig.controller.js`

Evidence:
- `createTelephonyConfig` validates the agent runtime, creates Dograh telephony config, adds the Dograh phone number, and only then saves the local `TelephonyConfig`.

Impact:
- If the local save fails after Dograh resources are created, the system can leave orphaned Dograh telephony resources.
- The code logs this case but does not roll back the remote resources.

Suggested fix:
- Save a local pending config before remote calls, then update status after Dograh succeeds.
- Add compensation/cleanup for remote resources if local persistence fails.

## Medium Issues

### 10. Several visible controls are placeholders or local-only state

Severity: Medium

Affected files:
- `frontend/src/pages/Billing.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/pages/VoiceLanguage.jsx`
- `frontend/src/shell/AppShell.jsx`

Evidence:
- Billing `Upgrade` button only shows `Payment integration is not enabled yet.`
- Dashboard `Last 30 days` button has no state or filter behavior.
- Settings profile save and password update only show placeholder alerts.
- Settings notification checkboxes only update local React state and are not persisted.
- Settings team invite button is disabled.
- Voice & Language `Test Voice` button has no handler.
- Header search input has no search behavior.
- Header notifications button has no behavior.
- Desktop sidebar layout button has no behavior.

Impact:
- Users can click controls that look production-ready but do not perform real actions.
- Settings choices can be lost on refresh.

Suggested fix:
- Either implement the backend/frontend behavior, hide these controls, or make them visibly disabled with clear status.

### 11. Knowledge Base exists but is not discoverable in sidebar navigation

Severity: Medium

Affected files:
- `frontend/src/main.jsx`
- `frontend/src/shell/AppShell.jsx`
- `frontend/src/pages/KnowledgeBase.jsx`

Evidence:
- The route `path="knowledge"` exists.
- `KnowledgeBase.jsx` has create/list/delete behavior.
- No sidebar link points to `/knowledge`.

Impact:
- A complete feature page is effectively hidden unless a user knows the URL.

Suggested fix:
- Add Knowledge Base to the sidebar, likely under Build or Manage.

### 12. Dashboard trends and charts are hard-coded, not data-driven

Severity: Medium

Affected file:
- `frontend/src/pages/Dashboard.jsx`

Evidence:
- Trend values are hard-coded (`+12%`, `+8%`, `+23%`, `+4%`).
- Chart bars use a constant `chartBars` array.
- The date-range button has no effect.

Impact:
- Dashboard can show misleading metrics even when actual data changes.

Suggested fix:
- Return trend and time-series data from `/api/dashboard`, or label the widgets as sample placeholders until implemented.

### 13. Active-agent dashboard count is case-sensitive and likely undercounts

Severity: Medium

Affected file:
- `backend/src/controllers/dashboard.controller.js`

Evidence:
- Active agents are counted with `status: "Active"`.
- Other parts of the app use statuses like `"active"`, `"Connected"`, `"Paused"`, and `"archived"`.
- Admin overview already uses `{ $in: ["Active", "active", "Connected"] }`.

Impact:
- Dashboard active-agent totals can disagree with admin totals and agent cards.

Suggested fix:
- Normalize status values in the schema and migrations, or count accepted active statuses consistently.

### 14. Settings email page is route-only, not surfaced in sidebar

Severity: Medium

Affected files:
- `frontend/src/main.jsx`
- `frontend/src/shell/AppShell.jsx`
- `frontend/src/pages/EmailIntegrationSettings.jsx`
- `frontend/src/pages/Settings.jsx`

Evidence:
- `/settings/email` exists and has substantial provider setup UI.
- It is only reachable from a Settings tab link, not primary navigation.

Impact:
- Users may miss required email setup while using Email Campaign or Email Inbox.

Suggested fix:
- Add direct contextual links from Email Campaign and Email Inbox empty/error states, or add a sidebar sub-entry.

### 15. Admin password reset exposes the temporary password in a browser alert

Severity: Medium

Affected files:
- `backend/src/controllers/admin.controller.js`
- `frontend/src/pages/Admin.jsx`

Evidence:
- Backend returns `temporaryPassword`.
- Frontend displays it with `alert(...)`.

Impact:
- Temporary credentials can be shoulder-surfed, captured in browser/UI automation, or mishandled by admins.

Suggested fix:
- Prefer a one-time reset link or forced password reset workflow.
- If temporary passwords remain, display in a controlled modal with explicit copy and expiry handling.

### 16. Debug logging is extensive in production-sensitive flows

Severity: Medium

Affected areas:
- Appointment creation/extraction
- Dograh workflow sync
- Webhook payload handling
- Telephony incoming calls
- Kie image generation
- Campaign/follow-up workers

Evidence:
- Source scan found many `console.log` statements in backend services and controllers, including full webhook payload logging.

Impact:
- Logs may contain phone numbers, transcripts, lead details, email content, provider payloads, or operational secrets depending on provider responses.

Suggested fix:
- Replace raw `console.log` calls with structured logging that redacts PII/secrets.
- Disable verbose diagnostics by default in production.

### 17. Error responses expose stack traces outside production only, but production depends on NODE_ENV being set correctly

Severity: Medium

Affected file:
- `backend/src/middleware/error.middleware.js`

Evidence:
- Stack details are returned whenever `process.env.NODE_ENV !== "production"`.

Impact:
- If production deployment forgets `NODE_ENV=production`, API responses leak stack traces.

Suggested fix:
- Ensure deployment sets `NODE_ENV=production`.
- Consider a stricter `SHOW_ERROR_DETAILS=true` opt-in for stack traces.

## Low Issues

### 18. Frontend build has a large JavaScript bundle

Severity: Low

Affected frontend build:
- Main JS chunk: about 621.85 kB minified

Evidence:
- Vite warning: some chunks are larger than 500 kB.

Impact:
- Slower first load, especially on mobile networks.

Suggested fix:
- Add route-level lazy loading for pages.
- Split large admin, public-agent, and integration screens.

### 19. Dynamic import of `api.js` does not create a separate chunk

Severity: Low

Affected file:
- `frontend/src/shell/AppShell.jsx`

Evidence:
- Vite warns that `api.js` is dynamically imported in `AppShell.jsx` but also statically imported by many modules.

Impact:
- The dynamic import does not improve bundle splitting.

Suggested fix:
- Replace the dynamic import in the impersonation handler with the existing static import, or move impersonation-only code into a truly separate module.

### 20. Uploaded generated assets are committed/stored inside backend workspace

Severity: Low

Affected paths:
- `backend/uploads/agents/...`
- `backend/uploads/bio-pages/...`

Evidence:
- Workspace contains generated upload files under `backend/uploads`.

Impact:
- Runtime uploads can pollute the repository/worktree and grow deployment artifacts.

Suggested fix:
- Store uploads outside the repo in production.
- Add appropriate ignore rules for runtime upload directories if these are not meant to be versioned.

### 21. Root `runwayml-sdk-4.2.0.tgz` appears unused by package manifests

Severity: Low

Affected file:
- `runwayml-sdk-4.2.0.tgz`

Evidence:
- The root, frontend, and backend package manifests do not reference this tarball.

Impact:
- Adds repository size and confusion unless it is intentionally kept for manual installation.

Suggested fix:
- Remove it if unused, or document why it must stay.

## Passed/Positive Findings

- Frontend production build completed successfully.
- Backend source files pass Node syntax checking.
- Protected route shell blocks unauthenticated access to app pages.
- Passwords are hashed with bcrypt before save.
- Core provider API keys are generally kept backend-side and encrypted for stored integrations.
- Bio-page image uploads validate content type and basic SVG script/event-handler patterns.
- Most feature pages use the shared authenticated API helper consistently.

## Recommended Fix Order

1. Add authentication/signature validation to public webhook endpoints.
2. Fix `super_admin` filtering across feature controllers.
3. Start the backend only after MongoDB connects successfully.
4. Normalize upload directory handling for generated and uploaded assets.
5. Move image generation out of request/response creation flow.
6. Replace or clearly disable placeholder UI actions.
7. Add missing navigation for Knowledge Base and important integration setup pages.
8. Clean up production logging and dashboard placeholder metrics.
