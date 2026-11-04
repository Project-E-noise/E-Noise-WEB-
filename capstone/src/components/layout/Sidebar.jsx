import { NavLink } from "react-router-dom";
import { NAV_SECTIONS } from "../../constants";
import { useAuth } from "../../context/AuthContext";

export function Sidebar({ tablesOnline, tablesTotal, incidentBadge }) {
  const { admin } = useAuth();
  const initials = (admin?.full_name || admin?.email || "AD").slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">
          <i className="ti ti-wave-sine" />
        </div>
        <div>
          <div className="sb-name">E-Noise</div>
          <div className="sb-sub">Studify - Cagayan de Oro</div>
        </div>
      </div>
      <nav className="sb-nav">
        {NAV_SECTIONS.map(section => (
          <div key={section.group}>
            <div className="nav-grp">{section.group}</div>
            {section.items.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <i className={`ti ${item.icon}`} /> {item.label}
                {item.to === "/incidents" && incidentBadge > 0 && <span className="nav-badge">{incidentBadge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-footer">
        <div className="sb-online">
          <div className="online-dot" />
          <span>
            {tablesOnline ?? "--"} of {tablesTotal ?? "--"} tables online
          </span>
        </div>
        <div className="sb-admin">
          <div className="admin-av">{initials}</div>
          <div>
            <div className="admin-name">{admin?.full_name || admin?.email || "Admin"}</div>
            <div className="admin-role">Studify Hub</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
