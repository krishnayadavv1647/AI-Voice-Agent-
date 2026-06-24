import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/apiError.js";
import User from "../models/User.js";
import { chargeFeature } from "./billing/featureBilling.service.js";

const DEFAULT_KIE_BASE_URL = "https://api.kie.ai";
const DEFAULT_KIE_CREATE_TASK_ENDPOINT = "/api/v1/jobs/createTask";
const DEFAULT_KIE_RECORD_INFO_ENDPOINT = "/api/v1/jobs/recordInfo";
const DEFAULT_IMAGE_MODEL = "gpt-image-2-text-to-image";
const AGENT_AVATAR_ASPECT_RATIO = "1:1";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, "..", "..", "uploads");

function clean(value, max = 180) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function imageExtension(contentType = "") {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

function joinUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
}

function normalizeKieCallbackUrl(rawUrl) {
  const originalUrl = String(rawUrl || "").trim();
  const callbackUrl = originalUrl.replace(/^https:\/\/https:\/\//i, "https://");
  let parsed;

  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error("KIE_CALLBACK_URL must be a valid public HTTPS backend URL");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname || callbackUrl.slice("https://".length).includes("://")) {
    throw new Error("KIE_CALLBACK_URL must be a valid public HTTPS backend URL");
  }

  if (callbackUrl !== originalUrl) {
    console.warn("[Kie Image Config]", "KIE_CALLBACK_URL had a duplicated https:// prefix and was normalized.");
  }

  return callbackUrl;
}

function buildKieInput({ model, prompt }) {
  const input = {
    prompt,
    aspect_ratio: AGENT_AVATAR_ASPECT_RATIO
  };

  if (String(model).startsWith("seedream/")) {
    input.quality = "basic";
    input.nsfw_checker = false;
  }

  return input;
}

function providerMessage(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(providerMessage).filter(Boolean).join(" ");
  if (typeof data === "object") {
    return data.msg || data.message || data.error || data.detail || data.title || JSON.stringify(data);
  }
  return "";
}

function kieApiError(error, fallback = "Kie image generation failed.") {
  if (error instanceof ApiError) return error;
  const status = error?.response?.status || error?.statusCode || 502;
  const data = error?.response?.data;
  const message = providerMessage(data) || data?.msg || error?.message || fallback;
  return new ApiError(status, `Kie image generation failed: ${message}`, {
    code: "KIE_IMAGE_GENERATION_FAILED",
    provider: "kie",
    providerStatus: status
  });
}

function parseJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstResultUrl(task = {}) {
  const result = parseJsonValue(task.resultJson) || task.resultJson || task.result || task.output;
  if (!result) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result)) return result[0] || "";
  return (
    result.resultUrls?.[0] ||
    result.result_urls?.[0] ||
    result.urls?.[0] ||
    result.images?.[0]?.url ||
    result.images?.[0] ||
    result.url ||
    ""
  );
}

async function writeImageBuffer({ agentId, buffer, extension = "png" }) {
  const uploadDir = path.join(UPLOADS_ROOT, "agents", String(agentId));
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `agent-image-${Date.now()}.${extension}`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, buffer);
  return `/uploads/agents/${agentId}/${fileName}`;
}

function assertKieConfig(finalPrompt) {
  if (!process.env.KIE_API_KEY) throw new Error("KIE_API_KEY is missing");
  if (!process.env.KIE_BASE_URL) throw new Error("KIE_BASE_URL is missing");
  if (!process.env.KIE_CREATE_TASK_ENDPOINT) throw new Error("KIE_CREATE_TASK_ENDPOINT is missing");
  if (!process.env.KIE_IMAGE_MODEL) throw new Error("KIE_IMAGE_MODEL is missing");
  if (!process.env.KIE_CALLBACK_URL) throw new Error("KIE_CALLBACK_URL is missing");
  normalizeKieCallbackUrl(process.env.KIE_CALLBACK_URL);
  if (!finalPrompt || !finalPrompt.trim()) throw new Error("Image prompt is missing");
}

export function generateAgentImagePrompt(agent) {
  const agentName = clean(agent.agentName || agent.name || "AI Voice Agent");
  const specialty = [
    clean(agent.agentType || agent.title || agent.role || "", 100),
    clean(agent.businessCategory || "", 100),
    clean(agent.businessName || "", 100),
    clean(agent.businessDescription || agent.description || agent.mainGoal || "", 220)
  ].filter(Boolean).join(", ");

  return `Create a premium futuristic AI voice agent avatar card image for an agent named ${agentName}. The agent specializes in ${specialty || "business calling, customer support, and lead qualification"}. Style: modern SaaS dashboard avatar, cinematic lighting, dark background, neon green accents, professional AI assistant look, friendly human-like digital agent, headset or communication theme, high quality, clean square composition, no text, no logos, no watermark.`;
}

export function shouldGenerateAgentImage(agent) {
  return (agent.imageMode || "auto_generate") === "auto_generate" && !agent.imageUrl;
}

