const baseLeadFields = [
  { key: "customerName", label: "Customer Name", required: true },
  { key: "phoneNumber", label: "Phone Number", required: true },
  { key: "intent", label: "Reason for Call", required: true },
  { key: "preferredDate", label: "Preferred Date", required: false },
  { key: "preferredTime", label: "Preferred Time", required: false },
  { key: "notes", label: "Notes", required: false }
];

function workflow(extraInstruction) {
  return {
    steps: [
      { id: "greet", name: "Greet Caller", instruction: "Greet the caller warmly using {{businessName}}." },
      { id: "identify_intent", name: "Identify Intent", instruction: "Understand why the caller contacted the business." },
      { id: "collect_details", name: "Collect Details", instruction: "Collect name, phone number, and the relevant request details." },
      { id: "handle_request", name: "Handle Request", instruction: extraInstruction },
      { id: "confirm_next_step", name: "Confirm Next Step", instruction: "Summarize the request and confirm what will happen next." }
    ]
  };
}

function config({
  agentName,
  description,
  firstMessage,
  prompt,
  category,
  services,
  workflowInstruction,
  leadCaptureFields = baseLeadFields
}) {
  return {
    agentNameTemplate: agentName,
    descriptionTemplate: description,
    firstMessageTemplate: firstMessage,
    systemPromptTemplate: prompt,
    language: "english",
    voiceConfig: {
      voiceLabel: "Default Voice",
      style: "professional",
      speed: "normal"
    },
    llmConfig: {
      providerLabel: "System Provider",
      responseStyle: "short_clear"
    },
    callConfig: {
      callMode: "callback",
      allowInterruption: true,
      fastReplyMode: true,
      leadCaptureEnabled: true
    },
    webCallConfig: {
      enabledByDefault: false,
      label: "Web Call"
    },
    workflowConfig: workflow(workflowInstruction),
    leadCaptureFields,
    fallbackRules: [
      "If information is missing, say the team will check and confirm.",
      "Do not invent prices, availability, guarantees, or medical/legal advice.",
      "Ask one question at a time."
    ],
    escalationRules: [
      "Escalate when the caller asks for a human.",
      "Escalate urgent, angry, unsafe, or complex requests.",
      "Collect callback details before escalation."
    ],
    appointmentRules: {
      enabled: true,
      instruction: "If the caller requests an appointment or booking, collect preferred date, time, name, phone number, and purpose."
    },
    knowledgeBaseDefaults: {
      services,
      workingHours: "{{workingHours}}",
      website: "{{businessWebsite}}",
      address: "{{businessAddress}}"
    },
    businessCategory: category,
    servicesTemplate: services
  };
}

