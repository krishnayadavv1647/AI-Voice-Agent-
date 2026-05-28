import mongoose from "mongoose";

const leadQuestionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    fieldName: { type: String, required: true },
    required: { type: Boolean, default: false }
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentName: { type: String, required: true },
    agentType: { type: String, required: true },
    businessName: { type: String, required: true },
    businessCategory: String,
    businessDescription: String,
    businessWebsite: String,
    businessLocation: String,
    workingHours: String,
    contactNumber: String,
    mainGoal: String,
    secondaryGoal: String,
    avoidInstructions: String,
    confusedInstructions: String,
    services: String,
    pricing: String,
    faqs: String,
    policies: String,
    offers: String,
    additionalInfo: String,
    leadQuestions: [leadQuestionSchema],
    language: { type: String, default: "English" },
    voiceGender: String,
    voiceStyle: String,
    tone: { type: String, default: "Professional" },
    speakingSpeed: { type: String, default: "Normal" },
    personality: { type: String, default: "Polite" },
    fallbackMessage: { type: String, default: "I am not sure about that. Our team will call you back with the right information." },
    endingMessage: { type: String, default: "Thank you for calling. Our team will follow up soon." },
    humanTransferMessage: { type: String, default: "I will ask a team member to contact you shortly." },
    summaryFormat: String,
    systemPrompt: String,
    dograhWorkflowId: String,
    dograhWorkflowUuid: String,
    dograhAgentId: String,
    dograhWorkflowName: String,
    connectedPhoneNumber: String,
    callerIdNumber: String,
    telephonyProvider: String,
    dograhStatus: String,
    status: { type: String, enum: ["Draft", "Active", "Paused", "Connected"], default: "Draft" },
    shareableLink: String,
    embedCode: String,
    totalCalls: { type: Number, default: 0 },
    totalLeads: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("Agent", agentSchema);
