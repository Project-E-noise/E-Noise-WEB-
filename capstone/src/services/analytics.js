import { apiClient, toQueryString } from "./apiClient";

export const analyticsApi = {
  overview: params => apiClient.get(`/api/analytics/overview${toQueryString(params)}`),
  incidents: params => apiClient.get(`/api/analytics/incidents${toQueryString(params)}`),
  noiseTrends: params => apiClient.get(`/api/analytics/noise-trends${toQueryString(params)}`)
};
