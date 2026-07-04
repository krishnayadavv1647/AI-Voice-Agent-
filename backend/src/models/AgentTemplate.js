import mongoose from "mongoose";

const agentTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, required: true, trim: true },
    industry: { type: String, default: "", trim: true },
    useCase: { type: String, default: "", trim: true },
    shortDescription: { type: String, required: true, trim: true },
    longDescription: { type: String, default: "", trim: true },
    icon: { type: String, default: "Bot" },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true, index: true },
    isPremium: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0, index: true },
    requiredFields: [{ type: String, trim: true }],
    optionalFields: [{ type: String, trim: true }],
    defaultAgentConfig: { type: mongoose.Schema.Types.Mixed, required: true, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("AgentTemplate", agentTemplateSchema);
