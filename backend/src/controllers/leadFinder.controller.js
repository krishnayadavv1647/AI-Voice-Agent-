import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import Lead from "../models/Lead.js";
import LeadFinder from "../models/LeadFinder.js";
import { enrichLeadsWithEmails } from "../services/leadEnrichment/emailExtractor.js";
import { listLeadFinderProviders, getLeadFinderProvider } from "../services/leadFinder/index.js";
import { chargeFeatureOrThrow } from "../services/billing/featureBilling.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import crypto from "crypto";

function filter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

function normalizeText(value) {
  return value ? String(value).trim() : "";
}

function buildQuery({ category, keyword, city, country }) {
  return [category, keyword, city, country].map(normalizeText).filter(Boolean).join(" | ");
}

async function ensureAgentAccess(req, agentId) {
  if (!mongoose.Types.ObjectId.isValid(agentId || "")) {
    throw new ApiError(400, "Valid agentId is required.");
  }

  const agent = await Agent.findOne({ _id: agentId, ...filter(req) });
  if (!agent) throw new ApiError(404, "Agent not found or not accessible.");
  return agent;
}

function normalizeLead(rawLead = {}, req, agentId) {
  const businessName = normalizeText(rawLead.businessName);
  const contactName = normalizeText(rawLead.contactName);

  return {
    userId: req.user._id,
    agentId,
    businessName,
    contactName,
    name: contactName || businessName,
    phone: normalizeText(rawLead.phone),
    email: normalizeText(rawLead.email).toLowerCase(),
    emails: Array.isArray(rawLead.emails) ? rawLead.emails.filter(Boolean) : [],
    emailSourceUrl: normalizeText(rawLead.emailSourceUrl),
    emailEnrichmentStatus: rawLead.emailEnrichmentStatus || "not_started",
    emailEnrichmentError: normalizeText(rawLead.emailEnrichmentError),
    emailEnrichedAt: rawLead.emailEnrichedAt ? new Date(rawLead.emailEnrichedAt) : undefined,
    website: normalizeText(rawLead.website),
    city: normalizeText(rawLead.city),
    address: normalizeText(rawLead.address),
    country: normalizeText(rawLead.country),
    category: normalizeText(rawLead.category),
    industry: normalizeText(rawLead.industry),
    googleMapsUrl: normalizeText(rawLead.googleMapsUrl),
    instagramUrl: normalizeText(rawLead.instagramUrl),
    facebookUrl: normalizeText(rawLead.facebookUrl),
    linkedinUrl: normalizeText(rawLead.linkedinUrl),
    source: "lead_finder",
    status: "new"
  };
}

