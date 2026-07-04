import mongoose from "mongoose";

import ConversationTurn from "../models/ConversationTurn.js";

const HISTORY_LIMIT = 20;

// In-memory fallback used when mongoose is not connected (e.g. unit tests). Keeps the engine
// functional without a database so existing engine tests do not require Mongo.
const fallbackMemory = new Map();

function dbAvailable() {
  // 1 === connected. Anything else (0 disconnected, 2 connecting, 3 disconnecting) → fallback.
  return mongoose.connection?.readyState === 1;
}

export async function getConversationHistory(conversationId, limit = HISTORY_LIMIT) {
  if (!conversationId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || HISTORY_LIMIT, HISTORY_LIMIT));

  if (!dbAvailable()) {
    return (fallbackMemory.get(conversationId) || []).slice(-safeLimit);
  }

  try {
    // Fetch the most recent turns, then return them oldest-first.
    const turns = await ConversationTurn.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    return turns
      .reverse()
      .map((turn) => ({
        role: turn.role,
        content: turn.content,
        createdAt: turn.createdAt instanceof Date ? turn.createdAt.toISOString() : turn.createdAt
      }));
  } catch (error) {
    console.error("[memoryService] getConversationHistory failed, using fallback:", error.message);
    return (fallbackMemory.get(conversationId) || []).slice(-safeLimit);
  }
}

export async function saveConversationMessage(conversationId, message) {
  if (!conversationId || !message) return;

  const turn = {
    conversationId,
    role: message.role,
    content: message.content ?? "",
    createdAt: new Date()
  };

  if (!dbAvailable()) {
    const current = fallbackMemory.get(conversationId) || [];
    current.push({ ...turn, createdAt: turn.createdAt.toISOString() });
    fallbackMemory.set(conversationId, current.slice(-HISTORY_LIMIT));
    return;
  }

  try {
    await ConversationTurn.create(turn);
  } catch (error) {
    console.error("[memoryService] saveConversationMessage failed, using fallback:", error.message);
    const current = fallbackMemory.get(conversationId) || [];
    current.push({ ...turn, createdAt: turn.createdAt.toISOString() });
    fallbackMemory.set(conversationId, current.slice(-HISTORY_LIMIT));
  }
}
