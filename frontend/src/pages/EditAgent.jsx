import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import LLMConfigurationPanel, { defaultLLMConfiguration } from "../components/LLMConfigurationPanel.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import VoiceConfigurationPanel, { defaultVoiceConfiguration } from "../components/VoiceConfigurationPanel.jsx";
import { api } from "../lib/api.js";
import { agentTypes, languages, tones, personalities } from "../lib/options.js";

const tabs = ["Basic Info", "Business Information", "System Prompt", "Call Behavior", "Voice & Language", "Dograh Workflow"];

const editableFields = [
  "agentName", "agentType", "businessName", "businessCategory", "businessDescription",
  "businessWebsite", "businessLocation", "workingHours", "contactNumber",
  "services", "pricing", "faqs", "policies", "offers", "additionalInfo",
  "systemPrompt", "greetingMessage", "fallbackMessage", "endingMessage", "humanTransferMessage",
  "language", "responseStyle", "callMode", "allowInterruption", "fastReplyMode", "leadCaptureEnabled",
  "voiceGender", "voiceStyle", "voiceProvider", "voiceId", "sttProvider", "sttModel", "sttLanguage", "sttSettings", "ttsProvider", "ttsModel", "ttsLanguage", "ttsSettings", "firstMessage", "telephonyConfigId",
  "voiceSpeed", "tone", "speakingSpeed", "personality",
  "provider", "vapiPhoneNumberId", "bio"
];

