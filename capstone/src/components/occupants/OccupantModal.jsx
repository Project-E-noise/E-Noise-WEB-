import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Input } from "../common/FormFields";
import { isValidEmail } from "../../utils/validation";

const EMPTY = { full_name: "", email: "", contact: "" };

export function OccupantModal({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { full_name: initial.full_name, email: initial.email || "", contact: initial.contact || "" } : EMPTY);
    setErrors({});
    setError(null);
  }, [open, initial]);

  const update = field => value => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async e => {
    e.preventDefault();
    const next = {};
    if (!form.full_name.trim()) next.full_name = "Enter the occupant's name.";
    else if (form.full_name.trim().length > 100) next.full_name = "Name must be 100 characters or fewer.";
    if (form.email.trim() && !isValidEmail(form.email)) next.email = "Enter a valid email address or leave it empty.";
    if (form.contact.trim().length > 100) next.contact = "Contact must be 100 characters or fewer.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit({ full_name: form.full_name.trim(), email: form.email.trim(), contact: form.contact.trim() });
    } catch (err) {
      setError(err.message || "Could not save this occupant.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit occupant" : "New occupant"} subtitle="Search existing names first to avoid duplicate records" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Input label="Full name" value={form.full_name} onChange={update("full_name")} placeholder="e.g. Juan Dela Cruz" error={errors.full_name} required />
        <Input label="Email (optional)" type="email" value={form.email} onChange={update("email")} error={errors.email} hint="Lets this person sign in to the client portal with this email." />
        <Input label="Contact (optional)" type="tel" value={form.contact} onChange={update("contact")} error={errors.contact} />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save occupant"}</button>
        </div>
      </form>
    </Modal>
  );
}
