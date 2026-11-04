import { apiClient, toQueryString } from "./apiClient";

export const occupantsApi = {
  list: params => apiClient.get(`/api/occupants${toQueryString(params)}`),
  get: id => apiClient.get(`/api/occupants/${id}`),
  create: payload => apiClient.post("/api/occupants", payload),
  update: (id, payload) => apiClient.put(`/api/occupants/${id}`, payload),
  remove: id => apiClient.delete(`/api/occupants/${id}`),
  assign: (id, tableId) => apiClient.post(`/api/occupants/${id}/assign`, { table_id: tableId }),
  release: id => apiClient.post(`/api/occupants/${id}/release`, {}),
  violations: id => apiClient.get(`/api/occupants/${id}/violations`)
};
