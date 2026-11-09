import { NavLink, Link } from "react-router-dom";
import { NAV_SECTIONS } from "../../constants";
import { useAuth } from "../../context/AuthContext";

export function Sidebar({ id, tablesOnline, tablesTotal, onClose }) {
  const { admin } = useAuth();
  const name = admin?.full_name || admin?.email || "Admin";
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  return (
    <aside className="sidebar" id={id} aria-label="Main menu">
      <div className="sb-brand">
        <div className="sb-logo"><i className="ti ti-wave-sine" aria-hidden="true" /></div>
        <div className="grow">
          <div className="sb-name">E-Noise</div>
          <div className="sb-sub">Studify - Cagayan de Oro</div>
        </div>
        <button type="button" className="icon-close mobile-only" onClick={onClose} aria-label="Close menu">
          <i className="ti ti-x" />
        </button>
      </div>
      <nav className="sb-nav">
        {NAV_SECTIONS.map(section => (
          <div key={section.group}>
            <div className="nav-grp">{section.group}</div>
            {section.items.map(item => (
              <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <i className={`ti ${item.icon}`} aria-hidden="true" /> {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-footer">
        <div className="sb-online">
          <div className="online-dot" aria-hidden="true" />
          <span>{tablesTotal ? `${tablesOnline} of ${tablesTotal} sensors online` : "No sensor data yet"}</span>
        </div>
        <Link to="/profile" className="sb-admin">
          <div className="admin-av" aria-hidden="true">{initials}</div>
          <div>
            <div className="admin-name">{name}</div>
            <div className="admin-role">Administrator</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
