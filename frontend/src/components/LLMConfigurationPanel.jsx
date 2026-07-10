import { Loader2, Play, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export const defaultLLMConfiguration = {
  integrationId: null,
  provider: "google_gemini",
  model: "",
  settings: {
    temperature: 0.4,
    maxTokens: 512,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    timeoutMs: 30000,
    streaming: true,
    toolCalling: true
  }
};

const PROVIDERS = [
  { value: "platform_default", label: "Platform Default (Inbuilt)" },
  { value: "openai", label: "OpenAI" },
  { value: "google_gemini", label: "Google Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "sarvam", label: "Sarvam AI" }
];

function providerLabel(provider) {
  return PROVIDERS.find((item) => item.value === provider)?.label || provider;
}

function modelOptionLabel(model) {
  if (model.provider === "Sarvam AI") {
    if (model.id === "sarvam-30b") return "Sarvam 30B - Recommended for Voice Agents";
    if (model.id === "sarvam-105b") return "Sarvam 105B - Advanced Reasoning";
    if (model.id === "sarvam-m") return "Sarvam M - Legacy";
  }
  return `${model.name || model.id}${model.recommendedForVoiceAgents || model.recommendedForVoice ? " - Recommended for Voice Agents" : ""}${model.legacy ? " - Legacy" : ""}${model.contextLength ? ` - ${model.contextLength} ctx` : ""}`;
}

function chatCompatibleModels(items = []) {
  const byId = new Map();
  items
    .filter((model) => model.llmCompatible === true && model.chatCompletionCompatible === true && model.deprecated !== true)
    .forEach((model) => {
      const id = String(model.id || "").trim().replace(/^models\//, "");
      if (!id) return;
      byId.set(id, { ...byId.get(id), ...model, id });
    });
  return [...byId.values()];
}

function NumberField({ label, value, min, max, step, onChange }) {
  return (
    <label className="block text-sm font-semibold text-neutral-700">
      {label}
      <input className="mt-1" type="number" min={min} max={max} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm font-medium text-neutral-700">
      <input className="h-4 w-4" type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function LLMConfigurationPanel({ value, onChange, compact = false }) {
  const config = {
    ...defaultLLMConfiguration,
    ...(value || {}),
    settings: { ...defaultLLMConfiguration.settings, ...(value?.settings || {}) }
  };
  const [integrations, setIntegrations] = useState([]);
  const [models, setModels] = useState([]);
  const [modelQuery, setModelQuery] = useState("");
  const [category, setCategory] = useState("recommended");
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPrompt, setTestPrompt] = useState("Reply exactly with: LLM connection successful");
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/integrations/llm")
      .then((result) => setIntegrations(result.integrations || []))
      .catch((err) => setError(err.message));
  }, []);

  const accounts = useMemo(
    () => integrations.filter((item) => item.provider === config.provider && item.credentialStatus === "connected"),
    [integrations, config.provider]
  );

  useEffect(() => {
    if (!config.integrationId) {
      setModels([]);
      return;
    }

    setLoadingModels(true);
    setError("");
    api(`/integrations/llm/${config.integrationId}/models`)
      .then((result) => setModels(chatCompatibleModels(result.models || [])))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingModels(false));
  }, [config.provider, config.integrationId]);

  function patch(patchValue) {
    onChange({ ...config, ...patchValue });
  }

  function patchSettings(patchValue) {
    patch({ settings: { ...config.settings, ...patchValue } });
  }

  function changeProvider(provider) {
    patch({ provider, integrationId: null, model: "" });
    setModels([]);
    setTestResult(null);
  }

  async function refreshModels() {
    if (!config.integrationId) return;
    setLoadingModels(true);
    setError("");
    try {
      const result = await api(`/integrations/llm/${config.integrationId}/models?refresh=true`);
      setModels(chatCompatibleModels(result.models || []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingModels(false);
    }
  }

  async function testModel() {
    if (!config.integrationId || !config.model) return setError("Choose a connected account and model before testing.");
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const result = await api(`/integrations/llm/${config.integrationId}/test-completion`, {
        method: "POST",
        body: { model: config.model, prompt: testPrompt, settings: { ...config.settings, temperature: 0, maxOutputTokens: 20 } }
      });
      setTestResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  const categories = useMemo(() => ["recommended", ...new Set(models.map((model) => model.category).filter(Boolean))], [models]);
  const filteredModels = useMemo(() => {
    const query = modelQuery.toLowerCase();
    return models.filter((model) => {
      if (category === "recommended" && config.provider !== "sarvam" && !(model.recommendedForVoiceAgents || model.recommendedForVoice)) return false;
      if (category !== "recommended" && category && model.category !== category) return false;
      return !query || `${model.id} ${model.name} ${model.provider} ${model.description}`.toLowerCase().includes(query);
    }).slice(0, category === "recommended" ? 80 : 250);
  }, [models, modelQuery, category, config.provider]);
  const modelChoices = useMemo(() => {
    if (!config.model || filteredModels.some((model) => model.id === config.model)) return filteredModels;
    return [{ id: config.model, name: config.model }, ...filteredModels];
  }, [config.model, filteredModels]);

  const isPlatformDefault = config.provider === "platform_default";
  const credentialsConnected = Boolean(config.integrationId);
  const agentConfigured = Boolean(config.integrationId && config.model);

  return (
    <section className={compact ? "voice-provider-panel" : "space-y-4 md:col-span-2"}>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className={compact ? "voice-provider-card" : "rounded-xl border border-hairline bg-neutral-50/70 p-4 sm:p-5"}>
        <div className="mb-4 flex items-start gap-3">
          <ShieldCheck className="mt-0.5 text-neutral-500" size={19} />
          <div>
            <h3 className="font-bold text-ink">LLM Configuration</h3>
            <p className="mt-1 text-sm text-neutral-500">{compact ? "Select the connected account and model used by this agent." : "Choose the model configuration used by the voice assistant."}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-sm font-semibold text-neutral-700">
            LLM Provider
            <select className="mt-1" value={config.provider} onChange={(event) => changeProvider(event.target.value)}>
              {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
            </select>
          </label>

          {!isPlatformDefault && <label className="block text-sm font-semibold text-neutral-700">
            Connected Account
            <select className="mt-1" value={config.integrationId || ""} onChange={(event) => patch({ integrationId: event.target.value, model: "" })}>
              <option value="">Select account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.connectionName} ({account.maskedApiKey})</option>)}
            </select>
          </label>}

          {!compact && !isPlatformDefault && <label className="block text-sm font-semibold text-neutral-700 xl:col-span-1">
            Manual Model ID
            <input className="mt-1" value={config.model || ""} onChange={(event) => patch({ model: event.target.value })} placeholder="Paste model ID" />
          </label>}
        </div>

        {isPlatformDefault && (
          <div className="mt-4 rounded-xl border border-hairline bg-white px-3 py-3 text-sm text-neutral-700">
            Using the platform default model. Credits are charged per minute.
          </div>
        )}

        {!isPlatformDefault && <div className={compact ? "voice-model-card" : "mt-4 rounded-xl border border-hairline bg-white p-4"}>
          <div className={compact ? "voice-model-tools" : "mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto]"}>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="pl-9" value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Search models" />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item === "recommended" ? "Recommended for Voice Agents" : item}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={loadingModels || !config.integrationId} onClick={refreshModels}>
              {loadingModels ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Refresh
            </button>
          </div>
          <label className="block text-sm font-semibold text-neutral-700">
            Model
            <select className="mt-1" disabled={!config.integrationId || loadingModels} value={config.model || ""} onChange={(event) => patch({ model: event.target.value })}>
              <option value="">{loadingModels ? "Loading models..." : "Select model"}</option>
              {modelChoices.map((model) => (
                <option key={model.id} value={model.id}>
                  {modelOptionLabel(model)}
                </option>
              ))}
            </select>
            {!loadingModels && config.integrationId && models.length === 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700">No chat-compatible models were returned for this provider account.</p>
            )}
          </label>
        </div>}

        {compact && !isPlatformDefault && (
          <p className="voice-provider-note">Save Agent applies this LLM selection to the existing calling configuration.</p>
        )}

        {!compact && !isPlatformDefault && <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Temperature" min={0} max={2} step={0.05} value={config.settings.temperature} onChange={(value) => patchSettings({ temperature: value })} />
          <NumberField label="Maximum Output Tokens" min={16} max={4096} step={16} value={config.settings.maxTokens} onChange={(value) => patchSettings({ maxTokens: value })} />
          <NumberField label="Top P" min={0} max={1} step={0.05} value={config.settings.topP} onChange={(value) => patchSettings({ topP: value })} />
          <NumberField label="Request Timeout (ms)" min={5000} max={120000} step={1000} value={config.settings.timeoutMs} onChange={(value) => patchSettings({ timeoutMs: value })} />
          <NumberField label="Frequency Penalty" min={-2} max={2} step={0.1} value={config.settings.frequencyPenalty} onChange={(value) => patchSettings({ frequencyPenalty: value })} />
          <NumberField label="Presence Penalty" min={-2} max={2} step={0.1} value={config.settings.presencePenalty} onChange={(value) => patchSettings({ presencePenalty: value })} />
          <Toggle label="Streaming" checked={config.settings.streaming} onChange={(value) => patchSettings({ streaming: value })} />
          <Toggle label="Tool Calling" checked={config.settings.toolCalling} onChange={(value) => patchSettings({ toolCalling: value })} />
        </div>}

        {!compact && !isPlatformDefault && <div className="mt-4 rounded-xl border border-hairline bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)} />
            <button type="button" className="btn-secondary" disabled={testing || !config.integrationId || !config.model} onClick={testModel}>
              {testing ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}Test Model
            </button>
          </div>
          {testResult && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Provider Test: Successful ({testResult.latencyMs} ms). {testResult.responseText || testResult.text}</div>}
        </div>}

        {!compact && !isPlatformDefault && <div className="mt-4 rounded-xl border border-hairline bg-white px-3 py-3 text-sm text-neutral-700">
          <p className="font-bold">LLM Runtime Status</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <StatusLine label="Credentials" value={credentialsConnected ? "Connected" : "Not connected"} ok={credentialsConnected} />
            <StatusLine label="Agent" value={agentConfigured ? "Configured" : "Not configured"} ok={agentConfigured} />
            <StatusLine label="Provider" value={providerLabel(config.provider)} ok />
            <StatusLine label="Model" value={config.model || "Not selected"} ok={Boolean(config.model)} />
          </div>
          <p className="mt-1 text-xs leading-5">
            Agent configured: {providerLabel(config.provider)} {config.model ? `/ ${config.model}` : ""}.
          </p>
        </div>}
      </div>
    </section>
  );
}

function StatusLine({ label, value, ok }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className={ok ? "font-semibold text-emerald-700" : "font-semibold"}>{value}</p>
    </div>
  );
}
