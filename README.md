# AI Voice Agent

AI Voice Agent is a full-stack SaaS application that allows users to create, configure, test, and manage AI-powered voice agents from one dashboard.

The application connects agent settings with Dograh workflows and can support LLM, voice, transcription, telephony, lead management, and outbound calling integrations.

---

# Table of Contents

1. [Application Overview](#application-overview)
2. [Main Features](#main-features)
3. [How the Application Works](#how-the-application-works)
4. [How to Use the Application](#how-to-use-the-application)
5. [Create an AI Voice Agent](#create-an-ai-voice-agent)
6. [Edit an Existing Agent](#edit-an-existing-agent)
7. [Connect Dograh](#connect-dograh)
8. [Configure AI Providers](#configure-ai-providers)
9. [Manage Leads](#manage-leads)
10. [Start a Call](#start-a-call)
11. [Test an Agent](#test-an-agent)
12. [Authentication Flow](#authentication-flow)
13. [Developer Installation](#developer-installation)
14. [Environment Variables](#environment-variables)
15. [Project Structure](#project-structure)


---

# Application Overview

AI Voice Agent provides a single place to manage voice automation.

A user can:

- Create an AI voice agent
- Add an agent name and description
- Write the system prompt
- Select a voice
- Select a language
- Configure call behavior
- Connect LLM, voice, and transcription providers
- Connect Dograh
- Automatically create a Dograh workflow
- Edit the agent without creating a duplicate workflow
- Add leads
- Start outbound calls
- Review call status
- Manage integrations
- Enable or disable an agent

The application should use real backend data. Connection status, agents, leads, calls, and workflow information should not be hardcoded in the frontend.

---

# Main Features

## 1. User Authentication

- Register a new account
- Log in
- Log out
- Maintain the logged-in session
- Protect private dashboard routes
- Load the current user when the application starts

## 2. Agent Management

- Create agents
- View agents
- Edit agents
- Delete agents
- Enable or disable agents
- Configure prompt, voice, language, and behavior
- Save the Dograh workflow ID with each agent

## 3. Dograh Workflow Integration

- Connect Dograh using an API key
- Test the Dograh connection
- Create a workflow automatically
- Update the existing workflow automatically
- Avoid duplicate workflows
- Disconnect Dograh
- Display real integration status

## 4. Provider Integrations

The application can support:

- LLM provider
- Text-to-speech provider
- Speech-to-text provider
- Voice provider
- Telephony provider
- Email provider
- Webhook provider

## 5. Lead Management

- Add leads
- Edit leads
- Delete leads
- Search leads
- Filter leads
- Assign leads to agents
- Start calls for selected leads
- View call status

## 6. Call Management

- Start outbound calls
- Start web calls
- End calls
- Display current call state
- Store call history
- Store call metadata
- Store call transcripts when available

---

# How the Application Works

The basic application flow is:

```text
User logs in
    ↓
Dashboard opens
    ↓
User connects required integrations
    ↓
User creates an AI voice agent
    ↓
Backend saves the agent
    ↓
Backend creates a Dograh workflow
    ↓
Dograh workflow ID is saved with the agent
    ↓
User adds a lead
    ↓
User starts a call
    ↓
Agent handles the conversation
    ↓
Call status and data are saved
```

---

# How to Use the Application

## Step 1: Create an Account

1. Open the application.
2. Click **Create Account** or **Register**.
3. Enter your name.
4. Enter your email address.
5. Create a strong password.
6. Submit the form.
7. After successful registration, log in to the application.

## Step 2: Log In

1. Open the login page.
2. Enter your registered email address.
3. Enter your password.
4. Click **Log In**.
5. The application will verify your credentials.
6. After successful login, you will be redirected to the dashboard.

## Step 3: Review the Dashboard

The dashboard can show:

- Total agents
- Active agents
- Total leads
- Total calls
- Recent calls
- Recent agents
- Integration status
- Usage information

Before creating an agent, check whether the required integrations are connected.

## Step 4: Open Settings or Integrations

1. Open **Settings** or **Connected Apps** from the sidebar.
2. Review the available providers.
3. Connect Dograh.
4. Connect the required LLM provider.
5. Connect the voice provider.
6. Connect the transcription provider.
7. Connect the telephony provider when phone calling is required.
8. Test every connection before creating an agent.

## Step 5: Create an Agent

1. Open **Agents** from the sidebar.
2. Click **Create Agent**.
3. Enter the required agent details.
4. Select the voice and language.
5. Add the system prompt.
6. Configure call behavior.
7. Save the agent.
8. Wait for the backend to save the agent and create its Dograh workflow.
9. Verify that the agent appears on the Agents page.

## Step 6: Add Leads

1. Open **Leads**.
2. Click **Add Lead**.
3. Enter the lead name.
4. Enter the phone number with country code.
5. Add an email address if required.
6. Add notes or tags.
7. Assign an agent.
8. Save the lead.

## Step 7: Test the Agent

1. Open the agent.
2. Click **Test Agent** or **Web Call**.
3. Allow microphone access when requested.
4. Speak to the agent.
5. Confirm that the agent can hear you.
6. Confirm that the response voice is working.
7. Check whether the correct prompt and behavior are being used.

## Step 8: Start a Call

1. Open a lead.
2. Select an active agent.
3. Click **Start Call**.
4. Confirm the phone number.
5. Start the call.
6. Monitor the call state.
7. After the call ends, review its status and available transcript.

---

# Create an AI Voice Agent

Open:

```text
Sidebar → Agents → Create Agent
```

Complete the following sections.

## Basic Information

### Agent Name

Add a clear name.

Example:

```text
Real Estate Follow-Up Agent
```

### Description

Explain the purpose of the agent.

Example:

```text
Calls property leads, checks their requirements, and schedules a consultation.
```

### Agent Status

Choose whether the agent should be active.

```text
Active
Inactive
Draft
```

## System Prompt

The system prompt controls the behavior of the agent.

Example:

```text
You are a professional real estate follow-up assistant.

Your job is to:
1. Greet the lead politely.
2. Confirm whether they are looking to buy or rent a property.
3. Ask about their preferred location.
4. Ask about their budget.
5. Ask about their preferred property type.
6. Schedule a consultation with a human agent.

Do not provide false information.
Do not pressure the customer.
Keep responses short and conversational.
```

A good prompt should define:

- Who the agent is
- What the agent must do
- What questions the agent must ask
- What the agent must avoid
- When the agent should transfer or end the call
- What information the agent must save

## First Message

The first message is the sentence spoken when the call begins.

Example:

```text
Hello, this is Ava from ABC Properties. Am I speaking with Rahul?
```

Keep the first message short. A long opening makes the call feel unnatural.

## Voice

Select:

- Voice provider
- Voice model
- Voice ID
- Gender when supported
- Speaking speed
- Stability
- Similarity
- Emotion or style when supported

Test the selected voice before using it in production.

## Language

Select the language used during the call.

Examples:

```text
English
Hindi
English and Hindi
Spanish
French
```

If multilingual behavior is supported, define when the agent should switch languages.

## Call Behavior

Configure:

- Maximum call duration
- Silence timeout
- Interruption behavior
- Response speed
- End-call conditions
- Transfer conditions
- Voicemail behavior
- Recording preference
- Retry behavior

## Save Agent

When the user clicks **Save Agent**, the backend should:

1. Validate the request.
2. Verify that the user is authenticated.
3. Verify required integrations.
4. Save the agent in the database.
5. Build the Dograh workflow payload.
6. Create the workflow in Dograh.
7. Save the returned workflow ID.
8. Return the completed agent data.

---

# Edit an Existing Agent

Open:

```text
Sidebar → Agents → Select Agent → Edit
```

The edit flow should update the same agent and the same Dograh workflow.

Correct flow:

```text
User edits agent
    ↓
Frontend sends agent ID
    ↓
Backend loads existing agent
    ↓
Backend reads dograhWorkflowId
    ↓
Backend updates the existing Dograh workflow
    ↓
Backend updates local agent data
```

Incorrect flow:

```text
User edits agent
    ↓
Backend creates a new Dograh workflow
```

That incorrect flow creates duplicate workflows.

Recommended backend logic:

```js
if (agent.dograhWorkflowId) {
  await updateDograhWorkflow(
    agent.dograhWorkflowId,
    workflowPayload
  );
} else {
  const workflow = await createDograhWorkflow(workflowPayload);
  agent.dograhWorkflowId = workflow.id;
}
```

When editing an agent:

1. Change the required fields.
2. Click **Save Changes**.
3. Prevent multiple button clicks while saving.
4. Show a success message only after both the local update and workflow update succeed.
5. Keep the existing workflow ID unchanged.

---

# Connect Dograh

Open:

```text
Sidebar → Settings → Connected Apps → Dograh
```

## Step-by-Step Dograh Connection

1. Log in to your Dograh account.
2. Generate or copy the Dograh API key.
3. Return to the AI Voice Agent application.
4. Open the Dograh integration form.
5. Enter the Dograh base URL.
6. Enter the Dograh API key.
7. Click **Test Connection**.
8. Wait for a real backend response.
9. If the test succeeds, click **Connect** or **Save**.
10. Confirm that the status changes to **Connected**.

Example base URL:

```text
https://app.dograh.com/api/v1
```

The exact URL must match the Dograh API documentation and the version used by the application.

## Dograh Connection Status

The frontend should load status from the backend:

```text
GET /api/integrations/dograh/status
```

Do not use hardcoded values such as:

```text
Status: Connected
API Key: ********
```

unless the backend has confirmed that the connection exists.

## Important Production Setting

Recommended:

```env
DOGRAH_ALLOW_GLOBAL_FALLBACK=false
```

A silent global fallback is risky because:

- A workflow may be created in the wrong organization.
- Platform credits may be consumed.
- User data may become mixed.
- Users may incorrectly believe their own Dograh account is being used.

If global fallback is required, clearly display it in the user interface.

---

# Configure AI Providers

The exact providers depend on the application.

## LLM Provider

The LLM generates the agent response.

Possible fields:

- Provider name
- API key
- Model
- Temperature
- Maximum tokens
- Base URL

Examples of model configuration:

```text
Provider: OpenAI-compatible provider
Model: selected chat model
Temperature: 0.3
```

Lower temperature generally produces more controlled responses.

## Voice Provider

The voice provider converts text into speech.

Possible fields:

- API key
- Voice ID
- Voice model
- Stability
- Similarity
- Speed
- Style

## Transcription Provider

The transcription provider converts customer speech into text.

Possible fields:

- API key
- Model
- Language
- Endpointing settings
- Silence detection

## Telephony Provider

The telephony provider handles phone calls.

Possible fields:

- Account ID
- Authentication token
- Phone number
- Outbound caller ID
- Webhook URL
- Status callback URL

Never expose provider secret keys in the frontend.

---

# Manage Leads

Open:

```text
Sidebar → Leads
```

## Add a Lead

Click **Add Lead** and enter:

- Full name
- Phone number
- Country code
- Email address
- Company
- Source
- Tags
- Notes
- Assigned agent
- Call status

Example:

```text
Name: Rahul Sharma
Phone: +91XXXXXXXXXX
Source: Website Form
Assigned Agent: Real Estate Follow-Up Agent
Status: New
```

## Import Leads

When CSV import is supported:

1. Download the sample CSV file.
2. Add lead data in the required columns.
3. Keep phone numbers in international format.
4. Upload the file.
5. Review invalid rows.
6. Confirm the import.

Example columns:

```csv
name,phone,email,company,status,agentId
Rahul Sharma,+91XXXXXXXXXX,rahul@example.com,ABC Ltd,new,AGENT_ID
```

## Lead Status

Suggested values:

```text
New
Contacted
Interested
Not Interested
Follow-Up
Converted
Failed
Do Not Call
```

## Delete a Lead

Before deletion:

1. Confirm the selected lead.
2. Show a warning.
3. Delete only when the authenticated user owns the lead.
4. Decide whether associated call history should remain.

---

# Start a Call

## Outbound Call

Open:

```text
Leads → Select Lead → Start Call
```

Before starting:

- Confirm that the agent is active.
- Confirm that Dograh is connected.
- Confirm that telephony is connected.
- Confirm the phone number.
- Confirm sufficient provider balance or credits.
- Confirm that the lead is legally allowed to be called.

Call flow:

```text
User clicks Start Call
    ↓
Frontend sends agent ID and lead ID
    ↓
Backend validates ownership
    ↓
Backend loads agent and lead
    ↓
Backend triggers the calling workflow
    ↓
Provider returns call ID
    ↓
Backend stores call record
    ↓
Frontend displays call status
```

Suggested call states:

```text
Queued
Ringing
In Progress
Completed
Busy
No Answer
Failed
Cancelled
```

## Web Call

A web call allows testing through the browser.

1. Open the agent.
2. Click **Web Call**.
3. Allow microphone access.
4. Click **Start Call**.
5. Speak naturally.
6. Click **End Call** when finished.

The web call view should not automatically scroll to another section when a button is clicked. Controls should open in a dedicated panel, modal, or separate page.

---

# Test an Agent

Testing should be completed before production calls.

## Test Checklist

### Prompt Test

- Does the agent follow its role?
- Does it ask the correct questions?
- Does it avoid unsupported claims?
- Does it end the conversation correctly?
- Does it avoid repeating the same question?

### Voice Test

- Is the voice clear?
- Is pronunciation correct?
- Is the speed natural?
- Is the language correct?
- Is the voice too robotic?

### Interruption Test

- Can the user interrupt the agent?
- Does the agent stop speaking when interrupted?
- Does it continue from the correct context?

### Silence Test

- What happens when the user remains silent?
- Does the agent repeat itself too quickly?
- Does it end the call after the configured timeout?

### Failure Test

Test:

- Invalid Dograh API key
- Expired provider key
- Missing phone number
- Disabled agent
- Failed workflow update
- Provider timeout
- Insufficient provider balance
- Lost internet connection

---

# Authentication Flow

Recommended frontend flow:

```text
Application starts
    ↓
AuthProvider loads stored session
    ↓
Frontend requests current user
    ↓
Backend verifies token
    ↓
User data is stored in AuthContext
    ↓
Protected routes are displayed
```

Example root setup:

```jsx
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import App from "./App";

function Root() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default Root;
```

`useAuth()` must be used inside `AuthProvider`.

Incorrect:

```jsx
function Root() {
  const auth = useAuth();

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
```

Correct:

```jsx
function Dashboard() {
  const auth = useAuth();
  return <div>{auth.user?.name}</div>;
}
```

---

# Developer Installation

## Prerequisites

Install:

- Node.js 18 or later
- npm
- MongoDB
- Git
- Dograh account
- Required provider accounts

Check versions:

```bash
node -v
npm -v
git --version
```

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/ai-voice-agent.git
cd ai-voice-agent
```

Replace the repository URL with the real project URL.

## Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

## Step 3: Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

## Step 4: Add Environment Variables

Create:

```text
backend/.env
frontend/.env
```

Use the examples provided in the next section.

## Step 5: Start MongoDB

For local MongoDB, make sure the service is running.

Example connection:

```text
mongodb://127.0.0.1:27017/ai-voice-agent
```

For MongoDB Atlas, use the Atlas connection string.

## Step 6: Start Backend

```bash
cd backend
npm run dev
```

Expected backend URL:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/api/health
```

## Step 7: Start Frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

Expected frontend URL:

```text
http://localhost:5173
```

## Step 8: Test the Complete Flow

1. Register a user.
2. Log in.
3. Connect Dograh.
4. Connect required providers.
5. Create an agent.
6. Confirm that a Dograh workflow was created.
7. Edit the agent.
8. Confirm that the same workflow was updated.
9. Add a lead.
10. Start a test call.
11. Review logs and call status.

---

# Environment Variables

## Backend `.env`

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/ai-voice-agent

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d

SECRET_ENCRYPTION_KEY=replace_with_a_secure_encryption_key

CLIENT_URL=http://localhost:5173

DOGRAH_BASE_URL=https://app.dograh.com/api/v1
DOGRAH_API_KEY=
DOGRAH_ALLOW_GLOBAL_FALLBACK=false

LLM_API_KEY=
VOICE_API_KEY=
TRANSCRIPTION_API_KEY=
TELEPHONY_API_KEY=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=
FROM_NAME=AI Voice Agent
```

## Frontend `.env`

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Environment Variable Rules

- Do not commit `.env` files.
- Do not place secret keys in React components.
- Do not expose backend keys through `VITE_` variables.
- Use different secrets for development and production.
- Rotate exposed keys immediately.
- Validate required variables when the server starts.

---

# Project Structure

```text
ai-voice-agent/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Agents.jsx
│   │   │   ├── CreateAgent.jsx
│   │   │   ├── EditAgent.jsx
│   │   │   ├── AgentDetails.jsx
│   │   │   ├── Leads.jsx
│   │   │   ├── Calls.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── services/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   │   └── dograhService.js
│   ├── utils/
│   ├── .env
│   ├── package.json
│   └── server.js
│
├── README.md
└── .gitignore
```

The exact structure may be different in the current project. Update this section after reviewing the real folders.

---
