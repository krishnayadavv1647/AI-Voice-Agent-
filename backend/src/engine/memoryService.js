const memory = new Map();

export function getConversationHistory(conversationId) {
  if (!conversationId) return [];
  return memory.get(conversationId) || [];
}

export function saveConversationMessage(conversationId, message) {
  if (!conversationId) return;
  const current = memory.get(conversationId) || [];
  current.push({ ...message, createdAt: new Date().toISOString() });
  memory.set(conversationId, current.slice(-20));
}
