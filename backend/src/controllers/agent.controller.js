import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import fs from "fs/promises";
import path from "path";
import Agent from "../models/Agent.js";
import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import AgentVoiceConfiguration from "../models/AgentVoiceConfiguration.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { generateAgentTextReply } from "../services/gemini.service.js";
import { generateSystemPrompt } from "../services/promptGenerator.js";
import { getProvider } from "../providers/index.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { triggerOutboundCallForAgent } from "../services/outboundCall.service.js";
import { normalizeApiKeyMode } from "../services/apiKeyMode.service.js";
import { toE164 } from "../utils/phone.js";
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
  BIO_PAGE_TEMPLATES,
  DEFAULT_QUICK_TOPICS,
  defaultBioPage,
  templateDefaults,
  resolveBioPage,
  isValidTemplateId,
  normalizeTemplateId,
  LAYOUT_VARIANTS,
  HERO_VARIANTS,
  CONTENT_WIDTHS,
  HERO_ALIGNMENTS,
  BACKGROUND_STYLES,
  SPACING_SCALES,
  CARD_SHADOWS,
  CARD_BORDERS,
  RADIUS_TOKENS,
  FONT_FAMILIES,
  HEADING_WEIGHTS,
  HEADING_TRACKINGS,
  BODY_SIZES,
  KNOWN_SECTIONS,
  FONT_STYLES,
  ANIMATIONS
} from "../services/bioPageTemplates.js";
import { applyGeneratedAgentImage, shouldGenerateAgentImage } from "../services/agentImage.service.js";

function userFilter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const BIO_COLOR_FIELDS = ["primaryColor", "backgroundColor", "textColor", "buttonColor", "cardColor", "accentColor", "mutedColor", "borderColor"];
const BIO_TEXT_FIELDS = ["headline", "subheadline", "welcomeMessage", "ctaText", "primaryCtaText", "secondaryCtaText", "voiceCallCtaText"];
// Constrained-value string fields: value is only accepted if it is in the allowed list,
// otherwise the field is silently dropped so an old/misbehaving client can't corrupt a page.
const BIO_ENUM_FIELDS = {
  fontStyle: FONT_STYLES,
  animation: ANIMATIONS,
  layoutVariant: LAYOUT_VARIANTS,
  heroVariant: HERO_VARIANTS,
  contentWidth: CONTENT_WIDTHS,
  heroAlignment: HERO_ALIGNMENTS,
  backgroundStyle: BACKGROUND_STYLES,
  spacingScale: SPACING_SCALES,
  cardShadow: CARD_SHADOWS,
  cardBorder: CARD_BORDERS,
  borderRadius: RADIUS_TOKENS,
  buttonRadius: RADIUS_TOKENS,
  headingFont: FONT_FAMILIES,
  bodyFont: FONT_FAMILIES,
  headingWeight: HEADING_WEIGHTS,
  headingTracking: HEADING_TRACKINGS,
  bodySize: BODY_SIZES
};
const BIO_STRING_FIELDS = [
  "template",
  "logoUrl",
  "coverImageUrl",
  "agentImageUrl",
  ...BIO_COLOR_FIELDS,
  ...Object.keys(BIO_ENUM_FIELDS),
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
  "showTopBar",
  "showLogo",
  "showAgentImage",
  "showCoverImage",
  "showQuickTopics",
  "isPublished"
];
const BIO_NESTED_TEXT_FIELDS = {
  businessInfo: ["businessName", "category", "location", "availability", "responseTime"],
  socialLinks: ["website", "instagram", "facebook", "whatsapp", "linkedin"]
};
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
  "apiKeyMode",
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

// Merges the saved bioPage with the selected template preset and shared defaults so the
// object is always complete (old pages saved before the template overhaul inherit real
// layout/typography values from their template rather than crashing on missing fields).
function ensureBioPage(agent) {
  return resolveBioPage(agent);
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

function sanitizeSectionOrder(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, "sectionOrder must be a list.");
  const seen = new Set();
  const cleaned = [];
  for (const raw of value) {
    const id = String(raw || "").trim();
    if (KNOWN_SECTIONS.includes(id) && !seen.has(id)) {
      seen.add(id);
      cleaned.push(id);
    }
  }
  // Always keep the hero and actions present so a bad order can't produce a blank page.
  if (!cleaned.includes("hero")) cleaned.unshift("hero");
  if (!cleaned.includes("actions")) cleaned.push("actions");
  return cleaned;
}

