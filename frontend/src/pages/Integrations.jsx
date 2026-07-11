import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PanelLeft,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  XCircle
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { api } from "../lib/api.js";

const VOICE_PROVIDERS = [
  { id: "cartesia", name: "Cartesia", initials: "CA", category: "voice", domain: "cartesia.ai", description: "Low-latency Sonic text-to-speech with real voice discovery and secure previews." },
  { id: "elevenlabs", name: "ElevenLabs", initials: "11", category: "voice", domain: "elevenlabs.io", description: "Natural multilingual voices, account voice library, models, and server-side TTS previews." },
  { id: "deepgram", name: "Deepgram", initials: "DG", category: "voice", domain: "deepgram.com", description: "Deepgram speech-to-text and Aura text-to-speech models for voice agents." }
];

const MODEL_PROVIDERS = [
  { id: "openai", name: "OpenAI", initials: "AI", category: "model", domain: "openai.com", description: "OpenAI chat models with dynamic model discovery and tool-capable model selection." },
  { id: "google_gemini", name: "Google Gemini", initials: "G", category: "model", domain: "gemini.google.com", description: "Gemini API models for fast, economical, and advanced conversational agents." },
  { id: "groq", name: "Groq", initials: "GQ", category: "model", domain: "groq.com", description: "Low-latency Groq-hosted chat models for responsive voice conversations." },
  { id: "openrouter", name: "OpenRouter", initials: "OR", category: "model", domain: "openrouter.ai", description: "OpenRouter access with recommended voice models, filters, and metadata." },
  { id: "sarvam", name: "Sarvam AI", initials: "SA", category: "model", domain: "sarvam.ai", description: "Indian-language focused LLMs for Hindi and multilingual voice-agent use." }
];

const SECTIONS = [
  { key: "voice", title: "Voice Providers", icon: AudioLines, providers: VOICE_PROVIDERS },
  { key: "model", title: "Model Providers", icon: Cpu, providers: MODEL_PROVIDERS }
];

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function emptyLlmForm(provider) {
  return { provider, connectionName: "", apiKey: "", projectId: "", applicationName: "", applicationUrl: "" };
}

function providerLogoUrl(provider) {
  return `https://www.google.com/s2/favicons?domain=${provider.domain}&sz=128`;
}

