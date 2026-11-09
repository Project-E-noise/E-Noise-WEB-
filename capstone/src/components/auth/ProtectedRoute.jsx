import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LoadingState } from "../common/UiStates";

export function ProtectedRoute({ children, role = "admin" }) {
  const { status, role: currentRole } = useAuth();
  const location = useLocation();

  if (status === "checking") {
    return (
      <div className="auth-shell">
        <LoadingState label="Checking your session..." />
      </div>
    );
  }
  if (status !== "authenticated") {
    return <Navigate to={role === "client" ? "/client/login" : "/login"} replace state={{ from: location }} />;
  }
  if (currentRole && currentRole !== role) return <Navigate to={currentRole === "client" ? "/client/dashboard" : "/overview"} replace />;
  return children;
}
