const KNOWN_KEYS = [
  "businessName",
  "businessPhone",
  "businessWebsite",
  "businessAddress",
  "services",
  "workingHours"
];

function cleanValue(value) {
  return String(value ?? "").trim();
}

function cleanText(value) {
  return String(value)
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeTemplateVariables(input = {}) {
  return Object.fromEntries(KNOWN_KEYS.map((key) => [key, cleanValue(input[key])]));
}

export function replaceTemplateVariables(value, variables = {}) {
  if (typeof value === "string") {
    return cleanText(value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => cleanValue(variables[key])));
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceTemplateVariables(item, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceTemplateVariables(item, variables)])
    );
  }

  return value;
}
