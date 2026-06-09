export const BIO_PAGE_DEFAULTS = {
  template: "classic_business",
  logoUrl: "",
  coverImageUrl: "",
  primaryColor: "#6C3BFF",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  buttonColor: "#6C3BFF",
  fontStyle: "modern",
  animation: "fade_in",
  headline: "",
  subheadline: "",
  welcomeMessage: "",
  ctaText: "Talk to AI Agent",
  secondaryCtaText: "Book Appointment",
  showWebCall: true,
  showAppointment: true,
  showContactForm: false,
  showBusinessInfo: true,
  showSocialLinks: false,
  isPublished: true,
  updatedAt: null
};

export const BIO_PAGE_TEMPLATES = [
  {
    templateId: "classic_business",
    name: "Classic Business",
    description: "Clean white background, purple CTA, simple centered card.",
    colors: { primaryColor: "#6C3BFF", backgroundColor: "#FFFFFF", textColor: "#111827", buttonColor: "#6C3BFF" },
    layoutStyle: "centered_card",
    recommendedUseCase: "General service businesses",
    previewThumbnail: "classic-business"
  },
  {
    templateId: "modern_saas",
    name: "Modern SaaS",
    description: "Gradient background, glassmorphism card, animated CTA.",
    colors: { primaryColor: "#5B5CFF", backgroundColor: "#EEF2FF", textColor: "#111827", buttonColor: "#4F46E5" },
    layoutStyle: "gradient_glass",
    recommendedUseCase: "SaaS, agencies, and technology teams",
    previewThumbnail: "modern-saas"
  },
  {
    templateId: "coaching_education",
    name: "Coaching Education",
    description: "Warm professional layout with education-focused sections.",
    colors: { primaryColor: "#B45309", backgroundColor: "#FFFBEB", textColor: "#1F2937", buttonColor: "#D97706" },
    layoutStyle: "warm_sections",
    recommendedUseCase: "Coaching centers, tutors, and education consultants",
    previewThumbnail: "coaching-education"
  },
  {
    templateId: "healthcare_clinic",
    name: "Healthcare Clinic",
    description: "Calm colors, trust-focused card, appointment CTA.",
    colors: { primaryColor: "#0F766E", backgroundColor: "#F0FDFA", textColor: "#134E4A", buttonColor: "#0D9488" },
    layoutStyle: "trust_card",
    recommendedUseCase: "Clinics, wellness, and healthcare practices",
    previewThumbnail: "healthcare-clinic"
  },
  {
    templateId: "real_estate",
    name: "Real Estate",
    description: "Large cover image style with a premium property-agent look.",
    colors: { primaryColor: "#1E3A8A", backgroundColor: "#F8FAFC", textColor: "#0F172A", buttonColor: "#1D4ED8" },
    layoutStyle: "cover_hero",
    recommendedUseCase: "Real estate agents and property consultants",
    previewThumbnail: "real-estate"
  },
  {
    templateId: "restaurant_booking",
    name: "Restaurant Booking",
    description: "Friendly layout, booking-focused CTA, warm colors.",
    colors: { primaryColor: "#BE123C", backgroundColor: "#FFF7ED", textColor: "#431407", buttonColor: "#E11D48" },
    layoutStyle: "booking_first",
    recommendedUseCase: "Restaurants, cafes, and hospitality",
    previewThumbnail: "restaurant-booking"
  }
];

export function defaultBioPage(agent = {}) {
  return {
    ...BIO_PAGE_DEFAULTS,
    headline: agent.publicTitle || agent.businessName || agent.agentName || agent.name || "",
    subheadline: agent.publicDescription || agent.businessDescription || agent.description || "",
    welcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || "",
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
