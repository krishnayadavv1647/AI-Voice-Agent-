import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import fs from "fs/promises";
import path from "path";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import UserIntegration from "../models/UserIntegration.js";
import DograhAgentMigration from "../models/DograhAgentMigration.js";
import {
  createDograhEmbedToken,
  deleteDograhEmbedToken,
  triggerDograhTestCallByWorkflow
} from "../services/dograh.service.js";
import { generateAgentTextReply } from "../services/gemini.service.js";
import { generateSystemPrompt } from "../services/promptGenerator.js";
import { getProvider } from "../providers/index.js";
import { DograhProvider } from "../providers/dograh.provider.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { assertDograhAgentReadyForCalls, triggerOutboundCallForAgent } from "../services/outboundCall.service.js";
import { syncAgentDograhRuntime } from "../services/dograhWorkflowSync.service.js";
import { getDograhClientForAgent, getDograhClientForIntegration, getPlatformDograhClient } from "../services/dograhClientResolver.js";
import {
  applyVoiceConfigurationToAgent,
  getAgentVoiceConfiguration,
  sanitizeVoiceConfiguration,
  upsertAgentVoiceConfiguration
} from "../services/agentVoiceConfiguration.service.js";
import {
  applyLLMConfigurationToAgent,
  getAgentLLMConfiguration,
  sanitizeLLMConfiguration,
  upsertAgentLLMConfiguration,
  validateLLMConfigurationOwnership
} from "../services/agentLLMConfiguration.service.js";
import {
  getDograhLLMRuntimeSummary
} from "../services/dograhLLMConfigSync.service.js";
import {
  assertDograhVoiceReadyForWebCall,
  getDograhVoiceRuntimeSummary
} from "../services/dograhVoiceConfigSync.service.js";
import { BIO_PAGE_TEMPLATES, DEFAULT_QUICK_TOPICS, defaultBioPage, templateDefaults } from "../services/bioPageTemplates.js";
import { applyGeneratedAgentImage, shouldGenerateAgentImage } from "../services/agentImage.service.js";

function userFilter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const BIO_TEXT_FIELDS = ["headline", "subheadline", "welcomeMessage", "ctaText", "primaryCtaText", "secondaryCtaText", "voiceCallCtaText"];
const BIO_STRING_FIELDS = [
  "template",
  "logoUrl",
  "coverImageUrl",
  "agentImageUrl",
  "primaryColor",
  "backgroundColor",
  "textColor",
  "buttonColor",
  "cardColor",
  "accentColor",
  "fontStyle",
  "animation",
  ...BIO_TEXT_FIELDS
];
const BIO_BOOL_FIELDS = [
  "showWebCall",
  "showWebCallButton",
  "showAppointment",
  "showAppointmentButton",
  "showContactForm",
  "showBusinessInfo",
  "showSocialLinks",
  "showVoiceCallButton",
  "isPublished"
];
const BIO_NESTED_TEXT_FIELDS = {
  businessInfo: ["businessName", "category", "location", "availability", "responseTime"],
  socialLinks: ["website", "instagram", "facebook", "whatsapp", "linkedin"]
};
const FONT_STYLES = ["modern", "professional", "friendly", "bold", "elegant"];
const ANIMATIONS = ["none", "fade_in", "slide_up", "zoom_in", "floating_cards", "gradient_motion", "pulse_button"];
const TOPIC_ICON_TYPES = ["lucide", "emoji", "image"];
const WORKFLOW_LINKED_FIELDS = [
  "agentName",
  "name",
  "description",
  "agentType",
  "businessName",
  "businessCategory",
  "businessDescription",
  "businessWebsite",
  "businessLocation",
  "workingHours",
  "contactNumber",
  "mainGoal",
  "secondaryGoal",
  "avoidInstructions",
  "confusedInstructions",
  "services",
  "pricing",
  "faqs",
  "policies",
  "offers",
  "additionalInfo",
  "leadQuestions",
  "systemPrompt",
  "greetingMessage",
  "fallbackMessage",
  "endingMessage",
  "humanTransferMessage",
  "language",
  "responseStyle",
  "callMode",
  "allowInterruption",
  "fastReplyMode",
  "leadCaptureEnabled",
  "voiceGender",
  "voiceStyle",
  "voiceProvider",
  "voiceId",
  "llmProvider",
  "llmModel",
  "sttProvider",
  "ttsProvider",
  "firstMessage",
  "voiceSpeed",
  "voice",
  "nodes",
  "workflowNodes",
  "tools",
  "settings",
  "knowledgeBaseIds",
  "tone",
  "speakingSpeed",
  "personality"
];

function sanitizeText(value) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, 600);
}

function normalizeComparableValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toString === "function" && value.constructor?.name === "ObjectId") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeComparableValue);
  if (value && typeof value === "object") {
    const plain = value.toObject ? value.toObject() : value;
    return Object.keys(plain)
      .filter((key) => key !== "_id")
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeComparableValue(plain[key]);
        return result;
      }, {});
  }
  return value;
}

function comparableJson(value) {
  return JSON.stringify(normalizeComparableValue(value));
}

function workflowLinkedFieldsChanged(before, after) {
  return WORKFLOW_LINKED_FIELDS.some((field) => comparableJson(before?.[field]) !== comparableJson(after?.[field]));
}

function ensureBioPage(agent) {
  const current = agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {};
  const defaults = defaultBioPage(agent);
  return {
    ...defaults,
    ...current,
    primaryCtaText: current.primaryCtaText || current.ctaText || defaults.primaryCtaText,
    ctaText: current.ctaText || current.primaryCtaText || defaults.ctaText,
    showWebCallButton: current.showWebCallButton ?? current.showWebCall ?? defaults.showWebCallButton,
    showWebCall: current.showWebCall ?? current.showWebCallButton ?? defaults.showWebCall,
    showAppointmentButton: current.showAppointmentButton ?? current.showAppointment ?? defaults.showAppointmentButton,
    showAppointment: current.showAppointment ?? current.showAppointmentButton ?? defaults.showAppointment,
    businessInfo: { ...defaults.businessInfo, ...(current.businessInfo || {}) },
    socialLinks: { ...defaults.socialLinks, ...(current.socialLinks || {}) },
    quickTopics: Array.isArray(current.quickTopics) && current.quickTopics.length
      ? current.quickTopics
      : DEFAULT_QUICK_TOPICS.map((topic) => ({ ...topic }))
  };
}

function sanitizeQuickTopics(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, "Quick topics must be a list.");

  return value.slice(0, 8).map((topic = {}, index) => {
    const color = String(topic.color || "#2563EB").trim();
    if (!HEX_COLOR.test(color)) throw new ApiError(400, "Quick topic color must be a safe hex color.");

    const iconType = TOPIC_ICON_TYPES.includes(topic.iconType) ? topic.iconType : "lucide";
    return {
      id: sanitizeText(topic.id || `topic-${index + 1}`).slice(0, 80) || `topic-${index + 1}`,
      title: sanitizeText(topic.title).slice(0, 80) || `Topic ${index + 1}`,
      description: sanitizeText(topic.description).slice(0, 160),
      icon: sanitizeText(topic.icon || "MessageCircle").slice(0, 80),
      iconType,
      iconImageUrl: sanitizeText(topic.iconImageUrl).slice(0, 500),
      color,
      prompt: sanitizeText(topic.prompt).slice(0, 300),
      isVisible: topic.isVisible !== false,
      order: Number.isFinite(Number(topic.order)) ? Number(topic.order) : index
    };
  });
}

function sanitizeBioPagePatch(body = {}) {
  const patch = {};
  for (const field of BIO_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (BIO_TEXT_FIELDS.includes(field)) patch[field] = sanitizeText(body[field]);
    else patch[field] = String(body[field] || "").trim().slice(0, 500);
  }
  for (const field of ["primaryColor", "backgroundColor", "textColor", "buttonColor", "cardColor", "accentColor"]) {
    if (patch[field] !== undefined && !HEX_COLOR.test(patch[field])) throw new ApiError(400, `${field} must be a safe hex color.`);
  }
  if (patch.template && !BIO_PAGE_TEMPLATES.some((item) => item.templateId === patch.template)) throw new ApiError(400, "Bio page template is not valid.");
  if (patch.fontStyle && !FONT_STYLES.includes(patch.fontStyle)) throw new ApiError(400, "Font style is not valid.");
  if (patch.animation && !ANIMATIONS.includes(patch.animation)) throw new ApiError(400, "Animation is not valid.");
  for (const field of BIO_BOOL_FIELDS) {
    if (body[field] !== undefined) patch[field] = Boolean(body[field]);
  }
  for (const [group, fields] of Object.entries(BIO_NESTED_TEXT_FIELDS)) {
    if (!body[group] || typeof body[group] !== "object") continue;
    patch[group] = {};
    for (const field of fields) {
      if (body[group][field] !== undefined) patch[group][field] = sanitizeText(body[group][field]).slice(0, 500);
    }
  }
  const quickTopics = sanitizeQuickTopics(body.quickTopics);
  if (quickTopics) patch.quickTopics = quickTopics;
  if (patch.primaryCtaText !== undefined && patch.ctaText === undefined) patch.ctaText = patch.primaryCtaText;
  if (patch.ctaText !== undefined && patch.primaryCtaText === undefined) patch.primaryCtaText = patch.ctaText;
  if (patch.showWebCallButton !== undefined && patch.showWebCall === undefined) patch.showWebCall = patch.showWebCallButton;
  if (patch.showWebCall !== undefined && patch.showWebCallButton === undefined) patch.showWebCallButton = patch.showWebCall;
  if (patch.showAppointmentButton !== undefined && patch.showAppointment === undefined) patch.showAppointment = patch.showAppointmentButton;
  if (patch.showAppointment !== undefined && patch.showAppointmentButton === undefined) patch.showAppointmentButton = patch.showAppointment;
  patch.updatedAt = new Date();
  return patch;
}

