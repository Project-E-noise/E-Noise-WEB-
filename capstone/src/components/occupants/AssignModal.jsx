import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Select } from "../common/FormFields";

export function AssignModal({ open, occupant, tables, onClose, onSubmit }) {
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTableId("");
    setError(null);
  }, [open]);

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

  const options = [
    { value: "", label: available.length ? "Select an available table" : "No available tables" },
    ...available.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))
  ];

  return (
    <Modal open={open} title={`Assign ${occupant?.full_name || "occupant"}`} subtitle="Only tables without an occupant are listed" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Select label="Table" value={tableId} onChange={setTableId} options={options} />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || !available.length}>{saving ? "Assigning..." : "Assign"}</button>
        </div>
      </form>
    </Modal>
  );
}
