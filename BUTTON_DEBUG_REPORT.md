# Button Debug Report

Audit date: 2026-06-23

Scope:
- All React pages in `frontend/src/pages`
- Shared buttons in `frontend/src/components`
- App shell/navigation buttons in `frontend/src/shell`

How to read status:
- Works: button/link is wired to navigation, UI state, or a backend endpoint that exists.
- Works if configured: button is wired, but needs real credentials/services/data to succeed.
- Partial: button does something, but behavior is incomplete or misleading.
- Not working: visible control has no useful action, only a placeholder alert, no handler, or is intentionally disabled.

Verification performed:
- Frontend production build passed.
- Backend syntax checks passed.
- Endpoint wiring was checked statically against backend routes.
- Follow-up fix pass on 2026-06-23: frontend build and backend syntax checks passed again.
- I did not click every button in a live browser with real MongoDB/provider credentials, so provider-backed buttons still need live account testing.

## App Shell

File: `frontend/src/shell/AppShell.jsx`

Works:
- Sidebar navigation links.
- Mobile menu open.
- Mobile menu close.
- Logout.
- Stop impersonation.
- Email unread polling indicator.

Not working / placeholder:
- Desktop sidebar layout icon button has no `onClick`.
- Header search input has no search behavior.
- Notifications bell has no `onClick`.

## Auth / Welcome

Files:
- `frontend/src/pages/Welcome.jsx`
- `frontend/src/pages/AuthPage.jsx`
- `frontend/src/pages/AuthSuccess.jsx`

Works:
- Welcome Login links.
- Welcome Get Started links.
- Login submit.
- Signup submit.
- Switch Login/Signup link.
- Back to login from auth error.

Works if configured:
- Continue with Google. Requires Google OAuth env configuration.

## Dashboard

File: `frontend/src/pages/Dashboard.jsx`

Works:
- Create Agent link.
- View all calls link.
- Agent cards link to agent detail.

Not working / placeholder:
- Last 30 days button has no filter behavior.

Partial:
- Dashboard trend numbers and chart bars are hard-coded, so the page can look active even when the button/filter does nothing.

## Agents

File: `frontend/src/pages/Agents.jsx`

Works:
- Create.
- Empty-state Create.
- Delete agent.
- Edit agent.
- View agent.

Works if configured:
- AI Gen / Regenerate Image. Endpoint exists, but depends on Kie image-generation env keys and external service.

## Agent Details

File: `frontend/src/pages/AgentDetails.jsx`

Works:
- Edit Agent.
- Customize Bio Page.
- Schedule Call scroll.
- Delete agent.
- Schedule-call submit.
- Cancel scheduled call.
- Book Appointment navigation.
- Appointment View navigation.
- Refresh.
- Call details View.
- Call modal close.
- Extract Lead.

Works if configured:
- Test Call.
- Outbound Call.
- Publish.
- Repeat call.

Notes:
- Test/outbound/repeat require connected Dograh workflow and phone/caller setup.

## Create Agent

File: `frontend/src/pages/CreateAgent.jsx`

Works:
- Form submit creates an agent through `/api/agents`.
- Connected select/input controls update form state.
- Telephony and Dograh status loading are wired.

Works if configured:
- Creating Dograh-backed agent requires Dograh credentials and runtime sync.
- Auto-generated image during creation requires Kie image env setup.

## Edit Agent

File: `frontend/src/pages/EditAgent.jsx`

Works:
- Save/update agent.
- Regenerate prompt preview.
- Voice/LLM panel edits update config state.

Works if configured:
- Sync provider.
- Sync Dograh runtime.
- Migrate Dograh agent.
- Voice preview.
- LLM test completion.
- Refresh provider models.

Notes:
- Provider-backed buttons need valid Dograh, voice-provider, and LLM-provider integrations.

## Test Agent

File: `frontend/src/pages/TestAgent.jsx`

Works:
- Agent Details link.

Works if configured:
- Trigger Test Call. Endpoint exists but requires Dograh/calling configuration.

## Bio Page Builder

File: `frontend/src/pages/BioPageBuilder.jsx`

Works:
- Agent Details navigation.
- Preview template.
- Use Template.
- Add topic.
- Save Changes.
- Publish.
- Unpublish.
- Reset to Default.
- Copy Link when public URL exists.
- Topic Up/Down.
- Topic Delete.
- Asset upload buttons/inputs are wired through upload handlers.

Works if configured:
- Public page chat/call behavior depends on published agent and backend runtime.

## Public Agent

File: `frontend/src/pages/PublicAgent.jsx`

