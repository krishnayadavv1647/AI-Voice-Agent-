import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, PlugZap, RefreshCw, Settings2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import DropdownMenu, { DropdownItem } from "../components/ui/DropdownMenu.jsx";
import { api } from "../lib/api.js";

const PROVIDERS = [
  {
    id: "cartesia",
    name: "Cartesia",
    initials: "CA",
    description: "Low-latency Sonic text-to-speech with real voice discovery and secure previews.",
    accent: "from-orange-500 to-rose-500"
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    initials: "11",
    description: "Natural multilingual voices, account voice library, models, and server-side TTS previews.",
    accent: "from-slate-950 to-slate-700"
  },
  {
    id: "deepgram",
    name: "Deepgram",
    initials: "DG",
    description: "Deepgram speech-to-text and Aura text-to-speech models for voice agents.",
    accent: "from-emerald-500 to-teal-600"
  }
];

function statusClass(status) {
  if (status === "connected") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "invalid" || status === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-hairline bg-neutral-50 text-neutral-600";
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function VoiceProviders() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [modal, setModal] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const integrationMap = useMemo(() => new Map(integrations.map((item) => [item.provider, item])), [integrations]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setIntegrations(await api("/integrations/voice"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openConnect(provider) {
    setModal(provider);
    setApiKey("");
    setShowKey(false);
    setError("");
    setNotice("");
  }

  async function connect() {
    if (!apiKey.trim()) return setError("API key is required.");
    setWorking(`${modal.id}:connect`);
    setError("");
    try {
      await api(`/integrations/voice/${modal.id}/connect`, { method: "POST", body: { apiKey: apiKey.trim() } });
      setNotice(`${modal.name} connected and validated successfully.`);
      setModal(null);
      setApiKey("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  }

  async function test(provider) {
    setWorking(`${provider.id}:test`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/voice/${provider.id}/test`, { method: "POST" });
      setNotice(`${provider.name} connection is valid.`);
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setWorking("");
    }
  }

  async function disconnect(provider) {
    if (!window.confirm(`Disconnect ${provider.name}? Agents using this provider must be migrated first.`)) return;
    setWorking(`${provider.id}:disconnect`);
    setError("");
    setNotice("");
    try {
      await api(`/integrations/voice/${provider.id}`, { method: "DELETE" });
      setNotice(`${provider.name} disconnected.`);
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
    <div className="page-stack">
      <PageHeader
        title="Voice Providers"
        description="Connect users' own Cartesia, ElevenLabs, and Deepgram accounts. Keys are validated and encrypted by the backend."
      />

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-800">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={20} />
          <p>Provider requests run only through your backend. Full API keys are never returned to the browser, stored in localStorage, or included in application logs.</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const integration = integrationMap.get(provider.id);
          const connected = integration?.credentialStatus === "connected";
          const busy = working.startsWith(`${provider.id}:`);
          return (
            <article key={provider.id} className="card flex min-h-[320px] flex-col">
              <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-sm font-semibold text-indigo-700">
                  {provider.initials}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(integration?.credentialStatus)}`}>
                  {connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {connected ? "Connected" : integration?.credentialStatus === "invalid" ? "Invalid" : "Not Connected"}
                </span>
              </div>

              <h2 className="text-lg font-semibold text-ink">{provider.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-neutral-500">{provider.description}</p>

              <div className="mt-5 space-y-2 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                <div className="flex justify-between gap-3"><span>API key</span><strong className="break-all text-right text-neutral-800">{integration?.maskedApiKey || "Not saved"}</strong></div>
                <div className="flex justify-between gap-3"><span>Last validated</span><strong className="text-right text-neutral-800">{dateTime(integration?.lastValidatedAt)}</strong></div>
                <div className="flex justify-between gap-3"><span>Dograh runtime</span><strong className="text-right capitalize text-neutral-800">{String(integration?.runtimeStatus || "configuration required").replaceAll("_", " ")}</strong></div>
              </div>

              <div className="mt-5 flex gap-2">
                {!connected ? (
                  <button className="btn-primary w-full" disabled={busy} onClick={() => openConnect(provider)}><PlugZap size={16} />Connect</button>
                ) : (
                  <>
                    <button className="btn-primary flex-1" disabled={busy} onClick={() => openConnect(provider)}><Settings2 size={16} />Manage</button>
                    <DropdownMenu label={`${provider.name} actions`}>
                      {({ close }) => (
                        <>
                          <DropdownItem icon={RefreshCw} disabled={busy} onClick={() => { close(); test(provider); }}>Test connection</DropdownItem>
                          <DropdownItem icon={Trash2} danger disabled={busy} onClick={() => { close(); disconnect(provider); }}>Disconnect</DropdownItem>
                        </>
                      )}
                    </DropdownMenu>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {loading && (
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="skeleton h-72" />)}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-4 backdrop-blur-sm" onMouseDown={() => setModal(null)}>
          <div className="w-full max-w-lg rounded-[14px] bg-white p-5 shadow-pop sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Connect {modal.name}</h2>
                <p className="mt-1 text-sm text-neutral-500">The existing key will be replaced only after the new key passes a real provider validation request.</p>
              </div>
              <button className="rounded-xl border border-hairline p-2 text-neutral-500" onClick={() => setModal(null)}><XCircle size={18} /></button>
            </div>

            <label className="block text-sm font-semibold text-neutral-700">
              API Key
              <div className="relative mt-1">
                <input className="pr-12" autoComplete="off" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={`Enter ${modal.name} API key`} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-500" onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-hairline bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
              <KeyRound className="mt-0.5 shrink-0" size={17} />
              <p>The key is sent once to your authenticated backend, encrypted with AES-256-GCM, and never displayed again.</p>
            </div>

            {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={working === `${modal.id}:connect`} onClick={connect}>
                {working === `${modal.id}:connect` ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                Connect & Validate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
