import { useState } from "react";
import { Slider, Select } from "../common/FormFields";
import { thresholdIssue, confirmationDurationIssue } from "../../utils/validation";
import { TABLE_STATUSES } from "../../constants";

export function ThresholdCard({ table, onSave }) {
  const [draft, setDraft] = useState({
    warning_threshold: table.warning_threshold,
    critical_threshold: table.critical_threshold,
    confirmation_seconds: table.confirmation_seconds,
    status: table.configured_status
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = field => value => setDraft(prev => ({ ...prev, [field]: value }));
  const issue = thresholdIssue(draft.warning_threshold, draft.critical_threshold) || confirmationDurationIssue(draft.confirmation_seconds);

  const save = async () => {
    if (issue) return setError(issue);
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err.message || "Could not save thresholds.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Table {table.table_number}</h2>
        <span className="badge badge-neu mono">{table.sensor_node_id}</span>
      </div>
      <Slider label="Warning threshold (yellow LEDs)" min={30} max={100} value={draft.warning_threshold} onChange={update("warning_threshold")} hint="Must be lower than the critical threshold." />
      <Slider label="Critical threshold (red LEDs + bulb)" min={30} max={110} value={draft.critical_threshold} onChange={update("critical_threshold")} />
      <Slider label="Confirmation time" min={0} max={30} unit="sec" value={draft.confirmation_seconds} onChange={update("confirmation_seconds")} hint="How long the noise must stay critical before it becomes a confirmed incident." />
      <Select label="Table status" value={draft.status} onChange={update("status")} options={TABLE_STATUSES} />
      {(error || issue) && <div className="form-error" role="alert">{error || issue}</div>}
      <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving || Boolean(issue)}>
        <i className="ti ti-device-floppy" /> {saving ? "Saving..." : "Save changes"}
      </button>
    </section>
  );
}
