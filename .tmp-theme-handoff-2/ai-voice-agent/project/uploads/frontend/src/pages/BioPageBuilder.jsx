import { Copy, Eye, Image, Palette, RefreshCw, Save, Sparkles, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { API_URL, api, getToken } from "../lib/api.js";

const fontStyles = ["modern", "professional", "friendly", "bold", "elegant"];
const animations = ["none", "fade_in", "slide_up", "zoom_in", "floating_cards", "gradient_motion", "pulse_button"];

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_URL.replace(/\/api$/, "")}${value}`;
}

export default function BioPageBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const publicUrl = agent?.publicSlug ? `${window.location.origin}/a/${agent.publicSlug}` : "";
  const selectedTemplate = useMemo(() => templates.find((template) => template.templateId === form?.template), [templates, form?.template]);

  async function load() {
    setError("");
    try {
      const [agentData, bioData, templateData] = await Promise.all([
        api(`/agents/${id}`),
        api(`/agents/${id}/bio-page`),
        api("/bio-page/templates")
      ]);
      setAgent(agentData.agent);
      setForm(bioData.bioPage);
      setTemplates(templateData);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(next = form) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/bio-page`, { method: "PATCH", body: next });
      setForm(result.bioPage);
      setNotice("Bio page saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind, file) {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/agents/${id}/bio-page/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": file.type
        },
        body: file
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(payload.message || "Upload failed");
      }
      const result = await response.json();
      setForm(result.bioPage);
      setNotice(`${kind === "logo" ? "Logo" : "Cover image"} uploaded.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function action(type) {
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/bio-page/${type}`, { method: "POST" });
      setForm(result.bioPage);
      setNotice(type === "publish" ? "Bio page published." : type === "unpublish" ? "Bio page unpublished." : "Bio page reset.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function useTemplate(template) {
    const next = { ...form, template: template.templateId, ...(template.colors || {}) };
    setForm(next);
    await save(next);
  }

  if (!form) {
    return (
      <>
        <PageHeader title="Agent Bio Page Builder" description="Loading builder..." />
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agent Bio Page Builder"
        description={`Customize the public bio page for ${agent?.agentName || "this agent"}.`}
        action={<button className="btn-secondary" onClick={() => navigate(`/agents/${id}`)}><Eye size={16} />Agent Details</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="space-y-5">
          <Panel title="Choose Template" icon={Sparkles}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <article key={template.templateId} className={`rounded-2xl border p-4 ${form.template === template.templateId ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}>
                  <div className="mb-3 aspect-video rounded-xl border border-slate-200" style={{ background: `linear-gradient(135deg, ${template.colors?.backgroundColor || "#fff"}, ${template.colors?.primaryColor || "#6C3BFF"}33)` }} />
                  <h3 className="font-bold text-slate-950">{template.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{template.description}</p>
                  <p className="mt-2 text-xs font-semibold uppercase text-slate-500">{template.recommendedUseCase}</p>
                  <div className="mt-3 action-row">
                    <button className="btn-secondary" onClick={() => setField("template", template.templateId)}>Preview</button>
                    <button className="btn-primary" onClick={() => useTemplate(template)}>Use Template</button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Branding" icon={Image}>
            <div className="grid gap-4 md:grid-cols-2">
              <UploadField label="Logo" onChange={(file) => upload("logo", file)} />
              <UploadField label="Cover Image" onChange={(file) => upload("cover", file)} />
              <Field label="Headline"><input value={form.headline || ""} onChange={(event) => setField("headline", event.target.value)} /></Field>
              <Field label="Subheadline"><input value={form.subheadline || ""} onChange={(event) => setField("subheadline", event.target.value)} /></Field>
              <Field label="Welcome Message"><textarea value={form.welcomeMessage || ""} onChange={(event) => setField("welcomeMessage", event.target.value)} /></Field>
              <div className="grid gap-4">
                <Field label="CTA Text"><input value={form.ctaText || ""} onChange={(event) => setField("ctaText", event.target.value)} /></Field>
                <Field label="Secondary CTA Text"><input value={form.secondaryCtaText || ""} onChange={(event) => setField("secondaryCtaText", event.target.value)} /></Field>
              </div>
            </div>
          </Panel>

          <Panel title="Theme" icon={Palette}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {["primaryColor", "backgroundColor", "textColor", "buttonColor"].map((field) => (
                <Field key={field} label={field}>
                  <input type="color" value={form[field] || "#6C3BFF"} onChange={(event) => setField(field, event.target.value)} />
                </Field>
              ))}
              <Field label="Font Style">
                <select value={form.fontStyle || "modern"} onChange={(event) => setField("fontStyle", event.target.value)}>
                  {fontStyles.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="Animation">
                <select value={form.animation || "fade_in"} onChange={(event) => setField("animation", event.target.value)}>
                  {animations.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
                </select>
              </Field>
            </div>
          </Panel>

          <Panel title="Visibility">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["showWebCall", "Show Web Call button"],
                ["showAppointment", "Show Appointment button"],
                ["showContactForm", "Show Contact Form"],
                ["showBusinessInfo", "Show Business Info"],
                ["showSocialLinks", "Show Social Links"]
              ].map(([field, label]) => (
                <label key={field} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3 text-sm font-semibold">
                  {label}
                  <input className="h-5 w-5" type="checkbox" checked={Boolean(form[field])} onChange={(event) => setField(field, event.target.checked)} />
                </label>
              ))}
            </div>
          </Panel>

          <div className="action-row">
            <button className="btn-primary" disabled={saving} onClick={() => save()}><Save size={16} />{saving ? "Saving..." : "Save Changes"}</button>
            <a className="btn-secondary" href={publicUrl} target="_blank"><Eye size={16} />Preview Public Page</a>
            <button className="btn-secondary" onClick={() => action("publish")}>Publish</button>
            <button className="btn-secondary" onClick={() => action("unpublish")}>Unpublish</button>
            <button className="btn-secondary" onClick={() => action("reset")}><RefreshCw size={16} />Reset to Default</button>
            <button className="btn-secondary" disabled={!publicUrl} onClick={() => navigator.clipboard.writeText(publicUrl)}><Copy size={16} />Copy Link</button>
          </div>
        </section>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Preview form={form} agent={agent} template={selectedTemplate} />
        </aside>
      </div>
    </>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        {Icon && <div className="icon-tile"><Icon size={18} /></div>}
        <h2 className="font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<div className="mt-1">{children}</div></label>;
}

function UploadField({ label, onChange }) {
  return (
    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-600">
      <Upload size={18} className="mb-2 text-brand-700" />
      {label}
      <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChange(event.target.files?.[0])} />
    </label>
  );
}

function Preview({ form, agent, template }) {
  return (
    <div className={`bio-preview bio-preview-${form.template} bio-anim-${form.animation}`} style={{ background: form.backgroundColor, color: form.textColor }}>
      <style>{previewCss}</style>
      {form.coverImageUrl && <img className="bio-preview-cover" src={assetUrl(form.coverImageUrl)} alt="" />}
      <div className="bio-preview-card">
        {form.logoUrl ? <img className="bio-preview-logo" src={assetUrl(form.logoUrl)} alt="" /> : <div className="bio-preview-mark">{(agent?.agentName || "AI").slice(0, 2).toUpperCase()}</div>}
        <StatusBadge status={form.isPublished ? "Published" : "Draft"} />
        <h2>{form.headline || agent?.businessName || agent?.agentName}</h2>
        <p>{form.subheadline || agent?.businessDescription || "Your AI assistant is ready to help."}</p>
        {form.welcomeMessage && <div className="bio-preview-note">{form.welcomeMessage}</div>}
        <div className="bio-preview-actions">
          {form.showWebCall && <button style={{ background: form.buttonColor }}>{form.ctaText || "Talk to AI Agent"}</button>}
          {form.showAppointment && <button className="secondary">{form.secondaryCtaText || "Book Appointment"}</button>}
        </div>
        {form.showBusinessInfo && <div className="bio-preview-info">{agent?.businessCategory || template?.recommendedUseCase || "Business"} - {agent?.businessLocation || "Online"}</div>}
      </div>
    </div>
  );
}

const previewCss = `
.bio-preview{overflow:hidden;position:relative;border:1px solid #e2e8f0;border-radius:1rem;padding:1rem;min-height:34rem;box-shadow:0 18px 50px rgba(15,23,42,.08)}
.bio-preview-cover{position:absolute;inset:0;width:100%;height:42%;object-fit:cover}
.bio-preview-card{position:relative;margin:5rem auto 0;max-width:22rem;border:1px solid rgba(226,232,240,.9);border-radius:1rem;background:rgba(255,255,255,.9);padding:1.25rem;backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(15,23,42,.08)}
.bio-preview-logo,.bio-preview-mark{width:4rem;height:4rem;border-radius:1rem;object-fit:cover}
.bio-preview-mark{display:grid;place-items:center;background:#111827;color:#fff;font-weight:800}
.bio-preview h2{margin:.9rem 0 .4rem;font-size:1.6rem;line-height:1.1;font-weight:800}
.bio-preview p{font-size:.95rem;line-height:1.55;color:inherit;opacity:.8}
.bio-preview-note{margin-top:1rem;border-radius:.9rem;background:rgba(108,59,255,.1);padding:.8rem;font-size:.9rem}
.bio-preview-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.bio-preview button{border:0;border-radius:.75rem;color:#fff;padding:.7rem .9rem;font-weight:700}
.bio-preview button.secondary{border:1px solid #e2e8f0;background:#fff!important;color:#111827}
.bio-preview-info{margin-top:1rem;border-top:1px solid #e2e8f0;padding-top:.8rem;font-size:.8rem;opacity:.75}
.bio-preview-modern_saas{background:linear-gradient(135deg,#eef2ff,#f8fafc)!important}.bio-preview-modern_saas .bio-preview-card{background:rgba(255,255,255,.72)}
.bio-preview-real_estate .bio-preview-card{margin-top:8rem}.bio-preview-restaurant_booking .bio-preview-card{border-radius:1.5rem}
.bio-anim-fade_in .bio-preview-card{animation:bioFade .5s ease}.bio-anim-slide_up .bio-preview-card{animation:bioSlide .5s ease}.bio-anim-zoom_in .bio-preview-card{animation:bioZoom .45s ease}.bio-anim-floating_cards .bio-preview-card{animation:bioFloat 3s ease-in-out infinite}.bio-anim-gradient_motion{background-size:200% 200%!important;animation:bioGradient 5s ease infinite}.bio-anim-pulse_button button:first-child{animation:bioPulse 1.6s infinite}
@keyframes bioFade{from{opacity:0}to{opacity:1}}@keyframes bioSlide{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes bioZoom{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}@keyframes bioFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes bioGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}@keyframes bioPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
`;
