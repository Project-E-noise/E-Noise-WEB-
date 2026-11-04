import { env } from "../config/env.js";

// Thin HTTP client for the Phase 7 Python ML microservice (ml-service/,
// YAMNet loaded via TensorFlow Hub). The Node backend never runs inference
// itself — it just forwards a raw WAV clip and gets back a label.
//
// Requires Node 18+ for global fetch (see server/package.json "engines").

/**
 * Sends a WAV clip to the ML service and returns { category, confidence },
 * or null if the service is unreachable/errored — classification is a
 * best-effort enhancement, never something that should take down telemetry
 * ingestion if the Python service is down or still starting up.
 */
export async function classifyAudioClip(wavBuffer) {
  try {
    const res = await fetch(`${env.mlServiceUrl}/classify`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wavBuffer
    });

    if (!res.ok) {
      console.warn(`[ml-client] ${env.mlServiceUrl}/classify responded ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (typeof data.category !== "string" || typeof data.confidence !== "number") {
      console.warn("[ml-client] Unexpected response shape from ML service:", data);
      return null;
    }
    return { category: data.category, confidence: data.confidence };
  } catch (err) {
    // Most commonly: ML service not running. Telemetry/LED/incident logic
    // must keep working without it — classification just stays whatever
    // it last was (or null).
    console.warn("[ml-client] Could not reach ML service:", err.message);
    return null;
  }
}
