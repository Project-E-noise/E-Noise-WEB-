import { apiClient, toQueryString } from "./apiClient";

export const authApi = {
  login: (email, password) => apiClient.post("/api/auth/login", { email, password }, { auth: false }),
  register: payload => apiClient.post("/api/auth/register", payload, { auth: false }),
  me: () => apiClient.get("/api/auth/me"),
  logout: () => apiClient.post("/api/auth/logout", {}),
  verifyEmail: token => apiClient.get(`/api/auth/verify-email${toQueryString({ token })}`, { auth: false }),
  resendVerification: email => apiClient.post("/api/auth/resend-verification", { email }, { auth: false })
};
