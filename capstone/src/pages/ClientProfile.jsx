import { useState } from "react";
import { ProfileHeader } from "../components/common/ProfileHeader";
import { useAuth } from "../context/AuthContext";
import { clientApi } from "../services/client";

export default function ClientProfile() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false), [name, setName] = useState(user?.full_name || ""), [contact, setContact] = useState(user?.contact || "");
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({}), [saving, setSaving] = useState(false), [success, setSuccess] = useState(""), [error, setError] = useState("");

  const saveProfile = async event => {
    event.preventDefault();
    const errors = {};
    if (!name.trim()) errors.name = "Name is required.";
    else if (name.trim().length > 100) errors.name = "Name must be 100 characters or fewer.";
    if (contact.length > 100) errors.contact = "Contact must be 100 characters or fewer.";
    setFieldErrors(errors); setSuccess(""); setError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try { const response = await clientApi.updateProfile({ full_name: name.trim(), contact }); updateUser(response.client); setSuccess("Profile saved."); setEditing(false); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const savePassword = async event => {
    event.preventDefault();
    const errors = {};
    if (!current) errors.current = "Current password is required.";
    if (next.length < 8) errors.next = "New password must be at least 8 characters.";
    if (next && next === current) errors.next = "New password must differ from the current password.";
    if (next !== confirm) errors.confirm = "Passwords do not match.";
    setFieldErrors(errors); setSuccess(""); setError("");
    if (Object.keys(errors).length) return;
    setSaving(true);
    try { await clientApi.changePassword({ current_password: current, new_password: next }); setSuccess("Password updated."); setCurrent(""); setNext(""); setConfirm(""); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <div className="client-profile">
    <div className="card profile-modern"><ProfileHeader name={user?.full_name} email={user?.email} role="Client" /></div>
    {(success || error) && <div className={success ? "profile-message profile-success" : "profile-message profile-error"}>{success || error}</div>}
    <div className="profile-groups">
      <section className="card profile-group"><div className="profile-group-heading"><h2>Details</h2><button className="btn" onClick={() => { setEditing(value => !value); setName(user?.full_name || ""); setContact(user?.contact || ""); setFieldErrors({}); }}>{editing ? "Cancel" : "Edit"}</button></div>
        {editing ? <form className="profile-form" onSubmit={saveProfile} noValidate>
          <label>Name<input value={name} onChange={event => setName(event.target.value)} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
          <label>Email<input value={user?.email || ""} disabled /></label>
          <label>Contact<input value={contact} onChange={event => setContact(event.target.value)} />{fieldErrors.contact && <small className="field-error">{fieldErrors.contact}</small>}</label>
          <div className="client-profile-actions"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save details"}</button></div>
        </form> : <dl className="profile-details"><div><dt>Name</dt><dd>{user?.full_name}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Contact</dt><dd>{user?.contact || "Not provided"}</dd></div><div><dt>Email status</dt><dd>{user?.email_verified ? "Verified" : "Unverified"}</dd></div></dl>}
      </section>
      <section className="card profile-group"><h2>Security</h2><form className="profile-form" onSubmit={savePassword} noValidate>
        <label>Current password<input type="password" value={current} onChange={event => setCurrent(event.target.value)} />{fieldErrors.current && <small className="field-error">{fieldErrors.current}</small>}</label>
        <label>New password<input type="password" value={next} onChange={event => setNext(event.target.value)} />{fieldErrors.next && <small className="field-error">{fieldErrors.next}</small>}</label>
        <label>Confirm new password<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} />{fieldErrors.confirm && <small className="field-error">{fieldErrors.confirm}</small>}</label>
        <div className="client-profile-actions"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Change password"}</button></div>
      </form></section>
    </div>
  </div>;
}