function sanitizeBioPagePatch(body = {}) {
  const patch = {};
  for (const field of BIO_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (BIO_TEXT_FIELDS.includes(field)) {
      patch[field] = sanitizeText(body[field]);
    } else if (BIO_ENUM_FIELDS[field]) {
      // Constrained token: accept only known values, otherwise silently ignore.
      const value = String(body[field] || "").trim();
      if (BIO_ENUM_FIELDS[field].includes(value)) patch[field] = value;
    } else {
      patch[field] = String(body[field] || "").trim().slice(0, 500);
    }
  }
  for (const field of BIO_COLOR_FIELDS) {
    if (patch[field] !== undefined && !HEX_COLOR.test(patch[field])) throw new ApiError(400, `${field} must be a safe hex color.`);
  }
  if (patch.template) {
    if (!isValidTemplateId(patch.template)) throw new ApiError(400, "Bio page template is not valid.");
    patch.template = normalizeTemplateId(patch.template);
  }
  const sectionOrder = sanitizeSectionOrder(body.sectionOrder);
  if (sectionOrder) patch.sectionOrder = sectionOrder;
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
  // Keep the voice-call toggle in sync across its three historical field names so the
  // public page and web-call gating all agree regardless of which one was sent.
  const voiceToggle = patch.showVoiceCallButton ?? patch.showWebCallButton ?? patch.showWebCall;
  if (voiceToggle !== undefined) {
    if (patch.showVoiceCallButton === undefined) patch.showVoiceCallButton = voiceToggle;
    if (patch.showWebCallButton === undefined) patch.showWebCallButton = voiceToggle;
    if (patch.showWebCall === undefined) patch.showWebCall = voiceToggle;
  }
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

  if (!agent.provider) {
    agent.provider = "vapi";
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

  return agent;
}

function publicProviderResult(result = null) {
  if (!result) return null;
  const { raw, ...safeResult } = result;
  return safeResult;
}

async function syncProvider(agent, action, { createIfMissing = false } = {}) {
  const providerName = agent.provider || "vapi";
  const providerWorkflowId = agent.providerWorkflowId || agent.workflowId;

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

  // Normalize the business contact number to E.164 so human call-forwarding can dial it reliably.
  // Non-destructive: only overwrite when normalization succeeds; otherwise keep the raw value and
  // forwarding simply stays off until it's valid.
  if (agent.contactNumber) {
    const normalized = toE164(agent.contactNumber);
    if (normalized) agent.contactNumber = normalized;
  }

  agent.apiKeyMode = normalizeApiKeyMode(req.body.apiKeyMode);
  if (agent.apiKeyMode === "default_system") {
    // DEFAULT SYSTEM: force platform_default everywhere and ignore any BYOK inputs.
    agent.llmProvider = "google_gemini"; // engine env fallback targets this
    agent.llmModel = "";                  // env GEMINI_MODEL is used
    agent.sttProvider = "platform_default";
    agent.ttsProvider = "platform_default";
    agent.voiceProvider = "Platform Default";
  } else if (!llmConfigurationInput || llmConfigurationInput.provider === "platform_default" || !llmConfigurationInput.integrationId) {
    // BYOK requires a real connected LLM account — block obviously-unconfigured setups here for
    // earlier, clearer feedback. The outbound pre-flight is the ultimate no-silent-fallback guard.
    throw new ApiError(400, "BYOK mode selected but no connected LLM account was chosen. Select an account or switch to Default System.", { code: "BYOK_NOT_CONFIGURED" });
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
  // A default_system agent never attaches BYOK voice/LLM integrations.
  if (agent.apiKeyMode !== "default_system" && voiceConfigurationInput) {
    const cleanVoiceConfiguration = sanitizeVoiceConfiguration(voiceConfigurationInput, agent);
    applyVoiceConfigurationToAgent(agent, cleanVoiceConfiguration);
  }
  if (agent.apiKeyMode !== "default_system" && llmConfigurationInput) {
    const cleanLLMConfiguration = sanitizeLLMConfiguration(llmConfigurationInput, agent);
    await validateLLMConfigurationOwnership({ userId: agent.userId, config: cleanLLMConfiguration });
    applyLLMConfigurationToAgent(agent, cleanLLMConfiguration);
  }
  await agent.validate();

  let voiceConfiguration = null;
  let llmConfiguration = null;

  if (agent.provider === "vapi") {
    await agent.save();
    if (agent.apiKeyMode !== "default_system" && voiceConfigurationInput) {
      voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
      await agent.save();
    }
    if (agent.apiKeyMode !== "default_system" && llmConfigurationInput) {
      llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
      await agent.save();
    }
    if (agent.telephonyConfigId) {
      await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
      await agent.save();
    }

    // Auto-create the Vapi assistant so the agent can place calls immediately (VapiProvider.startCall
    // requires providerAgentId). syncProvider persists providerAgentId/providerWorkflowId.
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
      warning: [vapiWarning, imageWarning].filter(Boolean).join(" ") || null
    });
  }

  await agent.save();
  if (agent.apiKeyMode !== "default_system" && voiceConfigurationInput) {
    voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
    await agent.save();
  }
  if (agent.apiKeyMode !== "default_system" && llmConfigurationInput) {
    llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
    await agent.save();
  }
  if (agent.telephonyConfigId) {
    await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
    await agent.save();
  }

  try {
    const providerResult = await syncProvider(agent, "create");

    const imageResult = await tryGenerateImageForAgent(agent, "create");
    if (imageResult?.error) imageWarning = imageGenerationWarning(imageResult.error);
    if (imageResult?.agent) agent.set(imageResult.agent.toObject());

    return res.status(201).json({
      agent,
      voiceConfiguration,
      llmConfiguration,
      providerResult: publicProviderResult(providerResult),
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
      warning: [`Agent created locally, but ${agent.provider} provider creation failed. ${error.message}`, imageWarning].filter(Boolean).join(" "),
      error: error.message
    });
  }
});

