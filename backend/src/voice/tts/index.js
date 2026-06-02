import { ApiError } from "../../utils/apiError.js";

export async function synthesizeSpeech({ provider = "openai_tts" }) {
  throw new ApiError(501, `TTS provider ${provider} is not implemented yet.`);
}
