import mongoose from "mongoose";

// One durable conversation turn, keyed by call/conversation id. Backs engine/memoryService.js so
// custom-LLM conversation history survives restarts and multiple instances. Stale conversations
// self-expire after 7 days via the TTL index on createdAt.
const conversationTurnSchema = new mongoose.Schema(
  {
    conversationId: { type: String, index: true, required: true },
    role: { type: String, required: true },
    content: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

conversationTurnSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
conversationTurnSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model("ConversationTurn", conversationTurnSchema);