Works:
- Home/back navigation inside the public widget.
- Start.
- Ask/chat navigation.
- Book navigation.
- Category tiles.
- Suggestion chips.
- Chat send when chat is enabled.
- Retry.
- Day selection.
- Time selection.
- Mode selection.

Works if configured:
- Voice call start/end requires Dograh embed/web-call token.
- Booking submit requires public callback/request-call flow and callable agent setup.

Not working / placeholder:
- Mute button has no actual mute handler.

## Public Callback

File: `frontend/src/pages/PublicCallback.jsx`

Works if configured:
- Submit callback request. Endpoint exists, but requires public agent/callback calling setup.

## Call Logs

File: `frontend/src/pages/CallLogs.jsx`

Works:
- View details.
- Delete call.
- Open recording link when recording URL exists.
- Download recording link when recording URL exists.

Works if configured:
- Sync call requires Dograh run ID.
- Retry call requires agent/caller setup.

## Campaigns

File: `frontend/src/pages/Campaigns.jsx`

Works:
- Refresh.
- Create Campaign.
- Cancel create form.
- Open campaign.
- Add Selected Leads.
- Import Recipients.
- Start.
- Pause.
- Resume.
- Retry Failed.
- Cancel.

Works if configured:
- Campaign call execution requires Dograh/calling setup.

## Leads

File: `frontend/src/pages/Leads.jsx`

Works:
- Export CSV.
- View Lead.
- View Details.
- Transcript link when URL exists.
- Add Note.
- Go to Email Outreach.
- Schedule Follow-up.
- View Follow-ups.
- Book Appointment.
- Reschedule Appointment.
- Delete Lead.

Works if configured:
- Find Email requires lead website and lead-finder/email enrichment provider.
- Call Lead / Call Again requires connected calling agent.

## Lead Finder

File: `frontend/src/pages/LeadFinder.jsx`

Works:
- Open search history.
- Close search history.
- Refresh history.
- Load past run.
- Toggle selected lead.
- Toggle all.
- Save selected.
- Save all.
- Open website.
- Open Google Maps.

Works if configured:
- Search leads requires selected/configured provider.
- Enrich emails requires website and enrichment provider.

## Appointments

File: `frontend/src/pages/Appointments.jsx`

Works:
- Book Appointment opens modal.
- Refresh.
- Modal close.
- Modal cancel.
- Create appointment.
- Reschedule appointment.
- Row action menu.
- View.
- Complete.
- Cancel.

Notes:
- Some fields are intentionally disabled while rescheduling existing appointments.

## Follow-Ups

File: `frontend/src/pages/FollowUps.jsx`

Works:
- Reschedule.
- Cancel.
- Run Now.

Works if configured:
- Running a call follow-up requires linked lead, linked agent, and calling setup.

## Import Calls

File: `frontend/src/pages/ImportCalls.jsx`

Works:
- Upload import file.
- Validate mapping.
- Import valid rows.
- Download errors.
- Open run/history details.

Notes:
- Upload requires selected agent and a valid file.

## Messages

File: `frontend/src/pages/Messages.jsx`

Works:
- Refresh agents.
- Select agent.
- Send message/test chat.

Works if configured:
- Test chat quality depends on agent runtime/LLM configuration.

## Email Outreach

File: `frontend/src/pages/EmailOutreach.jsx`

Works:
- Generate email.
- Create campaign.
- Send test email.
- Send campaign.
- Refresh campaign/log lists after sends.

Works if configured:
- Email generation requires Gemini/API setup.
- Sending email requires Brevo or configured email provider.

## Email Inbox

File: `frontend/src/pages/EmailInbox.jsx`

Works:
- Load thread.
- Mark read.
- Sync now.
- Generate reply.
- Send reply.
- Thread filtering/query behavior.

Works if configured:
- Sync/reply requires email integration and provider credentials.

## Email Integration Settings

File: `frontend/src/pages/EmailIntegrationSettings.jsx`

Works:
- Load status.
- Connect Brevo.
- Validate Brevo.
- Load Brevo senders.
- Save sender.
- Disconnect Brevo.
- Connect IMAP.
- Test IMAP.
- Sync now.
- Disconnect IMAP.

Works if configured:
- Gmail auth URL / Gmail connect requires Gmail OAuth env setup.

## Integrations

File: `frontend/src/pages/Integrations.jsx`

Works:
- Open/manage voice provider modal.
- Connect voice provider.
- Test voice provider.
- Disconnect voice provider.
- Toggle API key visibility.
- Manage LLM integration.
- Create new LLM connection.
- Save LLM connection.
- Test LLM connection.
- Disconnect LLM connection.

Works if configured:
- All provider validation/model/preview actions require valid external provider keys.

