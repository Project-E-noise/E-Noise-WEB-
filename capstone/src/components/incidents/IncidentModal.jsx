import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Input, Select, Textarea } from "../common/FormFields";
import { INCIDENT_STATUSES, ML_CATEGORIES } from "../../constants";
import { fromDatetimeLocal, toDatetimeLocal } from "../../utils/dates";

const EMPTY = { table_id: "", category: ML_CATEGORIES[0], db_level: "", confidence: "", occurred_at: "", bulb_triggered: "No", status: "CONFIRMED", notes: "" };

// Turns an incident from the API into form values (confidence 0.87 -> "87").
function toForm(incident) {
  if (!incident) return { ...EMPTY, occurred_at: toDatetimeLocal(new Date().toISOString()) };
  return {
    table_id: String(incident.table_id),
    category: incident.category,
    db_level: String(incident.db_level),
    confidence: incident.confidence != null ? String(Math.round(incident.confidence * 100)) : "",
    occurred_at: toDatetimeLocal(incident.occurred_at),
    bulb_triggered: incident.bulb_triggered ? "Yes" : "No",
    status: incident.status,
    notes: incident.notes || ""
  };
}

function validate(form, editing) {
  const errors = {};
  if (!editing && !form.table_id) errors.table_id = "Select a table.";
  const db = Number(form.db_level);
  if (form.db_level === "" || !Number.isFinite(db) || db < 0 || db > 200) errors.db_level = "Enter a dB level between 0 and 200.";
  if (form.confidence !== "") {
    const c = Number(form.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 100) errors.confidence = "Confidence must be between 0 and 100%.";
  }
  if (form.occurred_at && new Date(form.occurred_at).getTime() > Date.now() + 60000) errors.occurred_at = "The time can't be in the future.";
  if (form.notes.length > 1000) errors.notes = "Notes must be 1000 characters or fewer.";
  return errors;
}

export function IncidentModal({ open, tables, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(initial));
    setErrors({});
    setError(null);
  }, [open, initial]);

  const update = field => value => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async e => {
    e.preventDefault();
    const found = validate(form, editing);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        category: form.category,
        db_level: Number(form.db_level),
        // The form shows a percentage; the API stores 0-1.
        confidence: form.confidence === "" ? null : Number(form.confidence) / 100,
        bulb_triggered: form.bulb_triggered === "Yes",
        status: form.status,
        notes: form.notes.trim(),
        occurred_at: fromDatetimeLocal(form.occurred_at)
      };
      if (!editing) payload.table_id = Number(form.table_id);
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Could not save this incident.");
    } finally {
      setSaving(false);
    }
  };

  const tableOptions = [{ value: "", label: "Select a table" }, ...tables.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))];

  return (
    <Modal open={open} title={editing ? `Edit incident #${initial.id}` : "Log incident"} subtitle="Confirmed incidents count as a violation for the table's occupant" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-row">
          <Select label="Table" value={form.table_id} onChange={update("table_id")} options={tableOptions} error={errors.table_id} disabled={editing} />
          <Select label="Category" value={form.category} onChange={update("category")} options={ML_CATEGORIES} />
        </div>
        <div className="form-row">
          <Input label="dB level" type="number" inputMode="decimal" min="0" max="200" step="0.1" value={form.db_level} onChange={update("db_level")} error={errors.db_level} required />
          <Input label="ML confidence (%)" type="number" inputMode="numeric" min="0" max="100" value={form.confidence} onChange={update("confidence")} error={errors.confidence} hint="Optional" />
        </div>
        <div className="form-row">
          <Input label="Occurred at" type="datetime-local" value={form.occurred_at} onChange={update("occurred_at")} error={errors.occurred_at} />
          <Select label="Status" value={form.status} onChange={update("status")} options={INCIDENT_STATUSES} />
        </div>
        <Select label="Critical bulb triggered?" value={form.bulb_triggered} onChange={update("bulb_triggered")} options={["No", "Yes"]} />
        <Textarea label="Notes (optional)" value={form.notes} onChange={update("notes")} error={errors.notes} maxLength={1000} placeholder="e.g. Verbal reminder given to occupant" />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>
            <i className="ti ti-device-floppy" /> {saving ? "Saving..." : "Save incident"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
