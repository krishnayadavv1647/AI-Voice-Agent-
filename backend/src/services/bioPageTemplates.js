// Bio page template system.
//
// Every template is a full "preset": it defines not only colors but the real page
// structure the public agent page renders — layout variant, hero arrangement, typography,
// spacing, card/button style, section order, visibility flags and copy defaults.
//
// The public page (frontend/src/pages/PublicAgent.jsx) switches its whole layout on
// `bioPage.layoutVariant`, so changing the template meaningfully changes the page — not
// just its colors.

export const DEFAULT_QUICK_TOPICS = [
  {
    id: "admissions",
    title: "Admissions",
    description: "Understand the step-by-step admission process",
    icon: "Landmark",
    iconType: "lucide",
    iconImageUrl: "",
    color: "#2563EB",
    prompt: "Walk me through the admission process.",
    isVisible: true,
    order: 0
  },
  {
    id: "courses",
    title: "Courses",
    description: "Explore courses and batches",
    icon: "BookOpen",
    iconType: "lucide",
    iconImageUrl: "",
    color: "#2563EB",
    prompt: "What courses and batches do you offer?",
    isVisible: true,
    order: 1
  },
  {
    id: "fees",
    title: "Fees",
    description: "Get details about fees and payments",
    icon: "DollarSign",
    iconType: "lucide",
    iconImageUrl: "",
    color: "#2563EB",
    prompt: "I want to know about fees and payment options.",
    isVisible: true,
    order: 2
  },
  {
    id: "scholarships",
    title: "Scholarships",
    description: "Find scholarships and financial aid",
    icon: "GraduationCap",
    iconType: "lucide",
    iconImageUrl: "",
    color: "#2563EB",
    prompt: "What scholarships and financial aid are available?",
    isVisible: true,
    order: 3
  }
];

// ---------------------------------------------------------------------------
// Allowed token values. Exported so the controller can validate patches against
// the same source of truth the templates are built from.
// ---------------------------------------------------------------------------
export const LAYOUT_VARIANTS = [
  "centered_minimal",
  "split_saas",
  "cover_service",
  "education_advisor",
  "clinic_trust",
  "real_estate_cover",
  "booking_first",
  "finance_trust"
];
export const HERO_VARIANTS = ["minimal", "split", "cover", "advisor", "trust_card", "booking"];
export const CONTENT_WIDTHS = ["narrow", "standard", "wide", "full"];
export const HERO_ALIGNMENTS = ["left", "center", "split"];
export const BACKGROUND_STYLES = [
  "clean_white",
  "solid",
  "soft_gradient",
  "gradient_mesh",
  "warm_gradient",
  "cover_image",
  "radial_glow"
];
export const SPACING_SCALES = ["compact", "cozy", "comfortable", "spacious"];
export const CARD_SHADOWS = ["none", "soft", "medium", "elevated", "glow"];
export const CARD_BORDERS = ["none", "subtle", "strong"];
export const RADIUS_TOKENS = ["sm", "md", "lg", "xl", "2xl", "pill"];
export const FONT_FAMILIES = ["Inter", "Manrope", "Rethink Sans", "Roboto", "Stack Sans"];
export const HEADING_WEIGHTS = ["600", "700", "800", "900"];
export const HEADING_TRACKINGS = ["tight", "normal", "wide"];
export const BODY_SIZES = ["sm", "md", "lg"];
export const FONT_STYLES = ["modern", "professional", "friendly", "bold", "elegant"];
export const ANIMATIONS = ["none", "fade_in", "slide_up", "zoom_in", "floating_cards", "gradient_motion", "pulse_button"];
export const KNOWN_SECTIONS = ["hero", "businessInfo", "actions", "trustBadges", "cover", "quickTopics", "socialLinks"];

// Shared visibility/style baseline. Individual templates override what matters.
const BASE_PRESET = {
  fontStyle: "modern",
  headingFont: "Manrope",
  bodyFont: "Inter",
  headingWeight: "800",
  headingTracking: "tight",
  bodySize: "md",
  contentWidth: "standard",
  heroAlignment: "center",
  showTopBar: true,
  showLogo: true,
  showAgentImage: true,
  showCoverImage: false,
  showBusinessInfo: true,
  showSocialLinks: false,
  showAppointmentButton: true,
  showVoiceCallButton: true,
  showContactForm: false,
  showQuickTopics: false,
  borderRadius: "lg",
  cardShadow: "soft",
  cardBorder: "subtle",
  buttonRadius: "lg",
  backgroundStyle: "soft_gradient",
  spacingScale: "comfortable",
  animation: "fade_in",
  sectionOrder: ["hero", "businessInfo", "actions"],
  primaryCtaText: "Chat with AI Agent",
  secondaryCtaText: "Book Appointment",
  voiceCallCtaText: "Voice Call"
};

