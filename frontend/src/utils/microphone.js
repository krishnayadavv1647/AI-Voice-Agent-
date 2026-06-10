const BLOCKED_MIC_MESSAGE = "Microphone access is blocked. Please allow microphone permission from browser site settings and reload.";

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function readMicrophoneError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return BLOCKED_MIC_MESSAGE;
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No microphone was found. Connect or enable a microphone, then try again.";
  }

  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "The microphone is busy in another app. Close other calls or recordings, then try again.";
  }

  return error?.message || "Microphone permission failed.";
}

export async function requestMicrophoneAccess() {
  if (!window.isSecureContext && !isLocalHost(window.location.hostname)) {
    throw new Error("Microphone access requires HTTPS or localhost. Open this page with HTTPS.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this browser.");
  }

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    throw new Error(readMicrophoneError(error));
  }
}
