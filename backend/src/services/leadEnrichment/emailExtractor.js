import axios from "axios";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const BAD_EMAIL_PARTS = [
  "example.com",
  "domain.com",
  "test.com",
  "yourname",
  "youremail",
  "noreply",
  "no-reply",
  "privacy",
  "abuse",
  "sentry",
  "wordpress",
  "cloudflare"
];
const DEFAULT_PRIORITY = ["admissions@", "info@", "contact@", "hello@", "support@", "admin@", "sales@", "office@"];
const EDUCATION_PRIORITY = ["admissions@", "enquiry@", "info@", "contact@"];
const COMMON_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/support"];
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 8000;

function normalizeWebsite(website) {
  const value = String(website || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function pageUrls(website) {
  try {
    const base = new URL(normalizeWebsite(website));
    return COMMON_PATHS.slice(0, MAX_PAGES).map((path) => new URL(path, base.origin).toString());
  } catch {
    return [];
  }
}

function cleanEmail(email) {
  return String(email || "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[).,;:'"<\]]+$/g, "")
    .toLowerCase();
}

function isGoodEmail(email) {
  const value = cleanEmail(email);
  if (!value || BAD_EMAIL_PARTS.some((part) => value.includes(part))) return false;
  return EMAIL_VALIDATION_REGEX.test(value);
}

function priorityList(category = "") {
  const text = String(category || "").toLowerCase();
  if (/coaching|education|school|college|institute|academy|neet|jee/.test(text)) {
    return EDUCATION_PRIORITY;
  }
  return DEFAULT_PRIORITY;
}

function bestEmail(emails, category) {
  const priority = priorityList(category);
  return [...emails].sort((a, b) => {
    const aRank = priority.findIndex((prefix) => a.startsWith(prefix));
    const bRank = priority.findIndex((prefix) => b.startsWith(prefix));
    const normalizedARank = aRank === -1 ? priority.length : aRank;
    const normalizedBRank = bRank === -1 ? priority.length : bRank;
    return normalizedARank - normalizedBRank || a.length - b.length;
  })[0] || "";
}

function extractEmails(html) {
  const matches = String(html || "").match(EMAIL_REGEX) || [];
  return matches.map(cleanEmail).filter(isGoodEmail);
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT_MS,
    responseType: "text",
    maxRedirects: 3,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AI Voice Agent Lead Enrichment)"
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}

export async function extractEmailsFromWebsite({ website, category = "" }) {
  const urls = pageUrls(website);
  if (!urls.length) {
    return { emails: [], bestEmail: "", sourceUrl: "", status: "failed", error: "Website URL is not valid." };
  }

  const allEmails = new Set();
  let sourceUrl = "";
  let lastError = "";

  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      const emails = extractEmails(html);
      emails.forEach((email) => allEmails.add(email));
      if (emails.length && !sourceUrl) sourceUrl = url;
    } catch (error) {
      lastError = error.message || "Website request failed.";
    }
  }

  const emails = Array.from(allEmails);
  if (!emails.length) {
    return { emails: [], bestEmail: "", sourceUrl: "", status: "not_found", error: lastError };
  }

  return {
    emails,
    bestEmail: bestEmail(emails, category),
    sourceUrl,
    status: "found",
    error: ""
  };
}

export async function enrichLeadsWithEmails(leads = [], { concurrency = 3 } = {}) {
  const results = [...leads];
  let index = 0;

  async function worker() {
    while (index < results.length) {
      const currentIndex = index;
      index += 1;
      const lead = results[currentIndex];

      if (!lead?.website) {
        results[currentIndex] = {
          ...lead,
          emails: lead.emails || [],
          emailEnrichmentStatus: "not_found",
          emailEnrichmentError: "Website is missing."
        };
        continue;
      }

      try {
        const enrichment = await extractEmailsFromWebsite({ website: lead.website, category: lead.category || lead.industry });
        results[currentIndex] = {
          ...lead,
          email: lead.email || enrichment.bestEmail,
          emails: enrichment.emails,
          emailSourceUrl: enrichment.sourceUrl,
          emailEnrichmentStatus: enrichment.status,
          emailEnrichmentError: enrichment.error,
          emailEnrichedAt: new Date()
        };
      } catch (error) {
        results[currentIndex] = {
          ...lead,
          emails: lead.emails || [],
          emailEnrichmentStatus: "failed",
          emailEnrichmentError: error.message || "Email enrichment failed.",
          emailEnrichedAt: new Date()
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, () => worker()));
  return results;
}
