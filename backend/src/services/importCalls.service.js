import Agent from "../models/Agent.js";
import ImportedCallRow from "../models/ImportedCallRow.js";
import ImportRun from "../models/ImportRun.js";
import Lead from "../models/Lead.js";
import ScheduledCall from "../models/ScheduledCall.js";
import { ApiError } from "../utils/apiError.js";

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const EXPECTED_COLUMNS = ["name", "phone", "email", "city", "agent", "callDate", "callTime", "timezone", "purpose", "notes"];

export function defaultMapping(headers = []) {
  const normalized = Object.fromEntries(headers.map((header) => [normalizeHeader(header), header]));
  return Object.fromEntries(EXPECTED_COLUMNS.map((field) => [field, normalized[normalizeHeader(field)] || ""]));
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows) {
  const headers = ["name", "phone", "email", "city", "callDate", "callTime", "timezone", "purpose", "notes", "status", "error"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))
  ].join("\n");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

async function parseXlsx(buffer) {
  let xlsx;
  try {
    xlsx = await import("xlsx");
  } catch {
    throw new ApiError(500, "Excel import requires the xlsx package. Run npm install in backend.");
  }

  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
}

export async function parseImportFile({ buffer, fileName, contentType }) {
  const extension = String(fileName || "").toLowerCase().split(".").pop();
  if (extension === "csv" || contentType.includes("csv") || contentType.includes("text/plain")) {
    return parseCsv(buffer.toString("utf8"));
  }
  if (extension === "xlsx" || contentType.includes("spreadsheetml")) {
    return parseXlsx(buffer);
  }
  throw new ApiError(400, "Only .csv and .xlsx files are supported.");
}

export function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.length === 10) return `+91${compact}`;
  if (compact.length > 10 && compact.startsWith("91")) return `+${compact}`;
  return compact;
}

function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("invalid timezone");
  }
}

function parseLocalDateTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("invalid date/time");
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

export function localTimeToUtc(callDate, callTime, timezone) {
  assertTimezone(timezone);
  const wanted = parseLocalDateTime(`${callDate}T${callTime}`);
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
    throw new Error("invalid date/time for timezone");
  }

  return utcDate;
}

function readMappedValue(raw, mapping, field) {
  const source = mapping?.[field] || field;
  return raw?.[source] ?? raw?.[field] ?? "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function normalizeDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "number") {
    const date = excelSerialToDate(value);
    if (date) return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const text = String(value || "").trim();
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${pad(slash[2])}-${pad(slash[1])}`;
  return text;
}

function normalizeTimeValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  }
  if (typeof value === "number" && value > 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${pad(match[1])}:${match[2]}`;
  return text;
}

export function normalizeMappedRow(raw, mapping) {
  const row = Object.fromEntries(EXPECTED_COLUMNS.map((field) => [field, String(readMappedValue(raw, mapping, field) ?? "").trim()]));
  row.callDate = normalizeDateValue(readMappedValue(raw, mapping, "callDate"));
  row.callTime = normalizeTimeValue(readMappedValue(raw, mapping, "callTime"));
  row.timezone = row.timezone || DEFAULT_TIMEZONE;
  row.phone = normalizePhone(row.phone);
  return row;
}

export async function createRunFromRows({ userId, agentId, fileName, rows }) {
  const agent = await Agent.findOne({ _id: agentId, userId });
  if (!agent) throw new ApiError(404, "Agent not found.");

  const headers = Object.keys(rows[0] || {});
  const mapping = defaultMapping(headers);
  const run = await ImportRun.create({
    userId,
    agentId,
    fileName,
    totalRows: rows.length,
    status: "uploaded"
  });

  await ImportedCallRow.insertMany(rows.map((raw) => ({
    userId,
    importRunId: run._id,
    agentId,
    raw,
    ...normalizeMappedRow(raw, mapping),
    status: "invalid",
    error: "Not validated"
  })));

  return { run, mapping, headers };
}

