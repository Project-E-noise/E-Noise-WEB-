import { useState } from "react";
import { ProfileHeader } from "../components/common/ProfileHeader";
import { ChangePasswordForm } from "../components/common/ProfileForms";
import { Input } from "../components/common/FormFields";
import { useAuth } from "../context/AuthContext";
import { clientApi } from "../services/client";

export default function ClientProfile() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", contact: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setForm({ full_name: user?.full_name || "", contact: user?.contact || "" });
    setErrors({});
    setMessage(null);
    setEditing(true);
  };

  const save = async event => {
    event.preventDefault();
    const next = {};
    if (!form.full_name.trim()) next.full_name = "Name is required.";
    else if (form.full_name.trim().length > 100) next.full_name = "Name must be 100 characters or fewer.";
    if (form.contact.trim().length > 100) next.contact = "Contact must be 100 characters or fewer.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const response = await clientApi.updateProfile({ full_name: form.full_name.trim(), contact: form.contact.trim() });
      updateUser(response.client);
      setMessage({ ok: true, text: "Profile saved." });
      setEditing(false);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card"><ProfileHeader name={user?.full_name} email={user?.email} role="Client" /></section>
      {message && <div className={`alert ${message.ok ? "alert-success" : "alert-error"}`} role="status">{message.text}</div>}
      <div className="two-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Details</h2>
            {!editing && <button type="button" className="btn btn-sm" onClick={startEdit}><i className="ti ti-edit" /> Edit</button>}
          </div>
          {editing ? (
            <form onSubmit={save} noValidate>
              <Input label="Name" value={form.full_name} onChange={v => setForm(p => ({ ...p, full_name: v }))} error={errors.full_name} autoComplete="name" />
              <Input label="Contact number" type="tel" value={form.contact} onChange={v => setForm(p => ({ ...p, contact: v }))} error={errors.contact} autoComplete="tel" />
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </form>
          ) : (
            <dl className="profile-details">
              <div><dt>Name</dt><dd>{user?.full_name}</dd></div>
              <div><dt>Email</dt><dd>{user?.email}</dd></div>
              <div><dt>Contact</dt><dd>{user?.contact || <span className="muted">Not provided</span>}</dd></div>
            </dl>
          )}
        </section>
        <section className="card">
          <div className="card-header"><h2 className="card-title">Change password</h2></div>
          <ChangePasswordForm onSubmit={clientApi.changePassword} />
        </section>
      </div>
    </>
  );
}
