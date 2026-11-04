import { Topbar } from "../components/layout/Topbar";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function AdminProfile() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="page active">
      <Topbar title="Admin Profile" subtitle="Account details and session" />
      <div className="card profile-card">
        <div className="sb-admin profile-row">
          <div className="admin-av lg">{(admin?.full_name || admin?.email || "AD").slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="card-title-lg">{admin?.full_name || "Administrator"}</div>
            <div className="mono-muted">{admin?.email}</div>
          </div>
        </div>
        <div className="divider" />
        <div className="summary-grid">
          <div className="summary-card">
            <div>Account status</div>
            <strong>{admin?.status || "VERIFIED"}</strong>
          </div>
          <div className="summary-card">
            <div>Role</div>
            <strong>Administrator</strong>
          </div>
          <div className="summary-card">
            <div>Site</div>
            <strong>Studify Hub</strong>
          </div>
        </div>
        <div className="divider" />
        <button className="btn btn-danger" onClick={signOut}>
          <i className="ti ti-logout" /> Sign out
        </button>
      </div>
    </div>
  );
}
