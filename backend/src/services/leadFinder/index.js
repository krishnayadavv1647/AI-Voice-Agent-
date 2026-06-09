import { ApiError } from "../../utils/apiError.js";
import * as googlePlacesProvider from "./providers/googlePlacesProvider.js";
import * as mockProvider from "./providers/mockProvider.js";
import * as serpapiProvider from "./providers/serpapiProvider.js";

function envValue(...names) {
  return names.some((name) => Boolean(String(process.env[name] || "").trim()));
}

function providers() {
  return {
    mock: {
      key: "mock",
      label: "Mock Provider",
      configured: true,
      service: mockProvider
    },
    google_places: {
      key: "google_places",
      label: "Google Places API",
      configured: envValue("GOOGLE_PLACES_API_KEY"),
      service: googlePlacesProvider
    },
    serpapi: {
      key: "serpapi",
      label: "SerpAPI",
      configured: serpapiProvider.isConfigured(),
      service: serpapiProvider
    },
    outscraper: {
      key: "outscraper",
      label: "Outscraper",
      configured: envValue("OUTSCRAPER_API_KEY"),
      service: null
    },
    apollo: {
      key: "apollo",
      label: "Apollo",
      configured: envValue("APOLLO_API_KEY"),
      service: null
    },
    hunter: {
      key: "hunter",
      label: "Hunter",
      configured: envValue("HUNTER_API_KEY"),
      service: null
    }
  };
}

export function listLeadFinderProviders() {
  return Object.values(providers()).map(({ key, label, configured }) => ({ key, label, configured }));
}

export function getLeadFinderProvider(providerKey) {
  const key = providerKey || process.env.LEAD_FINDER_PROVIDER || "mock";
  const provider = providers()[key];

  if (!provider) throw new ApiError(400, "Lead finder provider is not supported.");
  if (!provider.configured) throw new ApiError(400, "Provider not configured.");
  if (!provider.service?.searchLeads) throw new ApiError(501, "Lead finder provider integration is not implemented yet.");

  return provider;
}
