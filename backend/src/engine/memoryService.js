import mongoose from "mongoose";

import ConversationTurn from "../models/ConversationTurn.js";

const HISTORY_LIMIT = 20;

const liveHistory = new Map(); // conversationId -> { turns: [], expiresAt }
const LIVE_HISTORY_TTL_MS = 30 * 60 * 1000;

function touchLive(conversationId) {
  const entry = liveHistory.get(conversationId) || { turns: [] };
  entry.expiresAt = Date.now() + LIVE_HISTORY_TTL_MS;
  liveHistory.set(conversationId, entry);
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of liveHistory) {
    if (entry.expiresAt <= now) liveHistory.delete(key);
  }
}, 60 * 1000).unref();

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

  const live = liveHistory.get(conversationId);
  if (live && live.expiresAt > Date.now()) {
    return live.turns.slice(-safeLimit);
  }

  if (!dbAvailable()) {
    return (fallbackMemory.get(conversationId) || []).slice(-safeLimit);
  }

  try {
    // Fetch the most recent turns, then return them oldest-first.
    const turns = await ConversationTurn.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    const mapped = turns.reverse().map((turn) => ({
      role: turn.role,
      content: turn.content,
      createdAt: turn.createdAt instanceof Date ? turn.createdAt.toISOString() : turn.createdAt
    }));
    touchLive(conversationId).turns = mapped;
    return mapped;
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

  const entry = touchLive(conversationId);
  entry.turns.push({ ...turn, createdAt: turn.createdAt.toISOString() });
  entry.turns = entry.turns.slice(-HISTORY_LIMIT);

  if (!dbAvailable()) return;

  ConversationTurn.create(turn).catch((error) => {
    console.error("[memoryService] background save failed:", error.message);
  });
}
