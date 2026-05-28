const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export function getToken() {
  return localStorage.getItem("ai_voice_agent_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("ai_voice_agent_token", token);
  else localStorage.removeItem("ai_voice_agent_token");
}

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
    });
  } catch (error) {
    throw new Error("Cannot reach the backend API. Make sure the backend server is running on port 5000.");
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