async function saveBioAsset({ req, agent, kind }) {
  const contentType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
  const allowed = kind === "topic-icon"
    ? { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }
    : { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const maxBytes = kind === "topic-icon" ? 1 * 1024 * 1024 : kind === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;

  if (!allowed[contentType]) throw new ApiError(400, `${kind} must be png, jpg, jpeg, webp${kind === "topic-icon" ? ", or safe svg" : ""}.`);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ApiError(400, `${kind} file is required.`);
  if (req.body.length > maxBytes) throw new ApiError(400, `${kind} file is too large.`);
  if (contentType === "image/svg+xml") {
    const svg = req.body.toString("utf8").toLowerCase();
    if (svg.includes("<script") || /on[a-z]+\s*=/.test(svg) || svg.includes("javascript:")) {
      throw new ApiError(400, "SVG icon contains unsafe content.");
    }
  }

  const uploadDir = path.resolve("uploads", "bio-pages", String(agent._id));
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${kind}-${Date.now()}.${allowed[contentType]}`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, req.body);
  return `/uploads/bio-pages/${agent._id}/${fileName}`;
}

function slugifyAgentName(value = "") {
  const slug = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || `agent-${Math.random().toString(36).slice(2, 8)}`;
}

async function generateUniquePublicSlug(name) {
  const baseSlug = slugifyAgentName(name);
  let slug = baseSlug;
  let exists = await Agent.exists({ publicSlug: slug });

  while (exists) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    exists = await Agent.exists({ publicSlug: slug });
  }

  return slug;
}

async function normalizeAgentProvider(agent) {
  let changed = false;

  if (agent.dograhWorkflowId && !agent.providerWorkflowId) {
    agent.provider = "dograh";
    agent.providerWorkflowId = agent.dograhWorkflowId;
    changed = true;
  }

  if (!agent.provider) {
    agent.provider = agent.dograhWorkflowId ? "dograh" : "custom";
    changed = true;
  }

  if (agent.provider === "dograh" && !agent.workflowStatus) {
    agent.workflowStatus = hasRealDograhWorkflow(agent) ? "connected" : agent.dograhStatus === "failed" ? "failed" : "creating";
    changed = true;
  }

  if (!agent.publicSlug) {
    agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);
    changed = true;
  }

  if (changed) await agent.save();
  return agent;
}

async function getOwnedAgent(req) {
  const agent = await Agent.findOne({
    _id: req.params.id,
    ...userFilter(req),
  });

  if (!agent) throw new ApiError(404, "Agent not found");

  return normalizeAgentProvider(agent);
}

async function getOwnedAgentById(req, agentId) {
  const agent = await Agent.findOne({
    _id: agentId,
    ...userFilter(req),
  });

  if (!agent) throw new ApiError(404, "Agent not found");

  return normalizeAgentProvider(agent);
}

function getAgentDograhWorkflowId(agent) {
  return (
    agent.dograhWorkflowId ||
    agent.providerWorkflowId ||
    agent.dograhWorkflowUuid ||
    null
  );
}

function hasRealDograhWorkflow(agent) {
  return Boolean(agent?.dograhWorkflowId || agent?.dograhWorkflowUuid);
}

function clearDograhWorkflowFields(agent, errorMessage) {
  agent.providerWorkflowId = null;
  agent.providerAgentId = null;
  agent.dograhWorkflowId = null;
  agent.dograhWorkflowUuid = null;
  agent.dograhWorkflowName = null;
  agent.dograhAgentId = null;
  agent.dograhStatus = "failed";
  agent.workflowStatus = "failed";
  agent.workflowSyncStatus = "failed";
  agent.workflowSyncError = errorMessage || "Dograh workflow creation failed.";
  agent.dograhSyncStatus = "Workflow Failed";
  agent.dograhConnection = "Not connected";
  agent.dograhError = errorMessage || "Dograh workflow creation failed.";
  agent.dograhNeedsUpdate = true;
  agent.status = "Draft";
}

function readProviderErrorMessage(error) {
  const data = error?.response?.data || error?.details?.dograhError || error?.details;
  const detail = data?.message || data?.error || data?.detail || data?.userMessage;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return JSON.stringify(detail);
  if (detail && typeof detail === "object") return "Dograh workflow operation failed. Check provider configuration.";
  if (typeof data === "string") return data;
  if (data && typeof data === "object") return error?.message || "Dograh workflow operation failed. Check provider configuration.";
  return error?.message || "Dograh workflow creation failed.";
}

function assertE164(value, fieldName) {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ApiError(
      400,
      `${fieldName} must be in E.164 format, for example +17578297060`
    );
  }
}

function validateEditableAgentFields(agent) {
  const validLanguages = ["english", "hindi", "hinglish", "hindi_english", "English", "Hindi", "Hinglish", "Hindi + English"];
  const validCallModes = ["outbound", "test", "callback"];

  if (!agent.agentName || !agent.businessName || !agent.businessCategory) {
    throw new ApiError(400, "Agent name, business name, and business category are required");
  }

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    throw new ApiError(400, "System prompt should not be empty");
  }

  if (agent.language && !validLanguages.includes(agent.language)) {
    throw new ApiError(400, "Language is not valid");
  }

  if (agent.callMode && !validCallModes.includes(agent.callMode)) {
    throw new ApiError(400, "Call mode is not valid");
  }
}

function cleanOptionalObjectId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!String(value).trim()) return null;
  if (!Agent.db.base.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${fieldName} is not valid`);
  }
  return value;
}

function sanitizeAgentBody(body = {}) {
  const sanitized = { ...body };
  delete sanitized.voiceConfiguration;
  delete sanitized.llmConfiguration;
  delete sanitized.llmProvider;
  delete sanitized.llmModel;
  const telephonyConfigId = cleanOptionalObjectId(sanitized.telephonyConfigId, "telephonyConfigId");

  if (telephonyConfigId === undefined) {
    delete sanitized.telephonyConfigId;
  } else {
    sanitized.telephonyConfigId = telephonyConfigId;
  }

  // dograhIntegrationId is an ObjectId path; the frontend sends "" for the platform/app-engine
  // case. Coerce blanks to null so a non-Dograh save does not fail the ObjectId cast. The Dograh
  // binding path reads req.body directly and overwrites this later, so it is unaffected.
  const dograhIntegrationId = cleanOptionalObjectId(sanitized.dograhIntegrationId, "dograhIntegrationId");

  if (dograhIntegrationId === undefined) {
    delete sanitized.dograhIntegrationId;
  } else {
    sanitized.dograhIntegrationId = dograhIntegrationId;
  }

  return sanitized;
}

function imageGenerationWarning(error) {
  return `Agent created. Image generation failed, using fallback avatar. ${error?.message || ""}`.trim();
}

async function tryGenerateImageForAgent(agent, context = "create") {
  if (!shouldGenerateAgentImage(agent)) return null;

  try {
    return await applyGeneratedAgentImage(agent);
  } catch (error) {
    console.error(`[agent-image] ${context} failed`, {
      agentId: agent._id?.toString(),
      message: error?.message
    });
    return { error };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableImageError(error) {
  const status = error?.response?.status || error?.statusCode;
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status < 600);
}

async function generateImageWithRetry(agent, { attempts = 3, delayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await applyGeneratedAgentImage(agent);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableImageError(error)) break;
      const retryAfter = Number(error?.response?.headers?.["retry-after"]);
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delayMs * attempt);
    }
  }
  throw lastError;
}

async function resolveRequestedDograhBinding(userId, body = {}) {
  const requestedType = body.dograhConnectionType || body.dograhRuntime || body.dograhRuntimeConnectionType;
  const requestedIntegrationId = cleanOptionalObjectId(body.dograhIntegrationId, "dograhIntegrationId");

  if (requestedType === "platform") {
    getPlatformDograhClient();
    return { dograhConnectionType: "platform", dograhIntegrationId: null };
  }

  if (requestedType === "user_integration") {
    const integration = requestedIntegrationId
      ? await UserIntegration.findOne({ _id: requestedIntegrationId, userId, provider: "dograh", status: "connected" })
      : await UserIntegration.findOne({ userId, provider: "dograh", status: "connected" });
    if (!integration) {
      throw new ApiError(400, "DOGRAH_INTEGRATION_INVALID", { code: "DOGRAH_INTEGRATION_INVALID" });
    }
    return { dograhConnectionType: "user_integration", dograhIntegrationId: integration._id };
  }

  const integration = await UserIntegration.findOne({ userId, provider: "dograh", status: "connected" });
  if (integration) return { dograhConnectionType: "user_integration", dograhIntegrationId: integration._id };
  return { dograhConnectionType: "platform", dograhIntegrationId: null };
}

function dograhBindingSummary(agent) {
  const type = agent?.dograhConnectionType || (agent?.dograhIntegrationId ? "user_integration" : "platform");
  return {
    dograhConnectionType: type,
    dograhIntegrationId: agent?.dograhIntegrationId || null,
    label: type === "user_integration" ? "My Dograh" : "Platform Dograh",
    workflowId: agent?.dograhWorkflowId || agent?.providerWorkflowId || "",
    workflowUuid: agent?.dograhWorkflowUuid || "",
    runtimeSyncStatus: agent?.workflowSyncStatus || agent?.dograhSyncStatus || "",
    lastSyncedAt: agent?.workflowLastSyncedAt || agent?.dograhLastSyncedAt || null,
    syncError: agent?.workflowSyncError || agent?.dograhError || ""
  };
}

