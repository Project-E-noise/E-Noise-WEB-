import { apiClient } from "./apiClient";

export const thresholdsApi = {
  list: () => apiClient.get("/api/thresholds"),
  update: (tableId, payload) => apiClient.put(`/api/thresholds/${tableId}`, payload)
};
