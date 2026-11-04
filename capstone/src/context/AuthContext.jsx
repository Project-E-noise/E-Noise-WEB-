import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../services/auth";
import { ApiError, getToken, setToken } from "../services/apiClient";

const AuthContext = createContext(null);

// status: "checking" | "authenticated" | "unauthenticated"
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setStatus("unauthenticated");
      return;
    }
    authApi
      .me()
      .then(data => {
        if (cancelled) return;
        setAdmin(data?.admin ?? data ?? null);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setAdmin(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const data = await authApi.login(email, password);
      setToken(data.token);
      setAdmin(data.admin ?? null);
      setStatus("authenticated");
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        return { ok: false, reason: "unverified", message: "Email verification required. Please verify your email before logging in." };
      }
      return { ok: false, reason: "error", message: err.message || "Login failed." };
    }
  }, []);

  const register = useCallback(async payload => {
    try {
      await authApi.register(payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message || "Registration failed." };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort — clear the local session regardless */
    }
    setToken(null);
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(() => ({ admin, status, login, register, logout }), [admin, status, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