function makePreset(overrides) {
  return { ...BASE_PRESET, ...overrides };
}

function colorsOf(preset) {
  return {
    primaryColor: preset.primaryColor,
    backgroundColor: preset.backgroundColor,
    textColor: preset.textColor,
    buttonColor: preset.buttonColor,
    cardColor: preset.cardColor,
    accentColor: preset.accentColor
  };
}

// ---------------------------------------------------------------------------
// The templates. Each entry: metadata + full preset.
// ---------------------------------------------------------------------------
const TEMPLATE_DEFS = [
  {
    templateId: "minimal_professional",
    name: "Minimal Professional",
    description: "White, restrained consultant layout with a centered hero and two clean CTAs.",
    recommendedUseCase: "Consultants and professional services",
    previewThumbnail: "minimal-professional",
    preset: makePreset({
      layoutVariant: "centered_minimal",
      heroVariant: "minimal",
      heroAlignment: "center",
      contentWidth: "narrow",
      primaryColor: "#111827",
      backgroundColor: "#FFFFFF",
      textColor: "#111827",
      buttonColor: "#111827",
      cardColor: "#FFFFFF",
      accentColor: "#F3F4F6",
      mutedColor: "#6B7280",
      borderColor: "#E5E7EB",
      fontStyle: "professional",
      headingFont: "Manrope",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "tight",
      borderRadius: "md",
      cardShadow: "none",
      cardBorder: "subtle",
      buttonRadius: "md",
      backgroundStyle: "clean_white",
      spacingScale: "spacious",
      animation: "fade_in",
      sectionOrder: ["hero", "actions", "businessInfo"],
      primaryCtaText: "Chat with me",
      secondaryCtaText: "Book a Call",
      voiceCallCtaText: "Voice Call"
    })
  },
  {
    templateId: "modern_saas",
    name: "Modern SaaS",
    description: "Gradient split hero — content on the left, a glassy AI agent card on the right.",
    recommendedUseCase: "SaaS, agencies and technology teams",
    previewThumbnail: "modern-saas",
    preset: makePreset({
      layoutVariant: "split_saas",
      heroVariant: "split",
      heroAlignment: "left",
      contentWidth: "wide",
      primaryColor: "#5B5CFF",
      backgroundColor: "#EEF2FF",
      textColor: "#0F172A",
      buttonColor: "#4F46E5",
      cardColor: "#FFFFFF",
      accentColor: "#C7D2FE",
      mutedColor: "#64748B",
      borderColor: "#E0E7FF",
      fontStyle: "modern",
      headingFont: "Manrope",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "tight",
      borderRadius: "xl",
      cardShadow: "glow",
      cardBorder: "none",
      buttonRadius: "lg",
      backgroundStyle: "gradient_mesh",
      spacingScale: "comfortable",
      animation: "slide_up",
      sectionOrder: ["hero", "businessInfo", "actions"],
      primaryCtaText: "Chat with AI",
      secondaryCtaText: "Book a Demo",
      voiceCallCtaText: "Talk to AI"
    })
  },
  {
    templateId: "service_business",
    name: "Local Service Business",
    description: "Cover-image hero with a clean business info card and clear enquiry actions.",
    recommendedUseCase: "Salons, gyms, clinics and local agencies",
    previewThumbnail: "service-business",
    preset: makePreset({
      layoutVariant: "cover_service",
      heroVariant: "cover",
      heroAlignment: "left",
      contentWidth: "standard",
      primaryColor: "#2563EB",
      backgroundColor: "#F8FAFC",
      textColor: "#0F172A",
      buttonColor: "#2563EB",
      cardColor: "#FFFFFF",
      accentColor: "#DBEAFE",
      mutedColor: "#64748B",
      borderColor: "#E2E8F0",
      fontStyle: "professional",
      headingFont: "Inter",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "normal",
      borderRadius: "lg",
      cardShadow: "medium",
      cardBorder: "subtle",
      buttonRadius: "lg",
      backgroundStyle: "soft_gradient",
      spacingScale: "comfortable",
      animation: "fade_in",
      showCoverImage: true,
      sectionOrder: ["hero", "businessInfo", "actions"],
      primaryCtaText: "Chat with us",
      secondaryCtaText: "Book Appointment",
      voiceCallCtaText: "Call us"
    })
  },
  {
    templateId: "coaching_education",
    name: "Coaching & Admissions",
    description: "Warm advisor layout with a prominent counsellor image and an appointment CTA.",
    recommendedUseCase: "Coaching centers, tutors and education consultants",
    previewThumbnail: "coaching-education",
    preset: makePreset({
      layoutVariant: "education_advisor",
      heroVariant: "advisor",
      heroAlignment: "split",
      contentWidth: "standard",
      primaryColor: "#4338CA",
      backgroundColor: "#F6F7FF",
      textColor: "#111536",
      buttonColor: "#4338CA",
      cardColor: "#FFFFFF",
      accentColor: "#E0E7FF",
      mutedColor: "#5B5F7B",
      borderColor: "#E4E6F6",
      fontStyle: "friendly",
      headingFont: "Rethink Sans",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "normal",
      borderRadius: "xl",
      cardShadow: "soft",
      cardBorder: "subtle",
      buttonRadius: "lg",
      backgroundStyle: "soft_gradient",
      spacingScale: "comfortable",
      animation: "slide_up",
      sectionOrder: ["hero", "actions", "businessInfo"],
      primaryCtaText: "Ask about admissions",
      secondaryCtaText: "Book Counselling",
      voiceCallCtaText: "Talk to Advisor"
    })
  },
  {
    templateId: "healthcare_clinic",
    name: "Clinic Appointment Desk",
    description: "Calm teal, appointment-first layout with business details shown as trust badges.",
    recommendedUseCase: "Clinics, wellness and healthcare practices",
    previewThumbnail: "healthcare-clinic",
    preset: makePreset({
      layoutVariant: "clinic_trust",
      heroVariant: "trust_card",
      heroAlignment: "center",
      contentWidth: "standard",
      primaryColor: "#0F766E",
      backgroundColor: "#F0FDFA",
      textColor: "#134E4A",
      buttonColor: "#0D9488",
      cardColor: "#FFFFFF",
      accentColor: "#CCFBF1",
      mutedColor: "#5F8A85",
      borderColor: "#CDEEE8",
      fontStyle: "professional",
      headingFont: "Manrope",
      bodyFont: "Inter",
      headingWeight: "700",
      headingTracking: "normal",
      borderRadius: "lg",
      cardShadow: "soft",
      cardBorder: "subtle",
      buttonRadius: "pill",
      backgroundStyle: "soft_gradient",
      spacingScale: "comfortable",
      animation: "fade_in",
      sectionOrder: ["hero", "actions", "trustBadges"],
      primaryCtaText: "Ask a question",
      secondaryCtaText: "Book Appointment",
      voiceCallCtaText: "Call the clinic"
    })
  },
  {
    templateId: "real_estate",
    name: "Property Consultant",
    description: "Premium cover hero with a gold accent CTA for a high-end property-agent feel.",
    recommendedUseCase: "Real estate agents and property consultants",
    previewThumbnail: "real-estate",
    preset: makePreset({
      layoutVariant: "real_estate_cover",
      heroVariant: "cover",
      heroAlignment: "left",
      contentWidth: "wide",
      primaryColor: "#1E3A8A",
      backgroundColor: "#F7F5F0",
      textColor: "#1A2436",
      buttonColor: "#B8860B",
      cardColor: "#FFFFFF",
      accentColor: "#FEF3C7",
      mutedColor: "#6B7280",
      borderColor: "#E9E3D5",
      fontStyle: "elegant",
      headingFont: "Roboto",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "tight",
      borderRadius: "lg",
      cardShadow: "elevated",
      cardBorder: "none",
      buttonRadius: "md",
      backgroundStyle: "cover_image",
      spacingScale: "comfortable",
      animation: "zoom_in",
      showCoverImage: true,
      sectionOrder: ["hero", "actions", "businessInfo"],
      primaryCtaText: "Enquire now",
      secondaryCtaText: "Book a Visit",
      voiceCallCtaText: "Call the agent"
    })
  },
  {
    templateId: "restaurant_booking",
    name: "Restaurant Reservation",
    description: "Warm, friendly booking-first layout with rounded cards and a prominent reserve CTA.",
    recommendedUseCase: "Restaurants, cafes and hospitality",
    previewThumbnail: "restaurant-booking",
    preset: makePreset({
      layoutVariant: "booking_first",
      heroVariant: "booking",
      heroAlignment: "center",
      contentWidth: "standard",
      primaryColor: "#C2410C",
      backgroundColor: "#FFF7ED",
      textColor: "#431407",
      buttonColor: "#EA580C",
      cardColor: "#FFFBEB",
      accentColor: "#FED7AA",
      mutedColor: "#9A6B4F",
      borderColor: "#F3E1CE",
      fontStyle: "friendly",
      headingFont: "Rethink Sans",
      bodyFont: "Inter",
      headingWeight: "800",
      headingTracking: "normal",
      borderRadius: "2xl",
      cardShadow: "soft",
      cardBorder: "subtle",
      buttonRadius: "pill",
      backgroundStyle: "warm_gradient",
      spacingScale: "cozy",
      animation: "fade_in",
      sectionOrder: ["hero", "actions", "businessInfo"],
      primaryCtaText: "Ask about the menu",
      secondaryCtaText: "Book a Table",
      voiceCallCtaText: "Call to book"
    })
  },
  {
    templateId: "finance_trust",
    name: "Finance Advisor",
    description: "Conservative navy-and-green layout with trust badges and a straightforward CTA.",
    recommendedUseCase: "Banks, NBFCs, loan and finance advisors",
    previewThumbnail: "finance-trust",
    preset: makePreset({
      layoutVariant: "finance_trust",
      heroVariant: "trust_card",
      heroAlignment: "left",
      contentWidth: "standard",
      primaryColor: "#1E3A8A",
      backgroundColor: "#F8FAFC",
      textColor: "#0F172A",
      buttonColor: "#047857",
      cardColor: "#FFFFFF",
      accentColor: "#D1FAE5",
      mutedColor: "#64748B",
      borderColor: "#E2E8F0",
      fontStyle: "professional",
      headingFont: "Manrope",
      bodyFont: "Inter",
      headingWeight: "700",
      headingTracking: "normal",
      borderRadius: "md",
      cardShadow: "medium",
      cardBorder: "subtle",
      buttonRadius: "md",
      backgroundStyle: "clean_white",
      spacingScale: "comfortable",
      animation: "fade_in",
      sectionOrder: ["hero", "trustBadges", "actions"],
      primaryCtaText: "Check eligibility",
      secondaryCtaText: "Talk to an Advisor",
      voiceCallCtaText: "Call an advisor"
    })
  }
];

