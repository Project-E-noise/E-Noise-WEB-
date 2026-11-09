import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Topbar } from "./Topbar";
import { useAuth } from "../../context/AuthContext";

export default function ClientLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const page = {
    "/client/dashboard": ["Overview", "Your recent activity and account standing"],
    "/client/logs": ["My logs", "Table assignments and incidents linked to your account"],
    "/client/violations": ["My violations", "Confirmed violations connected to your account"],
    "/client/profile": ["My profile", "Manage your client account"]
  }[location.pathname] || ["Client portal", "Your study hub activity"];
  const signOut = async () => { await logout(); navigate("/client/login", { replace: true }); };
  return <div className="page active client-shell">
    <div className="client-container">
      <Topbar title={page[0]} subtitle={page[1]}>
        <button className="btn btn-danger" onClick={signOut}><i className="ti ti-logout" /> Sign out</button>
      </Topbar>
      <nav className="client-nav" aria-label="Client navigation">
        <NavLink to="/client/dashboard" className={({ isActive }) => `client-nav-link${isActive ? " active" : ""}`}>Overview</NavLink>
        <NavLink to="/client/logs" className={({ isActive }) => `client-nav-link${isActive ? " active" : ""}`}>Logs</NavLink>
        <NavLink to="/client/violations" className={({ isActive }) => `client-nav-link${isActive ? " active" : ""}`}>Violations</NavLink>
        <NavLink to="/client/profile" className={({ isActive }) => `client-nav-link${isActive ? " active" : ""}`}>Profile</NavLink>
      </nav>
      <main className="client-content"><Outlet /></main>
    </div>
  </div>;
}
