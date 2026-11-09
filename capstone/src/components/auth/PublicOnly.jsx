import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LoadingState } from "../common/UiStates";

export function PublicOnly({ children }) {
  const { status, role } = useAuth();
  if (status === "checking") return <div className="auth-shell"><LoadingState label="Checking your session…" /></div>;
  if (status === "authenticated") return <Navigate to={role === "client" ? "/client/dashboard" : "/overview"} replace />;
  return children;
}
