import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import adminRoutes from "./routes/admin.routes.js";
import plansRoutes from "./routes/plans.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import agentTemplateRoutes from "./routes/agentTemplate.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import authRoutes from "./routes/auth.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import bioPageRoutes from "./routes/bioPage.routes.js";
import callRoutes from "./routes/call.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import connectionsRoutes from "./routes/connections.routes.js";
import creditsRoutes from "./routes/credits.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import dograhIntegrationRoutes from "./routes/dograhIntegration.routes.js";
import dograhRoutes from "./routes/dograh.routes.js";
import emailRoutes from "./routes/email.routes.js";
import emailIntegrationRoutes from "./routes/emailIntegration.routes.js";
import followUpRoutes from "./routes/followUp.routes.js";
import importCallsRoutes from "./routes/importCalls.routes.js";
import knowledgeRoutes from "./routes/knowledge.routes.js";
import leadFinderRoutes from "./routes/leadFinder.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import llmRoutes from "./routes/llm.routes.js";
import llmIntegrationRoutes from "./routes/llmIntegration.routes.js";
import publicRoutes from "./routes/public.routes.js";
import scheduledCallRoutes from "./routes/scheduledCall.routes.js";
import telephonyConfigRoutes from "./routes/telephonyConfig.routes.js";
import telephonyRoutes from "./routes/telephony.routes.js";
import telegramIntegrationRoutes from "./routes/telegramIntegration.routes.js";
import vapiRoutes from "./routes/vapi.routes.js";
import voiceIntegrationRoutes from "./routes/voiceIntegration.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

import { dograhWebhook } from "./controllers/webhook.controller.js";
import { handleBillingWebhook } from "./controllers/billing.controller.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// backend/uploads
const uploadsPath = path.join(__dirname, "..", "uploads");

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));

// Payment webhooks need the raw, unparsed body for signature verification, so mount before json.
app.post("/api/billing/webhook/:provider", express.raw({ type: "*/*" }), handleBillingWebhook);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Public uploaded files
app.use("/uploads", express.static(uploadsPath));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "AI Voice Agent API",
    uploadsPath,
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bio-page", bioPageRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.post("/api/dograh/webhook", dograhWebhook);
app.use("/api/dograh", dograhRoutes);

app.use("/api/email", emailRoutes);
app.use("/api/email-integrations", emailIntegrationRoutes);
app.use("/api/followups", followUpRoutes);
app.use("/api/import-calls", importCallsRoutes);
app.use("/api/agent-templates", agentTemplateRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/appointments", appointmentRoutes);

app.post("/api/calls/webhook", dograhWebhook);
app.use("/api/calls", callRoutes);
app.use("/api/campaigns", campaignRoutes);

app.use("/api/lead-finder", leadFinderRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/scheduled-calls", scheduledCallRoutes);
app.use("/api/telephony-configs", telephonyConfigRoutes);
app.use("/api/telephony", telephonyRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/integrations/dograh", dograhIntegrationRoutes);
app.use("/api/integrations/telegram", telegramIntegrationRoutes);
// Vapi custom-LLM + webhook. The /chat/completions route streams its own SSE response and must not
// be wrapped in any middleware that buffers the body. Both routes consume plain JSON (fine under the
// global json parser above). If signature verification over the raw body is later required, mount an
// express.raw handler before the global json parser like /api/billing/webhook does.
app.use("/api/vapi", vapiRoutes);
app.use("/api", voiceIntegrationRoutes);
app.use("/api", llmIntegrationRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin", adminRoutes);

// Error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
