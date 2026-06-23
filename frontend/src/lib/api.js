export const API_URL = import.meta.env.VITE_API_URL || "/api";

export function assetUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return `${API_URL.replace(/\/api$/, "")}${value}`;
}

export function getToken() {
  return localStorage.getItem("ai_voice_agent_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("ai_voice_agent_token", token);
  else localStorage.removeItem("ai_voice_agent_token");
}

function isJsonBody(body) {
  return (
    body &&
    typeof body !== "string" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)
  );
}

function requestOptions(options = {}) {
  const headers = { ...(options.headers || {}) };
  const shouldStringify = isJsonBody(options.body);
  if (shouldStringify && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  return {
    ...options,
    headers,
    body: shouldStringify ? JSON.stringify(options.body) : options.body
  };
}

export async function api(path, options = {}) {
  const request = requestOptions(options);
  const token = getToken();
  if (token && options.auth !== false) request.headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, request);
  } catch (error) {
    throw new Error("Backend API is unreachable. Check VITE_API_URL and backend server.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    if (response.status === 401) setToken(null);
    const apiError = new Error(error.message || "Request failed");
    apiError.status = response.status;
    apiError.response = error;
    throw apiError;
  }

  if (response.headers.get("Content-Type")?.includes("text/csv")) return response.text();
  if (response.status === 204) return null;
  return response.json();
}

export async function apiBlob(path, options = {}) {
  const request = requestOptions(options);
  const token = getToken();
  if (token && options.auth !== false) request.headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, request);
  } catch {
    throw new Error("Backend API is unreachable. Check VITE_API_URL and backend server.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    const apiError = new Error(error.message || "Request failed");
    apiError.status = response.status;
    apiError.response = error;
    throw apiError;
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("Content-Type") || "audio/mpeg"
  };
}
