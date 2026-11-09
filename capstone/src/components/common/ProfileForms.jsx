import { useState } from "react";
import { Input } from "./FormFields";
import { passwordIssue } from "../../utils/validation";

// Change-password form shared by the admin and client profile pages.
// onSubmit({ current_password, new_password }) should call the right API.
export function ChangePasswordForm({ onSubmit }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = field => value => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async event => {
    event.preventDefault();
    const next = {};
    if (!form.current) next.current = "Enter your current password.";
    const issue = passwordIssue(form.next);
    if (issue) next.next = issue;
    else if (form.next === form.current) next.next = "New password must differ from the current one.";
    if (form.next !== form.confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await onSubmit({ current_password: form.current, new_password: form.next });
      setMessage({ ok: true, text: "Password updated." });
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Input label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={update("current")} error={errors.current} />
      <Input label="New password" type="password" autoComplete="new-password" value={form.next} onChange={update("next")} error={errors.next} hint="At least 8 characters." />
      <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} error={errors.confirm} />
      {message && <div className={`alert ${message.ok ? "alert-success" : "alert-error"}`} role="status">{message.text}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Change password"}</button>
      </div>
    </form>
  );
}
