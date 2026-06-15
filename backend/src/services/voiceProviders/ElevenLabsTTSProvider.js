import { providerHttp, providerSafeError, listFromPayload, ensurePreviewText, normalizeLabels } from "./providerUtils.js";

const BASE_URL = "https://api.elevenlabs.io";

function headers(apiKey) {
  return { "xi-api-key": apiKey, "Content-Type": "application/json" };
}

function normalizeVoice(voice = {}) {
  const labels = normalizeLabels(voice.labels);
  const verifiedLanguage = Array.isArray(voice.verified_languages) ? voice.verified_languages[0] : null;
  return {
    id: voice.voice_id || voice.id || "",
    name: voice.name || "Unnamed ElevenLabs voice",
    provider: "elevenlabs",
    language: verifiedLanguage?.language || labels.language || labels.locale || "",
    gender: labels.gender || "",
    style: labels.use_case || labels.description || voice.description || voice.category || "",
    previewUrl: voice.preview_url || "",
    labels,
    raw: { category: voice.category, collectionIds: voice.collection_ids || [] }
  };
}

export const ElevenLabsTTSProvider = {
  provider: "elevenlabs",
  type: "tts",
  capabilities: {
    supportsVoiceListing: true,
    supportsStreaming: true,
    supportsSpeed: true,
    supportsStability: true,
    supportsSimilarityBoost: true,
    supportsVolume: false,
    supportsEmotion: false,
    previewOnlySettings: ["stability", "similarityBoost", "outputEncoding", "sampleRate"],
    supportedOutputFormats: ["mp3_44100_128", "pcm_16000", "ulaw_8000"],
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100]
  },

  async validateCredentials(apiKey) {
    try {
      await providerHttp.get(`${BASE_URL}/v1/user`, { headers: headers(apiKey) });
      return true;
    } catch (error) {
      throw providerSafeError(error, "ElevenLabs");
    }
  },

  async listVoices(apiKey, query = {}) {
    try {
      const requestedLimit = Math.min(Math.max(Number(query.limit) || 300, 1), 500);
      const voices = [];
      let nextPageToken = null;

      do {
        const response = await providerHttp.get(`${BASE_URL}/v2/voices`, {
          headers: headers(apiKey),
          params: {
            page_size: Math.min(100, requestedLimit - voices.length),
            search: query.search || undefined,
            next_page_token: nextPageToken || undefined,
            include_total_count: false
          }
        });
        voices.push(...listFromPayload(response.data, ["voices"]));
        nextPageToken = response.data?.has_more ? response.data?.next_page_token : null;
      } while (nextPageToken && voices.length < requestedLimit);

      return voices.slice(0, requestedLimit).map(normalizeVoice).filter((voice) => voice.id);
    } catch (error) {
      throw providerSafeError(error, "ElevenLabs");
    }
  },

  async listModels(apiKey) {
    try {
      const response = await providerHttp.get(`${BASE_URL}/v1/models`, { headers: headers(apiKey) });
      return listFromPayload(response.data, ["models"])
        .filter((model) => model.can_do_text_to_speech !== false)
        .map((model) => ({
          id: model.model_id || model.id,
          name: model.name || model.model_id || model.id,
          type: "tts",
          description: model.description || "",
          supportsStyle: Boolean(model.can_use_style),
          supportsSpeakerBoost: Boolean(model.can_use_speaker_boost)
        }))
        .filter((model) => model.id);
    } catch (error) {
      throw providerSafeError(error, "ElevenLabs");
    }
  },

  async generatePreview(apiKey, options = {}) {
    try {
      const response = await providerHttp.post(
        `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(options.voiceId)}`,
        {
          text: ensurePreviewText(options.text),
          model_id: options.model || "eleven_flash_v2_5",
          voice_settings: {
            stability: Number.isFinite(Number(options.stability)) ? Number(options.stability) : 0.5,
            similarity_boost: Number.isFinite(Number(options.similarityBoost)) ? Number(options.similarityBoost) : 0.75,
            speed: Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1
          }
        },
        {
          headers: headers(apiKey),
          params: { output_format: options.outputFormat || "mp3_44100_128" },
          responseType: "arraybuffer"
        }
      );
      return { buffer: Buffer.from(response.data), contentType: response.headers["content-type"] || "audio/mpeg" };
    } catch (error) {
      throw providerSafeError(error, "ElevenLabs");
    }
  }
};