export const BIO_PAGE_TEMPLATES = TEMPLATE_DEFS.map((tpl) => ({
  templateId: tpl.templateId,
  name: tpl.name,
  description: tpl.description,
  recommendedUseCase: tpl.recommendedUseCase,
  previewThumbnail: tpl.previewThumbnail,
  layoutStyle: tpl.preset.layoutVariant,
  layoutVariant: tpl.preset.layoutVariant,
  heroVariant: tpl.preset.heroVariant,
  colors: colorsOf(tpl.preset),
  preset: { ...tpl.preset }
}));

// Old template ids that no longer exist as their own entry map to the closest new one.
// This keeps agents saved before the template overhaul working without a migration.
const LEGACY_TEMPLATE_ALIASES = {
  classic_business: "service_business",
  bank_loan_agent: "finance_trust",
  gradient_glass: "modern_saas",
  warm_sections: "coaching_education",
  trust_card: "healthcare_clinic",
  cover_hero: "real_estate",
  booking_first: "restaurant_booking",
  minimal: "minimal_professional"
};

const DEFAULT_TEMPLATE_ID = "coaching_education";

export function normalizeTemplateId(templateId) {
  if (!templateId) return DEFAULT_TEMPLATE_ID;
  if (BIO_PAGE_TEMPLATES.some((tpl) => tpl.templateId === templateId)) return templateId;
  return LEGACY_TEMPLATE_ALIASES[templateId] || DEFAULT_TEMPLATE_ID;
}

