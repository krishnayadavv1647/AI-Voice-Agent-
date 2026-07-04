import { CustomProvider } from "./custom.provider.js";
import { VapiProvider } from "./vapi.provider.js";
import { ApiError } from "../utils/apiError.js";

export function getProvider(providerName = "custom") {
  switch (providerName) {
    case "vapi":
      return VapiProvider;
    case "custom":
      return CustomProvider;
    default:
      // Legacy providers (e.g. removed integrations) must be re-synced to a supported provider.
      throw new ApiError(400, `Unsupported provider "${providerName}". Re-sync this agent to Vapi.`);
  }
}
