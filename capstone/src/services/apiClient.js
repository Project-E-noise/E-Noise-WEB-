// Centralized API client. This is the ONLY place that should call fetch()
// for backend requests — pages/hooks must go through services/*.js instead
// of calling fetch() directly (see spec section 34).
//
// The API base URL is public frontend configuration only. It must never
// carry credentials for PostgreSQL, HiveMQ/MQTT, JWT signing, or SMTP —
// those stay on the backend, referenced only via server-side env vars.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const DEFAULT_TIMEOUT_MS = 12000;
const TOKEN_KEY = "enoise_admin_token";

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session simply won't persist across reloads */
  }
}

export function toQueryString(params) {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

async function request(path, { method = "GET", body, headers = {}, timeout = DEFAULT_TIMEOUT_MS, auth = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const token = auth ? getToken() : null;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new ApiError("Request timed out. Check your connection and try again.", 0, null);
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, null);
  }
  clearTimeout(timer);

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      // Let AuthContext leave protected screens when an API response invalidates this browser session.
      if (typeof window !== "undefined") window.dispatchEvent(new Event("enoise:auth-expired"));
    }
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const apiClient = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" })
};

export const API_BASE_URL = BASE_URL;

// Derives the WebSocket URL from the same VITE_API_BASE_URL used for REST
// calls (http -> ws, https -> wss), so there's only ever one base-URL env
// var to configure for the frontend (spec section 4/11 — no extra
// credentials or URLs belong in frontend config beyond this one).
export function getWsUrl(path = "/ws") {
  const wsBase = BASE_URL.replace(/^http/i, "ws");
  const token = getToken();
  return `${wsBase}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