function compactDefined(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function missingFieldUpdates(existingLead, leadPayload) {
  const updates = {};
  [
    "agentId",
    "businessName",
    "contactName",
    "name",
    "phone",
    "email",
    "emails",
    "emailSourceUrl",
    "emailEnrichmentStatus",
    "emailEnrichmentError",
    "emailEnrichedAt",
    "website",
    "city",
    "address",
    "country",
    "category",
    "industry",
    "googleMapsUrl",
    "instagramUrl",
    "facebookUrl",
    "linkedinUrl",
    "source"
  ].forEach((field) => {
    if (Array.isArray(leadPayload[field])) {
      if ((!Array.isArray(existingLead[field]) || !existingLead[field].length) && leadPayload[field].length) {
        updates[field] = leadPayload[field];
      }
      return;
    }
    if (!existingLead[field] && leadPayload[field]) updates[field] = leadPayload[field];
  });
  if (leadPayload.emailEnrichmentStatus && existingLead.emailEnrichmentStatus !== "found") {
    updates.emailEnrichmentStatus = leadPayload.emailEnrichmentStatus;
    updates.emailEnrichmentError = leadPayload.emailEnrichmentError || "";
    updates.emailSourceUrl = leadPayload.emailSourceUrl || existingLead.emailSourceUrl;
    updates.emailEnrichedAt = leadPayload.emailEnrichedAt || new Date();
  }
  return updates;
}

async function findDuplicateLead(userId, leadPayload) {
  const checks = [];
  if (leadPayload.phone) checks.push({ userId, phone: leadPayload.phone });
  if (leadPayload.email) checks.push({ userId, email: leadPayload.email });
  if (leadPayload.website) checks.push({ userId, website: leadPayload.website });
  if (!checks.length) return null;
  return Lead.findOne({ $or: checks });
}

async function saveLeadPayload(req, leadPayload) {
  const existingLead = await findDuplicateLead(req.user._id, leadPayload);

  if (existingLead) {
    Object.assign(existingLead, missingFieldUpdates(existingLead, leadPayload));
    await existingLead.save();
    return { lead: existingLead, created: false };
  }

  const lead = await Lead.create(compactDefined(leadPayload));
  return { lead, created: true };
}

export const listProviders = asyncHandler(async (req, res) => {
  res.json(listLeadFinderProviders());
});

export const searchLeadFinder = asyncHandler(async (req, res) => {
  const {
    agentId,
    category = "",
    keyword = "",
    city = "",
    country = "",
    totalRequested = 25,
    provider: requestedProvider,
    enrichEmails = false
  } = req.body;

  await ensureAgentAccess(req, agentId);

  // Plan/credit gate: blocks (and never starts a search) when the feature isn't in the plan or
  // the wallet can't cover it. No-op unless CREDIT_ENFORCEMENT is on.
  await chargeFeatureOrThrow({
    userId: req.user._id,
    featureKey: "lead_search",
    idempotencyKey: `lead_search:${req.user._id}:${crypto.randomUUID()}`,
    metadata: { agentId }
  });

  const provider = getLeadFinderProvider(requestedProvider);
  const run = await LeadFinder.create({
    userId: req.user._id,
    agentId,
    query: buildQuery({ category, keyword, city, country }),
    category,
    keyword,
    city,
    country,
    totalRequested,
    provider: provider.key,
    status: "running"
  });

  try {
    const rawLeadsPreview = await provider.service.searchLeads({ category, keyword, city, country, totalRequested });
    const leadsPreview = enrichEmails
      ? await enrichLeadsWithEmails(rawLeadsPreview, { concurrency: 3 })
      : rawLeadsPreview.map((lead) => ({ ...lead, emailEnrichmentStatus: lead.emailEnrichmentStatus || "not_started" }));
    run.leadsPreview = leadsPreview;
    run.totalFound = leadsPreview.length;
    run.status = "completed";
    await run.save();

    res.status(201).json({
      runId: run._id,
      status: run.status,
      leadsPreview: run.leadsPreview,
      totalFound: run.totalFound
    });
  } catch (error) {
    run.status = "failed";
    run.error = error.message || "Lead search failed.";
    await run.save();
    throw error;
  }
});

export const listRuns = asyncHandler(async (req, res) => {
  const runs = await LeadFinder.find(filter(req))
    .populate("agentId", "agentName businessName")
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(runs);
});

export const getRun = asyncHandler(async (req, res) => {
  const run = await LeadFinder.findOne({ _id: req.params.id, ...filter(req) }).populate("agentId", "agentName businessName");
  if (!run) throw new ApiError(404, "Lead finder run not found.");
  res.json(run);
});

export const saveRunLeads = asyncHandler(async (req, res) => {
  const run = await LeadFinder.findOne({ _id: req.params.id, ...filter(req) });
  if (!run) throw new ApiError(404, "Lead finder run not found.");

  await ensureAgentAccess(req, run.agentId);

  const selectedIds = Array.isArray(req.body.leadIds) ? req.body.leadIds.map(String) : [];
  const selectedLeads = selectedIds.length
    ? run.leadsPreview.filter((lead) => selectedIds.includes(lead._id.toString()))
    : run.leadsPreview;

  const saved = [];
  let created = 0;
  let updated = 0;

  for (const leadPreview of selectedLeads) {
    const leadPayload = normalizeLead(leadPreview.toObject ? leadPreview.toObject() : leadPreview, req, run.agentId);
    const result = await saveLeadPayload(req, leadPayload);
    saved.push(result.lead);
    if (result.created) created += 1;
    else updated += 1;

    leadPreview.savedLeadId = result.lead._id;
    leadPreview.savedAt = new Date();
  }

  if (created > 0) {
    await Agent.findByIdAndUpdate(run.agentId, { $inc: { totalLeads: created } });
  }

  await run.save();

  res.json({ success: true, saved, created, updated, skipped: selectedLeads.length - saved.length });
});

export const enrichLeadFinderEmails = asyncHandler(async (req, res) => {
  const { runId, leadIds = [], leads = [] } = req.body;
  const selectedIds = Array.isArray(leadIds) ? leadIds.map(String) : [];

  if (runId) {
    const run = await LeadFinder.findOne({ _id: runId, ...filter(req) });
    if (!run) throw new ApiError(404, "Lead finder run not found.");

    const targetIndexes = run.leadsPreview
      .map((leadPreview, index) => ({ leadPreview, index }))
      .filter(({ leadPreview }) => !selectedIds.length || selectedIds.includes(leadPreview._id.toString()));
    const enriched = await enrichLeadsWithEmails(
      targetIndexes.map(({ leadPreview }) => leadPreview.toObject()),
      { concurrency: 3 }
    );
    const enrichedByIndex = new Map(targetIndexes.map(({ index }, itemIndex) => [index, enriched[itemIndex]]));

    run.leadsPreview = run.leadsPreview.map((leadPreview, index) => {
      if (!enrichedByIndex.has(index)) return leadPreview;
      return { ...leadPreview.toObject(), ...enrichedByIndex.get(index) };
    });
    await run.save();

    return res.json({ success: true, runId: run._id, leadsPreview: run.leadsPreview });
  }

  if (Array.isArray(leads) && leads.length) {
    const enriched = await enrichLeadsWithEmails(leads, { concurrency: 3 });
    return res.json({ success: true, leads: enriched });
  }

  if (selectedIds.length) {
    const savedLeads = await Lead.find({ _id: { $in: selectedIds }, ...filter(req) });
    const enriched = await enrichLeadsWithEmails(savedLeads.map((lead) => lead.toObject()), { concurrency: 3 });
    const saved = [];

    for (const enrichedLead of enriched) {
      const lead = savedLeads.find((item) => item._id.toString() === enrichedLead._id.toString());
      if (!lead) continue;
      Object.assign(lead, {
        email: lead.email || enrichedLead.email,
        emails: enrichedLead.emails || [],
        emailSourceUrl: enrichedLead.emailSourceUrl || "",
        emailEnrichmentStatus: enrichedLead.emailEnrichmentStatus || "failed",
        emailEnrichmentError: enrichedLead.emailEnrichmentError || "",
        emailEnrichedAt: new Date()
      });
      await lead.save();
      saved.push(lead);
    }

    return res.json({ success: true, saved });
  }

  throw new ApiError(400, "Provide runId, leadIds, or leads to enrich.");
});

export const importLeadFinderLeads = asyncHandler(async (req, res) => {
  const { agentId, leads = [] } = req.body;
  await ensureAgentAccess(req, agentId);

  if (!Array.isArray(leads) || !leads.length) throw new ApiError(400, "Leads array is required.");

  const saved = [];
  let created = 0;
  let updated = 0;

  for (const rawLead of leads) {
    const leadPayload = normalizeLead(rawLead, req, agentId);
    const result = await saveLeadPayload(req, leadPayload);
    saved.push(result.lead);
    if (result.created) created += 1;
    else updated += 1;
  }

  if (created > 0) {
    await Agent.findByIdAndUpdate(agentId, { $inc: { totalLeads: created } });
  }

  res.status(201).json({ success: true, saved, created, updated });
});
