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
  LayoutTemplate,
  Link as LinkIcon,
  MessageCircle,
  Palette,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Type,
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
const borderRadiusOptions = ["sm", "md", "lg", "xl", "2xl", "pill"];
const backgroundStyles = ["clean_white", "solid", "soft_gradient", "gradient_mesh", "warm_gradient", "cover_image", "radial_glow"];

const RADIUS_PX = { sm: "6px", md: "9px", lg: "12px", xl: "16px", "2xl": "20px", pill: "999px" };

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
  layoutVariant: "education_advisor",
  heroVariant: "advisor",
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
  mutedColor: "#64748B",
  borderColor: "#E2E8F0",
  fontStyle: "modern",
  animation: "fade_in",
  borderRadius: "lg",
  buttonRadius: "lg",
  backgroundStyle: "soft_gradient",
  spacingScale: "comfortable",
  showWebCall: true,
  showWebCallButton: true,
  showAppointment: true,
  showAppointmentButton: true,
  showContactForm: false,
  showBusinessInfo: true,
  showSocialLinks: false,
  showVoiceCallButton: true,
  showTopBar: true,
  showLogo: true,
  showAgentImage: true,
  showCoverImage: false,
  showQuickTopics: false,
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

const templateDisplay = {
  minimal_professional: { recommendedUseCase: "Consultations, enquiries" },
  modern_saas: { recommendedUseCase: "Demos, support, pricing" },
  service_business: { recommendedUseCase: "Calls, enquiries, bookings" },
  coaching_education: { recommendedUseCase: "Courses, fees, admissions" },
  healthcare_clinic: { recommendedUseCase: "Appointments, services, hours" },
  real_estate: { recommendedUseCase: "Leads, visits, property FAQs" },
  restaurant_booking: { recommendedUseCase: "Tables, menu, directions" },
  finance_trust: { recommendedUseCase: "Eligibility, documents, leads" }
};

const TABS = [
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "content", label: "Content", icon: Type },
  { id: "media", label: "Media", icon: Image },
  { id: "design", label: "Design", icon: Palette },
  { id: "visibility", label: "Actions & Visibility", icon: Settings2 },
  { id: "advanced", label: "Advanced", icon: Sparkles }
];

function errorText(err) {
  return err.response?.userMessage || err.response?.message || err.message || "Something went wrong.";
}

function assetUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return `${API_URL.replace(/\/api$/, "")}${value}`;
}