export async function generateAgentImage(agent, options = {}) {
  const finalPrompt = (options.prompt || generateAgentImagePrompt(agent)).trim();
  assertKieConfig(finalPrompt);

  const baseUrl = String(process.env.KIE_BASE_URL || DEFAULT_KIE_BASE_URL).replace(/\/+$/, "");
  const model = String(process.env.KIE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL).trim();
  if (!model) throw new Error("KIE_IMAGE_MODEL is missing");
  const timeout = Number(process.env.KIE_IMAGE_TIMEOUT_MS || 180000);
  const callBackUrl = normalizeKieCallbackUrl(process.env.KIE_CALLBACK_URL);
  const headers = {
    Authorization: `Bearer ${process.env.KIE_API_KEY}`,
    "Content-Type": "application/json"
  };
  const payload = {
    model,
    callBackUrl,
    input: buildKieInput({ model, prompt: finalPrompt })
  };
  const endpoint = joinUrl(baseUrl, process.env.KIE_CREATE_TASK_ENDPOINT || DEFAULT_KIE_CREATE_TASK_ENDPOINT);

  let taskResponse;
  try {
    taskResponse = await axios.post(
      endpoint,
      payload,
      {
        headers,
        timeout
      }
    );
    console.log("[Kie Image CreateTask Response]", taskResponse.data);
  } catch (error) {
    console.error("[Kie Image Error]", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      payloadWithoutSecret: payload
    });
    throw new Error(
      error.response?.data?.msg ||
      error.response?.data?.message ||
      "Kie image generation failed"
    );
  }

  if (taskResponse.data?.code && taskResponse.data.code !== 200) {
    console.error("[Kie Image Error]", {
      status: 200,
      data: taskResponse.data,
      message: taskResponse.data.msg || "Task creation failed.",
      payloadWithoutSecret: payload
    });
    throw new ApiError(502, `Kie image generation failed: ${taskResponse.data.msg || "Task creation failed."}`, {
      code: "KIE_IMAGE_GENERATION_FAILED",
      provider: "kie",
      providerStatus: taskResponse.data.code
    });
  }

  const taskId = taskResponse.data?.data?.taskId || taskResponse.data?.taskId;
  if (!taskId) throw new ApiError(502, "Kie did not return a task ID.");

  const task = await waitForKieTask({ baseUrl, headers, taskId, timeout });
  const outputUrl = firstResultUrl(task);
  if (!outputUrl) throw new ApiError(502, "Kie returned no image output.");

  let fileResponse;
  try {
    fileResponse = await axios.get(outputUrl, {
      responseType: "arraybuffer",
      timeout: Number(process.env.KIE_IMAGE_DOWNLOAD_TIMEOUT_MS || 30000)
    });
  } catch (error) {
    throw kieApiError(error, "Kie image download failed.");
  }
  const imageUrl = await writeImageBuffer({
    agentId: agent._id,
    buffer: Buffer.from(fileResponse.data),
    extension: imageExtension(fileResponse.headers["content-type"])
  });

  return {
    imageUrl,
    imagePrompt: finalPrompt,
    imageGeneratedAt: new Date(),
    imageProvider: `kie:${model}`
  };
}

async function waitForKieTask({ baseUrl, headers, taskId, timeout }) {
  const startedAt = Date.now();
  const pollMs = Math.max(1000, Number(process.env.KIE_IMAGE_POLL_INTERVAL_MS || 3000));

  while (Date.now() - startedAt < timeout) {
    let response;
    try {
      response = await axios.get(joinUrl(baseUrl, process.env.KIE_RECORD_INFO_ENDPOINT || DEFAULT_KIE_RECORD_INFO_ENDPOINT), {
        headers,
        params: { taskId },
        timeout: Math.min(timeout, 30000)
      });
    } catch (error) {
      throw kieApiError(error, "Kie task polling failed.");
    }
    if (response.data?.code && response.data.code !== 200 && response.data.code !== 505) {
      throw new ApiError(502, `Kie image generation failed: ${response.data.msg || "Task polling failed."}`, {
        code: "KIE_IMAGE_GENERATION_FAILED",
        provider: "kie",
        taskId,
        providerStatus: response.data.code
      });
    }
    const task = response.data?.data || response.data || {};
    const state = String(task.state || task.status || "").toLowerCase();

    if (state === "success") return task;
    if (state === "fail" || state === "failed") {
      throw new ApiError(502, task.failMsg || task.failure || "Kie image generation failed.", {
        code: "KIE_IMAGE_GENERATION_FAILED",
        provider: "kie",
        taskId
      });
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new ApiError(504, "Kie image generation timed out.");
}

export async function applyGeneratedAgentImage(agent, options = {}) {
  const image = await generateAgentImage(agent, options);
  agent.imageUrl = image.imageUrl;
  agent.imagePrompt = image.imagePrompt;
  agent.imageGeneratedAt = image.imageGeneratedAt;
  agent.imageProvider = image.imageProvider;
  agent.imageMode = "auto_generate";
  await agent.save();
  if (agent.userId) {
    await Promise.all([
      User.findByIdAndUpdate(agent.userId, { $inc: { imageGenerationsUsed: 1, platformCreditsUsed: 1 } }),
      chargeFeature({
        userId: agent.userId,
        featureKey: "image_generate",
        idempotencyKey: `image_generate:${agent._id}:${Date.now()}`,
        metadata: { agentId: String(agent._id) }
      })
    ]);
  }
  return { agent, image };
}
