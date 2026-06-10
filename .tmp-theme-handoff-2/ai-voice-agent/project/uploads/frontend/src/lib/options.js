export const agentTypes = [
  "AI Receptionist",
  "AI Sales Agent",
  "AI Support Agent",
  "Appointment Booking Agent",
  "Lead Qualification Agent",
  "Real Estate Agent",
  "Clinic Assistant",
  "Restaurant Booking Agent",
  "Bus Ticket Booking Agent",
  "Coaching Center Counselor",
  "Custom Agent"
];

export const templates = {
  "Restaurant Booking Agent": {
    businessCategory: "Restaurant",
    businessDescription: "A restaurant that takes table booking, menu inquiries, takeaway questions, and customer follow-ups.",
    services: "Table reservation, menu information, takeaway support, party booking inquiries.",
    pricing: "Pricing depends on menu items, offers, and booking requirements. Confirm exact pricing with the team.",
    faqs: "Ask for number of guests, date, time, name, phone number, and special requests.",
    policies: "Bookings are subject to table availability. The team confirms special requests.",
    offers: "Mention current offers only if the business has provided them.",
    additionalInfo: "Keep calls short and collect booking details clearly.",
    mainGoal: "Help callers request table bookings and capture booking details.",
    secondaryGoal: "Collect name, phone number, number of guests, preferred date, preferred time, and special request.",
    leadQuestions: [
      { label: "Name", fieldName: "name", required: true },
      { label: "Phone Number", fieldName: "phone", required: true },
      { label: "Number of Guests", fieldName: "numberOfGuests", required: true },
      { label: "Booking Date", fieldName: "preferredDate", required: true },
      { label: "Booking Time", fieldName: "preferredTime", required: true },
      { label: "Special Request", fieldName: "specialRequest", required: false }
    ]
  },
  "Bank Loan Agent": {
    businessCategory: "Banking / Loans",
    businessDescription: "A loan inquiry assistant for personal loan, business loan, home loan, and eligibility callback requests.",
    services: "Loan inquiry, eligibility questions, document checklist, callback scheduling.",
    pricing: "Interest rates and charges depend on bank policy, customer profile, loan amount, and tenure.",
    faqs: "Ask loan type, amount, employment/business type, monthly income, city, name, and phone number.",
    policies: "Do not guarantee loan approval, rate, or disbursal. Team will verify eligibility.",
    mainGoal: "Qualify loan inquiries and capture callback details.",
    secondaryGoal: "Collect name, phone, loan type, amount, income range, city, and preferred callback time."
  },
  "Clinic Reception Agent": {
    businessCategory: "Clinic",
    businessDescription: "A clinic reception assistant for appointment inquiries and basic clinic information.",
    services: "Appointment requests, doctor availability questions, clinic timing, callback requests.",
    pricing: "Consultation fees vary by doctor or service. Team will confirm exact fees.",
    faqs: "Ask for patient name, phone number, concern, preferred date, and preferred time.",
    policies: "Do not diagnose, prescribe medicines, or interpret reports.",
    additionalInfo: "For emergencies, ask caller to visit the hospital or contact emergency services.",
    mainGoal: "Capture appointment requests and answer clinic information questions.",
    secondaryGoal: "Collect patient name, phone number, requirement, preferred date, and preferred time."
  },
  "Clinic Assistant": {
    businessCategory: "Clinic",
    businessDescription: "A clinic reception assistant for appointment inquiries and basic clinic information.",
    services: "Appointment requests, doctor availability questions, clinic timing, callback requests.",
    pricing: "Consultation fees vary by doctor or service. Team will confirm exact fees.",
    faqs: "Ask for patient name, phone number, concern, preferred date, and preferred time.",
    policies: "Do not diagnose, prescribe medicines, or interpret reports.",
    additionalInfo: "For emergencies, ask caller to visit the hospital or contact emergency services.",
    mainGoal: "Capture appointment requests and answer clinic information questions.",
    secondaryGoal: "Collect patient name, phone number, requirement, preferred date, and preferred time."
  },
  "Bus Ticket Booking Agent": {
    businessCategory: "Bus Ticket Booking",
    businessDescription: "A travel booking assistant for bus route, ticket, fare, and availability inquiries.",
    services: "Bus ticket booking requests, route inquiry, fare estimate, boarding and dropping point support.",
    pricing: "Fare depends on route, date, bus type, operator, and seat availability.",
    faqs: "Ask source city, destination city, travel date, passengers, bus type, and timing.",
    policies: "Do not confirm tickets unless booking confirmation and payment are complete.",
    mainGoal: "Capture bus ticket booking requests.",
    secondaryGoal: "Collect route, date, passengers, bus type, name, and phone number."
  },
  "Real Estate Lead Agent": {
    businessCategory: "Real Estate",
    businessDescription: "A real estate inquiry assistant for buyers, renters, and property visit requests.",
    services: "Property inquiry, site visit requests, budget qualification, location preference capture.",
    pricing: "Property price depends on location, size, availability, and project. Team will confirm.",
    faqs: "Ask property type, location, budget, timeline, name, and phone number.",
    policies: "Do not promise availability or price unless provided by the team.",
    mainGoal: "Qualify real estate leads and schedule follow-up.",
    secondaryGoal: "Capture name, phone, location, budget, and property requirement."
  },
  "Salon Booking Agent": {
    businessCategory: "Salon",
    businessDescription: "A salon booking assistant for appointments, services, and callback requests.",
    services: "Haircut, styling, facial, grooming, beauty services, appointment booking.",
    pricing: "Pricing depends on selected service and stylist. Team will confirm exact price.",
    faqs: "Ask service, preferred date, preferred time, name, and phone number.",
    policies: "Appointments depend on staff availability.",
    mainGoal: "Capture salon appointment requests.",
    secondaryGoal: "Collect service, date, time, name, and phone number."
  },
  "Hotel Booking Agent": {
    businessCategory: "Hotel",
    businessDescription: "A hotel booking assistant for room inquiries and reservation requests.",
    services: "Room booking requests, availability inquiry, amenities questions, callback requests.",
    pricing: "Room tariff depends on dates, room type, guests, and availability.",
    faqs: "Ask check-in date, check-out date, guests, room type, name, and phone.",
    policies: "Bookings are confirmed only after availability and payment confirmation.",
    mainGoal: "Capture hotel booking requests.",
    secondaryGoal: "Collect stay dates, room preference, guests, name, and phone number."
  },
  "Coaching Inquiry Agent": {
    businessCategory: "Coaching Center",
    businessDescription: "A coaching inquiry assistant for course questions and admission follow-up.",
    services: "Course information, batch timing, fee inquiry, admission callback.",
    pricing: "Fees depend on course and batch. Team will confirm exact fees.",
    faqs: "Ask course interest, student name, phone, class/level, preferred timing.",
    policies: "Do not guarantee admission or discounts unless provided.",
    mainGoal: "Capture coaching inquiry leads.",
    secondaryGoal: "Collect student details, course interest, and callback number."
  },
  "Customer Support Agent": {
    businessCategory: "Customer Support",
    businessDescription: "A support assistant for common questions, issue capture, and follow-up.",
    services: "FAQ support, issue logging, callback request, basic troubleshooting guidance.",
    pricing: "Not applicable unless business provides pricing.",
    faqs: "Ask issue type, order/account detail if relevant, name, phone, and message.",
    policies: "Do not make promises outside provided support policies.",
    mainGoal: "Help customers and collect support issues.",
    secondaryGoal: "Capture customer details and issue summary for follow-up."
  },
  "AI Receptionist": {
    mainGoal: "Answer customer questions, capture caller details, and route requests clearly.",
    secondaryGoal: "Collect name, phone number, and reason for calling.",
    tone: "Professional",
    personality: "Warm"
  },
  "AI Sales Agent": {
    mainGoal: "Qualify prospects and guide them toward the right offer.",
    secondaryGoal: "Capture requirement, budget, and timeline.",
    tone: "Sales-focused",
    personality: "Confident"
  },
  "AI Support Agent": {
    mainGoal: "Resolve common customer questions using the provided knowledge base.",
    secondaryGoal: "Collect issue details when human follow-up is needed.",
    tone: "Supportive",
    personality: "Expert"
  },
  "Appointment Booking Agent": {
    mainGoal: "Book appointments and answer customer questions.",
    secondaryGoal: "Capture name, phone number, requirement, preferred date, and preferred time.",
    tone: "Friendly",
    personality: "Polite"
  }
};

export const templateOptions = [
  "Restaurant Booking Agent",
  "Bank Loan Agent",
  "Clinic Reception Agent",
  "Bus Ticket Booking Agent",
  "Real Estate Lead Agent",
  "Salon Booking Agent",
  "Hotel Booking Agent",
  "Coaching Inquiry Agent",
  "Customer Support Agent"
];

export const defaultLeadQuestions = [
  ["Name", "name", true],
  ["Phone Number", "phone", true],
  ["Email", "email", false],
  ["Requirement", "requirement", true],
  ["Preferred Date", "preferredDate", false],
  ["Preferred Time", "preferredTime", false],
  ["Budget", "budget", false],
  ["Location", "location", false],
  ["Message", "message", false]
].map(([label, fieldName, required]) => ({ label, fieldName, required }));

export const languages = [
  { label: "English", value: "english" },
  { label: "Hindi", value: "hindi" },
  { label: "Hinglish", value: "hinglish" },
  { label: "Hindi + English", value: "hindi_english" }
];
export const tones = ["Professional", "Friendly", "Calm", "Energetic", "Sales-focused", "Supportive", "Luxury"];
export const personalities = ["Polite", "Confident", "Warm", "Formal", "Conversational", "Expert"];
