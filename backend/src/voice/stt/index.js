import { ApiError } from "../../utils/apiError.js";

export async function transcribeAudio({ provider = "openai_whisper" }) {
  throw new ApiError(501, `STT provider ${provider} is not implemented yet.`);
}
