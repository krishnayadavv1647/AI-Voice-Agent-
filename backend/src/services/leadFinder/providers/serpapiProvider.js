import axios from "axios";
import { ApiError } from "../../../utils/apiError.js";

function getApiKey() {
  return (
    process.env.SERPAPI_API_KEY ||
    process.env.SERP_API_KEY ||
    process.env.SERPAPI_KEY ||
    ""
  ).trim();
}

function clean(value) {
  return value ? String(value).trim() : "";
}

function mapsUrl(lead) {
  const query = [lead.businessName, lead.address, lead.city, lead.country].filter(Boolean).join(" ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function normalizeResult(result = {}, fallback = {}) {
  const businessName = clean(result.title || result.name);
  const address = clean(result.address);
  const city = clean(fallback.city);
  const country = clean(fallback.country);

  return {
    businessName,
    contactName: "",
    phone: clean(result.phone),
    email: "",
    website: clean(result.website || result.links?.website),
    city,
    address,
    country,
    category: clean(fallback.category || result.type),
    industry: clean(result.type || fallback.category),
    googleMapsUrl: clean(result.place_id ? `https://www.google.com/maps/place/?q=place_id:${result.place_id}` : "") || mapsUrl({ businessName, address, city, country }),
    instagramUrl: "",
    facebookUrl: "",
    linkedinUrl: "",
    source: "serpapi"
  };
}

export async function searchLeads({ category, keyword, city, country, totalRequested }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiError(400, "Provider not configured.");

  const total = Math.max(1, Math.min(Number(totalRequested) || 25, 100));
  const q = [keyword, category].map(clean).filter(Boolean).join(" ") || "business";
  const location = [city, country].map(clean).filter(Boolean).join(", ");
  const leads = [];
  let start = 0;

  while (leads.length < total && start < total) {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_local",
        q,
        location,
        api_key: apiKey,
        start
      },
      timeout: 20000
    });

    if (response.data?.error) {
      throw new ApiError(502, response.data.error);
    }

    const results = Array.isArray(response.data?.local_results) ? response.data.local_results : [];
    if (!results.length) break;

    for (const result of results) {
      leads.push(normalizeResult(result, { category, city, country }));
      if (leads.length >= total) break;
    }

    start += results.length;
    if (!response.data?.serpapi_pagination?.next) break;
  }

  return leads;
}

export function isConfigured() {
  return Boolean(getApiKey());
}
