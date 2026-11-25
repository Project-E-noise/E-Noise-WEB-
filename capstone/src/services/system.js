import { apiClient } from "./apiClient";

export const systemApi = {
  // { ml_service: "online" | "offline" | "unknown" | "not_configured",
  //   sensor_stale_seconds, db_calibrated, min_confidence, violation_categories }
  status: () => apiClient.get("/api/system/status")
};
