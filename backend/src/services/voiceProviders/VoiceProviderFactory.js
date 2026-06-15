import { ApiError } from "../../utils/apiError.js";
import { CartesiaTTSProvider } from "./CartesiaTTSProvider.js";
import { CartesiaSTTProvider } from "./CartesiaSTTProvider.js";
import { ElevenLabsTTSProvider } from "./ElevenLabsTTSProvider.js";
import { DeepgramTTSProvider } from "./DeepgramTTSProvider.js";
import { DeepgramSTTProvider } from "./DeepgramSTTProvider.js";

const TTS = {
  cartesia: CartesiaTTSProvider,
  elevenlabs: ElevenLabsTTSProvider,
  deepgram: DeepgramTTSProvider
};

const STT = {
  cartesia: CartesiaSTTProvider,
  deepgram: DeepgramSTTProvider
};

export function getVoiceProvider(provider, type = "tts") {
  const cleanProvider = String(provider || "").toLowerCase();
  const adapter = type === "stt" ? STT[cleanProvider] : TTS[cleanProvider];
  if (!adapter) throw new ApiError(400, `${provider} is not supported for ${type.toUpperCase()}.`);
  return adapter;
}

export function getProviderCapabilities(provider) {
  const cleanProvider = String(provider || "").toLowerCase();
  return {
    provider: cleanProvider,
    tts: TTS[cleanProvider]?.capabilities || null,
    stt: STT[cleanProvider]?.capabilities || null
  };
}

export const SUPPORTED_VOICE_PROVIDERS = Object.freeze(Object.keys(TTS));
