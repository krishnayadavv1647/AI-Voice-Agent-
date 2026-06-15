import { providerHttp, providerSafeError, ensurePreviewText } from "./providerUtils.js";
import { DEEPGRAM_AURA_VOICES } from "./deepgramAuraCatalog.js";

const BASE_URL = "https://api.deepgram.com";

function headers(apiKey) {
  return { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };
}

export const DeepgramTTSProvider = {
  provider: "deepgram",
  type: "tts",
  capabilities: {
    supportsVoiceListing: true,
    supportsStreaming: true,
    supportsSpeed: false,
    supportsStability: false,
    supportsSimilarityBoost: false,
    supportsVolume: false,
    supportsEmotion: false,
    previewOnlySettings: ["outputEncoding", "sampleRate"],
    supportedOutputFormats: ["mp3", "linear16", "mulaw", "alaw", "opus", "flac", "aac"],
    supportedSampleRates: [8000, 16000, 24000, 32000, 48000]
  },

  async validateCredentials(apiKey) {
    try {
      await providerHttp.get(`${BASE_URL}/v1/models`, { headers: headers(apiKey) });
      return true;
    } catch (error) {
      throw providerSafeError(error, "Deepgram");
    }
  },

  async listModels() {
    return [
      { id: "aura-2", name: "Aura 2", type: "tts", recommended: true }
    ];
  },

  async listVoices(_apiKey, query = {}) {
    const search = String(query.search || "").trim().toLowerCase();
    const language = String(query.language || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(query.limit) || 150, 1), 250);
    return DEEPGRAM_AURA_VOICES.filter((voice) => {
      const haystack = `${voice.id} ${voice.name} ${voice.language} ${voice.languageName}`.toLowerCase();
      return (!search || haystack.includes(search)) && (!language || voice.language === language);
    }).slice(0, limit);
  },

  async generatePreview(apiKey, options = {}) {
    try {
      const response = await providerHttp.post(
        `${BASE_URL}/v1/speak`,
        { text: ensurePreviewText(options.text) },
        {
          headers: headers(apiKey),
          params: {
            model: options.voiceId || "aura-2-thalia-en",
            encoding: options.outputFormat || "mp3",
            sample_rate: options.sampleRate || undefined
          },
          responseType: "arraybuffer"
        }
      );
      return { buffer: Buffer.from(response.data), contentType: response.headers["content-type"] || "audio/mpeg" };
    } catch (error) {
      throw providerSafeError(error, "Deepgram");
    }
  }
};
