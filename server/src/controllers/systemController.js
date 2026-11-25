import { env } from "../config/env.js";
import { mlHealthState } from "../services/mlClient.js";
import { VIOLATION_CATEGORIES } from "../data/constants.js";

// Small status block for the dashboard: whether the ML service answers
// (the "ML service offline" badge), the offline window, and whether dB
// readings are calibrated (they are estimates until bench calibration;
// see docs/HARDWARE_GUIDE.md).
export function status(req, res) {
  res.json({
    ml_service: mlHealthState(),
    sensor_stale_seconds: env.sensorStaleSeconds,
    db_calibrated: false,
    min_confidence: env.minConfidence,
    violation_categories: VIOLATION_CATEGORIES
  });
}
