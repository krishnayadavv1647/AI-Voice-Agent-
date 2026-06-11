import Agent from "../models/Agent.js";
import ScheduledCall from "../models/ScheduledCall.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function userFilter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

function assertE164(value) {
  if (!E164_PATTERN.test(value || "")) {
    throw new ApiError(400, "Phone number must be in E.164 format, for example +918000000000");
  }
}

function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new ApiError(400, "Timezone is not valid.");
  }
}

function parseLocalDateTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    throw new ApiError(400, "scheduledForLocal must use YYYY-MM-DDTHH:mm format.");
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  return { year, month, day, hour, minute };
}

function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false
  });

  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function localTimeToUtc(scheduledForLocal, timezone) {
  assertTimezone(timezone);
  const wanted = parseLocalDateTime(scheduledForLocal);
  const wantedAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  const guessedDate = new Date(wantedAsUtc);
  const parts = zonedParts(guessedDate, timezone);
  const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const utcDate = new Date(wantedAsUtc + (wantedAsUtc - actualAsUtc));
  const roundTrip = zonedParts(utcDate, timezone);

  if (
    roundTrip.year !== wanted.year ||
    roundTrip.month !== wanted.month ||
    roundTrip.day !== wanted.day ||
    roundTrip.hour !== wanted.hour ||
    roundTrip.minute !== wanted.minute
  ) {
    throw new ApiError(400, "Scheduled time is not valid in the selected timezone.");
  }

  return utcDate;
}

function assertAgentCanCall(agent) {
  if (!agent.dograhWorkflowUuid) {
    throw new ApiError(400, "Connect a Dograh workflow before scheduling calls.");
  }

  if (!agent.callerIdNumber) {
    throw new ApiError(400, "Connect a Dograh workflow with a caller ID number before scheduling calls.");
  }
}

async function getOwnedSchedule(req) {
  const schedule = await ScheduledCall.findOne({ _id: req.params.id, ...userFilter(req) });
  if (!schedule) throw new ApiError(404, "Scheduled call not found");
  return schedule;
}

export const createScheduledCall = asyncHandler(async (req, res) => {
  const { agentId, phoneNumber, scheduledForLocal, timezone } = req.body;

  if (!agentId) throw new ApiError(400, "agentId is required.");
  if (!phoneNumber) throw new ApiError(400, "phoneNumber is required.");
  if (!scheduledForLocal) throw new ApiError(400, "scheduledForLocal is required.");
  if (!timezone) throw new ApiError(400, "timezone is required.");

  assertE164(phoneNumber);

  const agent = await Agent.findOne({ _id: agentId, ...userFilter(req) });
  if (!agent) throw new ApiError(404, "Agent not found");
  assertAgentCanCall(agent);

  const scheduledForUtc = localTimeToUtc(scheduledForLocal, timezone);
  if (scheduledForUtc <= new Date()) {
    throw new ApiError(400, "Scheduled time must be in the future.");
  }

  const schedule = await ScheduledCall.create({
    userId: agent.userId,
    agentId: agent._id,
    phoneNumber,
    scheduledForUtc,
    timezone,
    status: "scheduled"
  });

  res.status(201).json(schedule);
});

export const listScheduledCalls = asyncHandler(async (req, res) => {
  const schedules = await ScheduledCall.find(userFilter(req))
    .populate("agentId", "agentName")
    .sort({ scheduledForUtc: 1, createdAt: -1 });

  res.json(schedules);
});

export const listScheduledCallsForAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({ _id: req.params.agentId, ...userFilter(req) });
  if (!agent) throw new ApiError(404, "Agent not found");

  const schedules = await ScheduledCall.find({ agentId: agent._id, ...userFilter(req) })
    .populate("agentId", "agentName")
    .sort({ scheduledForUtc: 1, createdAt: -1 });

  res.json(schedules);
});

export const cancelScheduledCall = asyncHandler(async (req, res) => {
  const schedule = await getOwnedSchedule(req);

  if (!["pending", "scheduled"].includes(schedule.status)) {
    throw new ApiError(400, "Only scheduled calls can be cancelled.");
  }

  schedule.status = "cancelled";
  schedule.processedAt = new Date();
  await schedule.save();

  res.json(schedule);
});
