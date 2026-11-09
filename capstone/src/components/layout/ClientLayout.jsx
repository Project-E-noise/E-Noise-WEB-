import { Suspense } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Topbar } from "./Topbar";
import { LoadingState } from "../common/UiStates";
import { useAuth } from "../../context/AuthContext";

const PAGES = {
  "/client/dashboard": ["Overview", "Your recent activity and account standing"],
  "/client/logs": ["My logs", "Table assignments and incidents linked to your account"],
  "/client/violations": ["My violations", "Confirmed violations connected to your account"],
  "/client/profile": ["My profile", "Manage your client account"]
};

const LINKS = [
  ["/client/dashboard", "Overview", "ti-layout-dashboard"],
  ["/client/logs", "Logs", "ti-list"],
  ["/client/violations", "Violations", "ti-alert-triangle"],
  ["/client/profile", "Profile", "ti-user-circle"]
];

// Shell for the client portal: top header with navigation, then the page.
export default function ClientLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [title, subtitle] = PAGES[location.pathname] || ["Client portal", "Your study hub activity"];

  const signOut = async () => {
    await logout();
    navigate("/client/login", { replace: true });
  };

  return (
    <div className="client-shell">
      <header className="client-header">
        <div className="client-header-inner">
          <div className="row-inline">
            <div className="sb-logo"><i className="ti ti-wave-sine" aria-hidden="true" /></div>
            <div className="sb-name">E-Noise</div>
          </div>
          <nav className="client-nav" aria-label="Client navigation">
            {LINKS.map(([to, label, icon]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <i className={`ti ${icon}`} aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="btn btn-sm" onClick={signOut}><i className="ti ti-logout" /> Sign out</button>
        </div>
      </header>
      <main className="client-main page">
        <Topbar title={title} subtitle={subtitle} />
        <Suspense fallback={<LoadingState label="Loading page..." />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
