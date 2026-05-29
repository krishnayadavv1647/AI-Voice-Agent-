import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";
import { agentTypes, defaultLeadQuestions, languages, personalities, templates, tones } from "../lib/options.js";

const steps = ["Type", "Details", "Goal", "Knowledge", "Leads", "Voice", "Rules", "Review"];

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
  language: "English",
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
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {options ? (
        <select className="mt-1" value={value} onChange={(event) => onChange(name, event.target.value)}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      ) : textarea ? (
        <textarea className="mt-1" value={value} onChange={(event) => onChange(name, event.target.value)} />
      ) : (
        <input className="mt-1" type={type} value={value} onChange={(event) => onChange(name, event.target.value)} />
      )}
    </label>
  );
}

export default function CreateAgent() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function chooseType(agentType) {
    setForm((current) => ({ ...current, ...templates[agentType], agentType }));
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
          notice: result.dograhCreated
            ? "Agent created and Dograh workflow created successfully."
            : null,
          warning: result.dograhCreated === false
            ? result.warning || "Agent created locally but Dograh workflow creation failed."
            : null
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
      <PageHeader title="Create Agent" description="Configure the voice agent step by step." />
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {steps.map((label, index) => (
            <button key={label} onClick={() => setStep(index)} className={`rounded-full px-3 py-1 text-xs font-semibold ${index === step ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {index + 1}. {label}
            </button>
          ))}
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="card">
        {step === 0 && (
          <div>
            <h2 className="mb-4 text-lg font-bold text-ink">Choose Agent Type</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {agentTypes.map((type) => (
                <button key={type} onClick={() => chooseType(type)} className={`rounded-lg border p-4 text-left ${form.agentType === type ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-200"}`}>
                  <span className="font-semibold text-ink">{type}</span>
                  <p className="mt-1 text-sm text-slate-500">Load a sensible default template.</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Agent Name" name="agentName" value={form.agentName} onChange={setField} />
            <Field label="Business Name" name="businessName" value={form.businessName} onChange={setField} />
            <Field label="Business Category" name="businessCategory" value={form.businessCategory} onChange={setField} />
            <Field label="Business Website" name="businessWebsite" value={form.businessWebsite} onChange={setField} />
            <Field label="Business Location" name="businessLocation" value={form.businessLocation} onChange={setField} />
            <Field label="Working Hours" name="workingHours" value={form.workingHours} onChange={setField} />
            <Field label="Contact Number" name="contactNumber" value={form.contactNumber} onChange={setField} />
            <div className="md:col-span-2"><Field label="Business Description" name="businessDescription" value={form.businessDescription} onChange={setField} textarea /></div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Main Goal" name="mainGoal" value={form.mainGoal} onChange={setField} textarea />
            <Field label="Secondary Goal" name="secondaryGoal" value={form.secondaryGoal} onChange={setField} textarea />
            <Field label="What should the agent avoid?" name="avoidInstructions" value={form.avoidInstructions} onChange={setField} textarea />
            <Field label="What should the agent do when confused?" name="confusedInstructions" value={form.confusedInstructions} onChange={setField} textarea />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 md:grid-cols-2">
            {["services", "pricing", "faqs", "policies", "offers", "additionalInfo"].map((name) => (
              <Field key={name} label={name === "additionalInfo" ? "Additional Business Information" : name[0].toUpperCase() + name.slice(1)} name={name} value={form[name]} onChange={setField} textarea />
            ))}
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Lead Capture Questions</h2>
              <button className="btn-secondary" onClick={addQuestion}><Plus size={16} />Add Question</button>
            </div>
            <div className="space-y-3">
              {form.leadQuestions.map((question, index) => (
                <div key={`${question.fieldName}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
                  <input value={question.label} onChange={(event) => updateQuestion(index, "label", event.target.value)} />
                  <input value={question.fieldName} onChange={(event) => updateQuestion(index, "fieldName", event.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input className="h-4 w-4" type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, "required", event.target.checked)} />
                    Required
                  </label>
                  <button title="Remove" className="rounded-lg border border-slate-200 p-2 text-rose-600" onClick={() => removeQuestion(index)}><X size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Language" name="language" value={form.language} onChange={setField} options={languages} />
            <Field label="Voice Gender" name="voiceGender" value={form.voiceGender} onChange={setField} options={["Female", "Male", "Neutral"]} />
            <Field label="Voice Style" name="voiceStyle" value={form.voiceStyle} onChange={setField} options={["Natural", "Studio", "Warm", "Crisp", "Custom"]} />
            <Field label="Tone" name="tone" value={form.tone} onChange={setField} options={tones} />
            <Field label="Speaking Speed" name="speakingSpeed" value={form.speakingSpeed} onChange={setField} options={["Slow", "Normal", "Fast"]} />
            <Field label="Personality" name="personality" value={form.personality} onChange={setField} options={personalities} />
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fallback Message" name="fallbackMessage" value={form.fallbackMessage} onChange={setField} textarea />
            <Field label="Ending Message" name="endingMessage" value={form.endingMessage} onChange={setField} textarea />
            <Field label="Human Transfer Message" name="humanTransferMessage" value={form.humanTransferMessage} onChange={setField} textarea />
            <Field label="Call Summary Format" name="summaryFormat" value={form.summaryFormat} onChange={setField} textarea />
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
              <p className="font-semibold text-ink">Default rules included in the final prompt</p>
              <p className="mt-2">Speak naturally, keep answers short, ask one question at a time, never make up information, stay inside business knowledge, collect lead details, and summarize before ending.</p>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-ink">Review & Create</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                ["Agent type", form.agentType],
                ["Business", `${form.businessName} · ${form.businessCategory}`],
                ["Goal", form.mainGoal],
                ["Knowledge", form.services || "No services added"],
                ["Lead questions", form.leadQuestions.map((q) => q.label).join(", ")],
                ["Voice", `${form.language}, ${form.voiceGender}, ${form.tone}, ${form.personality}`],
                ["Rules", form.fallbackMessage]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                  <p className="mt-2 text-sm text-slate-700">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-6 flex justify-between">
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
