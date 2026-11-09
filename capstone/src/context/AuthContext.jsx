import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../services/auth";
import { clientApi } from "../services/client";
import { ApiError, getToken, setToken } from "../services/apiClient";

const AuthContext = createContext(null);

function tokenRole(token) {
  try { return JSON.parse(atob(token.split(".")[1])).role || "admin"; }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [status, setStatus] = useState("checking");

  const checkSession = useCallback(async () => {
    const token = getToken();
    if (!token) { setUser(null); setRole(null); setStatus("unauthenticated"); return; }
    const nextRole = tokenRole(token);
    if (!nextRole) { setToken(null); setUser(null); setRole(null); setStatus("unauthenticated"); return; }
    setStatus("checking");
    try {
      const response = nextRole === "client" ? await clientApi.profile() : await authApi.me();
      if (getToken() !== token) return;
      setUser(response?.client ?? response?.admin ?? response ?? null);
      setRole(nextRole);
      setStatus("authenticated");
    } catch {
      if (getToken() !== token) return;
      setToken(null); setUser(null); setRole(null); setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    checkSession();
    const onStorage = event => { if (event.key === "enoise_admin_token") checkSession(); };
    const onAuthExpired = () => {
      setToken(null);
      setUser(null);
      setRole(null);
      setStatus("unauthenticated");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("enoise:auth-expired", onAuthExpired);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("enoise:auth-expired", onAuthExpired);
    };
  }, [checkSession]);

  const login = useCallback(async (email, password) => {
    try {
      const data = await authApi.login(email, password);
      setToken(data.token); setUser(data.admin ?? null); setRole("admin"); setStatus("authenticated");
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof ApiError && error.status === 403 ? "unverified" : "error", message: error.message || "Login failed." };
    }
  }, []);

  const clientLogin = useCallback(async (email, password) => {
    try {
      const data = await clientApi.login(email, password);
      setToken(data.token); setUser(data.client); setRole("client"); setStatus("authenticated");
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.status === 403 ? "unverified" : "error", message: error.message };
    }
  }, []);

  const register = useCallback(async payload => {
    try { await authApi.register(payload); return { ok: true }; }
    catch (error) { return { ok: false, message: error.message || "Registration failed." }; }
  }, []);
  const clientRegister = useCallback(async payload => {
    try { return { ok: true, ...(await clientApi.register(payload)) }; }
    catch (error) { return { ok: false, message: error.message || "Registration failed." }; }
  }, []);

  const updateUser = useCallback(next => setUser(previous => ({ ...previous, ...next })), []);
  const logout = useCallback(async () => {
    try { if (role === "client") await clientApi.logout(); else await authApi.logout(); }
    catch { /* Stateless logout still clears this browser session. */ }
    setToken(null); setUser(null); setRole(null); setStatus("unauthenticated");
  }, [role]);

  const value = useMemo(() => ({ user, admin: role === "admin" ? user : null, role, status, login, clientLogin, register, clientRegister, logout, updateUser }),
    [user, role, status, login, clientLogin, register, clientRegister, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