export const defaultAgentTemplates = [
  {
    name: "Restaurant Booking Agent",
    slug: "restaurant-booking-agent",
    category: "Booking",
    industry: "Restaurant",
    useCase: "Table bookings and guest inquiries",
    shortDescription: "Handles table bookings, menu questions, hours, location, and guest details.",
    longDescription: "A front-desk style agent for restaurants that captures booking details and answers basic dining questions.",
    icon: "Utensils",
    tags: ["Bookings", "Food", "Customer calls"],
    sortOrder: 10,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} AI Receptionist",
      description: "Reservation and customer inquiry assistant for {{businessName}}.",
      firstMessage: "Hi, thank you for calling {{businessName}}. How can I help you today?",
      category: "Restaurant",
      services: "{{services}}",
      workflowInstruction: "Help with table bookings, menu questions, opening hours, location, takeaway questions, and guest requirements.",
      prompt: "You are the AI receptionist for {{businessName}}, a restaurant. Help callers with table bookings, menu questions, location, opening hours, takeaway questions, and customer inquiries. Collect customer name, phone number, booking date, booking time, number of guests, and special notes. Services: {{services}}. Working hours: {{workingHours}}. Address: {{businessAddress}}. Website: {{businessWebsite}}. Keep replies short, warm, and practical. Do not confirm a booking as final unless explicit confirmation is available; say the team will confirm shortly."
    })
  },
  {
    name: "Dental Clinic Receptionist",
    slug: "dental-clinic-receptionist",
    category: "Healthcare",
    industry: "Dental Clinic",
    useCase: "Dental appointments and patient intake",
    shortDescription: "Collects appointment requests, treatment interest, symptoms, urgency, and preferred timing.",
    longDescription: "A front-desk assistant for dental clinics with safe patient intake and appointment handling.",
    icon: "HeartPulse",
    tags: ["Appointments", "Clinic", "Patient intake"],
    sortOrder: 20,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Dental Assistant",
      description: "Dental front desk assistant for appointment requests and patient questions.",
      firstMessage: "Hello, thank you for calling {{businessName}}. How may I help you today?",
      category: "Dental Clinic",
      services: "{{services}}",
      workflowInstruction: "Collect treatment interest, pain or emergency status, preferred date and time, patient name, and phone number.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "treatmentInterest", label: "Treatment Interest", required: false },
        { key: "urgency", label: "Pain or Emergency Status", required: false }
      ],
      prompt: "You are the front desk AI assistant for {{businessName}}, a dental clinic. Answer general questions, collect appointment requests, ask about treatment interest, pain or emergency status, preferred date and time, patient name, and phone number. Services: {{services}}. Working hours: {{workingHours}}. Address: {{businessAddress}}. Do not provide medical diagnosis. For severe pain, swelling, bleeding, injury, or emergency language, advise urgent care and escalate to the clinic team."
    })
  },
  {
    name: "Salon Appointment Agent",
    slug: "salon-appointment-agent",
    category: "Booking",
    industry: "Salon",
    useCase: "Salon service inquiries and appointment requests",
    shortDescription: "Handles service questions, pricing inquiries, stylist requests, and appointment timing.",
    longDescription: "A booking assistant for salons and beauty studios.",
    icon: "Scissors",
    tags: ["Salon", "Appointments", "Services"],
    sortOrder: 30,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Booking Assistant",
      description: "Salon appointment and service inquiry assistant for {{businessName}}.",
      firstMessage: "Hi, you have reached {{businessName}}. What service would you like help with?",
      category: "Salon",
      services: "{{services}}",
      workflowInstruction: "Help with service inquiries, approximate pricing questions, stylist preference, and appointment date/time.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "serviceRequested", label: "Service Requested", required: true },
        { key: "stylistPreference", label: "Stylist Preference", required: false }
      ],
      prompt: "You are the AI booking assistant for {{businessName}}, a salon. Help callers ask about services, pricing, stylist availability, and appointments. Collect name, phone number, service requested, preferred date, preferred time, and stylist preference if any. Services: {{services}}. Working hours: {{workingHours}}. Address: {{businessAddress}}. Keep responses friendly and concise. Do not guarantee pricing or appointment availability unless confirmed in the current context."
    })
  },
  {
    name: "Real Estate Lead Agent",
    slug: "real-estate-lead-agent",
    category: "Sales",
    industry: "Real Estate",
    useCase: "Buyer, seller, and renter qualification",
    shortDescription: "Qualifies buyers, sellers, and renters with budget, location, property type, and timeline.",
    longDescription: "A lead qualification agent for real estate teams and property consultants.",
    icon: "Building2",
    tags: ["Real estate", "Lead capture", "Sales"],
    sortOrder: 40,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Property Assistant",
      description: "Real estate lead qualification assistant for {{businessName}}.",
      firstMessage: "Hello, thank you for contacting {{businessName}}. Are you looking to buy, sell, rent, or invest?",
      category: "Real Estate",
      services: "{{services}}",
      workflowInstruction: "Qualify the caller by need, property type, budget, preferred location, timeline, and callback details.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "propertyIntent", label: "Buy / Sell / Rent", required: true },
        { key: "budget", label: "Budget", required: false },
        { key: "location", label: "Preferred Location", required: false },
        { key: "propertyType", label: "Property Type", required: false },
        { key: "timeline", label: "Timeline", required: false }
      ],
      prompt: "You are the AI property assistant for {{businessName}}. Qualify callers who want to buy, sell, rent, or invest. Collect name, phone number, intent, property type, preferred location, budget, timeline, and notes. Services: {{services}}. Website: {{businessWebsite}}. Keep responses helpful and sales-focused without overpromising availability, prices, or legal/financial outcomes."
    })
  },
  {
    name: "Gym Membership Agent",
    slug: "gym-membership-agent",
    category: "Membership",
    industry: "Fitness",
    useCase: "Membership questions and trial bookings",
    shortDescription: "Answers membership questions, class timings, trial booking, and lead capture.",
    longDescription: "A membership inquiry assistant for gyms, fitness studios, and wellness centers.",
    icon: "Zap",
    tags: ["Fitness", "Membership", "Trials"],
    sortOrder: 50,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Membership Assistant",
      description: "Fitness membership and trial booking assistant for {{businessName}}.",
      firstMessage: "Hi, thanks for calling {{businessName}}. Are you interested in membership, classes, or a trial session?",
      category: "Gym",
      services: "{{services}}",
      workflowInstruction: "Answer membership questions, collect fitness goal, preferred timing, trial interest, and callback details.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "fitnessGoal", label: "Fitness Goal", required: false },
        { key: "membershipInterest", label: "Membership Interest", required: false }
      ],
      prompt: "You are the AI membership assistant for {{businessName}}. Help callers with membership questions, trial sessions, class timings, facilities, and joining process. Collect name, phone number, fitness goal, membership interest, preferred time, and notes. Services: {{services}}. Working hours: {{workingHours}}. Address: {{businessAddress}}. Keep responses energetic, clear, and honest."
    })
  },
  {
    name: "Local Service Business Agent",
    slug: "local-service-business-agent",
    category: "Services",
    industry: "Local Services",
    useCase: "Service request capture for plumbers, electricians, cleaners, and repair teams",
    shortDescription: "Captures job type, address, urgency, preferred time, and customer details.",
    longDescription: "A practical intake assistant for local service businesses.",
    icon: "Home",
    tags: ["Local services", "Repair", "Dispatch"],
    sortOrder: 60,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Service Assistant",
      description: "Service request intake assistant for {{businessName}}.",
      firstMessage: "Hello, thank you for calling {{businessName}}. What service do you need help with?",
      category: "Local Service",
      services: "{{services}}",
      workflowInstruction: "Collect job type, service address, urgency, preferred time, name, and phone number.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "jobType", label: "Job Type", required: true },
        { key: "serviceAddress", label: "Service Address", required: true },
        { key: "urgency", label: "Urgency", required: false }
      ],
      prompt: "You are the AI service assistant for {{businessName}}. Help callers request plumbing, electrical, cleaning, repair, or other local services based on the business details. Collect name, phone number, job type, service address, urgency, preferred time, and notes. Services: {{services}}. Working hours: {{workingHours}}. Address: {{businessAddress}}. For urgent safety issues, advise the caller to take immediate safety precautions and escalate to the team."
    })
  },
  {
    name: "Medical Clinic Front Desk",
    slug: "medical-clinic-front-desk",
    category: "Healthcare",
    industry: "Medical Clinic",
    useCase: "Clinic inquiries and appointment requests",
    shortDescription: "Handles general clinic inquiries, appointment requests, doctor availability, and patient details.",
    longDescription: "A safe intake assistant for medical clinics and front desks.",
    icon: "HeartPulse",
    tags: ["Clinic", "Appointments", "Front desk"],
    sortOrder: 70,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Front Desk Assistant",
      description: "Clinic front desk assistant for {{businessName}}.",
      firstMessage: "Hello, you have reached {{businessName}}. How can I help you today?",
      category: "Medical Clinic",
      services: "{{services}}",
      workflowInstruction: "Collect patient name, phone number, appointment reason, preferred doctor or department, and preferred timing.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "patientConcern", label: "Patient Concern", required: true },
        { key: "preferredDoctor", label: "Preferred Doctor", required: false },
        { key: "urgency", label: "Urgency", required: false }
      ],
      prompt: "You are the front desk AI assistant for {{businessName}}, a medical clinic. Help with general clinic inquiries, appointment requests, working hours, location, and doctor availability if known. Collect patient name, phone number, appointment reason, preferred doctor or department, preferred date and time, and urgency. Services: {{services}}. Working hours: {{workingHours}}. Do not diagnose, prescribe, or give emergency medical advice. For urgent symptoms or emergencies, advise immediate medical attention and escalate."
    })
  },
  {
    name: "Coaching / Consultant Call Agent",
    slug: "coaching-consultant-call-agent",
    category: "Consulting",
    industry: "Coaching",
    useCase: "Lead qualification and consultation booking",
    shortDescription: "Qualifies leads, captures goals, problems, budget, and books consultation requests.",
    longDescription: "A discovery-call assistant for coaches, consultants, agencies, and advisors.",
    icon: "GraduationCap",
    tags: ["Consultation", "Lead capture", "Coaching"],
    sortOrder: 80,
    requiredFields: ["businessName"],
    optionalFields: ["businessPhone", "businessWebsite", "businessAddress", "services", "workingHours"],
    defaultAgentConfig: config({
      agentName: "{{businessName}} Consultation Assistant",
      description: "Lead qualification and consultation booking assistant for {{businessName}}.",
      firstMessage: "Hi, thank you for contacting {{businessName}}. What goal or challenge would you like help with?",
      category: "Coaching / Consulting",
      services: "{{services}}",
      workflowInstruction: "Qualify the caller by goal, problem, timeline, budget, and consultation preference.",
      leadCaptureFields: [
        ...baseLeadFields,
        { key: "goal", label: "Goal", required: true },
        { key: "challenge", label: "Challenge", required: false },
        { key: "budget", label: "Budget", required: false },
        { key: "timeline", label: "Timeline", required: false }
      ],
      prompt: "You are the AI consultation assistant for {{businessName}}. Qualify callers by understanding their goal, current challenge, timeline, budget if relevant, and consultation preference. Collect name, phone number, goal, problem, preferred date/time, and notes. Services: {{services}}. Website: {{businessWebsite}}. Keep responses consultative, helpful, and concise. Do not guarantee outcomes."
    })
  }
];
