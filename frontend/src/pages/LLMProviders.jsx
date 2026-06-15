import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, PlugZap, RefreshCw, Settings2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import DropdownMenu, { DropdownItem } from "../components/ui/DropdownMenu.jsx";
import { api } from "../lib/api.js";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", initials: "AI", description: "OpenAI chat models with dynamic model discovery and tool-capable model selection.", accent: "from-slate-950 to-slate-700" },
  { id: "google_gemini", name: "Google Gemini", initials: "G", description: "Gemini API models for fast, economical, and advanced conversational agents.", accent: "from-blue-500 to-emerald-500" },
  { id: "groq", name: "Groq", initials: "GQ", description: "Low-latency Groq-hosted chat models for responsive voice conversations.", accent: "from-orange-500 to-red-500" },
  { id: "openrouter", name: "OpenRouter", initials: "OR", description: "OpenRouter access with recommended voice models, filters, and metadata.", accent: "from-violet-500 to-indigo-600" },
  { id: "sarvam", name: "Sarvam AI", initials: "SA", description: "Indian-language focused LLMs for Hindi and multilingual voice-agent use.", accent: "from-emerald-500 to-teal-600" }
];

function statusClass(status) {
  if (status === "connected" || status === "supported") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "invalid" || status === "expired" || status === "unsupported" || status === "sync_failed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function emptyForm(provider) {
  return {
    provider,
    connectionName: "",
    apiKey: "",
    projectId: "",
    applicationName: "",
    applicationUrl: ""
  };
}

