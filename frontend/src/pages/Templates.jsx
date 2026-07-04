import { Eye, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AgentLikeCard from "../components/AgentLikeCard.jsx";
import { api } from "../lib/api.js";

const emptyForm = {
  businessName: "",
  businessPhone: "",
  businessWebsite: "",
  businessAddress: "",
  services: "",
  workingHours: ""
};

function errorText(err) {
  return err.response?.userMessage || err.response?.message || err.message || "Something went wrong.";
}

function initials(template) {
  return String(template.industry || template.category || template.name || "AI")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function previewList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    setError("");
    try {
      setTemplates(await api("/agent-templates"));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  function openTemplate(template) {
    setSelected(template);
    setForm(emptyForm);
    setModalError("");
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createAgent(event) {
    event.preventDefault();
    if (!form.businessName.trim()) {
      setModalError("Business Name is required.");
      return;
    }

    setSaving(true);
    setModalError("");
    try {
      const result = await api("/agents/from-template", {
        method: "POST",
        body: {
          templateId: selected._id || selected.slug,
          ...form
        }
      });
      navigate(`/agents/${result.agent._id}/edit`, { state: { notice: "Your AI agent is ready." } });
    } catch (err) {
      setModalError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agents-library-page">
      <div className="agents-library-header">
        <div>
          <h1>Choose Agent Template</h1>
          <p>Start with a ready-made agent blueprint and customize it after creation.</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Unable to load templates. Please try again.</div>}

      {loading ? (
        <div className="agent-card-grid" aria-label="Loading templates">
          {Array.from({ length: 6 }).map((_, index) => (
            <AgentLikeCard
              key={index}
              className="agent-card-generating"
              fallback="AI"
              title="Loading template"
              description="Preparing agent blueprint..."
            />
          ))}
        </div>
      ) : templates.length ? (
        <div className="agent-card-grid">
          {templates.map((template) => (
            <AgentLikeCard
              key={template._id || template.slug}
              fallback={initials(template)}
              title={template.name}
              description={template.shortDescription}
              topLeft={<span className="agent-card-template-badge">Template</span>}
              topRight={<span className="agent-card-template-category">{template.industry || template.category}</span>}
              actions={(
                <>
                  <button type="button" onClick={() => openTemplate(template)}>
                    <Sparkles size={13} />
                    <span>Use Template</span>
                  </button>
                  <button type="button" onClick={() => setPreview(template)}>
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>
                </>
              )}
            >
              <div className="agent-template-meta">
                <span>{template.useCase || "Ready-to-customize workflow"}</span>
                <span>{titleCase(template.preview?.language || "english")}</span>
                <span>{template.preview?.voiceName || "Default Voice"}</span>
              </div>
            </AgentLikeCard>
          ))}
        </div>
      ) : (
        <div className="card text-sm text-neutral-500">No templates available yet.</div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={() => !saving && setSelected(null)}>
          <form className="modal-panel w-full max-w-2xl" onSubmit={createAgent} onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{selected.industry || selected.category}</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">{selected.name}</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">{selected.longDescription || selected.shortDescription}</p>
              </div>
              <button className="rounded-lg border border-hairline p-2" type="button" disabled={saving} onClick={() => setSelected(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {modalError && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}

            <div className="field-grid">
              <Field label="Business Name" required value={form.businessName} onChange={(value) => setField("businessName", value)} />
              <Field label="Business Phone" value={form.businessPhone} onChange={(value) => setField("businessPhone", value)} />
              <Field label="Website" value={form.businessWebsite} onChange={(value) => setField("businessWebsite", value)} />
              <Field label="Business Address" value={form.businessAddress} onChange={(value) => setField("businessAddress", value)} />
              <Field label="Services" textarea value={form.services} onChange={(value) => setField("services", value)} />
              <Field label="Working Hours" textarea value={form.workingHours} onChange={(value) => setField("workingHours", value)} />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving}>{saving ? "Creating..." : "Create My Agent"}</button>
            </div>
          </form>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={() => setPreview(null)}>
          <div className="modal-panel w-full max-w-3xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{preview.industry || preview.category}</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">{preview.name}</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">{preview.preview?.useCase || preview.useCase}</p>
              </div>
              <button className="rounded-lg border border-hairline p-2" type="button" onClick={() => setPreview(null)} aria-label="Close preview">
                <X size={18} />
              </button>
            </div>

            <div className="template-preview-grid">
              <PreviewBlock title="First Message" value={preview.preview?.firstMessage} />
              <PreviewBlock title="Prompt Summary" value={preview.preview?.promptSummary || preview.longDescription || preview.shortDescription} />
              <PreviewBlock title="Best For" value={preview.useCase || preview.preview?.useCase} />
              <PreviewList title="Workflow Steps" items={previewList(preview.preview?.workflowSteps).map((step) => step.name || step.instruction)} />
              <PreviewList title="Lead Capture Fields" items={previewList(preview.preview?.leadCaptureFields).map((field) => `${field.label || titleCase(field.key)}${field.required ? " (required)" : ""}`)} />
              <PreviewList title="Voice Preview" items={[titleCase(preview.preview?.language || "english"), preview.preview?.voiceName || "Default Voice"]} />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" onClick={() => setPreview(null)}>Close</button>
              <button className="btn-primary" type="button" onClick={() => { setPreview(null); openTemplate(preview); }}>Use Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, textarea = false, required = false }) {
  return (
    <label className="field-label">
      {label}{required ? " *" : ""}
      {textarea ? (
        <textarea className="mt-1" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className="mt-1" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function PreviewBlock({ title, value }) {
  if (!value) return null;
  return (
    <section className="template-preview-block">
      <h3>{title}</h3>
      <p>{value}</p>
    </section>
  );
}

function PreviewList({ title, items }) {
  const cleanItems = items.filter(Boolean);
  if (!cleanItems.length) return null;
  return (
    <section className="template-preview-block">
      <h3>{title}</h3>
      <ul>
        {cleanItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
