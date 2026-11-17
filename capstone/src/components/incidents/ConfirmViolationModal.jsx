import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Select } from "../common/FormFields";
import { VIOLATION_CATEGORIES, FILTER_REASON_LABELS } from "../../constants";
import { formatDateTime, formatPercent, tableLabel } from "../../utils/formatting";

// "Confirm as violation" for a filtered (IGNORED / UNVERIFIED) incident.
// A category is required: it becomes the strike's category.
export function ConfirmViolationModal({ incident, onClose, onConfirm }) {
  const [category, setCategory] = useState(VIOLATION_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!incident) return;
    setCategory(VIOLATION_CATEGORIES.includes(incident.category) ? incident.category : VIOLATION_CATEGORIES[0]);
    setError(null);
  }, [incident]);

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onConfirm(incident, category);
    } catch (err) {
      setError(err.message || "Could not confirm this incident.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(incident)} title={incident ? `Confirm incident #${incident.id} as a violation` : ""} subtitle="This counts as a strike for the table's occupant" onClose={onClose}>
      {incident && (
        <form onSubmit={submit} noValidate>
          <p className="modal-text">
            {tableLabel(incident.table)}, {formatDateTime(incident.occurred_at)}. Filtered because: {FILTER_REASON_LABELS[incident.filter_reason] || incident.filter_reason || "unknown"}.
            {incident.top_class && <> Heard as <strong>{incident.top_class}</strong>{incident.confidence != null && <> ({formatPercent(incident.confidence)}% confidence)</>}.</>}
          </p>
          <Select label="Violation category" value={category} onChange={setCategory} options={VIOLATION_CATEGORIES} hint="Only these categories count as violations." />
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>
              <i className="ti ti-alert-triangle" /> {saving ? "Saving..." : "Confirm as violation"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