export default function LLMProviders() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm(""));
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const grouped = useMemo(() => {
    const map = new Map();
    for (const integration of integrations) {
      if (!map.has(integration.provider)) map.set(integration.provider, []);
      map.get(integration.provider).push(integration);
    }
    return map;
  }, [integrations]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api("/integrations/llm");
      setIntegrations(result.integrations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openConnect(provider, integration = null) {
    setModal({ provider, integration });
    setShowKey(false);
    setError("");
    setNotice("");
    setForm({
      ...emptyForm(provider.id),
      connectionName: integration?.connectionName || "",
      apiKey: "",
      projectId: "",
      applicationName: "",
      applicationUrl: ""
    });
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveConnection() {
    if (!form.connectionName.trim()) return setError("Connection name is required.");
    if (!modal.integration && !form.apiKey.trim()) return setError("API key is required.");

    const provider = modal.provider;
    const body = {
      connectionName: form.connectionName.trim(),
      apiKey: form.apiKey.trim(),
      projectId: form.projectId.trim(),
      applicationName: form.applicationName.trim(),
      applicationUrl: form.applicationUrl.trim()
    };
    if (!body.apiKey) delete body.apiKey;

    setWorking(`${provider.id}:connect`);
    setError("");
    try {
      if (modal.integration) {
        await api(`/integrations/llm/${modal.integration.id}`, { method: "PUT", body });
      } else {
        await api(`/integrations/llm/${provider.id}/connect`, { method: "POST", body });
      }
      setNotice(`${provider.name} connection saved and validated.`);
      setModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  }

  async function test(provider, integration) {
    setWorking(`${provider.id}:${integration.id}:test`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/llm/${integration.id}/test`, { method: "POST" });
      setNotice(`${integration.connectionName} is valid.`);
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setWorking("");
    }
  }

  async function disconnect(provider, integration) {
    if (!window.confirm(`Disconnect ${integration.connectionName}? Agents using it must be switched first.`)) return;
    setWorking(`${provider.id}:${integration.id}:disconnect`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/llm/${integration.id}`, { method: "DELETE" });
      setNotice(`${integration.connectionName} disconnected.`);
      await load();
    } catch (err) {
      const affected = err.response?.affectedAgents || [];
      const suffix = affected.length ? ` Affected agents: ${affected.map((item) => item.name).join(", ")}.` : "";
      setError(`${err.message}${suffix}`);
    } finally {
      setWorking("");
    }
  }

  return (
    <>
      <PageHeader title="LLM Providers" description="Connect user-owned OpenAI, Gemini, Groq, OpenRouter, and Sarvam AI credentials for Dograh runtime synchronization." />

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-800">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={20} />
          <p>Connected credentials are encrypted on the backend. Connected means credentials are valid; an agent is active only after Dograh sync verifies the selected provider and model.</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const providerIntegrations = grouped.get(provider.id) || [];
          return (
            <article key={provider.id} className="card flex min-h-[360px] flex-col">
              <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-sm font-semibold text-indigo-700">{provider.initials}</div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(providerIntegrations.length ? "connected" : "not_connected")}`}>
                  {providerIntegrations.length ? `${providerIntegrations.length} Connected` : "Not Connected"}
                </span>
              </div>

              <h2 className="text-lg font-bold text-slate-950">{provider.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{provider.description}</p>

              <div className="mt-5 flex-1 space-y-3">
                {providerIntegrations.map((integration) => {
                  const busy = working.startsWith(`${provider.id}:${integration.id}`);
                  return (
                    <div key={integration.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{integration.connectionName}</p>
                          <p className="break-all text-xs text-slate-500">{integration.maskedApiKey || "Masked key unavailable"}</p>
                        </div>
                        <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-slate-600">
                        <div className="flex justify-between gap-3"><span>Credentials</span><strong className="capitalize">{String(integration.credentialStatus).replaceAll("_", " ")}</strong></div>
                        <div className="flex justify-between gap-3"><span>Dograh Runtime</span><strong className="capitalize">{String(integration.runtimeStatus).replaceAll("_", " ")}</strong></div>
                        <div className="flex justify-between gap-3"><span>Last validated</span><strong className="text-right">{dateTime(integration.lastValidatedAt)}</strong></div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button className="btn-secondary flex-1 px-3 text-xs" disabled={busy} onClick={() => openConnect(provider, integration)}><Settings2 size={14} />Manage</button>
                        <DropdownMenu label={`${integration.connectionName} actions`}>
                          {({ close }) => (
                            <>
                              <DropdownItem icon={RefreshCw} disabled={busy} onClick={() => { close(); test(provider, integration); }}>Test connection</DropdownItem>
                              <DropdownItem icon={Trash2} danger disabled={busy} onClick={() => { close(); disconnect(provider, integration); }}>Disconnect</DropdownItem>
                            </>
                          )}
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
                {!providerIntegrations.length && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No connected accounts.</div>}
              </div>

              <button className="btn-primary mt-5" onClick={() => openConnect(provider)}><PlugZap size={16} />Connect Account</button>
            </article>
          );
        })}
      </div>

      {loading && <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="skeleton h-72" />)}</div>}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={() => setModal(null)}>
          <div className="w-full max-w-lg rounded-[14px] bg-white p-5 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{modal.integration ? "Manage" : "Connect"} {modal.provider.name}</h2>
                <p className="mt-1 text-sm text-slate-500">Stored keys are never shown again. Enter a new key only when replacing credentials.</p>
              </div>
              <button className="rounded-xl border border-slate-200 p-2 text-slate-500" onClick={() => setModal(null)}><XCircle size={18} /></button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Connection Name<input className="mt-1" value={form.connectionName} onChange={(event) => setField("connectionName", event.target.value)} placeholder="Production OpenAI" /></label>
              <label className="block text-sm font-semibold text-slate-700">
                {modal.provider.id === "sarvam" ? "API Subscription Key" : "API Key"}
                <div className="relative mt-1">
                  <input className="pr-12" autoComplete="off" type={showKey ? "text" : "password"} value={form.apiKey} onChange={(event) => setField("apiKey", event.target.value)} placeholder={modal.integration ? "Leave blank to keep existing key" : "Enter API key"} />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500" onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </label>
              {modal.provider.id === "openai" && <label className="block text-sm font-semibold text-slate-700">Optional Project ID<input className="mt-1" value={form.projectId} onChange={(event) => setField("projectId", event.target.value)} /></label>}
              {modal.provider.id === "openrouter" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">Application Name<input className="mt-1" value={form.applicationName} onChange={(event) => setField("applicationName", event.target.value)} /></label>
                  <label className="block text-sm font-semibold text-slate-700">Application URL<input className="mt-1" value={form.applicationUrl} onChange={(event) => setField("applicationUrl", event.target.value)} /></label>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <KeyRound className="mt-0.5 shrink-0" size={17} />
              <p>The key is sent only to your authenticated backend, validated, encrypted with AES-256-GCM, and never returned to the browser.</p>
            </div>

            {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={working.endsWith(":connect")} onClick={saveConnection}>
                {working.endsWith(":connect") ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                Connect & Validate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
