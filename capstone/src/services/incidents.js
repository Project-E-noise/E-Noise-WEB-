import { apiClient, toQueryString } from "./apiClient";

export const incidentsApi = {
  list: params => apiClient.get(`/api/incidents${toQueryString(params)}`),
  get: id => apiClient.get(`/api/incidents/${id}`),
  create: payload => apiClient.post("/api/incidents", payload),
  update: (id, payload) => apiClient.put(`/api/incidents/${id}`, payload),
  remove: id => apiClient.delete(`/api/incidents/${id}`)
};
