import { ApiError } from "../../../utils/apiError.js";

export async function searchLeads() {
  throw new ApiError(501, "Google Places provider is not configured yet. Use the mock provider or add provider integration.");
}
