import { ChevronLeft, Contact, Download, FilePlus, Info, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, api, getToken } from "../lib/api.js";

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const TEMPLATE_HEADER = "name,phone,email,city,scheduledAt,notes";
// TODO(outbound): point at the real docs page once one exists.
const SPAM_BEST_PRACTICES_URL = "https://docs.vapi.ai/phone-calling/outbound-campaigns";

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Calcutta (GMT+5:30)" },
  { value: "UTC", label: "UTC (GMT+0:00)" },
  { value: "America/New_York", label: "America/New York (GMT-5:00)" },
  { value: "America/Chicago", label: "America/Chicago (GMT-6:00)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (GMT-8:00)" },
  { value: "Europe/London", label: "Europe/London (GMT+0:00)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (GMT+1:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GMT+4:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (GMT+8:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (GMT+11:00)" }
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toLocalISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function nowHourMinute() {
  const date = new Date();
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function errorText(err) {
  return err?.response ? `${err.message}: ${JSON.stringify(err.response)}` : err?.message || "Something went wrong.";
}

// Minimal CSV parser (papaparse is not a dependency). Handles quoted fields, escaped quotes,
// and CR/LF line endings. Good enough for the flat template columns.
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // ignore; handled by the following \n
    } else {
      field += char;
    }
  }
  if (field.length || row.length) pushRow();

  const nonEmpty = rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((cell) => String(cell).trim().toLowerCase());
  return nonEmpty.slice(1).map((cells) => {
    const record = {};
    headers.forEach((key, index) => {
      record[key] = (cells[index] || "").trim();
    });
    return record;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OutboundNewCampaign() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const createdIdRef = useRef(null); // reuse a created campaign across retries so we never duplicate

  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: () => api("/agents") });
  const { data: phoneConfigs = [] } = useQuery({ queryKey: ["telephony-configs"], queryFn: () => api("/telephony-configs") });

  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(""); // TODO(outbound): persist selected phone number once schema allows
  const [agentId, setAgentId] = useState("");
  const [sendMode, setSendMode] = useState("now"); // "now" | "later"
  const [scheduleDate, setScheduleDate] = useState(() => toLocalISODate(new Date()));
  const [scheduleTime, setScheduleTime] = useState(() => nowHourMinute());
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const [file, setFile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const dateOptions = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 30 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const value = toLocalISODate(day);
      const label = index === 0
        ? "Today"
        : index === 1
          ? "Tomorrow"
          : day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      return { value, label };
    });
  }, []);

  const scheduledStartAt = scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : "";
  const hasFutureSchedule = sendMode === "now" || (scheduledStartAt && new Date(scheduledStartAt).getTime() > Date.now());
  const canLaunch = Boolean(name.trim()) && Boolean(agentId) && Boolean(file) && hasFutureSchedule && !submitting;

  function handleFiles(fileList) {
    const picked = fileList?.[0];
    if (!picked) return;
    setFileError("");
    if (picked.size > MAX_FILE_BYTES) {
      setFileError(`File is ${formatBytes(picked.size)}. Maximum file size is 5MB.`);
      return;
    }
    setFile(picked);
    const isCsv = /\.csv$/i.test(picked.name);
    if (isCsv) {
      picked
        .text()
        .then((text) => setContacts(parseCsv(text)))
        .catch(() => setContacts([]));
    } else {
      // XLSX is parsed server-side on import; we can't preview rows without a new dependency.
      setContacts([]);
    }
  }

  function removeFile() {
    setFile(null);
    setContacts([]);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer.files);
  }

  function downloadTemplate() {
    const blob = new Blob([`${TEMPLATE_HEADER}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "outbound-recipients-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function launch() {
    if (!canLaunch) return;
    setSubmitting(true);
    setLaunchError("");
    try {
      // 1. Create the campaign (reuse the id on retry so a failed step 2/3 doesn't duplicate it).
      if (!createdIdRef.current) {
        const campaign = await api("/campaigns", {
          method: "POST",
          body: {
            name: name.trim(),
            agentId,
            startAt: sendMode === "later" ? scheduledStartAt : undefined,
            timezone
            // callingSpeed & retryRules omitted → backend applies its own defaults.
          }
        });
        createdIdRef.current = campaign._id;
      }
      const campaignId = createdIdRef.current;

      // 2. Import recipients — raw file body (fetch pattern copied from the old Campaigns.jsx).
      const token = getToken();
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
      const response = await fetch(`${API_URL}/campaigns/${campaignId}/import-recipients?fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: {
          "Content-Type": isXlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: await file.arrayBuffer()
      });
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.message || "Import failed"), { response: payload });

      // 3. Start (backend derives scheduled vs running from startAt).
      await api(`/campaigns/${campaignId}/start`, { method: "POST" });

      // 4. Refresh the list and go to the detail screen (carry the selected from-number).
      queryClient.invalidateQueries({ queryKey: ["outbound-campaigns"] });
      navigate(`/outbound/${campaignId}`, { state: { phoneNumber } });
    } catch (err) {
      setLaunchError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  const launchButton = (
    <button className="btn-primary" disabled={!canLaunch} onClick={launch}>
      {submitting ? <span className="outbound-btn-spinner" /> : null}
      {submitting ? "Launching…" : "Launch campaign"}
    </button>
  );

  return (
    <div className="outbound-page">
      <div className="outbound-topbar">
        <div className="outbound-topbar-lead">
          <button className="outbound-back-btn" onClick={() => navigate("/outbound")} aria-label="Back to Outbound" type="button">
            <ChevronLeft size={18} />
          </button>
          <h1 className="outbound-topbar-title">New campaign</h1>
        </div>
        <div className="outbound-topbar-actions">{launchButton}</div>
      </div>

      <div className="outbound-split">
        <div className="outbound-form-col">
          {/* Campaign Name */}
          <div className="outbound-field">
            <label className="outbound-label" htmlFor="outbound-name">Campaign Name</label>
            <input
              id="outbound-name"
              className="outbound-input"
              placeholder="Campaign Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {/* Phone Number */}
          <div className="outbound-field">
            <label className="outbound-label" htmlFor="outbound-phone">
              Phone Number
              <Info size={14} className="outbound-label-info" title="The number your campaign calls are placed from." />
            </label>
            <select
              id="outbound-phone"
              className="outbound-select"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            >
              <option value="">Select</option>
              {phoneConfigs.map((config) => (
                <option key={config._id} value={config.phoneNumber}>
                  {config.name} · {config.phoneNumber}
                </option>
              ))}
            </select>
          </div>

          {/* Best Practices callout */}
          <div className="outbound-callout">
            <Info size={16} />
            <div>
              <p className="outbound-callout-title">Best Practices</p>
              <p className="outbound-callout-body">
                Learn how to avoid spam flagging and optimize your calling strategy for better success rates.{" "}
                <a className="outbound-callout-link" href={SPAM_BEST_PRACTICES_URL} target="_blank" rel="noreferrer">
                  Spam flagging best practices
                </a>
              </p>
            </div>
          </div>

          {/* Upload CSV */}
          <div className="outbound-field">
            <div className="outbound-upload-head">
              <label className="outbound-label">Upload CSV</label>
              <button className="outbound-ghost-btn" onClick={downloadTemplate} type="button">
                <Download size={14} />
                Download template
              </button>
            </div>

            {file ? (
              <div className="outbound-file-chip">
                <FilePlus size={20} />
                <div className="outbound-file-chip-info">
                  <p className="outbound-file-chip-name">{file.name}</p>
                  <p className="outbound-file-chip-meta">
                    {formatBytes(file.size)}
                    {/\.csv$/i.test(file.name) ? ` · ${contacts.length} contact${contacts.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <button className="outbound-file-remove" onClick={removeFile} type="button">Remove</button>
              </div>
            ) : (
              <div
                className={`outbound-dropzone${dragActive ? " outbound-dropzone-active" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
              >
                <FilePlus size={26} />
                <p className="outbound-dropzone-main">Drag and drop a CSV file here or click to select file locally</p>
                <p className="outbound-dropzone-sub">Maximum file size: 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(event) => handleFiles(event.target.files)}
            />
            {fileError && <p className="outbound-inline-error">{fileError}</p>}
          </div>

          {/* Assistant */}
          <div className="outbound-field">
            <label className="outbound-label" htmlFor="outbound-agent">Assistant</label>
            <select
              id="outbound-agent"
              className="outbound-select"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">Select</option>
              {agents.map((agent) => (
                <option key={agent._id} value={agent._id}>
                  {agent.agentName}
                </option>
              ))}
            </select>
          </div>

          {/* Choose when to send */}
          <div className="outbound-field">
            <label className="outbound-label">Choose when to send</label>
            <div className="outbound-radio-cards">
              <label className={`outbound-radio-card${sendMode === "now" ? " outbound-radio-card-active" : ""}`}>
                <input type="radio" name="outbound-send" checked={sendMode === "now"} onChange={() => setSendMode("now")} />
                Send Now
              </label>
              <label className={`outbound-radio-card${sendMode === "later" ? " outbound-radio-card-active" : ""}`}>
                <input type="radio" name="outbound-send" checked={sendMode === "later"} onChange={() => setSendMode("later")} />
                Schedule for later
              </label>
            </div>
            {sendMode === "later" && (
              <div className="outbound-schedule-reveal">
                <p className="outbound-startat-title">Start at:</p>
                <div className="outbound-schedule-grid">
                  <div>
                    <label className="outbound-sub-label" htmlFor="outbound-date">Date</label>
                    <select
                      id="outbound-date"
                      className="outbound-select outbound-date-select"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                    >
                      {dateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="outbound-sub-label" htmlFor="outbound-time">Time</label>
                    <input
                      id="outbound-time"
                      className="outbound-time"
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="outbound-sub-label" htmlFor="outbound-tz">Timezone</label>
                    <select
                      id="outbound-tz"
                      className="outbound-select"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {launchError && <p className="outbound-inline-error">{launchError}</p>}

          {/* Sticky launch (mirrors the header button) */}
          <div className="outbound-launch-sticky">{launchButton}</div>
        </div>

        {/* Preview column */}
        <div className="outbound-preview-col">
          {contacts.length ? (
            <>
              <div className="outbound-preview-head">
                <h3>Contacts</h3>
                <span className="outbound-preview-count">{contacts.length}</span>
              </div>
              <div className="outbound-table-wrap">
                <table className="outbound-preview-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 200).map((contact, index) => (
                      <tr key={`${contact.phone || ""}-${index}`}>
                        <td>{contact.name || "-"}</td>
                        <td>{contact.phone || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="outbound-preview-empty">
              <div className="outbound-preview-empty-icon">
                <Contact size={22} />
              </div>
              <p className="outbound-preview-empty-title">No contacts yet</p>
              <p className="outbound-preview-empty-sub">Contacts you upload or add will be previewed here before the campaign launches.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
