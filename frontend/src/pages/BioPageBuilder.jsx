import {
  BadgePercent,
  Briefcase,
  BookOpen,
  Building2,
  Calendar,
  Copy,
  DollarSign,
  Eye,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Home,
  Image,
  Landmark,
  Link as LinkIcon,
  MessageCircle,
  Palette,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Users,
  Utensils,
  Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { API_URL, api, getToken } from "../lib/api.js";

const fontStyles = ["modern", "professional", "friendly", "bold", "elegant"];
const animations = ["none", "fade_in", "slide_up", "zoom_in", "floating_cards", "gradient_motion", "pulse_button"];
const topicIconOptions = [
  "GraduationCap",
  "BookOpen",
  "DollarSign",
  "Landmark",
  "Calendar",
  "Phone",
  "MessageCircle",
  "Home",
  "HeartPulse",
  "Utensils",
  "Building2",
  "Users",
  "BadgePercent",
  "HelpCircle"
];

const topicIconMap = {
  BadgePercent,
  BookOpen,
  Building2,
  Calendar,
  DollarSign,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Home,
  Landmark,
  MessageCircle,
  Phone,
  Users,
  Utensils
};

const defaultQuickTopics = [
  { id: "admissions", title: "Admissions", description: "Understand the step-by-step admission process", icon: "Landmark", iconType: "lucide", iconImageUrl: "", color: "#2563EB", prompt: "Walk me through the admission process.", isVisible: true, order: 0 },
  { id: "courses", title: "Courses", description: "Explore courses and batches", icon: "BookOpen", iconType: "lucide", iconImageUrl: "", color: "#2563EB", prompt: "What courses and batches do you offer?", isVisible: true, order: 1 },
  { id: "fees", title: "Fees", description: "Get details about fees and payments", icon: "DollarSign", iconType: "lucide", iconImageUrl: "", color: "#2563EB", prompt: "I want to know about fees and payment options.", isVisible: true, order: 2 },
  { id: "scholarships", title: "Scholarships", description: "Find scholarships and financial aid", icon: "GraduationCap", iconType: "lucide", iconImageUrl: "", color: "#2563EB", prompt: "What scholarships and financial aid are available?", isVisible: true, order: 3 }
];

const defaults = {
  template: "coaching_education",
  logoUrl: "",
  coverImageUrl: "",
  agentImageUrl: "",
  headline: "",
  subheadline: "",
  welcomeMessage: "",
  primaryCtaText: "Talk to AI Agent",
  ctaText: "Talk to AI Agent",
  secondaryCtaText: "Book Appointment",
  voiceCallCtaText: "Voice Call",
  primaryColor: "#2563EB",
  backgroundColor: "#F8FAFC",
  textColor: "#0F172A",
  buttonColor: "#2563EB",
  cardColor: "#FFFFFF",
  accentColor: "#DBEAFE",
  fontStyle: "modern",
  animation: "fade_in",
  showWebCall: true,
  showWebCallButton: true,
  showAppointment: true,
  showAppointmentButton: true,
  showContactForm: false,
  showBusinessInfo: true,
  showSocialLinks: false,
  showVoiceCallButton: true,
  businessInfo: {
    businessName: "",
    category: "",
    location: "",
    availability: "Online now",
    responseTime: "< 30 sec"
  },
  socialLinks: {
    website: "",
    instagram: "",
    facebook: "",
    whatsapp: "",
    linkedin: ""
  },
  quickTopics: defaultQuickTopics
};

function errorText(err) {
  return err.response?.userMessage || err.response?.message || err.message || "Something went wrong.";
}

function assetUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return `${API_URL.replace(/\/api$/, "")}${value}`;
}