export default function Integrations() {
  const queryClient = useQueryClient();
  const { data: voiceData, error: voiceError, isFetching: voiceFetching } = useQuery({
    queryKey: ["integrations", "voice"],
    queryFn: () => api("/integrations/voice")
  });
  const { data: llmData, error: llmError, isFetching: llmFetching } = useQuery({
    queryKey: ["integrations", "llm"],
    queryFn: () => api("/integrations/llm")
  });
  const voiceIntegrations = voiceData || [];
  const llmIntegrations = llmData?.integrations || [];
  const loading = voiceFetching || llmFetching;
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [collapsed, setCollapsed] = useState({ voice: false, model: false });

  const [voiceModal, setVoiceModal] = useState(null);
  const [voiceApiKey, setVoiceApiKey] = useState("");
  const [showVoiceKey, setShowVoiceKey] = useState(false);

  const [llmModal, setLlmModal] = useState(null);
  const [llmForm, setLlmForm] = useState(emptyLlmForm(""));
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState(null);

  const voiceMap = useMemo(() => new Map(voiceIntegrations.map((item) => [item.provider, item])), [voiceIntegrations]);
  const llmGrouped = useMemo(() => {
    const map = new Map();
    for (const integration of llmIntegrations) {
      if (!map.has(integration.provider)) map.set(integration.provider, []);
      map.get(integration.provider).push(integration);
    }
    return map;
  }, [llmIntegrations]);

  // Surface load errors through the shared error banner.
  useEffect(() => {
    const loadError = voiceError || llmError;
    if (loadError) setError(loadError.message);
  }, [voiceError, llmError]);

  function reloadAll() {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  }

  function isConnected(provider) {
    if (provider.category === "voice") return voiceMap.get(provider.id)?.credentialStatus === "connected";
    return (llmGrouped.get(provider.id) || []).length > 0;
  }

  function toggleSection(key) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllSections() {
    const anyOpen = Object.values(collapsed).some((value) => !value);
    setCollapsed({ voice: anyOpen, model: anyOpen });
  }

  function openProvider(provider) {
    setError("");
    setNotice("");
    if (provider.category === "voice") {
      setVoiceModal(provider);
      setVoiceApiKey("");
      setShowVoiceKey(false);
    } else {
      setLlmModal(provider);
      setEditingIntegration(null);
      setShowLlmKey(false);
      setLlmForm(emptyLlmForm(provider.id));
    }
  }

  // -- Voice handlers (logic preserved from VoiceProviders) --
  async function connectVoice() {
    if (!voiceApiKey.trim()) return setError("API key is required.");
    setWorking(`${voiceModal.id}:connect`);
    setError("");
    try {
      await api(`/integrations/voice/${voiceModal.id}/connect`, { method: "POST", body: { apiKey: voiceApiKey.trim() } });
      setNotice(`${voiceModal.name} connected and validated successfully.`);
      setVoiceModal(null);
      setVoiceApiKey("");
      reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  }

  async function testVoice(provider) {
    setWorking(`${provider.id}:test`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/voice/${provider.id}/test`, { method: "POST" });
      setNotice(`${provider.name} connection is valid.`);
      reloadAll();
    } catch (err) {
      setError(err.message);
      reloadAll();
    } finally {
      setWorking("");
    }
  }

  async function disconnectVoice(provider) {
    if (!window.confirm(`Disconnect ${provider.name}? Agents using this provider must be migrated first.`)) return;
    setWorking(`${provider.id}:disconnect`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/voice/${provider.id}`, { method: "DELETE" });
      setNotice(`${provider.name} disconnected.`);
      setVoiceModal(null);
      reloadAll();
    } catch (err) {
      const affected = err.response?.affectedAgents || [];
      const suffix = affected.length ? ` Affected agents: ${affected.map((item) => item.name).join(", ")}.` : "";
      setError(`${err.message}${suffix}`);
    } finally {
      setWorking("");
    }
  }

  // -- LLM handlers (logic preserved from LLMProviders) --
  function setLlmField(name, value) {
    setLlmForm((current) => ({ ...current, [name]: value }));
  }

  function editLlmConnection(integration) {
    setEditingIntegration(integration);
    setShowLlmKey(false);
    setLlmForm({ ...emptyLlmForm(llmModal.id), connectionName: integration.connectionName || "" });
  }

  function newLlmConnection() {
    setEditingIntegration(null);
    setShowLlmKey(false);
    setLlmForm(emptyLlmForm(llmModal.id));
  }

  async function saveLlmConnection() {
    if (!llmForm.connectionName.trim()) return setError("Connection name is required.");
    if (!editingIntegration && !llmForm.apiKey.trim()) return setError("API key is required.");

    const provider = llmModal;
    const body = {
      connectionName: llmForm.connectionName.trim(),
      apiKey: llmForm.apiKey.trim(),
      projectId: llmForm.projectId.trim(),
      applicationName: llmForm.applicationName.trim(),
      applicationUrl: llmForm.applicationUrl.trim()
    };
    if (!body.apiKey) delete body.apiKey;

    setWorking(`${provider.id}:connect`);
    setError("");
    try {
      if (editingIntegration) {
        await api(`/integrations/llm/${editingIntegration.id}`, { method: "PUT", body });
      } else {
        await api(`/integrations/llm/${provider.id}/connect`, { method: "POST", body });
      }
      setNotice(`${provider.name} connection saved and validated.`);
      setEditingIntegration(null);
      setLlmForm(emptyLlmForm(provider.id));
      reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  }

  async function testLlm(provider, integration) {
    setWorking(`${provider.id}:${integration.id}:test`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/llm/${integration.id}/test`, { method: "POST" });
      setNotice(`${integration.connectionName} is valid.`);
      reloadAll();
    } catch (err) {
      setError(err.message);
      reloadAll();
    } finally {
      setWorking("");
    }
  }

  async function disconnectLlm(provider, integration) {
    if (!window.confirm(`Disconnect ${integration.connectionName}? Agents using it must be switched first.`)) return;
    setWorking(`${provider.id}:${integration.id}:disconnect`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/llm/${integration.id}`, { method: "DELETE" });
      setNotice(`${integration.connectionName} disconnected.`);
      reloadAll();
    } catch (err) {
      const affected = err.response?.affectedAgents || [];
      const suffix = affected.length ? ` Affected agents: ${affected.map((item) => item.name).join(", ")}.` : "";
      setError(`${err.message}${suffix}`);
    } finally {
      setWorking("");
    }
  }

  const sections = SECTIONS.map((section) => ({
    ...section,
    matches: section.providers
  }));

  return (
    <div className="page-stack">
      <PageHeader
        title="Integrations"
        description="Connect voice and model providers for your agents."
        action={(
          <div className="action-row">
            <button
              className="btn-secondary"
              onClick={toggleAllSections}
              title="Collapse or expand all sections"
            >
              <PanelLeft size={18} strokeWidth={1.8} />
              Sections
            </button>
            <button
              className="btn-primary"
              onClick={reloadAll}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </div>
        )}
      />

      {(error || notice) && (
        <div className="space-y-2">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
        </div>
      )}

      <div className="space-y-10">
        {loading && !voiceIntegrations.length && !llmIntegrations.length ? (
          <PageLoader label="Loading integrations" />
        ) : (
          sections.map((section) => {
            const open = !collapsed[section.key];
            const SectionIcon = section.icon;
            return (
              <section key={section.key}>
                <button
                  className="flex w-full items-center gap-3 pb-3 text-left focus-visible:outline-none"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={open}
                >
                  <span className="icon-tile h-7 w-7">
                    <SectionIcon size={16} strokeWidth={1.8} />
                  </span>
                  <h2 className="section-title">{section.title}</h2>
                  <span className="text-xs tabular-nums text-neutral-500">{section.matches.length}</span>
                  <ChevronDown
                    size={18}
                    className={`ml-auto text-neutral-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
                  />
                </button>
                <div className="border-t border-hairline" />

                {open && (
                  <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {section.matches.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        connected={isConnected(provider)}
                        connectionCount={provider.category === "model" ? (llmGrouped.get(provider.id) || []).length : 0}
                        onClick={() => openProvider(provider)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {voiceModal && (
        <VoiceModal
          provider={voiceModal}
          integration={voiceMap.get(voiceModal.id)}
          apiKey={voiceApiKey}
          setApiKey={setVoiceApiKey}
          showKey={showVoiceKey}
          setShowKey={setShowVoiceKey}
          working={working}
          error={error}
          onClose={() => setVoiceModal(null)}
          onConnect={connectVoice}
          onTest={() => testVoice(voiceModal)}
          onDisconnect={() => disconnectVoice(voiceModal)}
        />
      )}

      {llmModal && (
        <LlmModal
          provider={llmModal}
          connections={llmGrouped.get(llmModal.id) || []}
          form={llmForm}
          setField={setLlmField}
          showKey={showLlmKey}
          setShowKey={setShowLlmKey}
          editing={editingIntegration}
          working={working}
          error={error}
          onClose={() => setLlmModal(null)}
          onSave={saveLlmConnection}
          onNew={newLlmConnection}
          onEdit={editLlmConnection}
          onTest={(integration) => testLlm(llmModal, integration)}
          onDisconnect={(integration) => disconnectLlm(llmModal, integration)}
        />
      )}
    </div>
  );
}

function ProviderCard({ provider, connected, connectionCount, onClick }) {
  const deprecated = provider.status === "deprecated";
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[9rem] flex-col rounded-2xl border bg-white p-5 text-left shadow-soft transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
        connected ? "border-neutral-400" : "border-hairline"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-hairline bg-white p-2">
          <img
            src={providerLogoUrl(provider)}
            alt={`${provider.name} logo`}
            className="h-full w-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <span className="hidden text-sm font-semibold text-ink">{provider.initials}</span>
        </span>
        {connected && (
          <span className="badge border-neutral-300 bg-neutral-50 text-neutral-700">
            <CheckCircle2 size={12} />
            {connectionCount > 1 ? `${connectionCount} connected` : "Connected"}
          </span>
        )}
      </div>
      <h3 className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-ink">
        {provider.name}
        {deprecated && <span className="badge border-neutral-300 bg-neutral-50 text-[10px] uppercase text-neutral-600">Deprecated</span>}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-neutral-500">{provider.description}</p>
    </button>
  );
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="modal-panel p-5 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
          </div>
          <button className="btn-secondary min-h-0 p-2" onClick={onClose} aria-label="Close"><XCircle size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function VoiceModal({ provider, integration, apiKey, setApiKey, showKey, setShowKey, working, error, onClose, onConnect, onTest, onDisconnect }) {
  const connected = integration?.credentialStatus === "connected";
  const busy = working.startsWith(`${provider.id}:`);
  return (
    <ModalShell
      title={`${connected ? "Manage" : "Connect"} ${provider.name}`}
      subtitle="The existing key is replaced only after the new key passes a real provider validation request."
      onClose={onClose}
    >
      {connected && (
        <div className="mb-4 space-y-2 rounded-xl border border-hairline bg-neutral-50 p-3 text-xs text-neutral-600">
          <div className="flex justify-between gap-3"><span>API key</span><strong className="break-all text-right text-neutral-800">{integration?.maskedApiKey || "Not saved"}</strong></div>
          <div className="flex justify-between gap-3"><span>Last validated</span><strong className="text-right text-neutral-800">{dateTime(integration?.lastValidatedAt)}</strong></div>
          <div className="flex justify-between gap-3"><span>Runtime status</span><strong className="text-right capitalize text-neutral-800">{String(integration?.runtimeStatus || "configuration required").replaceAll("_", " ")}</strong></div>
        </div>
      )}

      <label className="block text-sm font-semibold text-neutral-700">
        API Key
        <div className="relative mt-1">
          <input className="pr-12" autoComplete="off" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={connected ? "Enter a new key to replace" : `Enter ${provider.name} API key`} />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-500" onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
      </label>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-hairline bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
        <KeyRound className="mt-0.5 shrink-0" size={17} />
        <p>The key is sent once to your authenticated backend, encrypted with AES-256-GCM, and never displayed again.</p>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {connected && (
            <>
              <button className="btn-secondary" disabled={busy} onClick={onTest}><RefreshCw size={16} />Test</button>
              <button className="btn-danger" disabled={busy} onClick={onDisconnect}><Trash2 size={16} />Disconnect</button>
            </>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={working === `${provider.id}:connect`} onClick={onConnect}>
            {working === `${provider.id}:connect` ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            Connect & Validate
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function LlmModal({ provider, connections, form, setField, showKey, setShowKey, editing, working, error, onClose, onSave, onNew, onEdit, onTest, onDisconnect }) {
  return (
    <ModalShell
      title={`${editing ? "Manage" : "Connect"} ${provider.name}`}
      subtitle="Stored keys are never shown again. Enter a new key only when replacing credentials."
      onClose={onClose}
    >
      {connections.length > 0 && (
        <div className="mb-5 space-y-2">
          {connections.map((integration) => {
            const busy = working.startsWith(`${provider.id}:${integration.id}`);
            const active = editing?.id === integration.id;
            return (
              <div key={integration.id} className={`rounded-xl border p-3 ${active ? "border-brand-300 bg-brand-50/40" : "border-hairline bg-neutral-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{integration.connectionName}</p>
                    <p className="break-all text-xs text-neutral-500">{integration.maskedApiKey || "Masked key unavailable"}</p>
                    <p className="mt-1 text-xs capitalize text-neutral-500">Runtime: {String(integration.runtimeStatus).replaceAll("_", " ")} - Validated {dateTime(integration.lastValidatedAt)}</p>
                  </div>
                  <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-secondary px-3 text-xs" disabled={busy} onClick={() => onEdit(integration)}><Settings2 size={14} />Manage</button>
                  <button className="btn-secondary px-3 text-xs" disabled={busy} onClick={() => onTest(integration)}><RefreshCw size={14} />Test</button>
                  <button className="btn-danger px-3 text-xs" disabled={busy} onClick={() => onDisconnect(integration)}><Trash2 size={14} />Disconnect</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-700">{editing ? `Editing: ${editing.connectionName}` : "Connect new account"}</h3>
        {editing && <button className="text-xs font-medium text-brand-700 hover:text-brand-800" onClick={onNew}>+ New connection</button>}
      </div>

      <div className="mt-3 space-y-4">
        <label className="block text-sm font-semibold text-neutral-700">Connection Name<input className="mt-1" value={form.connectionName} onChange={(event) => setField("connectionName", event.target.value)} placeholder="Production OpenAI" /></label>
        <label className="block text-sm font-semibold text-neutral-700">
          {provider.id === "sarvam" ? "API Subscription Key" : "API Key"}
          <div className="relative mt-1">
            <input className="pr-12" autoComplete="off" type={showKey ? "text" : "password"} value={form.apiKey} onChange={(event) => setField("apiKey", event.target.value)} placeholder={editing ? "Leave blank to keep existing key" : "Enter API key"} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-500" onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </label>
        {provider.id === "openai" && <label className="block text-sm font-semibold text-neutral-700">Optional Project ID<input className="mt-1" value={form.projectId} onChange={(event) => setField("projectId", event.target.value)} /></label>}
        {provider.id === "openrouter" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-neutral-700">Application Name<input className="mt-1" value={form.applicationName} onChange={(event) => setField("applicationName", event.target.value)} /></label>
            <label className="block text-sm font-semibold text-neutral-700">Application URL<input className="mt-1" value={form.applicationUrl} onChange={(event) => setField("applicationUrl", event.target.value)} /></label>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-hairline bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
        <KeyRound className="mt-0.5 shrink-0" size={17} />
        <p>The key is sent only to your authenticated backend, validated, encrypted with AES-256-GCM, and never returned to the browser.</p>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={working.endsWith(":connect")} onClick={onSave}>
          {working.endsWith(":connect") ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
          {editing ? "Save & Validate" : "Connect & Validate"}
        </button>
      </div>
    </ModalShell>
  );
}