export const listAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({
    ...userFilter(req),
    status: { $ne: "archived" }
  }).sort({ createdAt: -1 }).lean();
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
  // Applying a template only re-applies the full preset (layout, typography, spacing, card
  // & button style, section order, CTA defaults, colors) when the template actually changes.
  // A normal save (same template) keeps the user's customizations instead of resetting them.
  const templateChanged = patch.template && patch.template !== current.template;
  const templatePatch = templateChanged ? templateDefaults(patch.template) : {};
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
    "apiKeyMode",
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

  // Normalize the business contact number to E.164 so human call-forwarding can dial it reliably.
  // Non-destructive: only overwrite when normalization succeeds; otherwise keep the raw value and
  // forwarding simply stays off until it's valid.
  if (agent.contactNumber) {
    const normalized = toE164(agent.contactNumber);
    if (normalized) agent.contactNumber = normalized;
  }

  // -- API KEY MODE (re-resolved at every save) -----------------------------------
  agent.apiKeyMode = normalizeApiKeyMode(agent.apiKeyMode);
  if (agent.apiKeyMode === "default_system") {
    // Force platform_default everywhere, detach BYOK integrations, and reset any saved
    // voice/LLM configuration back to the platform default (integrationId: null).
    agent.llmProvider = "google_gemini";
    agent.llmModel = "";
    agent.sttProvider = "platform_default";
    agent.ttsProvider = "platform_default";
    agent.voiceProvider = "Platform Default";
    await AgentLLMConfiguration.updateOne(
      { agentId: agent._id, userId: agent.userId },
      { $set: { provider: "platform_default", integrationId: null, model: "" } }
    );
    await AgentVoiceConfiguration.updateOne(
      { agentId: agent._id, userId: agent.userId },
      { $set: { sttProvider: "platform_default", ttsProvider: "platform_default", sttIntegrationId: null, ttsIntegrationId: null } }
    );
  } else if (llmConfigurationInput && (llmConfigurationInput.provider === "platform_default" || !llmConfigurationInput.integrationId)) {
    // BYOK requires a real connected LLM account. The outbound pre-flight is the ultimate guard;
    // this gives earlier, clearer feedback at save time (no silent fallback).
    throw new ApiError(400, "BYOK mode selected but no connected LLM account was chosen. Select an account or switch to Default System.", { code: "BYOK_NOT_CONFIGURED" });
  }
  // -------------------------------------------------------------------------------

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
  if (agent.apiKeyMode !== "default_system" && voiceConfigurationInput) {
    const cleanVoiceConfiguration = sanitizeVoiceConfiguration(voiceConfigurationInput, agent);
    applyVoiceConfigurationToAgent(agent, cleanVoiceConfiguration);
  }
  let llmConfiguration = null;
  if (agent.apiKeyMode !== "default_system" && llmConfigurationInput) {
    const cleanLLMConfiguration = sanitizeLLMConfiguration(llmConfigurationInput, agent);
    await validateLLMConfigurationOwnership({ userId: agent.userId, config: cleanLLMConfiguration });
    applyLLMConfigurationToAgent(agent, cleanLLMConfiguration);
  }

  validateEditableAgentFields(agent);
  if (Object.prototype.hasOwnProperty.call(body, "telephonyConfigId")) {
    await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
  }

  await agent.save();

  let providerResult = null;

  if (agent.apiKeyMode !== "default_system" && voiceConfigurationInput) {
    voiceConfiguration = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: voiceConfigurationInput });
    await agent.save();
  }
  if (agent.apiKeyMode !== "default_system" && llmConfigurationInput) {
    llmConfiguration = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: llmConfigurationInput });
    await agent.save();
  }

  // Voice/LLM selections are baked into the Vapi assistant at sync time, so refresh the assistant
  // when they change. An explicit syncProvider request always syncs; a config-only change refreshes
  // best-effort so a transient Vapi error does not fail the save.
  const configChanged = Boolean(voiceConfigurationInput || llmConfigurationInput);
  if (body.syncProvider === true) {
    providerResult = await syncProvider(agent, "update", { createIfMissing: Boolean(body.createIfMissing) });
  } else if (configChanged && agent.provider === "vapi" && agent.providerAgentId) {
    try {
      providerResult = await syncProvider(agent, "update", { createIfMissing: false });
    } catch (error) {
      console.error("[Agent update] Vapi assistant refresh failed:", error.message);
    }
  }

  res.json({
    success: true,
    message: providerResult ? "Agent saved locally and provider synced successfully." : "Agent saved.",
    warning: null,
    providerResult: publicProviderResult(providerResult),
    voiceConfiguration,
    llmConfiguration,
    workflowSyncQueued: false,
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
    providerWorkflowId: agent.providerWorkflowId || agent.workflowId
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

export const enableWebCall = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);

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
  await agent.save();

  return res.json({
    success: true,
    webCallProvider: "vapi",
    publicWebCallEnabled: true,
    providerResult: publicProviderResult(providerResult),
    agent
  });
});

export const getWebCallStatus = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  return res.json({
    success: true,
    webCallProvider: "vapi",
    publicWebCallEnabled: Boolean(agent.publicWebCallEnabled && agent.providerAgentId),
    providerAgentId: agent.providerAgentId || null,
    embedToken: null
  });
});

export const disableWebCall = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  agent.publicWebCallEnabled = false;
  await agent.save();

  res.json({
    success: true,
    embedToken: null,
    agent
  });
});

export const syncProviderForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    agent.systemPrompt = generateSystemPrompt(agent);
    await agent.save();
  }

  const providerWorkflowId = agent.providerWorkflowId || agent.workflowId;
  const createIfMissing = Boolean(req.body?.createIfMissing);

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

async function triggerCall(req, res) {
  const agent = await getOwnedAgent(req);
  const { phoneNumber } = req.body;

  const result = await triggerOutboundCallForAgent({
    agent,
    userId: req.user._id,
    phoneNumber
  });

  res.status(202).json({
    providerResponse: result.providerResponse,
    callLog: result.publicCallLog
  });
}

export const triggerTestCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res);
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