async function syncTelephonyConfigForAgent(agent, telephonyConfigId) {
  const unlinkFilter = { userId: agent.userId, linkedAgentId: agent._id };
  if (telephonyConfigId) unlinkFilter._id = { $ne: telephonyConfigId };

  await TelephonyConfig.updateMany(
    unlinkFilter,
    { $set: { linkedAgentId: null } }
  );

  if (!telephonyConfigId) return;

  const config = await TelephonyConfig.findOne({ _id: telephonyConfigId, userId: agent.userId });
  if (!config) throw new ApiError(400, "Telephony configuration was not found for this user");

  config.linkedAgentId = agent._id;
  await config.save();

  agent.telephonyProvider = config.provider;
  agent.connectedPhoneNumber = config.phoneNumber;
}

async function validateTelephonyConfigForAgent(agent, telephonyConfigId) {
  if (!telephonyConfigId) return;

  const config = await TelephonyConfig.findOne({ _id: telephonyConfigId, userId: agent.userId });
  if (!config) throw new ApiError(400, "Telephony configuration was not found for this user");

  agent.telephonyConfigId = config._id;
  agent.telephonyProvider = config.provider;
  agent.connectedPhoneNumber = config.phoneNumber;
}

function buildProviderResultPatch(agent, result = {}, syncedAt = new Date()) {
  const set = {
    provider: result.provider || agent.provider || "custom",
    lastSyncedAt: syncedAt
  };
  const unset = {};

  if (result.providerWorkflowId || agent.providerWorkflowId) {
    set.providerWorkflowId = result.providerWorkflowId || agent.providerWorkflowId;
  }

  if (result.providerAgentId || agent.providerAgentId) {
    set.providerAgentId = result.providerAgentId || agent.providerAgentId;
  }

  if (set.provider === "dograh" || result.dograhWorkflowId) {
    set.dograhAgentId = result.dograhAgentId || result.providerAgentId || agent.dograhAgentId || agent.providerAgentId || result.dograhWorkflowId || agent.dograhWorkflowId;
    set.dograhWorkflowId = result.dograhWorkflowId || agent.dograhWorkflowId || result.providerWorkflowId;
    set.dograhWorkflowUuid = result.dograhWorkflowUuid || agent.dograhWorkflowUuid;
    set.dograhWorkflowName = result.dograhWorkflowName || agent.dograhWorkflowName || agent.agentName;
    set.dograhConnectionType = result.dograhConnectionType || agent.dograhConnectionType || "platform";
    set.dograhIntegrationId = result.dograhIntegrationId || agent.dograhIntegrationId || null;
    set.dograhStatus = hasRealDograhWorkflow(set) ? "connected" : result.status || agent.dograhStatus;
    set.workflowStatus = hasRealDograhWorkflow(set) ? "connected" : agent.workflowStatus || "failed";
    set.workflowSyncStatus = hasRealDograhWorkflow(set) ? "synced" : agent.workflowSyncStatus || "failed";
    set.dograhSyncStatus = hasRealDograhWorkflow(set) ? "Workflow Synced" : "Workflow Not Connected";
    set.dograhConnection = hasRealDograhWorkflow(set) ? "Connected" : "Not connected";
    set.dograhRawResponse = result.raw || agent.dograhRawResponse;
    set.dograhLastSyncedAt = syncedAt;
    set.workflowLastSyncedAt = syncedAt;
    set.dograhNeedsUpdate = !hasRealDograhWorkflow(set);

    if (hasRealDograhWorkflow(set)) {
      set.status = "Connected";
    }

    unset.dograhError = "";
    unset.workflowSyncError = "";
  }

  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) delete set[key];
  }

  return Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
}

function applyProviderResult(agent, result = {}, syncedAt = new Date()) {
  agent.provider = result.provider || agent.provider || "custom";
  agent.providerWorkflowId = result.providerWorkflowId || agent.providerWorkflowId;
  agent.providerAgentId = result.providerAgentId || agent.providerAgentId;
  agent.lastSyncedAt = syncedAt;

  if (agent.provider === "dograh" || result.dograhWorkflowId) {
    agent.dograhAgentId = result.dograhAgentId || result.providerAgentId || agent.dograhAgentId || agent.providerAgentId || result.dograhWorkflowId || agent.dograhWorkflowId;
    agent.dograhWorkflowId = result.dograhWorkflowId || agent.dograhWorkflowId || result.providerWorkflowId;
    agent.dograhWorkflowUuid = result.dograhWorkflowUuid || agent.dograhWorkflowUuid;
    agent.dograhWorkflowName = result.dograhWorkflowName || agent.dograhWorkflowName || agent.agentName;
    agent.dograhConnectionType = result.dograhConnectionType || agent.dograhConnectionType || "platform";
    agent.dograhIntegrationId = result.dograhIntegrationId || agent.dograhIntegrationId || null;
    agent.dograhStatus = hasRealDograhWorkflow(agent) ? "connected" : result.status || agent.dograhStatus;
    agent.workflowStatus = hasRealDograhWorkflow(agent) ? "connected" : agent.workflowStatus || "failed";
    agent.workflowSyncStatus = hasRealDograhWorkflow(agent) ? "synced" : agent.workflowSyncStatus || "failed";
    agent.dograhSyncStatus = hasRealDograhWorkflow(agent) ? "Workflow Synced" : "Workflow Not Connected";
    agent.dograhConnection = hasRealDograhWorkflow(agent) ? "Connected" : "Not connected";
    agent.dograhError = undefined;
    agent.workflowSyncError = undefined;
    agent.dograhRawResponse = result.raw || agent.dograhRawResponse;
    agent.dograhLastSyncedAt = syncedAt;
    agent.workflowLastSyncedAt = syncedAt;
    agent.dograhNeedsUpdate = !hasRealDograhWorkflow(agent);
    agent.status = hasRealDograhWorkflow(agent) ? "Connected" : agent.status;
  }

  return agent;
}

function publicProviderResult(result = null) {
  if (!result) return null;
  const { raw, ...safeResult } = result;
  return safeResult;
}

async function syncProvider(agent, action, { createIfMissing = false } = {}) {
  const providerName = agent.provider || (agent.dograhWorkflowId ? "dograh" : "custom");
  const providerWorkflowId = providerName === "dograh"
    ? (hasRealDograhWorkflow(agent) ? (agent.providerWorkflowId || agent.dograhWorkflowId) : null)
    : (agent.providerWorkflowId || agent.workflowId);

  if (action === "update" && providerName !== "custom" && !providerWorkflowId && !createIfMissing) {
    throw new ApiError(
      400,
      "Provider workflow ID missing. Enable createIfMissing to create a new provider workflow."
    );
  }

  const provider = getProvider(providerName);
  const operation = action === "update" && !providerWorkflowId && createIfMissing ? "create" : action;

  console.log("[Provider Sync]", {
    agentId: agent._id.toString(),
    provider: providerName,
    providerWorkflowId,
    action: operation,
    externalWorkflowCreated: operation === "create"
  });

  const result = await provider[operation](agent);
  const syncedAt = new Date();
  const providerPatch = buildProviderResultPatch(agent, result, syncedAt);
  await Agent.findOneAndUpdate(
    { _id: agent._id },
    providerPatch,
    { new: true, runValidators: true }
  );
  applyProviderResult(agent, result, syncedAt);

  return result;
}