function cleanForm(value = {}, agent = {}) {
  return {
    ...defaults,
    ...value,
    primaryCtaText: value.primaryCtaText || value.ctaText || defaults.primaryCtaText,
    ctaText: value.ctaText || value.primaryCtaText || defaults.ctaText,
    showWebCallButton: value.showWebCallButton ?? value.showWebCall ?? true,
    showWebCall: value.showWebCall ?? value.showWebCallButton ?? true,
    showAppointmentButton: value.showAppointmentButton ?? value.showAppointment ?? true,
    showAppointment: value.showAppointment ?? value.showAppointmentButton ?? true,
    businessInfo: {
      ...defaults.businessInfo,
      businessName: agent.businessName || "",
      category: agent.businessCategory || "",
      location: agent.businessLocation || "",
      ...(value.businessInfo || {})
    },
    socialLinks: {
      ...defaults.socialLinks,
      website: agent.businessWebsite || "",
      ...(value.socialLinks || {})
    },
    quickTopics: Array.isArray(value.quickTopics) && value.quickTopics.length
      ? value.quickTopics.slice(0, 8).map((topic, index) => ({ ...topic, order: Number.isFinite(Number(topic.order)) ? Number(topic.order) : index }))
      : defaultQuickTopics.map((topic) => ({ ...topic }))
  };
}