## Dograh Settings

File: `frontend/src/pages/DograhSettings.jsx`

Works:
- Connect Dograh.
- Test Dograh.
- Update fallback.
- Disconnect.

Works if configured:
- Requires valid Dograh credentials and reachable Dograh API.

## Telephony Configuration

File: `frontend/src/pages/TelephonyConfiguration.jsx`

Works:
- Add configuration.
- Open configuration.
- Back to all configurations.
- Copy configuration ID.
- Copy inbound webhook URL.
- Edit credentials.
- Delete configuration.
- Add/edit phone number through the same config modal.
- Delete phone number mapping from local form/config.
- Modal close.
- Modal cancel.
- Save config.
- Retry load.

Works if configured:
- Provider test/configure webhook/verify routing paths depend on Twilio/Exotel/Vonage/Dograh credentials and public backend URL.

## Settings

File: `frontend/src/pages/Settings.jsx`

Works:
- Tab switching.
- Manage Email link.
- Open Email Settings link.
- Generate Telegram connect code.
- Refresh Telegram status.
- Disconnect Telegram.
- Telegram alert toggle checkboxes when connected.

Not working / placeholder:
- Save Changes in Profile only shows placeholder alert.
- Update Password only shows placeholder alert.
- General notification preference checkboxes only update local state and are not saved.
- Invite Member is disabled.

Works if configured:
- Telegram connect flow requires Telegram bot env setup and bot worker.

## Admin

File: `frontend/src/pages/Admin.jsx`

Works:
- Refresh.
- Admin tabs.
- View user.
- Login As.
- Suspend user.
- Activate user.
- Reset password.
- Delete user.
- Close user modal.
- Edit credits.
- Edit plan.
- Agent pause/activate/delete in admin tables.
- Call delete.
- Lead delete.
- Appointment complete/cancel.
- Follow-up run/cancel.

Works:
- Admin campaign Pause/Cancel now call admin-scoped `/admin/campaigns/:id/...` endpoints.

Security concern:
- Reset password works, but exposes the temporary password in a browser alert.

## Billing

File: `frontend/src/pages/Billing.jsx`

Not working / placeholder:
- Upgrade only shows `Payment integration is not enabled yet.`

## Templates

File: `frontend/src/pages/Templates.jsx`

Partial:
- Use Template navigates to Create Agent.
- Preview also navigates to Create Agent and does not preview the template.

Suggested fix:
- Pass template identity/state to Create Agent, and make Preview open an actual preview modal or read-only template view.

## Voice & Language

File: `frontend/src/pages/VoiceLanguage.jsx`

Partial:
- Selects, range slider, checkbox, and pronunciation textarea update only the browser's local input state.

Not working:
- Test Voice has no handler.
- No Save/Apply button exists, so settings are not persisted.

## Knowledge Base

File: `frontend/src/pages/KnowledgeBase.jsx`

Works:
- Create Entry submit.
- Delete entry.

Issue:
- The page works but is not linked in the main sidebar, so users may not discover it.

## Shared Components

Files:
- `frontend/src/components/LLMConfigurationPanel.jsx`
- `frontend/src/components/VoiceConfigurationPanel.jsx`
- `frontend/src/components/ui/DropdownMenu.jsx`

Works:
- Dropdown menu open/close/items.
- Voice/LLM select controls.
- Streaming and tool-calling toggles.

Works if configured:
- Refresh LLM models.
- Test LLM model.
- Play voice preview.
- Sync Dograh runtime.

Intentionally disabled:
- LLM fallback-to-Dograh-default toggle is disabled.
- Provider controls disable when Dograh default is selected.

## Summary

Working or wired:
- Most CRUD/action buttons for agents, calls, campaigns, leads, appointments, follow-ups, imports, email, integrations, Dograh settings, telephony configuration, auth, and admin are wired.

Needs real provider configuration:
- Calling, Dograh sync, image generation, voice preview, LLM tests, email sending/sync, Telegram, lead enrichment, and telephony webhook/routing.

Not working / placeholder buttons:
- AppShell sidebar layout.
- AppShell notifications bell.
- AppShell search.
- Dashboard Last 30 days.
- Billing Upgrade.
- Settings Profile Save Changes.
- Settings Update Password.
- Settings notification preferences persistence.
- Settings Invite Member.
- Voice & Language Test Voice.
- Voice & Language persistence.
- Public Agent mute.
- Templates Preview.

Highest-priority remaining button fixes:
1. Make placeholder buttons disabled or implement them.
2. Add real Dashboard date-range filtering.
3. Add real Search and Notifications behavior in the app shell.
4. Persist Voice & Language and Settings notification preferences.
