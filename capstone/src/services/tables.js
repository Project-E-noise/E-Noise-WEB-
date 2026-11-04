import { apiClient, toQueryString } from "./apiClient";

export const tablesApi = {
  list: () => apiClient.get("/api/tables"),
  get: id => apiClient.get(`/api/tables/${id}`),
  readings: (id, params) => apiClient.get(`/api/tables/${id}/readings${toQueryString(params)}`),
  incidents: id => apiClient.get(`/api/tables/${id}/incidents`),
  create: payload => apiClient.post("/api/tables", payload),
  update: (id, payload) => apiClient.put(`/api/tables/${id}`, payload),
  remove: id => apiClient.delete(`/api/tables/${id}`)
};
