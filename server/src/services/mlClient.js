import { env } from "../config/env.js";
import { ML_CATEGORIES } from "../data/constants.js";

// Thin HTTP client for the Python ML service (ml-service/, YAMNet). The
// Node backend never runs inference itself: it forwards a raw WAV clip and
// gets back { category, confidence, top_class }.
//
// It also remembers whether the service answered recently, so the
// confirmation engine doesn't wait for a label that can't arrive, and the
// dashboard can show an "ML service offline" badge.

// "unknown" until the first contact, then "online" / "offline".
let health = "unknown";

export function resetMlHealth() {
  health = "unknown";
}

/** "not_configured" | "unknown" | "online" | "offline" */
export function mlHealthState() {
  if (!env.mlServiceUrl) return "not_configured";
  return health;
}

export function isMlServiceUp() {
  return mlHealthState() === "online";
}

function headers(extra = {}) {
  // The hosted ML service is public, so it checks this shared secret.
  return env.mlApiKey ? { ...extra, "X-API-Key": env.mlApiKey } : extra;
}

/** Pings GET /health. Returns true when the service answers 200. */
export async function checkMlHealth() {
  if (!env.mlServiceUrl) return false;
  try {
    const res = await fetch(`${env.mlServiceUrl}/health`, { headers: headers(), signal: AbortSignal.timeout(5000) });
    health = res.ok ? "online" : "offline";
  } catch {
    health = "offline";
  }
  return health === "online";
}

/**
 * Sends a WAV clip to the ML service and returns
 * { category, confidence, top_class }, or null if the service is
 * unreachable, errored, or answered something unexpected. Classification
 * never takes down telemetry ingestion.
 */
export async function classifyAudioClip(wavBuffer) {
  if (!env.mlServiceUrl) return null;
  try {
    const res = await fetch(`${env.mlServiceUrl}/classify`, {
      method: "POST",
      headers: headers({ "Content-Type": "audio/wav" }),
      body: wavBuffer,
      // A sleeping host can take a while to wake up; don't hang forever.
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      // 4xx means the service is up but refused this clip (bad key, bad
      // audio); 5xx means it is not able to classify right now.
      health = res.status >= 500 ? "offline" : "online";
      console.warn(`[ml-client] ${env.mlServiceUrl}/classify responded ${res.status}`);
      return null;
    }

    health = "online";
    const data = await res.json();
    if (!ML_CATEGORIES.includes(data.category) || typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
      console.warn("[ml-client] Unexpected response shape from ML service:", data);
      return null;
    }
    const topClass = typeof data.top_class === "string" && data.top_class ? data.top_class.slice(0, 100) : null;
    return { category: data.category, confidence: data.confidence, top_class: topClass };
  } catch (err) {
    // Most commonly: the ML service is not running.
    health = "offline";
    console.warn("[ml-client] Could not reach ML service:", err.message);
    return null;
  }
}