function labelize(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function templateMeta(template) {
  const extra = templateDisplay[template.templateId] || {};
  return {
    name: template.name,
    description: template.description,
    recommendedUseCase: extra.recommendedUseCase || template.recommendedUseCase
  };
}

// The applyable preset for a template — every field that changes the real layout/style.
function templatePreset(template) {
  return template.preset || template.colors || {};
}

function cleanForm(value = {}, agent = {}) {
  return {
    ...defaults,
    ...value,
    primaryCtaText: value.primaryCtaText || value.ctaText || defaults.primaryCtaText,
    ctaText: value.ctaText || value.primaryCtaText || defaults.ctaText,
    showWebCallButton: value.showWebCallButton ?? value.showWebCall ?? true,
    showWebCall: value.showWebCall ?? value.showWebCallButton ?? true,
    showVoiceCallButton: value.showVoiceCallButton ?? value.showWebCallButton ?? value.showWebCall ?? true,
    showAppointmentButton: value.showAppointmentButton ?? value.showAppointment ?? true,
    showAppointment: value.showAppointment ?? value.showAppointmentButton ?? true,
    showQuickTopics: value.showQuickTopics ?? false,
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
  const [tab, setTab] = useState("templates");
  const [webCallStatus, setWebCallStatus] = useState(null);
  const [webCallBusy, setWebCallBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const publicUrl = agent?.publicSlug ? `${window.location.origin}/a/${agent.publicSlug}` : "";
  const webCallEnabled = Boolean(webCallStatus?.publicWebCallEnabled);
  const webCallProvider = "Vapi";

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
    const status = await api(`/agents/${id}/web-call`);
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
      if (field === "showVoiceCallButton") { next.showWebCallButton = value; next.showWebCall = value; }
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
            title: "New Action",
            description: "Describe this action",
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
      setNotice("Action icon uploaded.");
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
      const result = await api(`/agents/${id}/web-call`, { method: enabled ? "POST" : "DELETE" });
      if (result.agent) setAgent(result.agent);
      await loadWebCallStatus();
      setNotice(enabled ? `${webCallProvider} web calling enabled for the public page.` : "Web calling disabled for the public page.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWebCallBusy(false);
    }
  }

  // Preview applies the full template preset to the LOCAL form only (nothing is saved
  // until the user clicks Use Template or Save Changes). Content and images are kept.
  function previewTemplate(template) {
    setForm((current) => cleanForm({ ...current, template: template.templateId, ...templatePreset(template) }, agent));
    setNotice(`Previewing "${template.name}". Click Use Template to apply and save.`);
  }

  // Use Template applies the preset and saves it, so the public page follows the exact
  // layout, typography, spacing, section visibility, section order and CTA defaults.
  async function useTemplate(template) {
    const next = cleanForm({ ...form, template: template.templateId, ...templatePreset(template) }, agent);
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
    <div className="page-stack bio-builder-page">
      <PageHeader
        title="Agent Bio Page Builder"
        description={`Customize the public bio page for ${agent?.agentName || "this agent"}.`}
        action={<button className="btn-secondary" onClick={() => navigate(`/agents/${id}`)}><Eye size={16} />Agent Details</button>}
      />

      <div className="bio-toolbar">
        <div className="bio-toolbar-url">
          {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="bio-toolbar-link">{publicUrl}</a> : <span className="text-neutral-500">Publish to get a public link</span>}
          <StatusBadge status={form.isPublished ? "Published" : "Draft"} />
        </div>
        <div className="bio-toolbar-actions">
          <button className="btn-secondary" disabled={!publicUrl} onClick={copyLink}><Copy size={16} />Copy</button>
          <a className={`btn-secondary ${!publicUrl ? "pointer-events-none opacity-50" : ""}`} href={publicUrl} target="_blank" rel="noreferrer"><Eye size={16} />Preview</a>
          <button className="btn-primary" disabled={saving} onClick={() => save()}><Save size={16} />{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <nav className="bio-tabs">
        {TABS.map((item) => (
          <button key={item.id} className={`bio-tab ${tab === item.id ? "is-active" : ""}`} onClick={() => setTab(item.id)}>
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </nav>

      <div className="bio-builder-grid">
        <section className="bio-builder-controls">
          {tab === "templates" && (
            <Panel title="Choose a template" icon={LayoutTemplate} hint="Each template changes the full page layout, not just colors.">
              <div className="bio-template-grid">
                {templates.map((template) => {
                  const meta = templateMeta(template);
                  const selected = form.template === template.templateId;
                  return (
                    <article key={template.templateId} className={`bio-template-card ${selected ? "is-selected" : ""}`}>
                      <TemplateWireframe template={template} />
                      <div className="bio-template-copy">
                        <h3>{meta.name}</h3>
                        <p>{meta.description}</p>
                        <span>{meta.recommendedUseCase}</span>
                      </div>
                      <div className="bio-template-actions">
                        <button className="btn-secondary" onClick={() => previewTemplate(template)}>Preview</button>
                        <button className="btn-primary" onClick={() => useTemplate(template)}>{selected ? "Re-apply" : "Use Template"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </Panel>
          )}

          {tab === "content" && (
            <Panel title="Content" icon={Type} hint="The words visitors read on your public page.">
              <div className="grid gap-4">
                <Field label="Headline"><input value={form.headline || ""} onChange={(event) => setField("headline", event.target.value)} placeholder={agent?.businessName || "Your headline"} /></Field>
                <Field label="Subheadline"><input value={form.subheadline || ""} onChange={(event) => setField("subheadline", event.target.value)} placeholder="A short line about what you offer" /></Field>
                <Field label="Welcome Message"><textarea rows={3} value={form.welcomeMessage || ""} onChange={(event) => setField("welcomeMessage", event.target.value)} placeholder="First message shown in chat" /></Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Primary CTA (Chat)"><input value={form.primaryCtaText || ""} onChange={(event) => setField("primaryCtaText", event.target.value)} /></Field>
                  <Field label="Appointment CTA"><input value={form.secondaryCtaText || ""} onChange={(event) => setField("secondaryCtaText", event.target.value)} /></Field>
                  <Field label="Voice Call CTA"><input value={form.voiceCallCtaText || ""} onChange={(event) => setField("voiceCallCtaText", event.target.value)} /></Field>
                </div>
              </div>
            </Panel>
          )}

          {tab === "media" && (
            <Panel title="Media" icon={Image} hint="Logo, cover image and agent image used across the layouts.">
              <div className="grid gap-4 md:grid-cols-3">
                <UploadField label="Logo" value={form.logoUrl} onChange={(file) => upload("logo", file)} />
                <UploadField label="Cover Image" value={form.coverImageUrl} onChange={(file) => upload("cover", file)} />
                <UploadField label="Agent Image" value={form.agentImageUrl} onChange={(file) => upload("agent-image", file)} />
              </div>
              <p className="mt-3 text-[12.5px] text-neutral-500">Cover image is used by the Service Business and Real Estate layouts. Agent image is the main hero visual.</p>
            </Panel>
          )}

          {tab === "design" && (
            <Panel title="Design" icon={Palette} hint="Fine-tune the look. Selecting a template sets sensible defaults you can adjust.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["primaryColor", "Primary Color"],
                  ["backgroundColor", "Background Color"],
                  ["textColor", "Text Color"],
                  ["cardColor", "Card Color"],
                  ["accentColor", "Accent Color"],
                  ["buttonColor", "Button Color"]
                ].map(([field, label]) => (
                  <ColorField key={field} label={label} value={form[field]} onChange={(value) => setField(field, value)} />
                ))}
                <Field label="Font Style">
                  <select value={form.fontStyle || "modern"} onChange={(event) => setField("fontStyle", event.target.value)}>
                    {fontStyles.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
                  </select>
                </Field>
                <Field label="Corner Radius">
                  <select value={form.borderRadius || "lg"} onChange={(event) => { setField("borderRadius", event.target.value); setField("buttonRadius", event.target.value); }}>
                    {borderRadiusOptions.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
                  </select>
                </Field>
                <Field label="Background Style">
                  <select value={form.backgroundStyle || "soft_gradient"} onChange={(event) => setField("backgroundStyle", event.target.value)}>
                    {backgroundStyles.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
                  </select>
                </Field>
                <Field label="Animation">
                  <select value={form.animation || "fade_in"} onChange={(event) => setField("animation", event.target.value)}>
                    {animations.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
                  </select>
                </Field>
              </div>
            </Panel>
          )}

          {tab === "visibility" && (
            <>
              <Panel title="Actions & Visibility" icon={Settings2} hint="Turn sections and buttons on or off. Chat is always the primary action.">
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["showAppointmentButton", "Show appointment button"],
                    ["showVoiceCallButton", "Show voice call button"],
                    ["showBusinessInfo", "Show business info"],
                    ["showSocialLinks", "Show social links"],
                    ["showCoverImage", "Show cover image"],
                    ["showAgentImage", "Show agent image"],
                    ["showTopBar", "Show top bar"]
                  ].map(([field, label]) => (
                    <Toggle key={field} label={label} checked={Boolean(form[field])} onChange={(value) => setField(field, value)} />
                  ))}
                </div>
              </Panel>

              <Panel title="Web Calling" icon={Phone}>
                <div className="bio-inline-card">
                  <div>
                    <p className="font-semibold text-ink">
                      {webCallEnabled ? `${webCallProvider} public web calling is enabled` : "Public web calling is not enabled"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">Vapi agents use the Vapi Web SDK on public pages.</p>
                  </div>
                  <button className={webCallEnabled ? "btn-secondary" : "btn-primary"} disabled={webCallBusy} onClick={() => setWebCalling(!webCallEnabled)}>
                    <Phone size={16} />
                    {webCallBusy ? "Updating..." : webCallEnabled ? "Disable Web Call" : `Enable ${webCallProvider} Web Call`}
                  </button>
                </div>
              </Panel>
            </>
          )}

          {tab === "advanced" && (
            <>
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
                    <Field key={field} label={labelize(field)}>
                      <input value={form.socialLinks?.[field] || ""} onChange={(event) => setNested("socialLinks", field, event.target.value)} placeholder={`https://${field}.com/...`} />
                    </Field>
                  ))}
                </div>
              </Panel>

              <Panel title="Action Cards" icon={MessageCircle} hint="Optional quick-question cards. Hidden on the public page unless enabled.">
                <Toggle label="Show action cards on the public page" checked={Boolean(form.showQuickTopics)} onChange={(value) => setField("showQuickTopics", value)} />
                {form.showQuickTopics ? (
                  <div className="mt-4 space-y-4">
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
                    <button className="btn-secondary bio-add-topic" type="button" disabled={(form.quickTopics || []).length >= 8} onClick={addTopic}>
                      <MessageCircle size={16} /> Add Action
                    </button>
                    {(form.quickTopics || []).length >= 8 && <p className="text-sm text-neutral-500">Maximum 8 action cards allowed.</p>}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-neutral-500">Action cards are off, keeping the public page clean and minimal.</p>
                )}
              </Panel>

              <Panel title="Danger Zone" icon={RefreshCw}>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => action("publish")}>Publish</button>
                  <button className="btn-secondary" onClick={() => action("unpublish")}>Unpublish</button>
                  <button className="btn-secondary" onClick={() => action("reset")}><RefreshCw size={16} />Reset to default</button>
                </div>
              </Panel>
            </>
          )}
        </section>

        <aside className="bio-builder-preview">
          <div className="bio-preview-sticky">
            <div className="bio-preview-head">
              <span>Live preview</span>
              <a className={`bio-preview-open ${!publicUrl ? "pointer-events-none opacity-50" : ""}`} href={publicUrl} target="_blank" rel="noreferrer"><Eye size={14} /> Open</a>
            </div>
            <BioPageMiniPreview form={form} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, hint, children }) {
  return (
    <section className="card min-w-0 bio-builder-panel">
      <div className="bio-builder-panel-header">
        {Icon && <div className="icon-tile"><Icon size={17} /></div>}
        <div className="min-w-0">
          <h2>{title}</h2>
          {hint && <p className="bio-panel-hint">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Template wireframe — a small structural sketch so the user can SEE the layout
// (centered hero, split hero, cover hero, booking-first, trust-card) at a glance.
// ---------------------------------------------------------------------------
function TemplateWireframe({ template }) {
  const preset = templatePreset(template);
  const c = {
    bg: preset.backgroundColor || "#F8FAFC",
    primary: preset.primaryColor || "#2563EB",
    card: preset.cardColor || "#FFFFFF",
    accent: preset.accentColor || "#DBEAFE",
    text: preset.textColor || "#0F172A"
  };
  const variant = preset.layoutVariant || template.layoutVariant || "centered_minimal";

  return (
    <div className="bio-wire" style={{ background: c.bg }}>
      <WireStructure variant={variant} c={c} />
    </div>
  );
}

function bar(color, width, height = 5, extra = {}) {
  return { background: color, width, height, borderRadius: 3, ...extra };
}

function WireStructure({ variant, c }) {
  const line = `color-mix(in srgb, ${c.text} 28%, ${c.card})`;
  const card = { background: c.card, borderRadius: 7, boxShadow: `0 3px 8px rgba(15,23,42,.08)` };

  if (variant === "split_saas" || variant === "finance_trust") {
    return (
      <div className="bio-wire-row">
        <div className="bio-wire-col">
          <div style={bar(c.primary, "70%", 8)} />
          <div style={bar(line, "90%")} />
          <div style={bar(line, "60%")} />
          <div style={{ ...bar(c.primary, "58%", 14), borderRadius: 5, marginTop: 4 }} />
        </div>
        <div className="bio-wire-panel" style={card}>
          <div className="bio-wire-dot" style={{ background: c.accent }} />
          <div style={bar(line, "80%")} />
          <div style={bar(line, "64%")} />
        </div>
      </div>
    );
  }

  if (variant === "cover_service" || variant === "real_estate_cover") {
    const dark = variant === "real_estate_cover";
    return (
      <div className="bio-wire-stack">
        <div className="bio-wire-cover" style={{ background: dark ? `linear-gradient(120deg, #1a2436, ${c.primary})` : `linear-gradient(120deg, ${c.primary}, ${c.accent})` }}>
          <div style={bar("rgba(255,255,255,.9)", "52%", 7)} />
          <div style={{ ...bar("rgba(255,255,255,.6)", "34%"), marginTop: 4 }} />
        </div>
        <div className="bio-wire-row" style={{ marginTop: 6 }}>
          <div className="bio-wire-col" style={{ flex: 1.2 }}>
            <div style={bar(line, "88%")} />
            <div style={{ ...bar(dark ? "#B8860B" : c.primary, "52%", 12), borderRadius: 5 }} />
          </div>
          <div className="bio-wire-panel" style={{ ...card, flex: 1 }}>
            <div style={bar(line, "80%")} />
            <div style={bar(line, "60%")} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "education_advisor") {
    return (
      <div className="bio-wire-row">
        <div className="bio-wire-avatar" style={{ background: `radial-gradient(circle at 50% 35%, ${c.accent}, ${c.card})` }}>
          <div className="bio-wire-dot" style={{ background: c.primary }} />
        </div>
        <div className="bio-wire-col">
          <div style={bar(c.primary, "72%", 8)} />
          <div style={bar(line, "92%")} />
          <div style={bar(line, "58%")} />
          <div style={{ ...bar(c.primary, "56%", 12), borderRadius: 5, marginTop: 3 }} />
        </div>
      </div>
    );
  }

  if (variant === "clinic_trust" || variant === "booking_first") {
    const radius = variant === "booking_first" ? 999 : 6;
    return (
      <div className="bio-wire-center">
        <div className="bio-wire-card" style={card}>
          <div className="bio-wire-dot bio-wire-dot-lg" style={{ background: c.accent }} />
          <div style={{ ...bar(c.text, "60%", 7), margin: "0 auto" }} />
          <div style={{ ...bar(line, "78%"), margin: "0 auto" }} />
          <div style={{ ...bar(c.primary, "70%", 12), borderRadius: radius, margin: "3px auto 0" }} />
        </div>
        <div className="bio-wire-badges">
          <div style={{ ...card, height: 12 }} />
          <div style={{ ...card, height: 12 }} />
        </div>
      </div>
    );
  }

  // centered_minimal (default)
  return (
    <div className="bio-wire-center">
      <div className="bio-wire-dot bio-wire-dot-lg" style={{ background: c.accent }} />
      <div style={{ ...bar(c.text, "56%", 7), margin: "0 auto" }} />
      <div style={{ ...bar(line, "72%"), margin: "0 auto" }} />
      <div style={{ ...bar(line, "48%"), margin: "0 auto" }} />
      <div style={{ ...bar(c.primary, "54%", 12), borderRadius: 5, margin: "4px auto 0" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live mini preview — reflects the current form (layout + colors + copy) so the
// user sees the real arrangement update as they edit, without leaving the builder.
// ---------------------------------------------------------------------------
function BioPageMiniPreview({ form }) {
  const c = {
    bg: form.backgroundColor || "#F8FAFC",
    primary: form.primaryColor || "#2563EB",
    button: form.buttonColor || form.primaryColor || "#2563EB",
    card: form.cardColor || "#FFFFFF",
    accent: form.accentColor || "#DBEAFE",
    text: form.textColor || "#0F172A",
    muted: form.mutedColor || "#64748B",
    line: form.borderColor || "#E2E8F0"
  };
  const radius = RADIUS_PX[form.borderRadius] || "12px";
  const btnRadius = RADIUS_PX[form.buttonRadius] || radius;
  const variant = form.layoutVariant || "centered_minimal";
  const title = form.headline || form.businessInfo?.businessName || "Your Agent";
  const subtitle = form.subheadline || "A short line about what you offer to visitors.";
  const avatarSrc = assetUrl(form.agentImageUrl || form.logoUrl);

  const style = {
    "--mp-bg": c.bg,
    "--mp-primary": c.primary,
    "--mp-btn": c.button,
    "--mp-card": c.card,
    "--mp-accent": c.accent,
    "--mp-text": c.text,
    "--mp-muted": c.muted,
    "--mp-line": c.line,
    "--mp-radius": radius,
    "--mp-btn-radius": btnRadius,
    color: c.text
  };

  const Avatar = ({ size = 34 }) => (
    <span className="mp-avatar" style={{ width: size, height: size }}>
      {avatarSrc ? <img src={avatarSrc} alt="" /> : <span className="mp-avatar-fallback" />}
    </span>
  );
  const Primary = ({ label }) => <span className="mp-btn mp-btn-primary">{label}</span>;
  const Ghost = ({ label }) => <span className="mp-btn mp-btn-ghost">{label}</span>;
  const Soft = ({ label }) => <span className="mp-btn mp-btn-soft">{label}</span>;

  const cta = form.primaryCtaText || "Talk to AI Agent";
  const bookCta = form.secondaryCtaText || "Book Appointment";
  const voiceCta = form.voiceCallCtaText || "Voice Call";
  const showBook = form.showAppointmentButton !== false;
  const showVoice = form.showVoiceCallButton !== false;
  const showInfo = form.showBusinessInfo !== false;

  const actionsRow = (
    <div className="mp-actions">
      <Primary label={cta} />
      <div className="mp-actions-sec">
        {showBook && <Ghost label={bookCta} />}
        {showVoice && <Soft label={voiceCta} />}
      </div>
    </div>
  );
  const infoCard = showInfo && (
    <div className="mp-info">
      {["Business", "Location", "Response"].map((label) => (
        <div key={label} className="mp-info-row"><span className="mp-info-orb" /><span className="mp-line mp-line-60" /></div>
      ))}
    </div>
  );

  let body;
  if (variant === "split_saas") {
    body = (
      <div className="mp-split">
        <div className="mp-col">
          <span className="mp-pill" />
          <div className="mp-h1" style={{ color: c.text }}>{title}</div>
          <div className="mp-sub">{subtitle}</div>
          {actionsRow}
        </div>
        <div className="mp-card mp-agent">
          <Avatar size={54} />
          {infoCard}
        </div>
      </div>
    );
  } else if (variant === "finance_trust") {
    body = (
      <div className="mp-split">
        <div className="mp-col">
          <span className="mp-pill" />
          <div className="mp-h1">{title}</div>
          <div className="mp-sub">{subtitle}</div>
          {actionsRow}
        </div>
        <div className="mp-card mp-agent">
          <div className="mp-agent-head"><Avatar size={30} /><span className="mp-line mp-line-60" /></div>
          {["", "", ""].map((_, i) => <div key={i} className="mp-check-row"><span className="mp-check" /><span className="mp-line mp-line-80" /></div>)}
        </div>
      </div>
    );
  } else if (variant === "cover_service" || variant === "real_estate_cover") {
    const dark = variant === "real_estate_cover";
    body = (
      <div className="mp-stack">
        <div className={`mp-cover ${dark ? "mp-cover-dark" : ""}`} style={dark ? undefined : { background: `linear-gradient(120deg, ${c.primary}, ${c.accent})` }}>
          <div className="mp-cover-body"><Avatar size={30} /><div className="mp-h1 mp-h1-light">{title}</div></div>
        </div>
        <div className="mp-sub">{subtitle}</div>
        <div className="mp-grid2">
          <div className="mp-col">{actionsRow}</div>
          {infoCard}
        </div>
      </div>
    );
  } else if (variant === "education_advisor") {
    body = (
      <div className="mp-split mp-split-advisor">
        <div className="mp-advisor"><Avatar size={62} /></div>
        <div className="mp-col">
          <span className="mp-pill" />
          <div className="mp-h1">{title}</div>
          <div className="mp-sub">{subtitle}</div>
          {actionsRow}
        </div>
      </div>
    );
  } else if (variant === "clinic_trust" || variant === "booking_first") {
    body = (
      <div className="mp-center">
        <div className="mp-card mp-trust">
          <Avatar size={46} />
          <div className="mp-h1 mp-center-text">{title}</div>
          <div className="mp-sub mp-center-text">{subtitle}</div>
          {actionsRow}
        </div>
        {showInfo && <div className="mp-badges"><span /><span /></div>}
      </div>
    );
  } else {
    // centered_minimal
    body = (
      <div className="mp-center">
        <Avatar size={44} />
        <span className="mp-pill" />
        <div className="mp-h1 mp-center-text">{title}</div>
        <div className="mp-sub mp-center-text">{subtitle}</div>
        <div className="mp-actions mp-actions-narrow">{actionsRow}</div>
        {showInfo && <div className="mp-inline-stats"><span /><span /><span /></div>}
      </div>
    );
  }

  return (
    <div className={`mp-frame mp-anim-${form.animation || "fade_in"}`} style={style}>
      {form.showTopBar !== false && (
        <div className="mp-topbar"><Avatar size={22} /><span className="mp-line mp-line-40" /><span className="mp-dot-live" /></div>
      )}
      <div className="mp-scroll">{body}</div>
    </div>
  );
}

function QuickTopicEditor({ topic, index, total, onChange, onMove, onDelete, onUpload }) {
  const Icon = topicIconMap[topic.icon] || MessageCircle;
  const color = topic.color || "#2563EB";

  return (
    <article className="bio-topic-card">
      <div className="bio-topic-header">
        <span className="bio-topic-icon" style={{ background: color }}>
          {topic.iconType === "image" && topic.iconImageUrl ? (
            <img className="h-full w-full object-cover" src={assetUrl(topic.iconImageUrl)} alt="" />
          ) : topic.iconType === "emoji" ? (
            <span className="text-xl">{topic.icon || "💬"}</span>
          ) : (
            <Icon size={20} />
          )}
        </span>
        <div className="min-w-0">
          <h3>Action {index + 1}</h3>
          <p>Shown as a quick-question card on the public page.</p>
        </div>
        <div className="bio-topic-actions">
          <button className="btn-secondary" type="button" disabled={index === 0} onClick={() => onMove(index, -1)}>Up</button>
          <button className="btn-secondary" type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)}>Down</button>
          <button className="bio-danger-button" type="button" onClick={() => onDelete(index)}>Delete</button>
        </div>
      </div>

      <div className="bio-topic-fields">
        <Field label="Title"><input value={topic.title || ""} onChange={(event) => onChange(index, "title", event.target.value)} /></Field>
        <Field label="Description"><input value={topic.description || ""} onChange={(event) => onChange(index, "description", event.target.value)} /></Field>
        <ColorField label="Card Color" value={color} onChange={(value) => onChange(index, "color", value)} />
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
        <label className="bio-upload-tile bio-topic-upload">
          <Upload size={18} className="mb-2 text-brand-700" />
          Upload custom icon
          <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => onUpload(index, event.target.files?.[0])} />
        </label>
        <Toggle label="Show action" checked={topic.isVisible !== false} onChange={(value) => onChange(index, "isVisible", value)} />
      </div>
    </article>
  );
}

function Field({ label, children }) {
  return <label className="bio-builder-field">{label}<div>{children}</div></label>;
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="bio-color-field">
        <input className="h-11 w-14 cursor-pointer border-0 p-1" type="color" value={value || "#2563EB"} onChange={(event) => onChange(event.target.value)} />
        <input className="min-w-0 flex-1 border-0 px-3 text-sm font-semibold uppercase outline-none" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="bio-toggle">
      <span className="min-w-0 break-words">{label}</span>
      <input className="h-5 w-5 flex-none" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function UploadField({ label, value, onChange }) {
  const src = assetUrl(value);
  return (
    <label className="bio-upload-tile">
      {src ? <img className="mb-2 h-20 w-full max-w-full rounded-xl object-cover" src={src} alt="" /> : <Upload size={18} className="mb-2 text-brand-700" />}
      {label}
      <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChange(event.target.files?.[0])} />
    </label>
  );
}
