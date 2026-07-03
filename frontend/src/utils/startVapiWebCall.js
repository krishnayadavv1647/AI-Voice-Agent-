import Vapi from "@vapi-ai/web";

// Starts a browser voice call against a Vapi assistant. Returns the live Vapi instance so the caller
// can wire event handlers and call `.stop()` to end the call. Only the PUBLIC key is used here.
export function startVapiWebCall({ publicKey, assistantId, metadata = {}, handlers = {} }) {
  if (!publicKey || !assistantId) throw new Error("Missing Vapi publicKey or assistantId.");
  const vapi = new Vapi(publicKey);

  if (handlers.onCallStart) vapi.on("call-start", handlers.onCallStart);
  if (handlers.onCallEnd) vapi.on("call-end", handlers.onCallEnd);
  if (handlers.onSpeechStart) vapi.on("speech-start", handlers.onSpeechStart);
  if (handlers.onSpeechEnd) vapi.on("speech-end", handlers.onSpeechEnd);
  if (handlers.onMessage) vapi.on("message", handlers.onMessage);
  if (handlers.onError) vapi.on("error", handlers.onError);

  vapi.start(assistantId, { metadata: { ...metadata, channel: "web" } });
  return vapi;
}
