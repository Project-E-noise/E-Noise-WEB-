import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Input, Select, Textarea } from "../common/FormFields";
import { ML_CATEGORIES } from "../../constants";

const EMPTY = { table_id: "", category: ML_CATEGORIES[0], db_level: "", confidence: "", occurred_at: "", bulb_triggered: "No", notes: "" };

export function IncidentModal({ open, tables, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setForm(initial ? { ...EMPTY, ...initial, bulb_triggered: initial.bulb_triggered ? "Yes" : "No" } : EMPTY);
    setError(null);
  }, [open, initial]);

  if (!open) return null;
  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.table_id) return setError("Select a table.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        table_id: Number(form.table_id),
        db_level: Number(form.db_level),
        confidence: Number(form.confidence),
        bulb_triggered: form.bulb_triggered === "Yes"
      });
    } catch (err) {
      setError(err.message || "Could not save this incident.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={initial ? "Edit Incident" : "Log Incident"} subtitle="Manually record a noise violation" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Select label="Table" value={form.table_id} onChange={v => update("table_id", v)} options={[{ value: "", label: "Select a table" }, ...tables.map(t => ({ value: t.id, label: `Table ${t.table_number}` }))]} />
          <Select label="Category" value={form.category} onChange={v => update("category", v)} options={ML_CATEGORIES} />
        </div>
        <div className="form-row">
          <Input label="dB level (measured)" type="number" value={form.db_level} onChange={v => update("db_level", v)} required />
          <Input label="ML confidence %" type="number" value={form.confidence} onChange={v => update("confidence", v)} required />
        </div>
        <div className="form-row">
          <Input label="Occurred at" type="datetime-local" value={form.occurred_at} onChange={v => update("occurred_at", v)} />
          <Select label="Bulb triggered?" value={form.bulb_triggered} onChange={v => update("bulb_triggered", v)} options={["Yes", "No"]} />
        </div>
        <Textarea label="Notes (optional)" value={form.notes} onChange={v => update("notes", v)} placeholder="e.g. Verbal reminder given to occupant..." />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn grow center" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow-2 center" disabled={saving}>
            <i className="ti ti-plus" /> {saving ? "Saving..." : "Save Incident"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
