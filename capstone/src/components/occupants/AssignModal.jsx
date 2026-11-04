import { useState } from "react";
import { Modal } from "../common/Modal";
import { Select } from "../common/FormFields";

export function AssignModal({ open, occupant, tables, onClose, onSubmit }) {
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const available = tables.filter(t => !t.occupant);

  const submit = async e => {
    e.preventDefault();
    if (!tableId) return setError("Select a table to assign.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit(Number(tableId));
    } catch (err) {
      setError(err.message || "Could not assign this occupant.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={`Assign ${occupant?.full_name || "occupant"}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Select
          label="Table"
          value={tableId}
          onChange={setTableId}
          options={[{ value: "", label: available.length ? "Select an available table" : "No available tables" }, ...available.map(t => ({ value: t.id, label: `Table ${t.table_number}` }))]}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn grow center" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow-2 center" disabled={saving || !available.length}>
            {saving ? "Assigning..." : "Assign Occupant"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
