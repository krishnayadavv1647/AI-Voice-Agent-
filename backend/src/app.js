import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import adminRoutes from "./routes/admin.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import authRoutes from "./routes/auth.routes.js";
import callRoutes from "./routes/call.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import dograhRoutes from "./routes/dograh.routes.js";
import knowledgeRoutes from "./routes/knowledge.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import llmRoutes from "./routes/llm.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.get("/api/health", (req, res) => res.json({ ok: true, app: "AI Voice Agent API" }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/dograh", dograhRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
