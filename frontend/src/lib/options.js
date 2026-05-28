export const agentTypes = [
  "AI Receptionist",
  "AI Sales Agent",
  "AI Support Agent",
  "Appointment Booking Agent",
  "Lead Qualification Agent",
  "Real Estate Agent",
  "Clinic Assistant",
  "Restaurant Booking Agent",
  "Coaching Center Counselor",
  "Custom Agent"
];

export const templates = {
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

export const languages = ["English", "Hindi", "Hindi + English", "Spanish", "Custom"];
export const tones = ["Professional", "Friendly", "Calm", "Energetic", "Sales-focused", "Supportive", "Luxury"];
export const personalities = ["Polite", "Confident", "Warm", "Formal", "Conversational", "Expert"];
