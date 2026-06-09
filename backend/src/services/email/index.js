import { ApiError } from "../../utils/apiError.js";
import * as brevoProvider from "./providers/brevoProvider.js";
import * as mockEmailProvider from "./providers/mockEmailProvider.js";

function providers() {
  return {
    mock: {
      key: "mock",
      label: "Mock Email Provider",
      configured: true,
      service: mockEmailProvider
    },
    brevo: {
      key: "brevo",
      label: "Brevo",
      configured: brevoProvider.isConfigured(),
      service: brevoProvider
    }
  };
}

export function listEmailProviders() {
  return Object.values(providers()).map(({ key, label, configured }) => ({ key, label, configured }));
}

export function getEmailProvider(providerKey) {
  const key = providerKey || process.env.EMAIL_PROVIDER || (brevoProvider.isConfigured() ? "brevo" : "mock");
  const provider = providers()[key];

  if (!provider) throw new ApiError(400, "Email provider is not supported.");
  if (!provider.configured) throw new ApiError(400, "Email provider is not configured.");
  if (!provider.service?.sendEmail) throw new ApiError(501, "Email provider integration is not implemented.");

  return provider;
}
