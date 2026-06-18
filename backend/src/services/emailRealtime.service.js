let ioInstance = null;

export function setEmailRealtimeServer(io) {
  ioInstance = io;
}

export function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}
