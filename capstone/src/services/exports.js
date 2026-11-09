import { apiClient, toQueryString } from "./apiClient";

// Each export downloads a file straight from the backend.
// params: { from, to, table_id, format: "csv" | "json" }
const download = (type, params) => apiClient.download(`/api/export/${type}${toQueryString(params)}`);

export const exportsApi = {
  readings: params => download("readings", params),
  incidents: params => download("incidents", params),
  violations: params => download("violations", params),
  tables: params => download("tables", params)
};
