import Agent from "../models/Agent.js";
import AgentTemplate from "../models/AgentTemplate.js";
import { defaultAgentTemplates } from "../data/agentTemplates.seed.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { replaceTemplateVariables, sanitizeTemplateVariables } from "../utils/templateVariables.js";

const PREMIUM_PLANS = ["growth", "scale"];

function cleanString(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function summarizePrompt(value) {
  const text = cleanString(value, 1000).replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > 260 ? `${text.slice(0, 257).trim()}...` : text;
}

function publicTemplate(template) {
  const item = template.toObject ? template.toObject() : { ...template };
  const config = item.defaultAgentConfig || {};
  item.preview = {
    firstMessage: config.firstMessageTemplate || "",
    promptSummary: summarizePrompt(config.systemPromptTemplate || item.longDescription || item.shortDescription),
    workflowSteps: Array.isArray(config.workflowConfig?.steps) ? config.workflowConfig.steps : [],
    leadCaptureFields: Array.isArray(config.leadCaptureFields) ? config.leadCaptureFields : [],
    language: config.language || "english",
    voiceName: config.voiceConfig?.voiceLabel || "Default Voice",
    useCase: item.useCase || ""
  };
  delete item.defaultAgentConfig;
  return item;
}

function canUsePremiumTemplate(user) {
  return ["admin", "super_admin"].includes(user?.role) || PREMIUM_PLANS.includes(user?.plan);
}

function leadQuestionsFromTemplate(fields = []) {
  return fields.map((field) => ({
    label: field.label || field.key,
    fieldName: field.key || field.fieldName || String(field.label || "field").toLowerCase().replace(/\W+/g, "_"),
    required: Boolean(field.required)
  })).filter((field) => field.label && field.fieldName);
}

export async function ensureDefaultAgentTemplates() {
  const count = await AgentTemplate.countDocuments();
  if (count) return;

  await AgentTemplate.bulkWrite(defaultAgentTemplates.map((template) => ({
    updateOne: {
      filter: { slug: template.slug },
      update: { $set: template },
      upsert: true
    }
  })));
}

export const listAgentTemplates = asyncHandler(async (req, res) => {
  await ensureDefaultAgentTemplates();
  const filter = ["admin", "super_admin"].includes(req.user?.role) && req.query.includeInactive === "true"
    ? {}
    : { isActive: true };
  const templates = await AgentTemplate.find(filter).sort({ sortOrder: 1, name: 1 });
  res.json(templates.map(publicTemplate));
});

export const getAgentTemplate = asyncHandler(async (req, res) => {
  await ensureDefaultAgentTemplates();
  const filter = { slug: req.params.slug };
  if (!["admin", "super_admin"].includes(req.user?.role)) filter.isActive = true;
  const template = await AgentTemplate.findOne(filter);
  if (!template) throw new ApiError(404, "Agent template not found");
  res.json(publicTemplate(template));
});

export const createAgentFromTemplate = asyncHandler(async (req, res) => {
  await ensureDefaultAgentTemplates();

  const templateId = cleanString(req.body.templateId || req.body.slug, 160);
  const businessName = cleanString(req.body.businessName, 160);
  if (!templateId) throw new ApiError(400, "Template is required.");
  if (!businessName) throw new ApiError(400, "Business Name is required.");

  const template = await AgentTemplate.findOne({
    $or: [{ _id: AgentTemplate.db.base.Types.ObjectId.isValid(templateId) ? templateId : null }, { slug: templateId }],
    isActive: true
  });
  if (!template) throw new ApiError(404, "Agent template not found");
  if (template.isPremium && !canUsePremiumTemplate(req.user)) {
    throw new ApiError(403, "This template requires a paid plan.");
  }

  const variables = sanitizeTemplateVariables({
    businessName,
    businessPhone: req.body.businessPhone,
    businessWebsite: req.body.businessWebsite,
    businessAddress: req.body.businessAddress,
    services: req.body.services,
    workingHours: req.body.workingHours
  });
  const config = replaceTemplateVariables(template.defaultAgentConfig || {}, variables);
  const leadCaptureFields = Array.isArray(config.leadCaptureFields) ? config.leadCaptureFields : [];
  const workflowSteps = Array.isArray(config.workflowConfig?.steps) ? config.workflowConfig.steps : [];

  const agent = await Agent.create({
    userId: req.user._id,
    sourceType: "template",
    sourceTemplateId: template._id,
    provider: "vapi",
    status: "draft",
    name: config.agentNameTemplate || `${businessName} AI Agent`,
    agentName: config.agentNameTemplate || `${businessName} AI Agent`,
    description: config.descriptionTemplate || template.shortDescription,
    agentType: template.useCase || "Template Agent",
    businessName,
    businessCategory: config.businessCategory || template.industry || template.category,
    businessDescription: config.descriptionTemplate || template.longDescription || template.shortDescription,
    businessWebsite: variables.businessWebsite,
    businessLocation: variables.businessAddress,
    workingHours: variables.workingHours,
    contactNumber: variables.businessPhone,
    services: config.servicesTemplate || variables.services,
    firstMessage: config.firstMessageTemplate,
    greetingMessage: config.firstMessageTemplate,
    systemPrompt: config.systemPromptTemplate,
    language: config.language || "english",
    voiceProvider: config.voiceConfig?.voiceLabel || "Default Voice",
    voiceStyle: config.voiceConfig?.style || "Professional",
    voiceSpeed: config.voiceConfig?.speed || "Normal",
    tone: "Professional",
    personality: "Polite",
    fallbackMessage: Array.isArray(config.fallbackRules) ? config.fallbackRules[0] : undefined,
    humanTransferMessage: Array.isArray(config.escalationRules) ? config.escalationRules[0] : undefined,
    callMode: config.callConfig?.callMode || "callback",
    allowInterruption: config.callConfig?.allowInterruption !== false,
    fastReplyMode: config.callConfig?.fastReplyMode !== false,
    leadCaptureEnabled: config.callConfig?.leadCaptureEnabled !== false,
    responseStyle: config.llmConfig?.responseStyle || "short_clear",
    leadQuestions: leadQuestionsFromTemplate(leadCaptureFields),
    workflowNodes: workflowSteps,
    nodes: workflowSteps,
    settings: {
      templateSlug: template.slug,
      workflowConfig: config.workflowConfig,
      callConfig: config.callConfig,
      webCallConfig: config.webCallConfig
    },
    voiceConfig: config.voiceConfig,
    llmConfig: config.llmConfig,
    callConfig: config.callConfig,
    webCallConfig: config.webCallConfig,
    workflowConfig: config.workflowConfig,
    leadCaptureFields,
    fallbackRules: config.fallbackRules,
    escalationRules: config.escalationRules,
    appointmentRules: config.appointmentRules,
    knowledgeBaseDefaults: config.knowledgeBaseDefaults,
    publicChatEnabled: true,
    publicWebCallEnabled: false
  });

  res.status(201).json({
    success: true,
    message: "Your AI agent is ready.",
    agent
  });
});