export const createAgent = asyncHandler(async (req, res) => {
  if (!req.body.agentName || !req.body.agentType || !req.body.businessName) {
    throw new ApiError(400, "Agent name, type, and business name are required");
  }

  const voiceConfigurationInput = req.body.voiceConfiguration || null;
  const llmConfigurationInput = req.body.llmConfiguration || null;
  const body = sanitizeAgentBody(req.body);
  const telephonyConfigId = body.telephonyConfigId;
  delete body.telephonyConfigId;
  let imageWarning = null;

  const agent = new Agent({
    ...body,
    userId: req.user._id,
    provider: body.provider || "vapi",
    agentName: body.agentName || body.name,
    name: body.name || body.agentName,
    description: body.description || body.businessDescription,
    publicTitle: body.publicTitle || body.businessName || body.agentName || body.name,
    publicDescription: body.publicDescription || body.businessDescription || body.description,
    publicWelcomeMessage: body.publicWelcomeMessage || body.greetingMessage || body.firstMessage
  });
  if (agent.provider === "dograh") {
    const binding = await resolveRequestedDograhBinding(req.user._id, req.body);
    agent.dograhConnectionType = binding.dograhConnectionType;
    agent.dograhIntegrationId = binding.dograhIntegrationId;
  }

  agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);

  if (!agent.systemPrompt) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }

  agent.callerIdNumber =
    body.callerIdNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER ||
    agent.callerIdNumber;

  agent.connectedPhoneNumber =
    body.connectedPhoneNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER ||
    agent.connectedPhoneNumber;

  agent.telephonyProvider =
    body.telephonyProvider ||
    process.env.DEFAULT_TELEPHONY_PROVIDER ||
    agent.telephonyProvider ||
    "twilio";

  agent.telephonyConfigId = telephonyConfigId || null;
  await validateTelephonyConfigForAgent(agent, agent.telephonyConfigId);
  if (voiceConfigurationInput) {
    const cleanVoiceConfiguration = sanitizeVoiceConfiguration(voiceConfigurationInput, agent);
    applyVoiceConfigurationToAgent(agent, cleanVoiceConfiguration);
  }
  if (llmConfigurationInput) {
    const cleanLLMConfiguration = sanitizeLLMConfiguration(llmConfigurationInput, agent);
    await validateLLMConfigurationOwnership({ userId: agent.userId, config: cleanLLMConfiguration });
    applyLLMConfigurationToAgent(agent, cleanLLMConfiguration);
  }
  await agent.validate();

  let voiceConfiguration = null;
  let llmConfiguration = null;

  if (agent.provider === "dograh") {
    let providerResult;
    agent.workflowStatus = "creating";
    agent.workflowSyncStatus = "syncing";
    agent.workflowSyncError = undefined;
    agent.dograhStatus = "creating";
    agent.dograhSyncStatus = "Workflow Creating";
    agent.dograhConnection = "Creating";
    await agent.save();
    if (voiceConfigurationInput) {
      voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
      await agent.save();
    }
    if (llmConfigurationInput) {
      llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
      await agent.save();
    }

    try {
      providerResult = await getProvider("dograh").create(agent);
      const dograhAgentId = providerResult.dograhAgentId || providerResult.providerAgentId || providerResult.dograhWorkflowId || providerResult.providerWorkflowId;

      if (!dograhAgentId) {
        throw new ApiError(502, "Dograh agent creation failed. Please check your API key and Dograh payload.");
      }

      applyProviderResult(agent, {
        ...providerResult,
        dograhAgentId,
        providerAgentId: providerResult.providerAgentId || dograhAgentId
      });
    } catch (error) {
      console.error("Dograh agent creation failed:", error.message);
      const dograhError = readProviderErrorMessage(error);
      clearDograhWorkflowFields(agent, dograhError);
      await agent.save();
      const imageResult = await tryGenerateImageForAgent(agent, "create-after-dograh-failure");
      if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
      if (imageResult?.agent) agent.set(imageResult.agent.toObject());

      return res.status(201).json({
        agent,
        voiceConfiguration,
        llmConfiguration,
        providerResult: null,
        dograhCreated: false,
        dograhResponse: null,
        warning: [`Agent created locally, but Dograh workflow creation failed. ${dograhError}`, imageWarning].filter(Boolean).join(" "),
        error: dograhError,
        dograhError
      });
    }

    await agent.save();
    if (agent.telephonyConfigId) {
      await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
      await agent.save();
    }
    const runtimeSync = await syncAgentDograhRuntime(agent);
    if (runtimeSync?.providerResult) providerResult = runtimeSync.providerResult;
    voiceConfiguration = runtimeSync?.voiceConfiguration || voiceConfiguration;
    llmConfiguration = runtimeSync?.llmConfiguration || llmConfiguration;
    const runtimeSyncWarning = runtimeSync?.error ? `Dograh runtime synchronization did not complete: ${runtimeSync.error}` : null;
    const refreshedAfterRuntimeSync = await Agent.findById(agent._id);
    if (refreshedAfterRuntimeSync) agent.set(refreshedAfterRuntimeSync.toObject());
    const imageResult = await tryGenerateImageForAgent(agent, "create");
    if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
    if (imageResult?.agent) agent.set(imageResult.agent.toObject());

    const creationWarnings = [
      runtimeSyncWarning,
      agent.dograhWorkflowUuid ? null : "Dograh workflow created but workflow UUID was not found in response.",
      ["failed", "configuration_required"].includes(voiceConfiguration?.dograhSyncStatus)
        ? `Dograh voice synchronization did not complete: ${voiceConfiguration.dograhSyncError || "Check the selected provider configuration."}`
        : null,
      ["failed", "configuration_required"].includes(llmConfiguration?.dograhSyncStatus)
        ? `Dograh LLM synchronization did not complete: ${llmConfiguration.dograhSyncError || "Check the selected provider configuration."}`
        : null,
      imageWarning
    ].filter(Boolean);

    return res.status(201).json({
      agent,
      voiceConfiguration,
      llmConfiguration,
      providerResult: publicProviderResult(providerResult),
      dograhCreated: true,
      dograhResponse: null,
      warning: creationWarnings.length ? creationWarnings.join(" ") : null
    });
  }

  if (agent.provider === "vapi") {
    await agent.save();
    if (voiceConfigurationInput) {
      voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
      await agent.save();
    }
    if (llmConfigurationInput) {
      llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
      await agent.save();
    }
    if (agent.telephonyConfigId) {
      await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
      await agent.save();
    }

    // Auto-create the Vapi assistant so the agent can place calls immediately (VapiProvider.startCall
    // requires providerAgentId). syncProvider persists providerAgentId/providerWorkflowId. Mirrors
    // how the Dograh branch above creates its workflow on agent creation.
    let providerResult = null;
    let vapiWarning = null;
    try {
      providerResult = await syncProvider(agent, "create");
    } catch (error) {
      console.error("Vapi assistant creation failed:", error.message);
      agent.status = "draft";
      await agent.save();
      vapiWarning = `Agent created locally, but Vapi assistant creation failed (${error.message}). Set VAPI_PRIVATE_KEY, then re-sync the agent.`;
    }

    const imageResult = await tryGenerateImageForAgent(agent, "create");
    if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
    if (imageResult?.agent) agent.set(imageResult.agent.toObject());

    return res.status(201).json({
      agent,
      voiceConfiguration,
      llmConfiguration,
      providerResult: providerResult ? publicProviderResult(providerResult) : null,
      dograhCreated: false,
      dograhResponse: null,
      warning: [vapiWarning, imageWarning].filter(Boolean).join(" ") || null
    });
  }

  await agent.save();
  if (voiceConfigurationInput) {
    voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
    await agent.save();
  }
  if (llmConfigurationInput) {
    llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
    await agent.save();
  }
  if (agent.telephonyConfigId) {
    await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
    await agent.save();
  }

  try {
    const providerResult = await syncProvider(agent, "create");

    const dograhCreated = false;
    const imageResult = await tryGenerateImageForAgent(agent, "create");
    if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
    if (imageResult?.agent) agent.set(imageResult.agent.toObject());

    return res.status(201).json({
      agent,
      voiceConfiguration,
      llmConfiguration,
      providerResult: publicProviderResult(providerResult),
      dograhCreated,
      dograhResponse: null,
      warning: imageWarning
    });
  } catch (error) {
    agent.status = "draft";
    await agent.save();
    const imageResult = await tryGenerateImageForAgent(agent, "create-after-provider-failure");
    if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
    if (imageResult?.agent) agent.set(imageResult.agent.toObject());

    return res.status(201).json({
      agent,
      voiceConfiguration,
      llmConfiguration,
      providerResult: null,
      dograhCreated: false,
      warning: [`Agent created locally, but ${agent.provider} provider creation failed. ${error.message}`, imageWarning].filter(Boolean).join(" "),
      error: error.message
    });
  }
});

export const listAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({
    ...userFilter(req),
    status: { $ne: "archived" }
  }).sort({ createdAt: -1 });
  res.json(agents);
});

export const listBioPageTemplates = asyncHandler(async (req, res) => {
  res.json(BIO_PAGE_TEMPLATES);
});

export const getBioPage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const bioPage = ensureBioPage(agent);
  if (!agent.bioPage || !agent.bioPage.updatedAt) {
    agent.bioPage = bioPage;
    await agent.save();
  }
  res.json({ agentId: agent._id, publicSlug: agent.publicSlug, bioPage });
});

export const updateBioPage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const current = ensureBioPage(agent);
  const patch = sanitizeBioPagePatch(req.body);
  const templatePatch = patch.template ? templateDefaults(patch.template) : {};
  agent.bioPage = {
    ...current,
    ...templatePatch,
    ...patch,
    businessInfo: { ...current.businessInfo, ...(patch.businessInfo || {}) },
    socialLinks: { ...current.socialLinks, ...(patch.socialLinks || {}) }
  };
  agent.publicTitle = agent.bioPage.headline || agent.publicTitle;
  agent.publicDescription = agent.bioPage.subheadline || agent.publicDescription;
  agent.publicWelcomeMessage = agent.bioPage.welcomeMessage || agent.publicWelcomeMessage;
  await agent.save();
  res.json({ success: true, agentId: agent._id, publicSlug: agent.publicSlug, bioPage: agent.bioPage });
});

export const resetBioPage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  agent.bioPage = defaultBioPage(agent);
  await agent.save();
  res.json({ success: true, bioPage: agent.bioPage });
});

export const publishBioPage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  agent.bioPage = { ...ensureBioPage(agent), isPublished: true, updatedAt: new Date() };
  agent.isPublic = true;
  await agent.save();
  res.json({ success: true, bioPage: agent.bioPage });
});

export const unpublishBioPage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  agent.bioPage = { ...ensureBioPage(agent), isPublished: false, updatedAt: new Date() };
  await agent.save();
  res.json({ success: true, bioPage: agent.bioPage });
});

export const uploadBioPageLogo = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const logoUrl = await saveBioAsset({ req, agent, kind: "logo" });
  agent.bioPage = { ...ensureBioPage(agent), logoUrl, updatedAt: new Date() };
  await agent.save();
  res.status(201).json({ success: true, logoUrl, bioPage: agent.bioPage });
});

