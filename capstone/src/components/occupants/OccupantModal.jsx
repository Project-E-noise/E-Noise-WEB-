import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Input } from "../common/FormFields";

const EMPTY = { full_name: "", email: "", contact: "" };

export function OccupantModal({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setForm(initial ? { full_name: initial.full_name, email: initial.email || "", contact: initial.contact || "" } : EMPTY);
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = async e => {
    e.preventDefault();
    if (!form.full_name.trim()) return setError("Enter the occupant's name.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || "Could not save this occupant.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit Occupant" : "New Occupant"} subtitle="Search existing names first to avoid duplicate records" onClose={onClose}>
      <form onSubmit={submit}>
        <Input label="Full name" value={form.full_name} onChange={v => setForm(prev => ({ ...prev, full_name: v }))} placeholder="e.g. Juan Dela Cruz" required />
        <Input label="Email (optional, for client login)" type="email" value={form.email} onChange={v => setForm(prev => ({ ...prev, email: v }))} />
        <Input label="Contact (optional)" value={form.contact} onChange={v => setForm(prev => ({ ...prev, contact: v }))} />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn grow center" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow-2 center" disabled={saving}>
            {saving ? "Saving..." : "Save Occupant"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
