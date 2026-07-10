import { Bot, Building2, Check, ChevronLeft, ChevronRight, ClipboardList, Headphones, MessageSquareText, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import ApiKeyModeToggle from "../components/ApiKeyModeToggle.jsx";
import LLMConfigurationPanel, { defaultLLMConfiguration } from "../components/LLMConfigurationPanel.jsx";
import VoiceConfigurationPanel, { defaultVoiceConfiguration, normalizeVoiceConfiguration } from "../components/VoiceConfigurationPanel.jsx";
import { api } from "../lib/api.js";
import { agentTypes, defaultLeadQuestions, languages, personalities, templateOptions, templates, tones } from "../lib/options.js";

const steps = ["Choose Template", "Business Information", "Services & FAQs", "Agent Behavior", "Language & Voice", "Review & Create"];
const stepIcons = [Sparkles, Building2, ClipboardList, MessageSquareText, Headphones, Check];

const initialForm = {
  agentName: "",
  agentType: "",
  businessName: "",
  businessCategory: "",
  businessDescription: "",
  businessWebsite: "",
  businessLocation: "",
  workingHours: "",
  contactNumber: "",
  mainGoal: "Book appointments and answer customer questions.",
  secondaryGoal: "Capture customer name, phone number, and requirement.",
  avoidInstructions: "Do not provide false information.",
  confusedInstructions: "Tell the user that the team will call back.",
  services: "",
  pricing: "",
  faqs: "",
  policies: "",
  offers: "",
  additionalInfo: "",
  leadQuestions: defaultLeadQuestions,
  templateType: "",
  provider: "vapi",
  apiKeyMode: "default_system",
  voiceConfiguration: defaultVoiceConfiguration,
  llmConfiguration: defaultLLMConfiguration,
  language: "english",
  sttProvider: "platform_default",
  ttsProvider: "platform_default",
  voiceId: "",
  firstMessage: "",
  telephonyConfigId: "",
  imageMode: "auto_generate",
  imageUrl: "",
  voiceProvider: "ElevenLabs",
  voiceGender: "Female",
  voiceStyle: "Natural",
  tone: "Professional",
  speakingSpeed: "Normal",
  personality: "Polite",
  fallbackMessage: "I am not sure about that. Our team will call you back with the right information.",
  endingMessage: "Thank you for calling. Our team will follow up soon.",
  humanTransferMessage: "I will ask a team member to contact you shortly.",
  summaryFormat: "Summarize caller name, phone number, requirement, urgency, and next step."
};

function Field({ label, name, value, onChange, type = "text", textarea = false, options }) {
  return (
    <label className="block min-w-0 text-sm font-semibold text-neutral-700">
      {label}
      {options ? (
        <select className="mt-1" value={value || ""} onChange={(event) => onChange(name, event.target.value)}>
          {options.map((option) => {
            const item = typeof option === "string" ? { label: option, value: option } : option;
            return <option key={item.value} value={item.value}>{item.label}</option>;
          })}
        </select>
      ) : textarea ? (
        <textarea className="mt-1" value={value || ""} onChange={(event) => onChange(name, event.target.value)} />
      ) : (
        <input className="mt-1" type={type} value={value || ""} onChange={(event) => onChange(name, event.target.value)} />
      )}
    </label>
  );
}

export default function CreateAgent() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [telephonyConfigs, setTelephonyConfigs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const StepIcon = stepIcons[step];

  useEffect(() => {
    async function loadTelephonyConfigs() {
      try {
        setTelephonyConfigs(await api("/telephony-configs"));
      } catch {
        setTelephonyConfigs([]);
      }
    }

    loadTelephonyConfigs();
  }, []);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function chooseType(agentType) {
    setForm((current) => ({ ...current, ...templates[agentType], agentType, templateType: current.templateType || agentType }));
  }

  function chooseTemplate(templateType) {
    setForm((current) => ({ ...current, ...(templates[templateType] || {}), templateType, agentType: templateType || current.agentType }));
  }

  function updateQuestion(index, key, value) {
    const questions = [...form.leadQuestions];
    questions[index] = { ...questions[index], [key]: value };
    setField("leadQuestions", questions);
  }

  function addQuestion() {
    setField("leadQuestions", [...form.leadQuestions, { label: "Custom Question", fieldName: `custom_${form.leadQuestions.length + 1}`, required: false }]);
  }

  function removeQuestion(index) {
    setField("leadQuestions", form.leadQuestions.filter((_, itemIndex) => itemIndex !== index));
  }

  async function createAgent() {
    setError("");
    if (!form.agentType || !form.agentName || !form.businessName) {
      setError("Agent type, agent name, and business name are required.");
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, voiceConfiguration: normalizeVoiceConfiguration(form.voiceConfiguration) };
      if (!payload.telephonyConfigId) delete payload.telephonyConfigId;
      if (payload.imageMode !== "upload_custom") delete payload.imageUrl;
      if (payload.apiKeyMode === "default_system") {
        delete payload.llmConfiguration;
        delete payload.voiceConfiguration;
      }
      const result = await api("/agents", { method: "POST", body: payload });
      const agent = result.agent || result;
      navigate(`/agents/${agent._id}`, {
        state: {
          notice: result.message || "Agent created successfully.",
          warning: result.warning || null
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Create Agent" description="Build an outbound-first AI calling agent with templates, business knowledge, and voice settings." />

      <div className="rounded-2xl border border-hairline bg-white p-3 shadow-soft sm:p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {steps.map((label, index) => (
            <button key={label} onClick={() => setStep(index)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${index === step ? "bg-ink text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
              {index + 1}. {label}
            </button>
          ))}
        </div>
        <div className="h-2 rounded-full bg-neutral-100">
          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="card">
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <div className="icon-tile"><StepIcon size={20} /></div>
          <div className="min-w-0">
            <h2 className="break-anywhere text-xl font-semibold text-ink">{steps[step]}</h2>
            <p className="text-sm text-neutral-500">Step {step + 1} of {steps.length}</p>
          </div>
        </div>

        {step === 0 && (
          <div>
            <div className="mb-5 max-w-md">
              <Field label="Template" name="templateType" value={form.templateType} onChange={(name, value) => chooseTemplate(value)} options={[{ label: "Select template", value: "" }, ...templateOptions]} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[...new Set([...templateOptions, ...agentTypes])].map((type) => (
                <button key={type} onClick={() => chooseType(type)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${form.agentType === type ? "border-brand-500 bg-brand-50 shadow-sm" : "border-hairline bg-white hover:border-brand-200 hover:shadow-sm"}`}>
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-ink text-white"><Bot size={18} /></div>
                  <span className="break-anywhere font-semibold text-ink">{type}</span>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">Ready-made behavior for a business calling workflow.</p>
                  <span className="mt-4 inline-flex rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600">Select</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider" name="provider" value={form.provider} onChange={setField} options={[
              { label: "Custom Engine", value: "custom" },
              { label: "Vapi", value: "vapi" }
            ]} />
            <Field label="Telephony Configuration" name="telephonyConfigId" value={form.telephonyConfigId} onChange={setField} options={[
              { label: "No telephony config", value: "" },
              ...telephonyConfigs.map((config) => ({
                label: `${config.name} (${config.provider} · ${config.phoneNumber})`,
                value: config._id
              }))
            ]} />
            <Field label="Image Mode" name="imageMode" value={form.imageMode} onChange={setField} options={[
              { label: "Auto Generate", value: "auto_generate" },
              { label: "Upload Custom Image", value: "upload_custom" },
              { label: "Use Default Avatar", value: "default_avatar" }
            ]} />
            {form.imageMode === "upload_custom" && (
              <Field label="Custom Image URL" name="imageUrl" value={form.imageUrl} onChange={setField} />
            )}
            <Field label="Agent Name" name="agentName" value={form.agentName} onChange={setField} />
            <Field label="Business Name" name="businessName" value={form.businessName} onChange={setField} />
            <Field label="Business Category" name="businessCategory" value={form.businessCategory} onChange={setField} />
            <Field label="Business Website" name="businessWebsite" value={form.businessWebsite} onChange={setField} />
            <Field label="Location" name="businessLocation" value={form.businessLocation} onChange={setField} />
            <Field label="Contact Number" name="contactNumber" value={form.contactNumber} onChange={setField} />
            <div className="md:col-span-2"><Field label="Business Description" name="businessDescription" value={form.businessDescription} onChange={setField} textarea /></div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            {["services", "pricing", "faqs", "policies", "offers", "additionalInfo"].map((name) => (
              <Field key={name} label={name === "additionalInfo" ? "Additional Information" : name[0].toUpperCase() + name.slice(1)} name={name} value={form[name]} onChange={setField} textarea />
            ))}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <Field label="Main Goal" name="mainGoal" value={form.mainGoal} onChange={setField} textarea />
              <Field label="Secondary Goal" name="secondaryGoal" value={form.secondaryGoal} onChange={setField} textarea />
              <Field label="Avoid Instructions" name="avoidInstructions" value={form.avoidInstructions} onChange={setField} textarea />
              <Field label="Confused Instructions" name="confusedInstructions" value={form.confusedInstructions} onChange={setField} textarea />
              <Field label="Fallback Message" name="fallbackMessage" value={form.fallbackMessage} onChange={setField} textarea />
              <Field label="First Message" name="firstMessage" value={form.firstMessage} onChange={setField} textarea />
              <Field label="Ending Message" name="endingMessage" value={form.endingMessage} onChange={setField} textarea />
              <Field label="Human Transfer Message" name="humanTransferMessage" value={form.humanTransferMessage} onChange={setField} textarea />
              <Field label="Call Summary Format" name="summaryFormat" value={form.summaryFormat} onChange={setField} textarea />
            </div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-ink">Lead Capture Questions</h3>
              <button className="btn-secondary" onClick={addQuestion}><Plus size={16} />Add Question</button>
            </div>
            <div className="space-y-3">
              {form.leadQuestions.map((question, index) => (
                <div key={`${question.fieldName}-${index}`} className="grid min-w-0 gap-3 rounded-2xl border border-hairline p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                  <input value={question.label} onChange={(event) => updateQuestion(index, "label", event.target.value)} />
                  <input value={question.fieldName} onChange={(event) => updateQuestion(index, "fieldName", event.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input className="h-4 w-4" type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, "required", event.target.checked)} />
                    Required
                  </label>
                  <button title="Remove" className="rounded-xl border border-hairline p-2 text-rose-600" onClick={() => removeQuestion(index)}><X size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Conversation Language" name="language" value={form.language} onChange={setField} options={languages} />
            <Field label="Tone" name="tone" value={form.tone} onChange={setField} options={tones} />
            <Field label="Personality" name="personality" value={form.personality} onChange={setField} options={personalities} />
            <div className="md:col-span-2">
              <ApiKeyModeToggle value={form.apiKeyMode} onChange={(value) => setField("apiKeyMode", value)} />
            </div>
            {form.apiKeyMode === "default_system" ? (
              <div className="md:col-span-2 rounded-xl border border-hairline bg-brand-50 p-4 text-sm text-brand-700">
                Inbuilt system active. LLM and voice use the platform defaults. Just Save and you can start calling. Each call's credits are deducted from your wallet.
              </div>
            ) : (
              <>
                <LLMConfigurationPanel value={form.llmConfiguration} onChange={(value) => setField("llmConfiguration", value)} />
                <p className="md:col-span-2 text-xs text-neutral-500">Voice runs on the platform Vapi account; only the LLM uses your key.</p>
                <VoiceConfigurationPanel value={form.voiceConfiguration} onChange={(value) => setField("voiceConfiguration", value)} />
                <p className="md:col-span-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">If your key is missing or invalid, the call will not start and no credits will be used.</p>
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                ["Agent type", form.agentType],
                ["Provider", form.provider === "vapi" ? "Vapi" : "Custom Engine"],
                ["Business", `${form.businessName} · ${form.businessCategory}`],
                ["Goal", form.mainGoal],
                ["Knowledge", form.services || "No services added"],
                ["Lead questions", form.leadQuestions.map((q) => q.label).join(", ")],
                ["Voice", `${form.language}, ${(form.voiceConfiguration?.ttsProvider || "elevenlabs").replaceAll("_", " ")}, ${form.voiceConfiguration?.ttsVoiceId || "default voice"}, ${form.tone}`],
                ["Rules", form.fallbackMessage]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-hairline p-4">
                  <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
                  <p className="break-anywhere mt-2 text-sm text-neutral-700">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-700">
              {form.provider === "vapi"
                ? "A Vapi assistant will be created automatically after the local agent is saved."
                : "This agent will be saved in your own app engine."}
            </div>
          </div>
        )}

        {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row">
          <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />Back</button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Next<ChevronRight size={16} /></button>
          ) : (
            <button className="btn-primary" disabled={loading} onClick={createAgent}><Check size={16} />{loading ? "Creating..." : "Create Agent"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
