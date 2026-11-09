import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../services/auth";
import { clientApi } from "../services/client";
import { ApiError, getToken, setToken, TOKEN_STORAGE_KEY } from "../services/apiClient";

const AuthContext = createContext(null);

// Reads the role ("admin" or "client") from the token. This is only used to
// pick the right API call; the server checks the token properly.
function tokenRole(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | authenticated | unauthenticated

  const signedOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setRole(null);
    setStatus("unauthenticated");
  }, []);

  const checkSession = useCallback(async () => {
    const token = getToken();
    const nextRole = token && tokenRole(token);
    if (!nextRole) return signedOut();
    setStatus("checking");
    try {
      const response = nextRole === "client" ? await clientApi.profile() : await authApi.me();
      if (getToken() !== token) return;
      setUser(response?.client ?? response?.admin ?? null);
      setRole(nextRole);
      setStatus("authenticated");
    } catch (error) {
      if (getToken() !== token) return;
      // Only sign out when the server says the session is bad, not when it's unreachable.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) signedOut();
      else {
        setUser(null);
        setRole(nextRole);
        setStatus("authenticated");
      }
    }
  }, [signedOut]);

  useEffect(() => {
    checkSession();
    // Signing in or out in another tab updates this tab too.
    const onStorage = event => { if (event.key === TOKEN_STORAGE_KEY) checkSession(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("enoise:auth-expired", signedOut);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("enoise:auth-expired", signedOut);
    };
  }, [checkSession, signedOut]);

  const login = useCallback(async (email, password) => {
    try {
      const data = await authApi.login(email, password);
      setToken(data.token);
      setUser(data.admin ?? null);
      setRole("admin");
      setStatus("authenticated");
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.status === 403 ? "unverified" : "error", message: error.message || "Login failed." };
    }
  }, []);

  const clientLogin = useCallback(async (email, password) => {
    try {
      const data = await clientApi.login(email, password);
      setToken(data.token);
      setUser(data.client);
      setRole("client");
      setStatus("authenticated");
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.status === 403 ? "unverified" : "error", message: error.message || "Login failed." };
    }
  }, []);

  const updateUser = useCallback(next => setUser(previous => ({ ...previous, ...next })), []);

  const logout = useCallback(async () => {
    try {
      if (role === "client") await clientApi.logout();
      else await authApi.logout();
    } catch {
      /* Logout is stateless; clearing the browser token is what matters. */
    }
    signedOut();
  }, [role, signedOut]);

  const value = useMemo(
    () => ({ user, admin: role === "admin" ? user : null, role, status, login, clientLogin, logout, updateUser }),
    [user, role, status, login, clientLogin, logout, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
