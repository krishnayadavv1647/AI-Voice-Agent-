import { AlertTriangle, Loader2, Play, Search, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, apiBlob } from "../lib/api.js";

export const defaultVoiceConfiguration = {
  sttIntegrationId: null,
  sttProvider: "deepgram",
  sttModel: "",
  sttLanguage: "en",
  sttSettings: {
    endpointing: 300,
    interimResults: true,
    smartFormat: true,
    punctuation: true,
    silenceTimeout: 1000
  },
  ttsIntegrationId: null,
  ttsProvider: "elevenlabs",
  ttsModel: "",
  ttsVoiceId: "",
  ttsLanguage: "en",
  ttsSettings: {
    speed: 1,
    stability: 0.5,
    similarityBoost: 0.75,
    volume: 1,
    emotion: "",
    outputEncoding: "",
    sampleRate: null
  }
};

function integrationFor(integrations, provider) {
  return integrations.find((item) => item.provider === provider && item.credentialStatus === "connected");
}

function optionName(item) {
  return item.name || item.id;
}

function NumberField({ label, value, min, max, step, onChange }) {
  return (
    <label className="block text-sm font-semibold text-neutral-700">
      {label}
      <input className="mt-1" type="number" min={min} max={max} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm font-medium text-neutral-700">
      <input className="h-4 w-4" type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function VoiceConfigurationPanel({ value, onChange }) {
  const config = {
    ...defaultVoiceConfiguration,
    ...(value || {}),
    sttSettings: { ...defaultVoiceConfiguration.sttSettings, ...(value?.sttSettings || {}) },
    ttsSettings: { ...defaultVoiceConfiguration.ttsSettings, ...(value?.ttsSettings || {}) }
  };
  const [integrations, setIntegrations] = useState([]);
  const [sttModels, setSttModels] = useState([]);
  const [ttsModels, setTtsModels] = useState([]);
  const [voices, setVoices] = useState([]);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [loadingStt, setLoadingStt] = useState(false);
  const [loadingTts, setLoadingTts] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/integrations/voice").then(setIntegrations).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const connected = integrationFor(integrations, config.sttProvider);
    if (!connected) return setSttModels([]);
    setLoadingStt(true);
    api(`/integrations/voice/${config.sttProvider}/models?type=stt`)
      .then((result) => setSttModels(result.models || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingStt(false));
  }, [config.sttProvider, integrations]);

  useEffect(() => {
    const connected = integrationFor(integrations, config.ttsProvider);
    if (!connected) {
      setTtsModels([]);
      setVoices([]);
      return;
    }
    setLoadingTts(true);
    setError("");
    Promise.all([
      api(`/integrations/voice/${config.ttsProvider}/models?type=tts`),
      api(`/integrations/voice/${config.ttsProvider}/voices`)
    ])
      .then(([modelResult, voiceResult]) => {
        setTtsModels(modelResult.models || []);
        setVoices(voiceResult.voices || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingTts(false));
  }, [config.ttsProvider, integrations]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    if (!voices.length || !config.ttsVoiceId) return;
    const selectedVoice = voices.find((voice) => voice.id === config.ttsVoiceId);
    if (!selectedVoice?.language || selectedVoice.language === config.ttsLanguage) return;
    patch({ ttsLanguage: selectedVoice.language });
  }, [voices, config.ttsVoiceId]);

  const sttOptions = useMemo(() => {
    const options = [{ value: "deepgram", label: "Deepgram" }];
    for (const integration of integrations) {
      if (integration.credentialStatus !== "connected" || !integration.capabilities?.stt) continue;
      options.push({ value: integration.provider, label: integration.provider === "deepgram" ? "Deepgram" : "Cartesia" });
    }
    return [...new Map(options.map((item) => [item.value, item])).values()];
  }, [integrations]);

  const ttsOptions = useMemo(() => {
    const options = [{ value: "elevenlabs", label: "ElevenLabs" }];
    for (const integration of integrations) {
      if (integration.credentialStatus !== "connected" || !integration.capabilities?.tts) continue;
      const name = integration.provider === "elevenlabs" ? "ElevenLabs" : integration.provider[0].toUpperCase() + integration.provider.slice(1);
      options.push({ value: integration.provider, label: name });
    }
    return [...new Map(options.map((item) => [item.value, item])).values()];
  }, [integrations]);

  const languages = useMemo(() => [...new Set(voices.map((voice) => voice.language).filter(Boolean))].sort(), [voices]);
  const filteredVoices = useMemo(() => voices.filter((voice) => {
    const text = `${voice.name} ${voice.language} ${voice.gender} ${voice.style}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!languageFilter || voice.language === languageFilter);
  }), [voices, search, languageFilter]);

  function patch(patchValue) {
    onChange({ ...config, ...patchValue });
  }

  function patchSttSettings(patchValue) {
    patch({ sttSettings: { ...config.sttSettings, ...patchValue } });
  }

  function patchTtsSettings(patchValue) {
    patch({ ttsSettings: { ...config.ttsSettings, ...patchValue } });
  }

  function changeSttProvider(provider) {
    const integration = integrationFor(integrations, provider);
    patch({ sttProvider: provider, sttIntegrationId: integration?.id || null, sttModel: "" });
  }

  function changeTtsProvider(provider) {
    const integration = integrationFor(integrations, provider);
    setAudioUrl("");
    patch({ ttsProvider: provider, ttsIntegrationId: integration?.id || null, ttsModel: "", ttsVoiceId: "" });
  }

  function changeTtsVoice(voiceId) {
    const selectedVoice = voices.find((voice) => voice.id === voiceId);
    patch({
      ttsVoiceId: voiceId,
      ...(selectedVoice?.language ? { ttsLanguage: selectedVoice.language } : {})
    });
  }

  async function preview() {
    if (!config.ttsVoiceId) return setError("Select a connected provider and voice before previewing.");
    setPreviewing(true);
    setError("");
    try {
      const result = await apiBlob(`/integrations/voice/${config.ttsProvider}/preview`, {
        method: "POST",
        body: {
          voiceId: config.ttsVoiceId,
          model: config.ttsModel,
          language: config.ttsLanguage,
          text: "Hello, this is a voice preview for your AI agent.",
          ...config.ttsSettings,
          outputFormat: config.ttsSettings.outputEncoding,
          sampleRate: config.ttsSettings.sampleRate
        }
      });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  const ttsCapabilities = integrationFor(integrations, config.ttsProvider)?.capabilities?.tts || {};

  return (
    <div className="space-y-6 md:col-span-2">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!integrations.some((item) => item.credentialStatus === "connected") && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>No BYOK voice provider is connected. Connect providers from Integrations - Voice Providers.</p>
        </div>
      )}

      <section className="rounded-xl border border-hairline bg-neutral-50/70 p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="font-bold text-ink">Transcriber / Speech-to-Text</h3>
          <p className="mt-1 text-sm text-neutral-500">Choose the provider that converts caller audio into text.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-sm font-semibold text-neutral-700">Provider<select className="mt-1" value={config.sttProvider} onChange={(event) => changeSttProvider(event.target.value)}>{sttOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block text-sm font-semibold text-neutral-700">Model<select className="mt-1" disabled={loadingStt} value={config.sttModel} onChange={(event) => patch({ sttModel: event.target.value })}><option value="">{loadingStt ? "Loading models..." : "Select model"}</option>{sttModels.map((item) => <option key={item.id} value={item.id}>{optionName(item)}</option>)}</select></label>
          <label className="block text-sm font-semibold text-neutral-700">Language<input className="mt-1" value={config.sttLanguage} onChange={(event) => patch({ sttLanguage: event.target.value })} placeholder="en or en-IN" /></label>
          <NumberField label="Endpointing (ms)" min={50} max={5000} step={50} value={config.sttSettings.endpointing} onChange={(value) => patchSttSettings({ endpointing: value })} />
          <NumberField label="Silence timeout (ms)" min={100} max={10000} step={100} value={config.sttSettings.silenceTimeout} onChange={(value) => patchSttSettings({ silenceTimeout: value })} />
          <div className="grid gap-2 sm:grid-cols-3 md:col-span-2 xl:col-span-3">
            <Toggle label="Interim results" checked={config.sttSettings.interimResults} onChange={(value) => patchSttSettings({ interimResults: value })} />
            <Toggle label="Smart formatting" checked={config.sttSettings.smartFormat} onChange={(value) => patchSttSettings({ smartFormat: value })} />
            <Toggle label="Punctuation" checked={config.sttSettings.punctuation} onChange={(value) => patchSttSettings({ punctuation: value })} />
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-neutral-500">Endpointing, silence timeout, interim results, smart formatting, and punctuation are stored with the agent.</p>
      </section>

      <section className="rounded-xl border border-hairline bg-neutral-50/70 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-bold text-ink">Voice / Text-to-Speech</h3>
            <p className="mt-1 text-sm text-neutral-500">Voice and model options are fetched from the connected user's real provider account.</p>
          </div>
          <button type="button" className="btn-secondary" disabled={previewing} onClick={preview}>{previewing ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}Play Preview</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-sm font-semibold text-neutral-700">Provider<select className="mt-1" value={config.ttsProvider} onChange={(event) => changeTtsProvider(event.target.value)}>{ttsOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block text-sm font-semibold text-neutral-700">Model<select className="mt-1" disabled={loadingTts} value={config.ttsModel} onChange={(event) => patch({ ttsModel: event.target.value })}><option value="">{loadingTts ? "Loading models..." : "Select model"}</option>{ttsModels.map((item) => <option key={item.id} value={item.id}>{optionName(item)}</option>)}</select></label>
          <label className="block text-sm font-semibold text-neutral-700">Language<input className="mt-1" value={config.ttsLanguage} onChange={(event) => patch({ ttsLanguage: event.target.value })} placeholder="en or hi" /></label>
        </div>

        <div className="mt-4 rounded-xl border border-hairline bg-white p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search voices by name, gender, language, or style" /></label>
            <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}><option value="">All languages</option>{languages.map((language) => <option key={language} value={language}>{language}</option>)}</select>
          </div>
          <label className="block text-sm font-semibold text-neutral-700">Voice<select className="mt-1" value={config.ttsVoiceId} onChange={(event) => changeTtsVoice(event.target.value)}><option value="">Select voice</option>{filteredVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}{voice.language ? ` - ${voice.language}` : ""}{voice.gender ? ` - ${voice.gender}` : ""}</option>)}</select></label>
          <label className="mt-3 block text-sm font-semibold text-neutral-700">Manual Voice ID / Aura model<input className="mt-1" value={config.ttsVoiceId} onChange={(event) => patch({ ttsVoiceId: event.target.value })} placeholder="Paste voice ID when it is not listed" /></label>
        </div>

        {(ttsCapabilities.previewOnlySettings || []).length > 0 && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
            Preview-only controls for the current adapter: {(ttsCapabilities.previewOnlySettings || []).map((item) => item.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}.
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ttsCapabilities.supportsSpeed !== false && <NumberField label="Speed" min={0.5} max={2} step={0.05} value={config.ttsSettings.speed} onChange={(value) => patchTtsSettings({ speed: value })} />}
          {ttsCapabilities.supportsStability && <NumberField label="Stability" min={0} max={1} step={0.05} value={config.ttsSettings.stability} onChange={(value) => patchTtsSettings({ stability: value })} />}
          {ttsCapabilities.supportsSimilarityBoost && <NumberField label="Similarity boost" min={0} max={1} step={0.05} value={config.ttsSettings.similarityBoost} onChange={(value) => patchTtsSettings({ similarityBoost: value })} />}
          {ttsCapabilities.supportsVolume && <NumberField label="Volume" min={0.5} max={2} step={0.05} value={config.ttsSettings.volume} onChange={(value) => patchTtsSettings({ volume: value })} />}
          {ttsCapabilities.supportsEmotion && <label className="block text-sm font-semibold text-neutral-700">Emotion<input className="mt-1" value={config.ttsSettings.emotion} onChange={(event) => patchTtsSettings({ emotion: event.target.value })} placeholder="neutral, happy..." /></label>}
          <label className="block text-sm font-semibold text-neutral-700">Output encoding<select className="mt-1" value={config.ttsSettings.outputEncoding || ""} onChange={(event) => patchTtsSettings({ outputEncoding: event.target.value })}><option value="">Provider default</option>{(ttsCapabilities.supportedOutputFormats || []).map((format) => <option key={format} value={format}>{format}</option>)}</select></label>
          <label className="block text-sm font-semibold text-neutral-700">Sample rate<select className="mt-1" value={config.ttsSettings.sampleRate || ""} onChange={(event) => patchTtsSettings({ sampleRate: event.target.value ? Number(event.target.value) : null })}><option value="">Provider default</option>{(ttsCapabilities.supportedSampleRates || []).map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></label>
        </div>

        {audioUrl && <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><Volume2 className="shrink-0 text-emerald-700" size={18} /><audio controls autoPlay src={audioUrl} className="w-full" /></div>}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-hairline bg-white p-4 text-sm text-neutral-600">
        <Volume2 className="mt-0.5 shrink-0" size={18} />
        <p>Saving updates the existing local agent and refreshes the provider configuration used for calls.</p>
      </div>
    </div>
  );
}
