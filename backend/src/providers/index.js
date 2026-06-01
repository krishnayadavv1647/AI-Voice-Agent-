import { CustomProvider } from "./custom.provider.js";
import { DograhProvider } from "./dograh.provider.js";
import { VapiProvider } from "./vapi.provider.js";

export function getProvider(providerName = "custom") {
  switch (providerName) {
    case "dograh":
      return DograhProvider;
    case "vapi":
      return VapiProvider;
    case "custom":
      return CustomProvider;
    default:
      throw new Error(`Invalid provider: ${providerName}`);
  }
}
