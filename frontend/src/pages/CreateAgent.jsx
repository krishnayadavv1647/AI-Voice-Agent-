import { Bot, Building2, Check, ChevronLeft, ChevronRight, ClipboardList, Headphones, MessageSquareText, Plus, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
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
  provider: "custom",
  language: "english",
  llmProvider: "gemini",
  llmModel: "gemini-2.5-flash",
  sttProvider: "openai_whisper",
  ttsProvider: "openai_tts",
  voiceId: "",
  firstMessage: "",
  telephonyConfigId: "",
  voiceProvider: "Dograh Default",
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
    <label className="block min-w-0 text-sm font-semibold text-slate-700">
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
      const result = await api("/agents", { method: "POST", body: form });
      const agent = result.agent || result;
      navigate(`/agents/${agent._id}`, {
        state: {
          notice: result.dograhCreated ? "Agent created and Dograh workflow created successfully." : null,
          warning: result.dograhCreated === false ? result.warning || "Agent created locally but Dograh workflow creation failed." : null
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Create Agent" description="Build an outbound-first AI calling agent with templates, business knowledge, voice settings, and automatic Dograh workflow creation." />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          {steps.map((label, index) => (
            <button key={label} onClick={() => setStep(index)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === step ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {index + 1}. {label}
            </button>
          ))}
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="card">
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <div className="icon-tile"><StepIcon size={20} /></div>
          <div className="min-w-0">
            <h2 className="break-anywhere text-xl font-bold text-slate-950">{steps[step]}</h2>
            <p className="text-sm text-slate-500">Step {step + 1} of {steps.length}</p>
          </div>
        </div>

        {step === 0 && (
          <div>
            <div className="mb-5 max-w-md">
              <Field label="Template" name="templateType" value={form.templateType} onChange={(name, value) => chooseTemplate(value)} options={[{ label: "Select template", value: "" }, ...templateOptions]} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[...new Set([...templateOptions, ...agentTypes])].map((type) => (
                <button key={type} onClick={() => chooseType(type)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${form.agentType === type ? "border-brand-500 bg-brand-50 shadow-sm" : "border-slate-200 bg-white hover:border-brand-200 hover:shadow-sm"}`}>
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><Bot size={18} /></div>
                  <span className="break-anywhere font-semibold text-slate-950">{type}</span>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Ready-made behavior for a business calling workflow.</p>
                  <span className="mt-4 inline-flex rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Select</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider" name="provider" value={form.provider} onChange={setField} options={[
              { label: "Custom Engine", value: "custom" },
              { label: "Dograh", value: "dograh" },
              { label: "Vapi", value: "vapi" }
            ]} />
            <Field label="Telephony Configuration" name="telephonyConfigId" value={form.telephonyConfigId} onChange={setField} options={[
              { label: "No telephony config", value: "" },
              ...telephonyConfigs.map((config) => ({
                label: `${config.name} (${config.provider} · ${config.phoneNumber})`,
                value: config._id
              }))
            ]} />
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-950">Lead Capture Questions</h3>
              <button className="btn-secondary" onClick={addQuestion}><Plus size={16} />Add Question</button>
            </div>
            <div className="space-y-3">
              {form.leadQuestions.map((question, index) => (
                <div key={`${question.fieldName}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                  <input value={question.label} onChange={(event) => updateQuestion(index, "label", event.target.value)} />
                  <input value={question.fieldName} onChange={(event) => updateQuestion(index, "fieldName", event.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input className="h-4 w-4" type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, "required", event.target.checked)} />
                    Required
                  </label>
                  <button title="Remove" className="rounded-xl border border-slate-200 p-2 text-rose-600" onClick={() => removeQuestion(index)}><X size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Language" name="language" value={form.language} onChange={setField} options={languages} />
            <Field label="LLM Provider" name="llmProvider" value={form.llmProvider} onChange={setField} options={[
              { label: "Gemini", value: "gemini" },
              { label: "OpenAI", value: "openai" }
            ]} />
            <Field label="LLM Model" name="llmModel" value={form.llmModel} onChange={setField} />
            <Field label="STT Provider" name="sttProvider" value={form.sttProvider} onChange={setField} options={["openai_whisper", "deepgram", "google_stt"]} />
            <Field label="TTS Provider" name="ttsProvider" value={form.ttsProvider} onChange={setField} options={["openai_tts", "elevenlabs", "google_tts"]} />
            <Field label="Voice Provider" name="voiceProvider" value={form.voiceProvider} onChange={setField} options={["Dograh Default", "Sarvam", "Cartesia", "ElevenLabs"]} />
            <Field label="Voice ID" name="voiceId" value={form.voiceId} onChange={setField} />
            <Field label="Voice Gender" name="voiceGender" value={form.voiceGender} onChange={setField} options={["Female", "Male", "Neutral"]} />
            <Field label="Voice Style" name="voiceStyle" value={form.voiceStyle} onChange={setField} options={["Natural", "Studio", "Warm", "Crisp", "Custom"]} />
            <Field label="Tone" name="tone" value={form.tone} onChange={setField} options={tones} />
            <Field label="Speaking Speed" name="speakingSpeed" value={form.speakingSpeed} onChange={setField} options={["Slow", "Normal", "Fast"]} />
            <Field label="Personality" name="personality" value={form.personality} onChange={setField} options={personalities} />
            <div className="flex items-end"><button className="btn-secondary" type="button"><Volume2 size={16} />Voice Preview</button></div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                ["Agent type", form.agentType],
                ["Provider", form.provider === "dograh" ? "Dograh" : form.provider === "vapi" ? "Vapi" : "Custom Engine"],
                ["Business", `${form.businessName} · ${form.businessCategory}`],
                ["Goal", form.mainGoal],
                ["Knowledge", form.services || "No services added"],
                ["Lead questions", form.leadQuestions.map((q) => q.label).join(", ")],
                ["Voice", `${form.language}, ${form.voiceProvider}, ${form.voiceGender}, ${form.tone}`],
                ["Rules", form.fallbackMessage]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                  <p className="break-anywhere mt-2 text-sm text-slate-700">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-700">
              {form.provider === "dograh"
                ? "Dograh workflow will be created automatically after the local agent is saved."
                : "This agent will be saved in your own app engine without creating a Dograh workflow."}
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
    </>
  );
}