export async function validateRun({ userId, runId, mapping }) {
  const run = await ImportRun.findOne({ _id: runId, userId });
  if (!run) throw new ApiError(404, "Import run not found.");

  const agent = await Agent.findOne({ _id: run.agentId, userId });
  if (!agent) throw new ApiError(404, "Agent not found.");

  const rows = await ImportedCallRow.find({ importRunId: run._id, userId }).sort({ createdAt: 1 });
  const seen = new Set();
  let validRows = 0;
  let invalidRows = 0;

  for (const row of rows) {
    Object.assign(row, normalizeMappedRow(row.raw, mapping));
    row.error = "";
    row.status = "valid";
    row.startAt = undefined;

    if (!row.phone || !E164_PATTERN.test(row.phone)) row.error = "invalid phone";
    else if (!row.callDate) row.error = "missing date";
    else if (!row.callTime) row.error = "missing time";
    else {
      try {
        row.startAt = localTimeToUtc(row.callDate, row.callTime, row.timezone || DEFAULT_TIMEZONE);
        if (row.startAt <= new Date()) row.error = "past date/time";
      } catch {
        row.error = "invalid date/time";
      }
    }

    const key = `${row.phone}|${row.startAt ? row.startAt.toISOString() : ""}`;
    if (!row.error && seen.has(key)) row.error = "duplicate";
    if (!row.error) {
      const duplicate = await ScheduledCall.findOne({
        userId,
        agentId: run.agentId,
        phoneNumber: row.phone,
        scheduledForUtc: row.startAt,
        status: { $in: ["pending", "processing"] }
      });
      if (duplicate) row.error = "duplicate";
    }

    if (row.error) {
      row.status = "invalid";
      invalidRows += 1;
    } else {
      seen.add(key);
      validRows += 1;
    }

    await row.save();
  }

  run.validRows = validRows;
  run.invalidRows = invalidRows;
  run.status = "validated";
  run.errors = invalidRows ? [`${invalidRows} rows need fixing before import.`] : [];
  await run.save();

  return run;
}

export async function importValidRows({ userId, runId }) {
  const run = await ImportRun.findOne({ _id: runId, userId });
  if (!run) throw new ApiError(404, "Import run not found.");

  const agent = await Agent.findOne({ _id: run.agentId, userId });
  if (!agent) throw new ApiError(404, "Agent not found.");

  const rows = await ImportedCallRow.find({ importRunId: run._id, userId }).sort({ createdAt: 1 });
  let importedRows = 0;
  let skippedRows = 0;
  const errors = [];

  for (const row of rows) {
    if (row.status !== "valid") continue;

    const duplicate = await ScheduledCall.findOne({
      userId,
      agentId: run.agentId,
      phoneNumber: row.phone,
      scheduledForUtc: row.startAt,
      status: { $in: ["pending", "processing"] }
    });
    if (duplicate) {
      row.status = "skipped";
      row.error = "duplicate";
      skippedRows += 1;
      await row.save();
      continue;
    }

    try {
      const lead = await Lead.findOneAndUpdate(
        { userId, agentId: run.agentId, phone: row.phone },
        {
          $setOnInsert: {
            userId,
            agentId: run.agentId,
            phone: row.phone,
            source: "import",
            status: "New"
          },
          $set: {
            name: row.name || row.phone,
            email: row.email || undefined,
            city: row.city || undefined,
            requirement: row.purpose || undefined,
            preferredDate: row.callDate,
            preferredTime: row.callTime
          },
          $push: {
            notes: { text: row.notes || `Imported call scheduled for ${row.startAt.toLocaleString([], { timeZone: row.timezone })}` }
          }
        },
        { new: true, upsert: true }
      );

      const schedule = await ScheduledCall.create({
        userId,
        agentId: run.agentId,
        leadId: lead._id,
        importRunId: run._id,
        phoneNumber: row.phone,
        scheduledForUtc: row.startAt,
        timezone: row.timezone,
        status: "pending",
        source: "import",
        purpose: row.purpose,
        notes: row.notes
      });

      row.leadId = lead._id;
      row.scheduledCallId = schedule._id;
      row.status = "imported";
      row.error = "";
      importedRows += 1;
      await row.save();
    } catch (error) {
      row.status = "skipped";
      row.error = error.message || "import failed";
      errors.push(`${row.phone}: ${row.error}`);
      skippedRows += 1;
      await row.save();
    }
  }

  const invalidRows = await ImportedCallRow.countDocuments({ importRunId: run._id, userId, status: "invalid" });
  run.importedRows = importedRows;
  run.skippedRows = skippedRows;
  run.invalidRows = invalidRows;
  run.status = "imported";
  run.errors = errors;
  await run.save();

  return {
    totalRows: run.totalRows,
    importedRows,
    skippedRows,
    invalidRows,
    errors
  };
}
