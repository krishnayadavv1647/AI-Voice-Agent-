import { providerHttp, providerSafeError, listFromPayload, ensurePreviewText, normalizeLabels } from "./providerUtils.js";

const BASE_URL = "https://api.cartesia.ai";
const VERSION = process.env.CARTESIA_API_VERSION || "2026-03-01";

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
    "Cartesia-Version": VERSION,
    "Content-Type": "application/json"
  };
}

function normalizeVoice(voice = {}) {
  const language = voice.language || voice.language_code || voice.labels?.language || voice.labels?.locale || "";
  const gender = voice.gender || voice.labels?.gender || "";
  return {
    id: voice.id || voice.voice_id || "",
    name: voice.name || voice.display_name || "Unnamed Cartesia voice",
    provider: "cartesia",
    language,
    gender,
    style: voice.description || voice.labels?.style || voice.labels?.accent || "",
    previewUrl: voice.preview_file_url || voice.preview_url || voice.previewUrl || voice.preview?.url || "",
    labels: normalizeLabels(voice.labels),
    raw: { isPublic: voice.is_public, createdAt: voice.created_at }
  };
}

export const CartesiaTTSProvider = {
  provider: "cartesia",
  type: "tts",
  capabilities: {
    supportsVoiceListing: true,
    supportsStreaming: true,
    supportsSpeed: true,
    supportsStability: false,
    supportsSimilarityBoost: false,
    supportsVolume: true,
    supportsEmotion: false,
    previewOnlySettings: ["outputEncoding", "sampleRate"],
    supportedOutputFormats: ["wav", "raw"],
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100]
  },

  async validateCredentials(apiKey) {
    try {
      await providerHttp.get(`${BASE_URL}/voices`, { headers: headers(apiKey), params: { limit: 1 } });
      return true;
    } catch (error) {
      throw providerSafeError(error, "Cartesia");
    }
  },

  async listVoices(apiKey, query = {}) {
    try {
      const requestedLimit = Math.min(Math.max(Number(query.limit) || 300, 1), 500);
      const voices = [];
      let startingAfter = null;

      do {
        const response = await providerHttp.get(`${BASE_URL}/voices`, {
          headers: headers(apiKey),
          params: {
            limit: Math.min(100, requestedLimit - voices.length),
            q: query.search || undefined,
            language: query.language || undefined,
            gender: query.gender || undefined,
            starting_after: startingAfter || undefined,
            expand: ["preview_file_url"]
          }
        });
        voices.push(...listFromPayload(response.data, ["voices"]));
        startingAfter = response.data?.has_more ? response.data?.next_page : null;
      } while (startingAfter && voices.length < requestedLimit);

      return voices.slice(0, requestedLimit).map(normalizeVoice).filter((voice) => voice.id);
    } catch (error) {
      throw providerSafeError(error, "Cartesia");
    }
  },

  async listModels() {
    return [
      { id: "sonic-3.5", name: "Sonic 3.5", type: "tts", recommended: true },
      { id: "sonic-3", name: "Sonic 3", type: "tts" }
    ];
  },

  async generatePreview(apiKey, options = {}) {
    try {
      const response = await providerHttp.post(
        `${BASE_URL}/tts/bytes`,
        {
          model_id: options.model || "sonic-3.5",
          transcript: ensurePreviewText(options.text),
          voice: { mode: "id", id: options.voiceId },
          language: options.language || undefined,
          output_format: options.outputFormat === "raw"
            ? {
                container: "raw",
                encoding: "pcm_f32le",
                sample_rate: Number(options.sampleRate) || 44100
              }
            : {
                container: "wav",
                encoding: "pcm_f32le",
                sample_rate: Number(options.sampleRate) || 44100
              },
          generation_config: {
            speed: Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1,
            volume: Number.isFinite(Number(options.volume)) ? Number(options.volume) : 1
          }
        },
        { headers: headers(apiKey), responseType: "arraybuffer" }
      );
      return { buffer: Buffer.from(response.data), contentType: response.headers["content-type"] || (options.outputFormat === "raw" ? "application/octet-stream" : "audio/wav") };
    } catch (error) {
      throw providerSafeError(error, "Cartesia");
    }
  }
};