export function isValidTemplateId(templateId) {
  return BIO_PAGE_TEMPLATES.some((tpl) => tpl.templateId === templateId)
    || Boolean(LEGACY_TEMPLATE_ALIASES[templateId]);
}

// Returns the full applyable preset for a template (design tokens + typography + layout
// + section order + style + copy + visibility). Legacy ids resolve to their new preset.
export function getBioPageTemplatePreset(templateId) {
  const id = normalizeTemplateId(templateId);
  const tpl = BIO_PAGE_TEMPLATES.find((item) => item.templateId === id);
  return tpl ? { ...tpl.preset } : null;
}

export const BIO_PAGE_DEFAULTS = {
  template: DEFAULT_TEMPLATE_ID,
  logoUrl: "",
  coverImageUrl: "",
  agentImageUrl: "",
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
  headline: "",
  subheadline: "",
  welcomeMessage: "",
  ctaText: "Talk to AI Agent",
  primaryCtaText: "Talk to AI Agent",
  secondaryCtaText: "Book Appointment",
  voiceCallCtaText: "Voice Call",
  showWebCall: true,
  showWebCallButton: true,
  showAppointment: true,
  showAppointmentButton: true,
  showContactForm: false,
  showBusinessInfo: true,
  showSocialLinks: false,
  showVoiceCallButton: true,
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
  quickTopics: DEFAULT_QUICK_TOPICS,
  isPublished: true,
  updatedAt: null
};

