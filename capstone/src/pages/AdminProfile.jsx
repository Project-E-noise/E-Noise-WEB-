import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { ProfileHeader } from "../components/common/ProfileHeader";
import { ChangePasswordForm } from "../components/common/ProfileForms";
import { Input } from "../components/common/FormFields";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/auth";
import { formatDate } from "../utils/formatting";

export default function AdminProfile() {
  const { admin, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const startEdit = () => {
    setName(admin?.full_name || "");
    setNameError("");
    setMessage(null);
    setEditing(true);
  };

  const saveName = async event => {
    event.preventDefault();
    if (!name.trim()) return setNameError("Name is required.");
    if (name.trim().length > 100) return setNameError("Name must be 100 characters or fewer.");
    setSaving(true);
    try {
      const response = await authApi.updateProfile({ full_name: name.trim() });
      updateUser(response.admin);
      setMessage({ ok: true, text: "Profile saved." });
      setEditing(false);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <Topbar title="Admin Profile" subtitle="Your account details and password">
        <button type="button" className="btn btn-danger" onClick={signOut}><i className="ti ti-logout" /> Sign out</button>
      </Topbar>
      <section className="card"><ProfileHeader name={admin?.full_name} email={admin?.email} role="Administrator" /></section>
      {message && <div className={`alert ${message.ok ? "alert-success" : "alert-error"}`} role="status">{message.text}</div>}
      <div className="two-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Details</h2>
            {!editing && <button type="button" className="btn btn-sm" onClick={startEdit}><i className="ti ti-edit" /> Edit</button>}
          </div>
          {editing ? (
            <form onSubmit={saveName} noValidate>
              <Input label="Name" value={name} onChange={setName} error={nameError} autoComplete="name" />
              <Input label="Email" value={admin?.email || ""} onChange={() => {}} disabled hint="Email can't be changed." />
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </form>
          ) : (
            <dl className="profile-details">
              <div><dt>Name</dt><dd>{admin?.full_name}</dd></div>
              <div><dt>Email</dt><dd>{admin?.email}</dd></div>
              <div><dt>Status</dt><dd>{admin?.status}</dd></div>
              <div><dt>Member since</dt><dd>{formatDate(admin?.created_at)}</dd></div>
            </dl>
          )}
        </section>
        <section className="card">
          <div className="card-header"><h2 className="card-title">Change password</h2></div>
          <ChangePasswordForm onSubmit={authApi.changePassword} />
        </section>
      </div>
    </div>
  );
}
