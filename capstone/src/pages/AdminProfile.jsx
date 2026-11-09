import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { ProfileHeader } from "../components/common/ProfileHeader";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/auth";

export default function AdminProfile() {
  const { admin, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false), [name, setName] = useState(admin?.full_name || "");
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({}), [saving, setSaving] = useState(false), [success, setSuccess] = useState(""), [error, setError] = useState("");
  const signOut = async () => { await logout(); navigate("/login", { replace: true }); };

  const saveProfile = async event => {
    event.preventDefault(); const errors = {};
    if (!name.trim()) errors.name = "Name is required.";
    if (name.trim().length > 100) errors.name = "Name must be 100 characters or fewer.";
    setFieldErrors(errors); setSuccess(""); setError(""); if (Object.keys(errors).length) return;
    setSaving(true);
    try { const response = await authApi.updateProfile({ full_name: name.trim() }); updateUser(response.admin); setSuccess("Profile saved."); setEditing(false); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const savePassword = async event => {
    event.preventDefault(); const errors = {};
    if (!current) errors.current = "Current password is required.";
    if (next.length < 8) errors.next = "New password must be at least 8 characters.";
    if (next && next === current) errors.next = "New password must differ from the current password.";
    if (next !== confirm) errors.confirm = "Passwords do not match.";
    setFieldErrors(errors); setSuccess(""); setError(""); if (Object.keys(errors).length) return;
    setSaving(true);
    try { await authApi.changePassword({ current_password: current, new_password: next }); setSuccess("Password updated."); setCurrent(""); setNext(""); setConfirm(""); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <div className="page active">
    <Topbar title="Admin Profile" subtitle="Account details and session"><button className="btn btn-danger" onClick={signOut}><i className="ti ti-logout" /> Sign out</button></Topbar>
    <div className="card profile-modern"><ProfileHeader name={admin?.full_name} email={admin?.email} role="Administrator" /></div>
    {(success || error) && <div className={success ? "profile-message profile-success" : "profile-message profile-error"}>{success || error}</div>}
    <div className="profile-groups">
      <section className="card profile-group"><div className="profile-group-heading"><h2>Details</h2><button className="btn" onClick={() => { setEditing(value => !value); setName(admin?.full_name || ""); setFieldErrors({}); }}>{editing ? "Cancel" : "Edit"}</button></div>
        {editing ? <form className="profile-form" onSubmit={saveProfile} noValidate><label>Name<input value={name} onChange={event => setName(event.target.value)} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label><label>Email<input value={admin?.email || ""} disabled /></label><label>Account status<input value={admin?.status || "VERIFIED"} disabled /></label><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save details"}</button></form> : <dl className="profile-details"><div><dt>Name</dt><dd>{admin?.full_name}</dd></div><div><dt>Email</dt><dd>{admin?.email}</dd></div><div><dt>Account status</dt><dd>{admin?.status || "VERIFIED"}</dd></div><div><dt>Role</dt><dd>Administrator</dd></div><div><dt>Site</dt><dd>Studify Hub</dd></div></dl>}
      </section>
      <section className="card profile-group"><h2>Security</h2><form className="profile-form" onSubmit={savePassword} noValidate>
        <label>Current password<input type="password" value={current} onChange={event => setCurrent(event.target.value)} />{fieldErrors.current && <small className="field-error">{fieldErrors.current}</small>}</label>
        <label>New password<input type="password" value={next} onChange={event => setNext(event.target.value)} />{fieldErrors.next && <small className="field-error">{fieldErrors.next}</small>}</label>
        <label>Confirm new password<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} />{fieldErrors.confirm && <small className="field-error">{fieldErrors.confirm}</small>}</label>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
      </form></section>
    </div>
  </div>;
}