function formatApiError(error) {
  const response = error?.response;
  if (response?.userMessage) return response.userMessage;
  if (response?.message) return response.message;
  if (typeof response?.details === "string") return response.details;
  return error?.message || "Something went wrong.";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function EditAgent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(tabs[0]);
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const [syncingRuntime, setSyncingRuntime] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [telephonyConfigs, setTelephonyConfigs] = useState([]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);

  useEffect(() => {
    load();
    loadTelephonyConfigs();
  }, [id]);

  async function loadTelephonyConfigs() {
    try {
      setTelephonyConfigs(await api("/telephony-configs"));
    } catch {
      setTelephonyConfigs([]);
    }
  }

  useEffect(() => {
    function beforeUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function load() {
    const result = await api(`/agents/${id}`);
    const agent = result.agent;
    const next = {};
    editableFields.forEach((field) => {
      next[field] = agent[field] ?? defaultValue(field);
    });
    next.dograhNeedsUpdate = Boolean(agent.dograhNeedsUpdate);
    next.dograhStatus = agent.dograhStatus || "";
    next.dograhError = agent.dograhError || "";
    next.workflowSyncStatus = agent.workflowSyncStatus || "";
    next.workflowLastSyncedAt = agent.workflowLastSyncedAt || "";
    next.workflowSyncError = agent.workflowSyncError || "";
    next.workflowVersion = agent.workflowVersion || 0;
    next.dograhWorkflowId = agent.dograhWorkflowId || "";
    next.dograhWorkflowUuid = agent.dograhWorkflowUuid || "";
    next.dograhConnectionType = agent.dograhConnectionType || (agent.dograhIntegrationId ? "user_integration" : "platform");
    next.dograhIntegrationId = agent.dograhIntegrationId || "";
    next.provider = agent.provider || (agent.dograhWorkflowId ? "dograh" : "custom");
    next.providerWorkflowId = agent.providerWorkflowId || agent.dograhWorkflowId || "";
    next.voiceConfiguration = {
      ...defaultVoiceConfiguration,
      ...(result.voiceConfiguration || {}),
      sttSettings: {
        ...defaultVoiceConfiguration.sttSettings,
        ...(result.voiceConfiguration?.sttSettings || {})
      },
      ttsSettings: {
        ...defaultVoiceConfiguration.ttsSettings,
        ...(result.voiceConfiguration?.ttsSettings || {})
      }
    };
    next.llmConfiguration = {
      ...defaultLLMConfiguration,
      ...(result.llmConfiguration || {}),
      settings: {
        ...defaultLLMConfiguration.settings,
        ...(result.llmConfiguration?.settings || {})
      }
    };
    setForm(next);
    setOriginal(next);
  }

  function defaultValue(field) {
    if (["allowInterruption", "fastReplyMode", "leadCaptureEnabled"].includes(field)) return true;
    if (field === "language") return "english";
    if (field === "callMode") return "outbound";
    if (field === "responseStyle") return "short_clear";
    if (field === "voiceProvider") return "Dograh Default";
    if (field === "sttProvider") return "dograh_default";
    if (field === "ttsProvider") return "dograh_default";
    if (field === "voiceSpeed") return "Normal";
    return "";
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function validate() {
    if (!form.agentName || !form.businessName || !form.businessCategory) return "Agent name, business name, and business category are required.";
    if (!form.systemPrompt || !form.systemPrompt.trim()) return "System prompt should not be empty.";
    if (!["english", "hindi", "hinglish", "hindi_english", "English", "Hindi", "Hinglish", "Hindi + English"].includes(form.language)) return "Language is not valid.";
    if (!["outbound", "test", "callback"].includes(form.callMode)) return "Call mode is not valid.";
    return "";
  }

  async function saveAgent() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        telephonyConfigId: form.telephonyConfigId || null
      };
      const result = await api(`/agents/${id}`, { method: "PUT", body: payload });
      const saved = result.agent || result;
      if (saved._id && saved._id !== id) {
        throw new Error("Save returned a different agent. Local edit was stopped.");
      }
      const next = {
        ...form,
        dograhNeedsUpdate: saved.dograhNeedsUpdate,
        dograhStatus: saved.dograhStatus || "",
        dograhError: saved.dograhError || "",
        workflowSyncStatus: saved.workflowSyncStatus || "",
        workflowLastSyncedAt: saved.workflowLastSyncedAt || "",
        workflowSyncError: saved.workflowSyncError || "",
        workflowVersion: saved.workflowVersion || 0,
        dograhWorkflowId: saved.dograhWorkflowId || form.dograhWorkflowId,
        dograhWorkflowUuid: saved.dograhWorkflowUuid || form.dograhWorkflowUuid,
        provider: saved.provider || form.provider,
        providerWorkflowId: saved.providerWorkflowId || form.providerWorkflowId,
        voiceConfiguration: result.voiceConfiguration || form.voiceConfiguration,
        llmConfiguration: result.llmConfiguration || form.llmConfiguration
      };
      setForm(next);
      setOriginal(next);
      if (result.warning) setError(result.warning);
      else setNotice(result.message || "Agent saved.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePrompt() {
    setError("");
    const result = await api(`/agents/${id}/regenerate-prompt-preview`, { method: "POST", body: form });
    setField("systemPrompt", result.systemPrompt);
    setNotice("Prompt regenerated as a preview. Save Agent to keep it.");
  }

  async function retryWorkflowSync() {
    setRetryingSync(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/sync-provider`, { method: "PATCH", body: { createIfMissing: false } });
      const updated = result.agent;
      setForm((current) => ({
        ...current,
        dograhNeedsUpdate: updated.dograhNeedsUpdate,
        dograhStatus: updated.dograhStatus || "",
        dograhError: updated.dograhError || "",
        workflowSyncStatus: updated.workflowSyncStatus || "",
        workflowLastSyncedAt: updated.workflowLastSyncedAt || "",
        workflowSyncError: updated.workflowSyncError || "",
        workflowVersion: updated.workflowVersion || 0,
        dograhWorkflowId: updated.dograhWorkflowId || "",
        dograhWorkflowUuid: updated.dograhWorkflowUuid || "",
        provider: updated.provider || current.provider,
        providerWorkflowId: updated.providerWorkflowId || "",
        voiceConfiguration: result.voiceConfiguration || current.voiceConfiguration,
        llmConfiguration: result.llmConfiguration || current.llmConfiguration
      }));
      setOriginal((current) => ({
        ...current,
        dograhNeedsUpdate: updated.dograhNeedsUpdate,
        dograhStatus: updated.dograhStatus || "",
        dograhError: updated.dograhError || "",
        workflowSyncStatus: updated.workflowSyncStatus || "",
        workflowLastSyncedAt: updated.workflowLastSyncedAt || "",
        workflowSyncError: updated.workflowSyncError || "",
        workflowVersion: updated.workflowVersion || 0,
        dograhWorkflowId: updated.dograhWorkflowId || "",
        dograhWorkflowUuid: updated.dograhWorkflowUuid || "",
        provider: updated.provider || current.provider,
        providerWorkflowId: updated.providerWorkflowId || "",
        voiceConfiguration: result.voiceConfiguration || current.voiceConfiguration,
        llmConfiguration: result.llmConfiguration || current.llmConfiguration
      }));
      setNotice(result.message || "Dograh workflow sync started.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setRetryingSync(false);
    }
  }

  async function syncRuntime() {
    setSyncingRuntime(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/sync-runtime`, { method: "PATCH", body: {} });
      const updated = result.agent;
      setForm((current) => ({
        ...current,
        dograhNeedsUpdate: updated?.dograhNeedsUpdate,
        dograhStatus: updated?.dograhStatus || "",
        dograhError: updated?.dograhError || "",
        workflowSyncStatus: updated?.workflowSyncStatus || "",
        workflowLastSyncedAt: updated?.workflowLastSyncedAt || "",
        workflowSyncError: updated?.workflowSyncError || "",
        workflowVersion: updated?.workflowVersion || 0,
        dograhWorkflowId: updated?.dograhWorkflowId || current.dograhWorkflowId,
        dograhWorkflowUuid: updated?.dograhWorkflowUuid || current.dograhWorkflowUuid,
        provider: updated?.provider || current.provider,
        providerWorkflowId: updated?.providerWorkflowId || current.providerWorkflowId,
        voiceConfiguration: result.voiceConfiguration || current.voiceConfiguration,
        llmConfiguration: result.llmConfiguration || current.llmConfiguration
      }));
      setOriginal((current) => ({
        ...current,
        dograhNeedsUpdate: updated?.dograhNeedsUpdate,
        dograhStatus: updated?.dograhStatus || "",
        dograhError: updated?.dograhError || "",
        workflowSyncStatus: updated?.workflowSyncStatus || "",
        workflowLastSyncedAt: updated?.workflowLastSyncedAt || "",
        workflowSyncError: updated?.workflowSyncError || "",
        workflowVersion: updated?.workflowVersion || 0,
        dograhWorkflowId: updated?.dograhWorkflowId || current.dograhWorkflowId,
        dograhWorkflowUuid: updated?.dograhWorkflowUuid || current.dograhWorkflowUuid,
        provider: updated?.provider || current.provider,
        providerWorkflowId: updated?.providerWorkflowId || current.providerWorkflowId,
        voiceConfiguration: result.voiceConfiguration || current.voiceConfiguration,
        llmConfiguration: result.llmConfiguration || current.llmConfiguration
      }));
      if (result.warning) setError(result.warning);
      else setNotice(result.message || "Dograh runtime verified.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSyncingRuntime(false);
    }
  }

  async function migrateDograh(targetConnectionType) {
    setMigrating(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/migrate-dograh`, {
        method: "POST",
        body: { targetConnectionType, targetIntegrationId: targetConnectionType === "user_integration" ? form.dograhIntegrationId : null }
      });
      const updated = result.agent;
      setForm((current) => ({
        ...current,
        dograhConnectionType: updated.dograhConnectionType || targetConnectionType,
        dograhIntegrationId: updated.dograhIntegrationId || "",
        dograhWorkflowId: updated.dograhWorkflowId || "",
        dograhWorkflowUuid: updated.dograhWorkflowUuid || "",
        providerWorkflowId: updated.providerWorkflowId || "",
        workflowSyncStatus: updated.workflowSyncStatus || "",
        workflowLastSyncedAt: updated.workflowLastSyncedAt || "",
        workflowSyncError: updated.workflowSyncError || "",
        dograhStatus: updated.dograhStatus || ""
      }));
      setNotice("Dograh migration completed and verified.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setMigrating(false);
    }
  }

  function goBack() {
    if (dirty && !confirm("You have unsaved changes. Are you sure you want to leave?")) return;
    navigate(`/agents/${id}`);
  }

  if (!form) return <div className="p-6 text-neutral-500">Loading...</div>;

  return (
    <div className="page-stack">
      <PageHeader
        title="Edit Agent"
        description="Update agent details. Dograh workflow sync starts automatically after saving."
        action={
          <>
            <button className="btn-secondary" onClick={goBack}><ArrowLeft size={16} />Back</button>
            <StatusBadge status={dirty ? "Unsaved" : "Saved"} />
          </>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {form.workflowSyncStatus === "syncing" && <div className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-700">Dograh workflow sync is running in the background.</div>}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,900px)]">
        <aside className="self-start rounded-xl border border-hairline bg-white p-3 lg:sticky lg:top-24">
          {tabs.map((item) => (
            <button
              key={item}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${item === tab ? "bg-ink text-white" : "text-neutral-600 hover:bg-neutral-50 hover:text-ink"}`}
              onClick={() => setTab(item)}
            >
              <span>{item}</span>
              {item !== tab && !dirty && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </aside>

      <div className="card min-w-0">
        <div className="mb-6">
          <h2 className="section-title">{tab}</h2>
          <p className="section-description">Edit this section without leaving the agent editor.</p>
        </div>
        {tab === "Basic Info" && (
          <div className="field-grid">
            <Field label="Provider" name="provider" value={form.provider} setField={setField} options={[
              { label: "Custom Engine", value: "custom" },
              { label: "Dograh", value: "dograh" },
              { label: "Vapi", value: "vapi" }
            ]} />
            <Field label="Telephony Configuration" name="telephonyConfigId" value={form.telephonyConfigId} setField={setField} options={[
              { label: "No telephony config", value: "" },
              ...telephonyConfigs.map((config) => ({
                label: `${config.name} (${config.provider} · ${config.phoneNumber})`,
                value: config._id
              }))
            ]} />
            {form.provider === "vapi" && (
              <div className="md:col-span-2">
                <Field
                  label="Vapi Phone Number ID"
                  name="vapiPhoneNumberId"
                  value={form.vapiPhoneNumberId}
                  setField={setField}
                  placeholder="e.g. 95d51f79-c397-46f9-b49a-23763d3eaa2d"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  The phone number's UUID from the Vapi dashboard (Phone Numbers) after importing your Twilio number — not the phone number itself.
                </p>
              </div>
            )}
            <Field label="Agent Name" name="agentName" value={form.agentName} setField={setField} />
            <Field label="Agent Type" name="agentType" value={form.agentType} setField={setField} options={agentTypes} />
            <Field label="Business Name" name="businessName" value={form.businessName} setField={setField} />
            <Field label="Business Category" name="businessCategory" value={form.businessCategory} setField={setField} />
            <div className="md:col-span-2"><Field label="Business Description" name="businessDescription" value={form.businessDescription} setField={setField} textarea /></div>
            <div className="md:col-span-2">
              <BioField value={form.bio ?? ""} onChange={(v) => setField("bio", v)} disabled={saving} />
            </div>
          </div>
        )}

        {tab === "Business Information" && (
          <div className="field-grid">
            {["services", "pricing", "faqs", "policies", "offers", "additionalInfo"].map((field) => (
              <Field key={field} label={labelFor(field)} name={field} value={form[field]} setField={setField} textarea />
            ))}
          </div>
        )}

        {tab === "System Prompt" && (
          <div className="space-y-4">
            <Field label="System Prompt" name="systemPrompt" value={form.systemPrompt} setField={setField} textarea tall />
            <div className="action-row">
              <button className="btn-secondary" onClick={regeneratePrompt}><RefreshCw size={16} />Regenerate System Prompt</button>
            </div>
          </div>
        )}

        {tab === "Call Behavior" && (
          <div className="field-grid">
            <Field label="Greeting Message" name="greetingMessage" value={form.greetingMessage} setField={setField} textarea />
            <Field label="First Message" name="firstMessage" value={form.firstMessage} setField={setField} textarea />
            <Field label="Fallback Message" name="fallbackMessage" value={form.fallbackMessage} setField={setField} textarea />
            <Field label="Ending Message" name="endingMessage" value={form.endingMessage} setField={setField} textarea />
            <Field label="Human Transfer Message" name="humanTransferMessage" value={form.humanTransferMessage} setField={setField} textarea />
            <Field label="Response Style" name="responseStyle" value={form.responseStyle} setField={setField} options={["short_clear", "friendly", "formal", "sales_focused", "supportive"]} />
            <Field label="Call Mode" name="callMode" value={form.callMode} setField={setField} options={["outbound", "test", "callback"]} />
            <Toggle label="Allow Interruption" name="allowInterruption" value={form.allowInterruption} setField={setField} />
            <Toggle label="Fast Reply Mode" name="fastReplyMode" value={form.fastReplyMode} setField={setField} />
            <Toggle label="Lead Capture Enabled" name="leadCaptureEnabled" value={form.leadCaptureEnabled} setField={setField} />
          </div>
        )}

        {tab === "Voice & Language" && (
          <div className="field-grid">
            <Field label="Conversation Language" name="language" value={form.language} setField={setField} options={languages} />
            <LLMConfigurationPanel value={form.llmConfiguration} onChange={(value) => setField("llmConfiguration", value)} />
            <Field label="Tone" name="tone" value={form.tone} setField={setField} options={tones} />
            <Field label="Personality" name="personality" value={form.personality} setField={setField} options={personalities} />
            <VoiceConfigurationPanel value={form.voiceConfiguration} onChange={(value) => setField("voiceConfiguration", value)} onSyncRuntime={syncRuntime} syncingRuntime={syncingRuntime} />
          </div>
        )}

        {tab === "Dograh Workflow" && (
          <div className="space-y-4">
            <Info label="Provider" value={form.provider} />
            <Info label="Dograh Connection" value={form.dograhConnectionType === "user_integration" ? "My Dograh" : "Platform Dograh"} />
            <Info label="Dograh Integration ID" value={form.dograhIntegrationId || "Platform managed"} />
            <Info label="Provider Workflow ID" value={form.providerWorkflowId} />
            <Info label="Workflow ID" value={form.dograhWorkflowId} />
            <Info label="Workflow UUID" value={form.dograhWorkflowUuid} />
            <Info label="Workflow Status" value={form.workflowSyncStatus || form.dograhStatus} />
            <Info label="Last Sync" value={formatDateTime(form.workflowLastSyncedAt)} />
            <Info label="Last Error" value={form.workflowSyncError || form.dograhError} />
            {!form.providerWorkflowId && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">This agent is not synced with the selected provider yet.</p>}
            {form.workflowSyncStatus === "failed" && (
              <button className="btn-primary" disabled={retryingSync} onClick={retryWorkflowSync}>
                <RefreshCw size={16} />{retryingSync ? "Retrying..." : "Retry Sync"}
              </button>
            )}
            {form.provider === "dograh" && form.dograhConnectionType === "platform" && (
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-700">
                This agent currently runs on Platform Dograh. Connecting My Dograh does not automatically move this agent.
              </p>
            )}
            {form.provider === "dograh" && form.dograhWorkflowId && (
              <button className="btn-secondary" disabled={migrating} onClick={() => migrateDograh(form.dograhConnectionType === "platform" ? "user_integration" : "platform")}>
                <RefreshCw size={16} />{migrating ? "Migrating..." : "Migrate Agent"}
              </button>
            )}
          </div>
        )}

        {dirty && (
          <div className="sticky bottom-0 -mx-6 mt-6 border-t border-hairline bg-white/95 px-6 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-500">You have unsaved changes in this agent.</p>
              <button className="btn-primary" disabled={saving} onClick={saveAgent}><Save size={16} />{saving ? "Saving..." : "Save Agent"}</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Field({ label, name, value, setField, textarea = false, tall = false, options, placeholder }) {
  return (
    <label className="field-label">
      {label}
      {options ? (
        <select className="mt-1" value={value} onChange={(event) => setField(name, event.target.value)}>
          {options.map((option) => {
            const item = typeof option === "string" ? { label: option, value: option } : option;
            return <option key={item.value} value={item.value}>{item.label}</option>;
          })}
        </select>
      ) : textarea ? (
        <textarea className={`mt-1 ${tall ? "min-h-[440px] font-mono text-xs" : ""}`} value={value} placeholder={placeholder} onChange={(event) => setField(name, event.target.value)} />
      ) : (
        <input className="mt-1" value={value} placeholder={placeholder} onChange={(event) => setField(name, event.target.value)} />
      )}
    </label>
  );
}

function Toggle({ label, name, value, setField }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
      <input className="h-4 w-4" type="checkbox" checked={Boolean(value)} onChange={(event) => setField(name, event.target.checked)} />
      {label}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
      <p className="break-words text-sm text-neutral-700">{value || "Not provided"}</p>
    </div>
  );
}

function labelFor(field) {
  return field === "additionalInfo" ? "Additional Info" : field[0].toUpperCase() + field.slice(1);
}

const BIO_MAX = 500;
const BIO_WARN_THRESHOLD = 20;

function BioField({ value, onChange, disabled }) {
  const len = (value || "").length;
  const remaining = BIO_MAX - len;
  const counterClass = remaining <= 0
    ? "bio-char-counter bio-char-counter-error"
    : remaining <= BIO_WARN_THRESHOLD
      ? "bio-char-counter bio-char-counter-warn"
      : "bio-char-counter";

  return (
    <div>
      <label className="field-label" style={{ display: "block" }}>
        Agent Bio
        <span className="field-label" style={{ display: "block", fontSize: 12, fontWeight: 400, marginTop: 2, marginBottom: 4, opacity: 0.7 }}>
          A short description shown on the agent's profile. Used to give the agent personality context.
        </span>
        <div className="bio-field-wrap">
          <textarea
            className="mt-1"
            style={{ minHeight: 96, resize: "vertical", paddingBottom: 24 }}
            value={value}
            maxLength={BIO_MAX}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. A professional and friendly sales agent for real estate inquiries…"
          />
          <span className={counterClass}>{len}/{BIO_MAX}</span>
        </div>
      </label>
    </div>
  );
}
