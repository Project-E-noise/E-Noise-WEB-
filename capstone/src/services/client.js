import { apiClient, toQueryString } from "./apiClient";

export const clientApi = {
  register: payload => apiClient.post("/api/client/register", payload, { auth: false }),
  resendVerification: email => apiClient.post("/api/client/resend-verification", { email }, { auth: false }),
  login: (email, password) => apiClient.post("/api/client/login", { email, password }, { auth: false }),
  checkVerification: token => apiClient.get(`/api/client/verify-email${toQueryString({ token })}`, { auth: false }),
  setPassword: (token, password) => apiClient.post("/api/client/set-password", { token, password }, { auth: false }),
  logout: () => apiClient.post("/api/client/logout", {}),
  profile: () => apiClient.get("/api/client/profile"),
  updateProfile: payload => apiClient.patch("/api/client/profile", payload),
  changePassword: payload => apiClient.post("/api/client/change-password", payload),
  logs: params => apiClient.get(`/api/client/logs${toQueryString(params)}`),
  violations: params => apiClient.get(`/api/client/violations${toQueryString(params)}`)
};
