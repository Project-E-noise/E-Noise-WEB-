// The only place that calls fetch() for the backend. Pages and hooks use
// the small wrappers in services/*.js instead.
//
// VITE_API_BASE_URL is public frontend config. Never put database, MQTT,
// JWT or email secrets in the frontend.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_MS = 20000; // Render free can take ~1 minute to wake up; the UI shows a retry button.
const TOKEN_KEY = "enoise_admin_token"; // holds the admin or client session token

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
    /* storage unavailable: the session just won't survive a reload */
  }
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

export function toQueryString(params) {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

const FRIENDLY_STATUS = {
  429: "Too many attempts. Please wait a little and try again.",
  500: "Something went wrong on the server. Please try again.",
  502: "The server is starting up. Please try again in a minute.",
  503: "The server is starting up. Please try again in a minute."
};

async function send(path, { method = "GET", body, timeout = DEFAULT_TIMEOUT_MS, auth = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const token = auth ? getToken() : null;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") throw new ApiError("The server took too long to answer. It may be waking up - please try again.", 0, null);
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, null);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const data = (res.headers.get("content-type") || "").includes("application/json") ? await res.json().catch(() => null) : null;
    if (res.status === 401 && token) {
      // The session is no longer valid: sign out everywhere in this browser.
      setToken(null);
      window.dispatchEvent(new Event("enoise:auth-expired"));
    }
    throw new ApiError(data?.error || FRIENDLY_STATUS[res.status] || `Request failed (${res.status}).`, res.status, data);
  }
  return res;
}

async function request(path, options) {
  const res = await send(path, options);
  if (res.status === 204) return null;
  return (res.headers.get("content-type") || "").includes("application/json") ? res.json() : null;
}

export const apiClient = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),

  /** Downloads a file from the API and saves it in the browser. */
  async download(path) {
    const res = await send(path, { timeout: 60000 });
    const blob = await res.blob();
    const match = (res.headers.get("content-disposition") || "").match(/filename="?([^"]+)"?/);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = match ? match[1] : "export.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
};

// WebSocket URL from the same base URL (http -> ws, https -> wss).
// Browsers can't add headers to a WebSocket, so the token goes in the query
// string. The server never logs it.
export function getWsUrl(path = "/ws") {
  const wsBase = BASE_URL.replace(/^http/i, "ws");
  const token = getToken();
  return `${wsBase}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