export default function BioPageBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(null);
  const [webCallStatus, setWebCallStatus] = useState(null);
  const [webCallBusy, setWebCallBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const publicUrl = agent?.publicSlug ? `${window.location.origin}/a/${agent.publicSlug}` : "";
  const webCallEnabled = Boolean(webCallStatus?.publicWebCallEnabled ?? webCallStatus?.dograhWidgetEnabled);
  const webCallProvider = webCallStatus?.webCallProvider === "dograh" ? "Dograh" : "Vapi";

  async function load() {
    setError("");
    try {
      const [agentData, bioData, templateData] = await Promise.all([
        api(`/agents/${id}`),
        api(`/agents/${id}/bio-page`),
        api("/bio-page/templates")
      ]);
      const loadedAgent = agentData.agent;
      setAgent(loadedAgent);
      setForm(cleanForm(bioData.bioPage, loadedAgent));
      setTemplates(templateData);
      loadWebCallStatus().catch(() => {});
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function loadWebCallStatus() {
    const status = await api(`/agents/${id}/dograh/embed-token`);
    setWebCallStatus(status);
    return status;
  }

  useEffect(() => {
    load();
  }, [id]);

  function setField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "primaryCtaText") next.ctaText = value;
      if (field === "showWebCallButton") next.showWebCall = value;
      if (field === "showAppointmentButton") next.showAppointment = value;
      return next;
    });
  }

  function setNested(group, field, value) {
    setForm((current) => ({ ...current, [group]: { ...(current[group] || {}), [field]: value } }));
  }

  function normalizeTopicOrder(topics) {
    return topics.map((topic, index) => ({ ...topic, order: index }));
  }

  function setTopic(index, field, value) {
    setForm((current) => ({
      ...current,
      quickTopics: normalizeTopicOrder((current.quickTopics || defaultQuickTopics).map((topic, topicIndex) => (
        topicIndex === index ? { ...topic, [field]: value } : topic
      )))
    }));
  }

  function addTopic() {
    setForm((current) => {
      const topics = current.quickTopics || [];
      if (topics.length >= 8) return current;
      return {
        ...current,
        quickTopics: normalizeTopicOrder([
          ...topics,
          {
            id: `topic-${Date.now()}`,
            title: "New Topic",
            description: "Describe this topic",
            icon: "MessageCircle",
            iconType: "lucide",
            iconImageUrl: "",
            color: "#2563EB",
            prompt: "Tell me more about this.",
            isVisible: true,
            order: topics.length
          }
        ])
      };
    });
  }

  function moveTopic(index, direction) {
    setForm((current) => {
      const topics = [...(current.quickTopics || [])];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= topics.length) return current;
      [topics[index], topics[nextIndex]] = [topics[nextIndex], topics[index]];
      return { ...current, quickTopics: normalizeTopicOrder(topics) };
    });
  }

  function deleteTopic(index) {
    setForm((current) => ({
      ...current,
      quickTopics: normalizeTopicOrder((current.quickTopics || []).filter((_, topicIndex) => topicIndex !== index))
    }));
  }

  async function save(next = form) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/bio-page`, { method: "PUT", body: next });
      setForm(cleanForm(result.bioPage, agent));
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
    const localPreview = URL.createObjectURL(file);
    const field = kind === "logo" ? "logoUrl" : kind === "cover" ? "coverImageUrl" : "agentImageUrl";
    setField(field, localPreview);
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
      setForm(cleanForm(result.bioPage, agent));
      setNotice(kind === "agent-image" ? "Agent image uploaded." : kind === "logo" ? "Logo uploaded." : "Cover image uploaded.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadTopicIcon(index, file) {
    if (!file) return;
    setError("");
    setNotice("");
    const localPreview = URL.createObjectURL(file);
    setTopic(index, "iconType", "image");
    setTopic(index, "iconImageUrl", localPreview);
    try {
      const response = await fetch(`${API_URL}/agents/${id}/bio-page/topic-icon`, {
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
      setTopic(index, "iconImageUrl", result.iconImageUrl);
      setNotice("Topic icon uploaded.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function action(type) {
    setError("");
    setNotice("");
    if (type === "reset" && !window.confirm("Reset this bio page to default settings?")) return;
    try {
      const result = await api(`/agents/${id}/bio-page/${type}`, { method: "POST" });
      setForm(cleanForm(result.bioPage, agent));
      setNotice(type === "publish" ? "Bio page published." : type === "unpublish" ? "Bio page unpublished." : "Bio page reset.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function setWebCalling(enabled) {
    setError("");
    setNotice("");
    setWebCallBusy(true);
    try {
      const result = await api(`/agents/${id}/dograh/embed-token`, { method: enabled ? "POST" : "DELETE" });
      if (result.agent) setAgent(result.agent);
      await loadWebCallStatus();
      setNotice(enabled ? `${webCallProvider} web calling enabled for the public page.` : "Web calling disabled for the public page.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWebCallBusy(false);
    }
  }

  function previewTemplate(template) {
    setForm((current) => ({ ...current, template: template.templateId, ...(template.colors || {}) }));
  }

  async function useTemplate(template) {
    const next = cleanForm({ ...form, template: template.templateId, ...(template.colors || {}) }, agent);
    setForm(next);
    await save(next);
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setNotice("Link copied.");
  }

  if (!form) {
    return (
      <div className="page-stack">
        <PageHeader title="Agent Bio Page Builder" description="Loading builder..." />
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Agent Bio Page Builder"
        description={`Customize the public bio page for ${agent?.agentName || "this agent"}.`}
        action={<button className="btn-secondary" onClick={() => navigate(`/agents/${id}`)}><Eye size={16} />Agent Details</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid min-w-0 gap-5 pb-28">
        <section className="min-w-0 space-y-5">
          <Panel title="Choose Template" icon={Sparkles}>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {templates.map((template) => (
                <article key={template.templateId} className={`rounded-2xl border p-4 transition ${form.template === template.templateId ? "border-amber-300 bg-amber-50" : "border-hairline bg-white"}`}>
                  <div className="mb-3 aspect-video rounded-xl border border-hairline" style={{ background: `linear-gradient(135deg, ${template.colors?.backgroundColor || "#fff"}, ${template.colors?.primaryColor || "#2563EB"}55)` }} />
                  <h3 className="font-semibold text-ink">{template.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-neutral-500">{template.description}</p>
                  <p className="mt-2 text-xs font-semibold uppercase text-neutral-500">{template.recommendedUseCase}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => previewTemplate(template)}>Preview</button>
                    <button className="btn-primary" onClick={() => useTemplate(template)}>Use Template</button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Branding" icon={Image}>
            <div className="grid gap-4 md:grid-cols-3">
              <UploadField label="Logo" value={form.logoUrl} onChange={(file) => upload("logo", file)} />
              <UploadField label="Cover Image" value={form.coverImageUrl} onChange={(file) => upload("cover", file)} />
              <UploadField label="Agent Image" value={form.agentImageUrl} onChange={(file) => upload("agent-image", file)} />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Headline"><input value={form.headline || ""} onChange={(event) => setField("headline", event.target.value)} /></Field>
              <Field label="Subheadline"><input value={form.subheadline || ""} onChange={(event) => setField("subheadline", event.target.value)} /></Field>
              <Field label="Welcome Message"><textarea rows={4} value={form.welcomeMessage || ""} onChange={(event) => setField("welcomeMessage", event.target.value)} /></Field>
              <div className="grid gap-4">
                <Field label="Primary CTA Text"><input value={form.primaryCtaText || ""} onChange={(event) => setField("primaryCtaText", event.target.value)} /></Field>
                <Field label="Secondary CTA Text"><input value={form.secondaryCtaText || ""} onChange={(event) => setField("secondaryCtaText", event.target.value)} /></Field>
                <Field label="Voice Call CTA Text"><input value={form.voiceCallCtaText || ""} onChange={(event) => setField("voiceCallCtaText", event.target.value)} /></Field>
              </div>
            </div>
          </Panel>

          <Panel title="Theme" icon={Palette}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["primaryColor", "Primary Color"],
                ["backgroundColor", "Background Color"],
                ["textColor", "Text Color"],
                ["buttonColor", "Button Color"],
                ["cardColor", "Card Color"],
                ["accentColor", "Accent Color"]
              ].map(([field, label]) => (
                <ColorField key={field} label={label} value={form[field]} onChange={(value) => setField(field, value)} />
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

          <Panel title="Visibility" icon={Settings2}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["showWebCallButton", "Show Web Call button"],
                ["showAppointmentButton", "Show Appointment button"],
                ["showContactForm", "Show Contact Form"],
                ["showBusinessInfo", "Show Business Info"],
                ["showSocialLinks", "Show Social Links"],
                ["showVoiceCallButton", "Show Voice Call button"]
              ].map(([field, label]) => (
                <Toggle key={field} label={label} checked={Boolean(form[field])} onChange={(value) => setField(field, value)} />
              ))}
            </div>
          </Panel>

          <Panel title="Web Calling" icon={Phone}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-4">
              <div>
                <p className="font-semibold text-ink">
                  {webCallEnabled ? `${webCallProvider} public web calling is enabled` : "Public web calling is not enabled"}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Vapi agents use the Vapi Web SDK. Dograh agents use the Dograh web widget.
                </p>
              </div>
              <button
                className={webCallEnabled ? "btn-secondary" : "btn-primary"}
                disabled={webCallBusy}
                onClick={() => setWebCalling(!webCallEnabled)}
              >
                <Phone size={16} />
                {webCallBusy ? "Updating..." : webCallEnabled ? "Disable Web Call" : `Enable ${webCallProvider} Web Call`}
              </button>
            </div>
          </Panel>

          <Panel title="Quick Topics" icon={MessageCircle}>
            <div className="space-y-4">
              {[...(form.quickTopics || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((topic, index) => (
                <QuickTopicEditor
                  key={topic.id || index}
                  topic={topic}
                  index={index}
                  total={(form.quickTopics || []).length}
                  onChange={setTopic}
                  onMove={moveTopic}
                  onDelete={deleteTopic}
                  onUpload={uploadTopicIcon}
                />
              ))}
              <button className="btn-secondary" type="button" disabled={(form.quickTopics || []).length >= 8} onClick={addTopic}>
                <MessageCircle size={16} /> Add Topic
              </button>
              {(form.quickTopics || []).length >= 8 && <p className="text-sm text-neutral-500">Maximum 8 quick topics allowed.</p>}
            </div>
          </Panel>

          <Panel title="Business Info" icon={Briefcase}>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["businessName", "Business Name"],
                ["category", "Category"],
                ["location", "Location"],
                ["availability", "Availability"],
                ["responseTime", "Response Time"]
              ].map(([field, label]) => (
                <Field key={field} label={label}><input value={form.businessInfo?.[field] || ""} onChange={(event) => setNested("businessInfo", field, event.target.value)} /></Field>
              ))}
            </div>
          </Panel>

          <Panel title="Social Links" icon={LinkIcon}>
            <div className="grid gap-4 md:grid-cols-2">
              {["website", "instagram", "facebook", "whatsapp", "linkedin"].map((field) => (
                <Field key={field} label={field.charAt(0).toUpperCase() + field.slice(1)}>
                  <input value={form.socialLinks?.[field] || ""} onChange={(event) => setNested("socialLinks", field, event.target.value)} placeholder={`https://${field}.com/...`} />
                </Field>
              ))}
            </div>
          </Panel>
        </section>
      </div>

      <div className="bio-page-action-bar fixed inset-x-0 bottom-0 z-30 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={saving} onClick={() => save()}><Save size={16} />{saving ? "Saving..." : "Save Changes"}</button>
          <a className="btn-secondary" href={publicUrl} target="_blank" rel="noreferrer"><Eye size={16} />Preview Public Page</a>
          <button className="btn-secondary" onClick={() => action("publish")}>Publish</button>
          <button className="btn-secondary" onClick={() => action("unpublish")}>Unpublish</button>
          <button className="btn-secondary" onClick={() => action("reset")}><RefreshCw size={16} />Reset to Default</button>
          <button className="btn-secondary" disabled={!publicUrl} onClick={copyLink}><Copy size={16} />Copy Link</button>
          <div className="ml-auto"><StatusBadge status={form.isPublished ? "Published" : "Draft"} /></div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="card min-w-0">
      <div className="mb-4 flex items-center gap-3">
        {Icon && <div className="icon-tile"><Icon size={18} /></div>}
        <h2 className="font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function QuickTopicEditor({ topic, index, total, onChange, onMove, onDelete, onUpload }) {
  const Icon = topicIconMap[topic.icon] || MessageCircle;
  const color = topic.color || "#2563EB";

  return (
    <article className="rounded-2xl border border-hairline bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl text-white" style={{ background: color }}>
          {topic.iconType === "image" && topic.iconImageUrl ? (
            <img className="h-full w-full object-cover" src={assetUrl(topic.iconImageUrl)} alt="" />
          ) : topic.iconType === "emoji" ? (
            <span className="text-xl">{topic.icon || "💬"}</span>
          ) : (
            <Icon size={20} />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">Topic {index + 1}</h3>
          <p className="text-sm text-neutral-500">Customize the card shown on the public page.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" disabled={index === 0} onClick={() => onMove(index, -1)}>Up</button>
          <button className="btn-secondary" type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)}>Down</button>
          <button className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" type="button" onClick={() => onDelete(index)}>Delete</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Title"><input value={topic.title || ""} onChange={(event) => onChange(index, "title", event.target.value)} /></Field>
        <Field label="Description"><input value={topic.description || ""} onChange={(event) => onChange(index, "description", event.target.value)} /></Field>
        <ColorField label="Topic Color" value={color} onChange={(value) => onChange(index, "color", value)} />
        <Field label="Prompt / Action Text"><textarea rows={3} value={topic.prompt || ""} onChange={(event) => onChange(index, "prompt", event.target.value)} /></Field>
        <Field label="Icon Type">
          <select value={topic.iconType || "lucide"} onChange={(event) => onChange(index, "iconType", event.target.value)}>
            <option value="lucide">Lucide icon</option>
            <option value="emoji">Emoji</option>
            <option value="image">Custom image</option>
          </select>
        </Field>
        {topic.iconType === "emoji" ? (
          <Field label="Emoji"><input value={topic.icon || ""} onChange={(event) => onChange(index, "icon", event.target.value.slice(0, 4))} placeholder="💬" /></Field>
        ) : (
          <Field label="Lucide Icon">
            <select value={topic.icon || "MessageCircle"} onChange={(event) => onChange(index, "icon", event.target.value)}>
              {topicIconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
          </Field>
        )}
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-center text-sm font-semibold text-neutral-600">
          <Upload size={18} className="mb-2 text-brand-700" />
          Upload custom icon
          <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => onUpload(index, event.target.files?.[0])} />
        </label>
        <Toggle label="Show topic" checked={topic.isVisible !== false} onChange={(value) => onChange(index, "isVisible", value)} />
      </div>
    </article>
  );
}

function Field({ label, children }) {
  return <label className="block min-w-0 text-sm font-semibold text-neutral-700">{label}<div className="mt-1">{children}</div></label>;
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex overflow-hidden rounded-xl border border-hairline bg-white">
        <input className="h-11 w-14 cursor-pointer border-0 p-1" type="color" value={value || "#2563EB"} onChange={(event) => onChange(event.target.value)} />
        <input className="min-w-0 flex-1 border-0 px-3 text-sm font-semibold uppercase outline-none" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-3 text-sm font-semibold">
      <span className="min-w-0 break-words">{label}</span>
      <input className="h-5 w-5 flex-none" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function UploadField({ label, value, onChange }) {
  const src = assetUrl(value);
  return (
    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-center text-sm font-semibold text-neutral-600">
      {src ? <img className="mb-2 h-20 w-full max-w-full rounded-xl object-cover" src={src} alt="" /> : <Upload size={18} className="mb-2 text-brand-700" />}
      {label}
      <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChange(event.target.files?.[0])} />
    </label>
  );
}