export function defaultBioPage(agent = {}) {
  const headline = agent.publicTitle || agent.businessName || agent.agentName || agent.name || "";
  const subheadline = agent.publicDescription || agent.businessDescription || agent.description || "";
  const preset = getBioPageTemplatePreset(BIO_PAGE_DEFAULTS.template) || {};
  return {
    ...BIO_PAGE_DEFAULTS,
    ...preset,
    template: BIO_PAGE_DEFAULTS.template,
    headline,
    subheadline,
    welcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || "",
    ctaText: preset.primaryCtaText || BIO_PAGE_DEFAULTS.ctaText,
    showQuickTopics: false,
    businessInfo: {
      ...BIO_PAGE_DEFAULTS.businessInfo,
      businessName: agent.businessName || headline,
      category: agent.businessCategory || "Business",
      location: agent.businessLocation || "Online"
    },
    socialLinks: {
      ...BIO_PAGE_DEFAULTS.socialLinks,
      website: agent.businessWebsite || ""
    },
    quickTopics: DEFAULT_QUICK_TOPICS.map((topic) => ({ ...topic })),
    updatedAt: new Date()
  };
}

// Returns the full applyable preset merged with the `template` id. Used by updateBioPage
// so selecting a template applies the real layout, not only colors.
export function templateDefaults(templateId) {
  const preset = getBioPageTemplatePreset(templateId);
  if (!preset) return {};
  return { template: normalizeTemplateId(templateId), ...preset };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function firstBool(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

// Merges a saved bioPage with its template preset and the shared defaults so the object
// handed to the frontend is always complete:
//   base defaults  ->  template preset (layout/typography/style)  ->  saved customizations
// Saved user values win, but any field the user never set (including everything on old
// bio pages saved before the overhaul) is filled from the template preset.
export function resolveBioPage(agent = {}, savedInput = null) {
  const base = defaultBioPage(agent);
  const saved = savedInput
    || (agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage)
    || {};

  const templateId = normalizeTemplateId(saved.template || base.template);
  const preset = getBioPageTemplatePreset(templateId) || {};

  const merged = {
    ...base,
    ...preset,
    ...saved,
    template: templateId,

    // CTA aliasing (primaryCtaText <-> ctaText kept in sync)
    primaryCtaText: firstDefined(saved.primaryCtaText, saved.ctaText, preset.primaryCtaText, base.primaryCtaText),
    ctaText: firstDefined(saved.ctaText, saved.primaryCtaText, preset.primaryCtaText, base.ctaText),
    secondaryCtaText: firstDefined(saved.secondaryCtaText, preset.secondaryCtaText, base.secondaryCtaText),
    voiceCallCtaText: firstDefined(saved.voiceCallCtaText, preset.voiceCallCtaText, base.voiceCallCtaText),

    // Web / voice call visibility aliases (older pages only stored showWebCall*)
    showVoiceCallButton: firstBool(saved.showVoiceCallButton, saved.showWebCallButton, saved.showWebCall, preset.showVoiceCallButton, base.showVoiceCallButton),
    showWebCallButton: firstBool(saved.showWebCallButton, saved.showWebCall, saved.showVoiceCallButton, preset.showVoiceCallButton, base.showWebCallButton),
    showWebCall: firstBool(saved.showWebCall, saved.showWebCallButton, saved.showVoiceCallButton, preset.showVoiceCallButton, base.showWebCall),
    showAppointmentButton: firstBool(saved.showAppointmentButton, saved.showAppointment, preset.showAppointmentButton, base.showAppointmentButton),
    showAppointment: firstBool(saved.showAppointment, saved.showAppointmentButton, preset.showAppointmentButton, base.showAppointment),

    // Layout / typography / style — always resolved to a real value
    layoutVariant: firstDefined(saved.layoutVariant, preset.layoutVariant, "centered_minimal"),
    heroVariant: firstDefined(saved.heroVariant, preset.heroVariant, "minimal"),
    contentWidth: firstDefined(saved.contentWidth, preset.contentWidth, "standard"),
    heroAlignment: firstDefined(saved.heroAlignment, preset.heroAlignment, "center"),
    headingFont: firstDefined(saved.headingFont, preset.headingFont, "Manrope"),
    bodyFont: firstDefined(saved.bodyFont, preset.bodyFont, "Inter"),
    headingWeight: firstDefined(saved.headingWeight, preset.headingWeight, "800"),
    headingTracking: firstDefined(saved.headingTracking, preset.headingTracking, "tight"),
    bodySize: firstDefined(saved.bodySize, preset.bodySize, "md"),
    borderRadius: firstDefined(saved.borderRadius, preset.borderRadius, "lg"),
    cardShadow: firstDefined(saved.cardShadow, preset.cardShadow, "soft"),
    cardBorder: firstDefined(saved.cardBorder, preset.cardBorder, "subtle"),
    buttonRadius: firstDefined(saved.buttonRadius, preset.buttonRadius, "lg"),
    backgroundStyle: firstDefined(saved.backgroundStyle, preset.backgroundStyle, "soft_gradient"),
    spacingScale: firstDefined(saved.spacingScale, preset.spacingScale, "comfortable"),
    animation: firstDefined(saved.animation, preset.animation, base.animation),
    fontStyle: firstDefined(saved.fontStyle, preset.fontStyle, base.fontStyle),
    mutedColor: firstDefined(saved.mutedColor, preset.mutedColor, base.mutedColor),
    borderColor: firstDefined(saved.borderColor, preset.borderColor, base.borderColor),

    // Quick topics are OFF by default — only shown if a user explicitly turned them on.
    showQuickTopics: firstBool(saved.showQuickTopics, false),
    showTopBar: firstBool(saved.showTopBar, preset.showTopBar, base.showTopBar ?? true),
    showLogo: firstBool(saved.showLogo, preset.showLogo, base.showLogo ?? true),
    showAgentImage: firstBool(saved.showAgentImage, preset.showAgentImage, base.showAgentImage ?? true),
    showCoverImage: firstBool(saved.showCoverImage, preset.showCoverImage, base.showCoverImage ?? false),
    showBusinessInfo: firstBool(saved.showBusinessInfo, preset.showBusinessInfo, base.showBusinessInfo),
    showSocialLinks: firstBool(saved.showSocialLinks, preset.showSocialLinks, base.showSocialLinks),

    sectionOrder: (Array.isArray(saved.sectionOrder) && saved.sectionOrder.length)
      ? saved.sectionOrder
      : (preset.sectionOrder || base.sectionOrder || ["hero", "businessInfo", "actions"]),

    businessInfo: { ...base.businessInfo, ...(saved.businessInfo || {}) },
    socialLinks: { ...base.socialLinks, ...(saved.socialLinks || {}) },
    quickTopics: Array.isArray(saved.quickTopics) && saved.quickTopics.length
      ? saved.quickTopics
      : DEFAULT_QUICK_TOPICS.map((topic) => ({ ...topic }))
  };

  return merged;
}
