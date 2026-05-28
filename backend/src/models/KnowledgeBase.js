import mongoose from "mongoose";

const knowledgeBaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    title: { type: String, required: true },
    content: { type: String, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("KnowledgeBase", knowledgeBaseSchema);
