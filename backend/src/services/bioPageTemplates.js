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

export const BIO_PAGE_DEFAULTS = {
  template: "coaching_education",
  logoUrl: "",
  coverImageUrl: "",
  agentImageUrl: "",
  primaryColor: "#2563EB",
  backgroundColor: "#F8FAFC",
  textColor: "#0F172A",
  buttonColor: "#2563EB",
  cardColor: "#FFFFFF",
  accentColor: "#DBEAFE",
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

export const BIO_PAGE_TEMPLATES = [
  {
    templateId: "classic_business",
    name: "Classic Business",
    description: "Clean centered layout with professional blue accents.",
    colors: { primaryColor: "#2563EB", backgroundColor: "#F8FAFC", textColor: "#0F172A", buttonColor: "#2563EB", cardColor: "#FFFFFF", accentColor: "#BFDBFE" },
    layoutStyle: "centered_card",
    recommendedUseCase: "General service businesses",
    previewThumbnail: "classic-business"
  },
  {
    templateId: "modern_saas",
    name: "Modern SaaS",
    description: "Gradient background, glassmorphism card, animated CTA.",
    colors: { primaryColor: "#5B5CFF", backgroundColor: "#EEF2FF", textColor: "#111827", buttonColor: "#4F46E5", cardColor: "#FFFFFF", accentColor: "#C7D2FE" },
    layoutStyle: "gradient_glass",
    recommendedUseCase: "SaaS, agencies, and technology teams",
    previewThumbnail: "modern-saas"
  },
  {
    templateId: "coaching_education",
    name: "Coaching Education",
    description: "Warm professional layout with education-focused sections.",
    colors: { primaryColor: "#2563EB", backgroundColor: "#F8FAFC", textColor: "#0F172A", buttonColor: "#2563EB", cardColor: "#FFFFFF", accentColor: "#DBEAFE" },
    layoutStyle: "warm_sections",
    recommendedUseCase: "Coaching centers, tutors, and education consultants",
    previewThumbnail: "coaching-education"
  },
  {
    templateId: "healthcare_clinic",
    name: "Healthcare Clinic",
    description: "Calm colors, trust-focused card, appointment CTA.",
    colors: { primaryColor: "#0F766E", backgroundColor: "#F0FDFA", textColor: "#134E4A", buttonColor: "#0D9488", cardColor: "#FFFFFF", accentColor: "#99F6E4" },
    layoutStyle: "trust_card",
    recommendedUseCase: "Clinics, wellness, and healthcare practices",
    previewThumbnail: "healthcare-clinic"
  },
  {
    templateId: "real_estate",
    name: "Real Estate",
    description: "Large cover image style with a premium property-agent look.",
    colors: { primaryColor: "#1E3A8A", backgroundColor: "#F8FAFC", textColor: "#0F172A", buttonColor: "#B8860B", cardColor: "#FFFFFF", accentColor: "#DBEAFE" },
    layoutStyle: "cover_hero",
    recommendedUseCase: "Real estate agents and property consultants",
    previewThumbnail: "real-estate"
  },
  {
    templateId: "restaurant_booking",
    name: "Restaurant Booking",
    description: "Friendly layout, booking-focused CTA, warm colors.",
    colors: { primaryColor: "#C2410C", backgroundColor: "#FFF7ED", textColor: "#431407", buttonColor: "#EA580C", cardColor: "#FFFBEB", accentColor: "#FED7AA" },
    layoutStyle: "booking_first",
    recommendedUseCase: "Restaurants, cafes, and hospitality",
    previewThumbnail: "restaurant-booking"
  },
  {
    templateId: "bank_loan_agent",
    name: "Bank Loan Agent",
    description: "Professional finance theme with trust-focused blue and green accents.",
    colors: { primaryColor: "#0F766E", backgroundColor: "#F8FAFC", textColor: "#0F172A", buttonColor: "#047857", cardColor: "#FFFFFF", accentColor: "#BBF7D0" },
    layoutStyle: "finance_trust",
    recommendedUseCase: "Banks, NBFCs, loan and finance advisors",
    previewThumbnail: "bank-loan-agent"
  },
  {
    templateId: "minimal_professional",
    name: "Minimal Professional",
    description: "White background, clean typography, and restrained black CTA.",
    colors: { primaryColor: "#111827", backgroundColor: "#FFFFFF", textColor: "#111827", buttonColor: "#111827", cardColor: "#FFFFFF", accentColor: "#E5E7EB" },
    layoutStyle: "minimal",
    recommendedUseCase: "Consultants and professional services",
    previewThumbnail: "minimal-professional"
  }
];

export function defaultBioPage(agent = {}) {
  const headline = agent.publicTitle || agent.businessName || agent.agentName || agent.name || "";
  const subheadline = agent.publicDescription || agent.businessDescription || agent.description || "";
  return {
    ...BIO_PAGE_DEFAULTS,
    headline,
    subheadline,
    welcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || "",
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

export function templateDefaults(templateId) {
  const template = BIO_PAGE_TEMPLATES.find((item) => item.templateId === templateId);
  if (!template) return {};
  return {
    template: template.templateId,
    ...(template.colors || {})
  };
}
