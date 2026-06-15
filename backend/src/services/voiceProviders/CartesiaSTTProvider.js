import { CartesiaTTSProvider } from "./CartesiaTTSProvider.js";

export const CartesiaSTTProvider = {
  provider: "cartesia",
  type: "stt",
  capabilities: {
    supportsStreaming: true,
    supportsInterimResults: true,
    supportsSmartFormatting: true,
    supportsPunctuation: true,
    // Current Dograh supports Cartesia STT. Set the flag to false only for an older/custom deployment.
    dograhRuntimeSupport: process.env.DOGRAH_CARTESIA_STT_SUPPORTED !== "false"
  },
  validateCredentials: CartesiaTTSProvider.validateCredentials,
  async listModels() {
    return [
      { id: "ink-whisper", name: "Ink Whisper", type: "stt", recommended: true }
    ];
  }
};