export const uploadBioPageCover = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const coverImageUrl = await saveBioAsset({ req, agent, kind: "cover" });
  agent.bioPage = { ...ensureBioPage(agent), coverImageUrl, updatedAt: new Date() };
  await agent.save();
  res.status(201).json({ success: true, coverImageUrl, bioPage: agent.bioPage });
});

export const uploadBioPageAgentImage = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const agentImageUrl = await saveBioAsset({ req, agent, kind: "agent" });
  agent.bioPage = { ...ensureBioPage(agent), agentImageUrl, updatedAt: new Date() };
  await agent.save();
  res.status(201).json({ success: true, agentImageUrl, bioPage: agent.bioPage });
});

export const uploadBioPageTopicIcon = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const iconImageUrl = await saveBioAsset({ req, agent, kind: "topic-icon" });
  res.status(201).json({ success: true, iconImageUrl });
});

export const uploadAgentAvatar = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const contentType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
  const allowed = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const ext = allowed[contentType];
  if (!ext) throw new ApiError(400, "Avatar must be png, jpg, or webp.");
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ApiError(400, "Avatar file is required.");
  if (req.body.length > 2 * 1024 * 1024) throw new ApiError(400, "Avatar file must be under 2 MB.");

  const uploadDir = path.resolve("uploads", "agents", String(agent._id));
  await fs.mkdir(uploadDir, { recursive: true });

  // Delete old avatar file if present
  if (agent.avatarImagePath) {
    const rel = agent.avatarImagePath.replace(/^\//, "");
    fs.unlink(path.resolve(rel)).catch(() => {});
  }

  const fileName = `avatar-${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, req.body);

  const avatarImagePath = `/uploads/agents/${agent._id}/${fileName}`;
  agent.avatarImagePath = avatarImagePath;
  await agent.save();

  res.status(201).json({ success: true, avatarImagePath });
});

export const deleteAgentAvatar = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (agent.avatarImagePath) {
    const rel = agent.avatarImagePath.replace(/^\//, "");
    fs.unlink(path.resolve(rel)).catch(() => {});
    agent.avatarImagePath = null;
    await agent.save();
  }

  res.json({ success: true });
});

export const getAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const [recentCalls, recentLeads] = await Promise.all([
    CallLog.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5),
    Lead.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5)
  ]);
  const [voiceConfiguration, llmConfiguration] = await Promise.all([
    getAgentVoiceConfiguration({ userId: agent.userId, agent }),
    getAgentLLMConfiguration({ userId: agent.userId, agent })
  ]);

  res.json({ agent, recentCalls, recentLeads, voiceConfiguration, llmConfiguration });
});

export const updateAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "agentId is required");
  }

  const agent = await getOwnedAgent(req);
  const agentBeforeUpdate = agent.toObject();
  const voiceConfigurationInput = req.body.voiceConfiguration || null;
  const llmConfigurationInput = req.body.llmConfiguration || null;
  const body = sanitizeAgentBody(req.body);
  const allowedFields = [
    "agentName",
    "name",
    "description",
    "agentType",
    "businessName",
    "businessCategory",
    "businessDescription",
    "businessWebsite",
    "businessLocation",
    "workingHours",
    "contactNumber",
    "services",
    "pricing",
    "faqs",
    "policies",
    "offers",
    "additionalInfo",
    "leadQuestions",
    "systemPrompt",
    "greetingMessage",
    "fallbackMessage",
    "endingMessage",
    "humanTransferMessage",
    "language",
    "responseStyle",
    "callMode",
    "allowInterruption",
    "fastReplyMode",
    "leadCaptureEnabled",
    "voiceGender",
    "voiceStyle",
    "voiceProvider",
    "voiceId",
    "llmProvider",
    "llmModel",
    "sttProvider",
    "sttModel",
    "sttLanguage",
    "sttSettings",
    "ttsProvider",
    "ttsModel",
    "ttsLanguage",
    "ttsSettings",
    "firstMessage",
    "voiceSpeed",
    "voice",
    "nodes",
    "workflowNodes",
    "tools",
    "settings",
    "knowledgeBaseIds",
    "telephonyConfigId",
    "provider",
    "vapiPhoneNumberId",
    "imageMode",
    "imageUrl",
    "tone",
    "speakingSpeed",
    "personality",
    "mainGoal",
    "secondaryGoal",
    "avoidInstructions",
    "confusedInstructions",
    "bio"
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) agent[field] = body[field];
  }

  // Enforce bio max-length server-side even if client skips it
  if (agent.bio && agent.bio.length > 500) {
    throw new ApiError(400, "Bio must be 500 characters or fewer.");
  }

  agent.agentName = agent.agentName || agent.name;
  agent.name = agent.name || agent.agentName;
  agent.description = agent.description || agent.businessDescription;

  if (body.regeneratePrompt === true) {
    agent.systemPrompt = generateSystemPrompt(agent);
  } else if (body.systemPrompt !== undefined) {
    agent.systemPrompt = body.systemPrompt;
  }

  let voiceConfiguration = null;
  if (voiceConfigurationInput) {
    const cleanVoiceConfiguration = sanitizeVoiceConfiguration(voiceConfigurationInput, agent);
    applyVoiceConfigurationToAgent(agent, cleanVoiceConfiguration);
  }
  let llmConfiguration = null;
  if (llmConfigurationInput) {
    const cleanLLMConfiguration = sanitizeLLMConfiguration(llmConfigurationInput, agent);
    await validateLLMConfigurationOwnership({ userId: agent.userId, config: cleanLLMConfiguration });
    applyLLMConfigurationToAgent(agent, cleanLLMConfiguration);
  }

  validateEditableAgentFields(agent);
  if (Object.prototype.hasOwnProperty.call(body, "telephonyConfigId")) {
    await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
  }

  const shouldSyncDograhWorkflow =
    agent.provider === "dograh" &&
    hasRealDograhWorkflow(agent) &&
    workflowLinkedFieldsChanged(agentBeforeUpdate, agent);

  if (shouldSyncDograhWorkflow) {
    agent.workflowSyncStatus = "syncing";
    agent.workflowSyncError = undefined;
    agent.dograhSyncStatus = "Workflow Syncing";
    agent.dograhStatus = "syncing";
    agent.dograhNeedsUpdate = false;
    agent.workflowVersion = (agent.workflowVersion || 0) + 1;
  }

  await agent.save();

  let providerResult = null;
  let workflowSyncQueued = shouldSyncDograhWorkflow;
  let runtimeSyncWarning = null;

  if (voiceConfigurationInput) {
    voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
    await agent.save();
  }
  if (llmConfigurationInput) {
    llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
    await agent.save();
  }

  const shouldSyncRuntimeNow =
    agent.provider === "dograh" &&
    hasRealDograhWorkflow(agent) &&
    (voiceConfigurationInput || llmConfigurationInput || shouldSyncDograhWorkflow);

  if (shouldSyncRuntimeNow) {
    const runtimeSync = await syncAgentDograhRuntime(agent);
    providerResult = runtimeSync?.providerResult || providerResult;
    voiceConfiguration = runtimeSync?.voiceConfiguration || voiceConfiguration;
    llmConfiguration = runtimeSync?.llmConfiguration || llmConfiguration;
    workflowSyncQueued = false;
    runtimeSyncWarning = runtimeSync?.error ? `Dograh runtime synchronization did not complete: ${runtimeSync.error}` : null;
    const refreshedAgent = await Agent.findById(agent._id);
    if (refreshedAgent) {
      agent.set(refreshedAgent.toObject());
    }
  }

  if (body.syncProvider === true) {
    if (agent.provider === "dograh" && hasRealDograhWorkflow(agent)) {
      agent.workflowSyncStatus = "syncing";
      agent.workflowSyncError = undefined;
      agent.dograhSyncStatus = "Workflow Syncing";
      agent.dograhStatus = "syncing";
      agent.dograhNeedsUpdate = false;
      agent.workflowVersion = (agent.workflowVersion || 0) + 1;
      await agent.save();
      const runtimeSync = await syncAgentDograhRuntime(agent);
      providerResult = runtimeSync?.providerResult || providerResult;
      voiceConfiguration = runtimeSync?.voiceConfiguration || voiceConfiguration;
      llmConfiguration = runtimeSync?.llmConfiguration || llmConfiguration;
      workflowSyncQueued = false;
      runtimeSyncWarning = runtimeSync?.error ? `Dograh runtime synchronization did not complete: ${runtimeSync.error}` : runtimeSyncWarning;
      const refreshedAgent = await Agent.findById(agent._id);
      if (refreshedAgent) {
        agent.set(refreshedAgent.toObject());
      }
    } else {
      providerResult = await syncProvider(agent, "update", {
        createIfMissing: Boolean(body.createIfMissing)
      });
    }
  }

  const voiceSyncWarning = ["failed", "configuration_required"].includes(voiceConfiguration?.dograhSyncStatus)
    ? `Agent saved, but Dograh voice synchronization did not complete: ${voiceConfiguration.dograhSyncError || "Check the selected provider configuration."}`
    : null;
  const llmSyncWarning = ["failed", "configuration_required"].includes(llmConfiguration?.dograhSyncStatus)
    ? `Agent saved, but Dograh LLM synchronization did not complete: ${llmConfiguration.dograhSyncError || "Check the selected provider configuration."}`
    : null;

  res.json({
    success: true,
    message: providerResult
      ? "Agent saved locally and provider synced successfully."
      : workflowSyncQueued
        ? "Agent saved. Dograh workflow sync started."
        : "Agent saved.",
    warning: [runtimeSyncWarning, voiceSyncWarning, llmSyncWarning].filter(Boolean).join(" ") || null,
    providerResult: publicProviderResult(providerResult),
    voiceConfiguration,
    llmConfiguration,
    workflowSyncQueued,
    agent
  });
});

export const updateShareSettings = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  const allowedFields = [
    "isPublic",
    "publicChatEnabled",
    "publicWebCallEnabled",
    "publicTitle",
    "publicDescription",
    "publicWelcomeMessage"
  ];

  if (!agent.publicSlug) {
    agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);
  }

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) agent[field] = req.body[field];
  }

  await agent.save();

  res.json({
    success: true,
    agent
  });
});

export const previewRegeneratedPrompt = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const previewAgent = { ...agent.toObject(), ...req.body };
  const systemPrompt = generateSystemPrompt(previewAgent);

  res.json({ systemPrompt });
});

export const generateAgentImageForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  try {
    const result = await applyGeneratedAgentImage(agent);
    return res.json({
      success: true,
      agent: result.agent,
      imageUrl: result.image.imageUrl,
      imagePrompt: result.image.imagePrompt,
      imageProvider: result.image.imageProvider,
      imageGeneratedAt: result.image.imageGeneratedAt
    });
  } catch (error) {
    console.error("[agent-image] manual generation failed", {
      agentId: agent._id?.toString(),
      message: error?.message
    });
    return res.json({
      success: false,
      fallbackUsed: true,
      message: "Image generation failed. Default avatar used.",
      agent
    });
  }
});

export const backfillAgentImages = asyncHandler(async (req, res) => {
  const delayMs = Math.max(0, Math.min(Number(req.body?.delayMs ?? 1500), 10000));
  const retryAttempts = Math.max(1, Math.min(Number(req.body?.retryAttempts ?? 3), 5));
  const agents = await Agent.find({ status: { $ne: "archived" } }).sort({ createdAt: 1 });
  const result = {
    totalAgentsChecked: agents.length,
    imagesGenerated: 0,
    failed: 0,
    skipped: 0
  };
  const failures = [];

  for (const agent of agents) {
    if (agent.imageUrl) {
      result.skipped += 1;
      continue;
    }

    try {
      await generateImageWithRetry(agent, { attempts: retryAttempts, delayMs });
      result.imagesGenerated += 1;
    } catch (error) {
      result.failed += 1;
      failures.push({
        agentId: agent._id,
        agentName: agent.agentName || agent.name,
        message: error?.message || "Image generation failed"
      });
      console.error("[agent-image] backfill failed", {
        agentId: agent._id.toString(),
        message: error?.message
      });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  res.json({
    success: true,
    ...result,
    count: {
      totalAgentsChecked: result.totalAgentsChecked,
      imagesGenerated: result.imagesGenerated,
      failed: result.failed,
      skipped: result.skipped
    },
    failures
  });
});

export const removeAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "Agent ID is required");
  }

  const agent = await getOwnedAgent(req);

  console.log("Archiving agent with provider sync:", {
    agentId: agent._id.toString(),
    provider: agent.provider,
    providerWorkflowId: agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId
  });

  const providerResult = await syncProvider(agent, "archive");

  console.log("Provider workflow archived successfully:", {
    agentId: agent._id.toString(),
    provider: agent.provider,
    providerWorkflowId: agent.providerWorkflowId
  });

  agent.status = "archived";
  agent.archivedAt = new Date();
  await agent.save();

  res.json({
    success: true,
    message: "Agent archived and provider workflow archived successfully",
    providerResult: publicProviderResult(providerResult),
    agent
  });
});

export const testAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const { message } = req.body;

  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const aiResponse = await generateAgentTextReply({
    systemPrompt: agent.systemPrompt,
    message,
    agent,
  });

  res.json({
    success: true,
    message,
    response: aiResponse,
  });
});

export const testChatAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const { message, conversationId } = req.body;

  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const reply = await runCustomAgent({
    systemPrompt: agent.systemPrompt,
    userMessage: message,
    conversationId: conversationId || `agent:${agent._id.toString()}:test-chat`,
    tools: agent.tools,
    settings: agent.settings,
    agent
  });

  res.json({
    success: true,
    reply,
    response: reply
  });
});

export const publishAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.agentName || !agent.businessName || !agent.systemPrompt) {
    throw new ApiError(400, "Agent is missing required fields");
  }

  if (agent.provider === "dograh" && !hasRealDograhWorkflow(agent)) {
    throw new ApiError(400, "Dograh workflow sync must finish before publishing this agent.");
  }

  // Publish uses the same resolved TTS/STT/LLM configuration as Test/Outbound/Scheduled
  // calls, so block publishing an agent whose BYOK voice or LLM sync did not complete.
  await assertDograhAgentReadyForCalls({ agent, userId: agent.userId });

  agent.status = "Active";
  if (!agent.publicSlug) {
    agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);
  }
  agent.isPublic = true;
  agent.shareableLink = `${process.env.CLIENT_URL}/a/${agent.publicSlug}`;
  agent.embedCode = `<script src="${process.env.CLIENT_URL}/widget.js" data-agent-id="${agent._id}"></script>`;

  await agent.save();

  res.json(agent);
});

export const pauseAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  agent.status = "Paused";
  await agent.save();

  res.json(agent);
});

export const connectDograhWorkflow = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const {
    dograhWorkflowId,
    dograhWorkflowUuid,
    dograhWorkflowName,
    connectedPhoneNumber,
    callerIdNumber,
    telephonyProvider,
  } = req.body;

  if (!dograhWorkflowId || !dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "Dograh workflow ID and workflow UUID are required"
    );
  }

  assertE164(connectedPhoneNumber, "Connected phone number");
  assertE164(callerIdNumber, "Caller ID number");

  agent.dograhWorkflowId = dograhWorkflowId;
  agent.dograhAgentId = dograhWorkflowId;
  agent.provider = "dograh";
  if (!agent.dograhConnectionType) {
    const binding = await resolveRequestedDograhBinding(req.user._id, req.body);
    agent.dograhConnectionType = binding.dograhConnectionType;
    agent.dograhIntegrationId = binding.dograhIntegrationId;
  }
  agent.providerWorkflowId = dograhWorkflowId;
  agent.providerAgentId = agent.providerAgentId || dograhWorkflowId;
  agent.dograhWorkflowUuid = dograhWorkflowUuid;
  agent.dograhWorkflowName = dograhWorkflowName;
  agent.connectedPhoneNumber = connectedPhoneNumber;
  agent.callerIdNumber = callerIdNumber;
  agent.telephonyProvider = telephonyProvider || "twilio";
  agent.dograhStatus = "connected";
  agent.workflowStatus = "connected";
  agent.workflowSyncStatus = "synced";
  agent.workflowLastSyncedAt = new Date();
  agent.dograhSyncStatus = "Workflow Synced";
  agent.dograhConnection = "Connected";
  agent.dograhError = undefined;
  agent.dograhNeedsUpdate = false;
  agent.status = "Connected";

  await agent.save();

  res.json(agent);
});

export const createDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);

  if (agent.provider === "vapi") {
    if (!process.env.VAPI_PUBLIC_KEY?.trim()) {
      throw new ApiError(500, "Vapi web calling is not configured: VAPI_PUBLIC_KEY is missing.", {
        code: "VAPI_PUBLIC_KEY_MISSING",
        userMessage: "Vapi web calling is not configured yet. Add VAPI_PUBLIC_KEY, then try again."
      });
    }

    let providerResult = null;
    if (!agent.providerAgentId) {
      try {
        providerResult = await syncProvider(agent, "update", { createIfMissing: true });
      } catch (error) {
        throw new ApiError(error.statusCode || 502, error.safeMessage || error.message || "Vapi assistant could not be created.", {
          code: "VAPI_ASSISTANT_NOT_READY",
          userMessage: error.safeMessage || error.message || "Vapi assistant could not be created. Check Vapi settings, then try again."
        });
      }
    }

    agent.publicWebCallEnabled = true;
    agent.dograhWidgetEnabled = false;
    agent.dograhEmbedToken = undefined;
    await agent.save();

    return res.json({
      success: true,
      webCallProvider: "vapi",
      publicWebCallEnabled: true,
      dograhWidgetEnabled: false,
      providerResult: publicProviderResult(providerResult),
      agent
    });
  }

  const workflowId = getAgentDograhWorkflowId(agent);

  if (!workflowId) {
    throw new ApiError(400, "Dograh workflow sync must finish before enabling web calling. Save or re-sync the agent, then try again.", {
      code: "DOGRAH_WORKFLOW_REQUIRED",
      userMessage: "Dograh workflow sync must finish before enabling web calling. Save or re-sync the agent, then try again."
    });
  }

  let voiceRuntime;
  try {
    voiceRuntime = await assertDograhVoiceReadyForWebCall({ agent, userId: agent.userId });
  } catch (error) {
    throw new ApiError(400, error.safeMessage || error.message || "Dograh voice settings are not verified yet.", {
      code: "DOGRAH_VOICE_NOT_VERIFIED",
      userMessage: error.safeMessage || error.message || "Dograh voice settings are not verified yet.",
      voiceRuntime: error.runtime || null
    });
  }
  const llmRuntime = await getDograhLLMRuntimeSummary({ agent, userId: agent.userId });
  if (llmRuntime.requiresSync && llmRuntime.dograhSyncStatus !== "synced") {
    throw new ApiError(400, llmRuntime.dograhSyncError || "Web calling is waiting for Dograh LLM synchronization.", {
      code: "DOGRAH_LLM_NOT_VERIFIED",
      userMessage: llmRuntime.dograhSyncError || "Web calling is waiting for Dograh LLM synchronization.",
      llmRuntime
    });
  }
  const { embedToken } = await createDograhEmbedToken(workflowId, { userId: agent.userId, agent });
  agent.dograhEmbedToken = embedToken;
  agent.dograhWidgetEnabled = true;
  agent.publicWebCallEnabled = true;
  await agent.save();

  res.json({
    success: true,
    webCallProvider: "dograh",
    publicWebCallEnabled: true,
    embedToken,
    voiceRuntime,
    llmRuntime,
    agent
  });
});

export const getDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  if (agent.provider === "vapi") {
    return res.json({
      success: true,
      webCallProvider: "vapi",
      publicWebCallEnabled: Boolean(agent.publicWebCallEnabled && agent.providerAgentId),
      dograhWidgetEnabled: false,
      providerAgentId: agent.providerAgentId || null,
      embedToken: null
    });
  }
  const voiceRuntime = await getDograhVoiceRuntimeSummary({ agent, userId: agent.userId });
  const llmRuntime = await getDograhLLMRuntimeSummary({ agent, userId: agent.userId });

  res.json({
    success: true,
    webCallProvider: "dograh",
    publicWebCallEnabled: Boolean(agent.publicWebCallEnabled && agent.dograhWidgetEnabled && agent.dograhEmbedToken),
    embedToken: agent.dograhEmbedToken || null,
    dograhWidgetEnabled: Boolean(agent.dograhWidgetEnabled && agent.dograhEmbedToken),
    voiceRuntime,
    llmRuntime
  });
});

export const deleteDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  if (agent.provider === "vapi") {
    agent.publicWebCallEnabled = false;
    await agent.save();

    return res.json({
      success: true,
      webCallProvider: "vapi",
      publicWebCallEnabled: false,
      dograhWidgetEnabled: false,
      embedToken: null,
      agent
    });
  }
  const workflowId = getAgentDograhWorkflowId(agent);

  if (!workflowId) {
    throw new ApiError(400, "dograhWorkflowId is required before disabling Dograh web calling.");
  }

  await deleteDograhEmbedToken(workflowId, { userId: agent.userId, agent });
  agent.dograhEmbedToken = undefined;
  agent.dograhWidgetEnabled = false;
  agent.publicWebCallEnabled = false;
  await agent.save();

  res.json({
    success: true,
    embedToken: null,
    agent
  });
});

export const createDograhWorkflowForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (hasRealDograhWorkflow(agent)) {
    if (agent.workflowStatus !== "connected" || agent.dograhStatus !== "connected") {
      agent.workflowStatus = "connected";
      agent.workflowSyncStatus = "synced";
      agent.dograhStatus = "connected";
      agent.dograhSyncStatus = "Workflow Synced";
      agent.dograhConnection = "Connected";
      agent.dograhNeedsUpdate = false;
      await agent.save();
    }

    return res.json({
      agent,
      dograhCreated: true,
      providerResult: {
        provider: "dograh",
        providerWorkflowId: agent.providerWorkflowId || agent.dograhWorkflowId,
        providerAgentId: agent.providerAgentId || agent.dograhAgentId,
        dograhWorkflowId: agent.dograhWorkflowId,
        dograhWorkflowUuid: agent.dograhWorkflowUuid,
        dograhWorkflowName: agent.dograhWorkflowName,
        dograhAgentId: agent.dograhAgentId,
        status: "already_connected"
      },
      dograhResponse: null,
      warning: null,
      message: "Dograh workflow is already connected."
    });
  }

  if (!agent.systemPrompt) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }

  agent.provider = "dograh";
  agent.callerIdNumber =
    agent.callerIdNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER;

  agent.connectedPhoneNumber =
    agent.connectedPhoneNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER;

  agent.telephonyProvider =
    agent.telephonyProvider ||
    process.env.DEFAULT_TELEPHONY_PROVIDER ||
    "twilio";
  agent.providerWorkflowId = null;
  agent.providerAgentId = null;
  agent.dograhWorkflowId = null;
  agent.dograhWorkflowUuid = null;
  agent.dograhWorkflowName = null;
  agent.dograhAgentId = null;
  agent.workflowStatus = "creating";
  agent.workflowSyncStatus = "syncing";
  agent.workflowSyncError = undefined;
  agent.dograhStatus = "creating";
  agent.dograhSyncStatus = "Workflow Creating";
  agent.dograhConnection = "Creating";
  agent.dograhError = undefined;
  await agent.save();

  try {
    const providerResult = await syncProvider(agent, "update", { createIfMissing: true });
    const updatedAgent = await Agent.findById(agent._id);

    return res.json({
      agent: updatedAgent || agent,
      dograhCreated: hasRealDograhWorkflow(updatedAgent || agent),
      providerResult: publicProviderResult(providerResult),
      dograhResponse: null,
      warning: hasRealDograhWorkflow(updatedAgent || agent) ? null : "Dograh workflow synced but workflow ID was not found in response."
    });
  } catch (error) {
    console.error("Dograh workflow creation failed:", error.message);
    clearDograhWorkflowFields(agent, readProviderErrorMessage(error));
    await agent.save();

    return res.status(502).json({
      agent,
      dograhCreated: false,
      error: agent.dograhError,
      dograhError: agent.dograhError
    });
  }
});

export const updateDograhWorkflowForAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "agentId is required");
  }

  const agent = await getOwnedAgent(req);
  agent.provider = "dograh";
  agent.providerWorkflowId = hasRealDograhWorkflow(agent) ? (agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId) : null;
  const workflowId = agent.providerWorkflowId;

  if (!workflowId) {
    throw new ApiError(400, "Cannot update Dograh workflow because this agent is not connected. Use Retry Workflow Sync first.");
  }

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }
  agent.callerIdNumber = agent.callerIdNumber || process.env.DEFAULT_CALLER_ID_NUMBER;
  agent.connectedPhoneNumber = agent.connectedPhoneNumber || process.env.DEFAULT_CALLER_ID_NUMBER;
  agent.telephonyProvider = agent.telephonyProvider || process.env.DEFAULT_TELEPHONY_PROVIDER || "twilio";
  await agent.save();

  try {
    console.log("[Dograh Runtime Sync]", {
      agentId: agent._id.toString(),
      provider: "dograh",
      providerWorkflowId: workflowId,
      action: "manual_update"
    });

    const runtimeSync = await syncAgentDograhRuntime(agent);
    if (runtimeSync?.error) {
      throw new ApiError(400, runtimeSync.error);
    }
    const updatedAgent = await Agent.findById(agent._id);

    res.json({
      agent: updatedAgent || agent,
      dograhUpdated: Boolean((updatedAgent || agent).dograhWorkflowUuid),
      providerResult: publicProviderResult(runtimeSync?.providerResult),
      voiceConfiguration: runtimeSync?.voiceConfiguration || null,
      llmConfiguration: runtimeSync?.llmConfiguration || null,
      verification: runtimeSync?.verification?.diagnostics || null,
      dograhResponse: null,
      success: true,
      message: "Dograh workflow runtime updated and verified successfully",
      workflowId,
      warning: (updatedAgent || agent).dograhWorkflowUuid ? null : "Dograh workflow updated but workflow UUID was not found in response."
    });
  } catch (error) {
    agent.dograhStatus = "update_failed";
    agent.workflowStatus = "failed";
    agent.workflowSyncStatus = "failed";
    agent.workflowSyncError = error.message;
    agent.dograhSyncStatus = hasRealDograhWorkflow(agent) ? "Workflow Needs Update" : "Workflow Failed";
    agent.dograhError = error.message;
    agent.dograhNeedsUpdate = true;
    await agent.save();

    res.status(502).json({
      agent,
      dograhUpdated: false,
      error: error.message
    });
  }
});

export const syncProviderForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    agent.systemPrompt = generateSystemPrompt(agent);
    await agent.save();
  }

  const providerWorkflowId = hasRealDograhWorkflow(agent) ? (agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId) : null;
  const createIfMissing = Boolean(req.body?.createIfMissing);

  if (agent.provider === "dograh" && providerWorkflowId) {
    agent.workflowSyncStatus = "syncing";
    agent.workflowSyncError = undefined;
    agent.dograhSyncStatus = "Runtime Syncing";
    agent.dograhStatus = "syncing";
    agent.dograhNeedsUpdate = false;
    agent.workflowVersion = (agent.workflowVersion || 0) + 1;
    await agent.save();
    const runtimeSync = await syncAgentDograhRuntime(agent);
    const updatedAgent = await Agent.findById(agent._id);

    return res.json({
      success: !runtimeSync?.error,
      message: runtimeSync?.error ? `Dograh runtime sync failed: ${runtimeSync.error}` : "Dograh runtime sync completed and verified.",
      providerResult: publicProviderResult(runtimeSync?.providerResult),
      voiceConfiguration: runtimeSync?.voiceConfiguration || null,
      llmConfiguration: runtimeSync?.llmConfiguration || null,
      verification: runtimeSync?.verification?.diagnostics || null,
      workflowSyncQueued: false,
      agent: updatedAgent || agent
    });
  }

  if (agent.provider !== "custom" && !providerWorkflowId && !createIfMissing) {
    throw new ApiError(
      400,
      "Provider workflow ID missing. Enable createIfMissing to create a new provider workflow."
    );
  }

  const providerResult = await syncProvider(agent, "update", { createIfMissing });

  res.json({
    success: true,
    message: "Provider synced successfully",
    providerResult: publicProviderResult(providerResult),
    agent
  });
});

export const syncDograhRuntimeForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (agent.provider !== "dograh" || !hasRealDograhWorkflow(agent)) {
    throw new ApiError(400, "Dograh workflow must be connected before runtime verification.");
  }

  agent.workflowSyncStatus = "syncing";
  agent.workflowSyncError = undefined;
  agent.dograhSyncStatus = "Runtime Syncing";
  agent.dograhStatus = "syncing";
  agent.dograhNeedsUpdate = false;
  agent.workflowVersion = (agent.workflowVersion || 0) + 1;
  await agent.save();

  const runtimeSync = await syncAgentDograhRuntime(agent);
  const updatedAgent = await Agent.findById(agent._id);

  res.json({
    success: !runtimeSync?.error,
    message: runtimeSync?.error ? `Dograh runtime sync failed: ${runtimeSync.error}` : "Dograh runtime sync completed and verified.",
    providerResult: publicProviderResult(runtimeSync?.providerResult),
    voiceConfiguration: runtimeSync?.voiceConfiguration || null,
    llmConfiguration: runtimeSync?.llmConfiguration || null,
    verification: runtimeSync?.verification?.diagnostics || null,
    agent: updatedAgent || agent,
    warning: runtimeSync?.error || null
  });
});

export const getDograhBindingForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  res.json({
    success: true,
    binding: dograhBindingSummary(agent)
  });
});

export const updateDograhBindingForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  if (hasRealDograhWorkflow(agent)) {
    throw new ApiError(400, "Existing Dograh workflows must be migrated instead of changing the binding directly.", {
      code: "DOGRAH_WORKFLOW_ACCOUNT_MISMATCH"
    });
  }
  const binding = await resolveRequestedDograhBinding(agent.userId, req.body);
  agent.dograhConnectionType = binding.dograhConnectionType;
  agent.dograhIntegrationId = binding.dograhIntegrationId;
  await agent.save();
  res.json({ success: true, agent, binding: dograhBindingSummary(agent) });
});

export const getDograhMigrationStatus = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  const migration = await DograhAgentMigration.findOne({ agentId: agent._id, userId: agent.userId }).sort({ createdAt: -1 });
  res.json({ success: true, migration });
});

export const migrateDograhAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  if (agent.provider !== "dograh" || !hasRealDograhWorkflow(agent)) {
    throw new ApiError(400, "Dograh workflow must exist before migration.", { code: "DOGRAH_AGENT_BINDING_MISSING" });
  }

  const targetBinding = await resolveRequestedDograhBinding(agent.userId, {
    dograhConnectionType: req.body.targetConnectionType,
    dograhIntegrationId: req.body.targetIntegrationId
  });
  const sourceBinding = {
    dograhConnectionType: agent.dograhConnectionType || "platform",
    dograhIntegrationId: agent.dograhIntegrationId || null
  };

  if (
    sourceBinding.dograhConnectionType === targetBinding.dograhConnectionType &&
    String(sourceBinding.dograhIntegrationId || "") === String(targetBinding.dograhIntegrationId || "")
  ) {
    throw new ApiError(400, "Agent already uses the selected Dograh connection.");
  }

  let migration = await DograhAgentMigration.findOne({
    agentId: agent._id,
    userId: agent.userId,
    status: { $in: ["pending", "exporting", "creating_target", "syncing_models", "verifying"] }
  });
  if (!migration) {
    migration = await DograhAgentMigration.create({
      userId: agent.userId,
      agentId: agent._id,
      sourceConnectionType: sourceBinding.dograhConnectionType,
      sourceIntegrationId: sourceBinding.dograhIntegrationId,
      sourceWorkflowId: agent.dograhWorkflowId || agent.providerWorkflowId,
      sourceWorkflowUuid: agent.dograhWorkflowUuid || "",
      targetConnectionType: targetBinding.dograhConnectionType,
      targetIntegrationId: targetBinding.dograhIntegrationId,
      status: "pending"
    });
  }

  try {
    migration.status = "exporting";
    migration.errorSafeMessage = "";
    await migration.save();

    const sourceResolved = await getDograhClientForAgent(agent, agent.userId);
    await sourceResolved.client.get(`/workflow/fetch/${encodeURIComponent(agent.dograhWorkflowId || agent.providerWorkflowId)}`);

    let providerResult = null;
    if (!migration.targetWorkflowId) {
      migration.status = "creating_target";
      await migration.save();
      const targetAgent = {
        ...(agent.toObject ? agent.toObject() : agent),
        provider: "dograh",
        providerWorkflowId: null,
        dograhWorkflowId: null,
        dograhWorkflowUuid: null,
        dograhAgentId: null,
        dograhConnectionType: targetBinding.dograhConnectionType,
        dograhIntegrationId: targetBinding.dograhIntegrationId,
        userId: agent.userId,
        _id: agent._id
      };
      providerResult = await DograhProvider.create(targetAgent);
      migration.targetWorkflowId = providerResult.dograhWorkflowId || providerResult.providerWorkflowId;
      migration.targetWorkflowUuid = providerResult.dograhWorkflowUuid || "";
      await migration.save();
    }

    const migratedAgent = {
      ...(agent.toObject ? agent.toObject() : agent),
      provider: "dograh",
      providerWorkflowId: migration.targetWorkflowId,
      dograhWorkflowId: migration.targetWorkflowId,
      dograhWorkflowUuid: migration.targetWorkflowUuid,
      dograhConnectionType: targetBinding.dograhConnectionType,
      dograhIntegrationId: targetBinding.dograhIntegrationId,
      userId: agent.userId,
      _id: agent._id
    };

    migration.status = "syncing_models";
    await migration.save();
    const llmConfiguration = await syncAgentLLMConfigurationToDograh({ agent: migratedAgent, userId: agent.userId });
    const voiceConfiguration = await syncAgentVoiceConfigurationToDograh({ agent: migratedAgent, userId: agent.userId });
    const providerSyncErrors = [
      ["failed", "configuration_required"].includes(llmConfiguration?.dograhSyncStatus) ? llmConfiguration.dograhSyncError : "",
      ["failed", "configuration_required"].includes(voiceConfiguration?.dograhSyncStatus) ? voiceConfiguration.dograhSyncError : ""
    ].filter(Boolean);
    if (providerSyncErrors.length) throw new Error(providerSyncErrors.join(" "));

    migration.status = "verifying";
    await migration.save();
    const targetResolved = targetBinding.dograhConnectionType === "user_integration"
      ? await getDograhClientForIntegration(targetBinding.dograhIntegrationId, agent.userId)
      : getPlatformDograhClient();
    const verification = await verifyDograhWorkflowRuntime({
      agent: migratedAgent,
      userId: agent.userId,
      callType: "dograh_migration",
      fetchWorkflow: async () => {
        const response = await targetResolved.client.get(`/workflow/fetch/${encodeURIComponent(migration.targetWorkflowId)}`);
        return response.data;
      }
    });
    assertRuntimeVerification(verification);

    const updatedAgent = await Agent.findOneAndUpdate(
      { _id: agent._id, userId: agent.userId, dograhWorkflowId: agent.dograhWorkflowId },
      {
        $set: {
          dograhConnectionType: targetBinding.dograhConnectionType,
          dograhIntegrationId: targetBinding.dograhIntegrationId,
          providerWorkflowId: migration.targetWorkflowId,
          dograhWorkflowId: migration.targetWorkflowId,
          dograhWorkflowUuid: migration.targetWorkflowUuid,
          dograhWorkflowName: providerResult?.dograhWorkflowName || agent.dograhWorkflowName,
          workflowSyncStatus: "synced",
          dograhSyncStatus: "Runtime Synced",
          dograhStatus: "connected",
          dograhConnection: targetBinding.dograhConnectionType === "user_integration" ? "My Dograh" : "Platform Dograh",
          dograhNeedsUpdate: false,
          dograhLastSyncedAt: new Date(),
          workflowLastSyncedAt: new Date(),
          lastSyncedAt: new Date()
        },
        $unset: { workflowSyncError: "", dograhError: "", dograhEmbedToken: "" }
      },
      { new: true, runValidators: true }
    );
    if (!updatedAgent) throw new Error("Agent changed during migration. Please retry.");

    migration.status = "completed";
    migration.completedAt = new Date();
    await migration.save();

    res.json({
      success: true,
      migration,
      agent: updatedAgent,
      binding: dograhBindingSummary(updatedAgent),
      verification: verification.diagnostics || null
    });
  } catch (error) {
    migration.status = "failed";
    migration.errorSafeMessage = error?.safeMessage || error?.message || "Dograh migration failed.";
    await migration.save();
    throw new ApiError(502, migration.errorSafeMessage, { code: "DOGRAH_MIGRATION_FAILED" });
  }
});

async function triggerCall(req, res, trigger) {
  const agent = await getOwnedAgent(req);
  const { phoneNumber } = req.body;

  const result = await triggerOutboundCallForAgent({
    agent,
    userId: req.user._id,
    phoneNumber,
    trigger
  });

  res.status(202).json({
    dograhResponse: result.dograhResponse,
    callLog: result.publicCallLog
  });
}

export const triggerTestCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res, triggerDograhTestCallByWorkflow);
});

export const triggerOutboundCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res);
});

export const listAgentCalls = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const calls = await CallLog.find({
    agentId: agent._id,
    userId: agent.userId,
  }).sort({ createdAt: -1 });

  res.json(calls);
});
