import { useState } from "react";
import { Slider, Select } from "../common/FormFields";
import { thresholdIssue, confirmationDurationIssue } from "../../utils/validation";

export function ThresholdCard({ table, value, onSave }) {
  const [draft, setDraft] = useState({
    warning_threshold: value.warning_threshold ?? 50,
    critical_threshold: value.critical_threshold ?? 60,
    confirmation_seconds: value.confirmation_seconds ?? 10,
    status: value.status ?? "AVAILABLE"
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field, v) => setDraft(prev => ({ ...prev, [field]: v }));

  const save = async () => {
    const issue = thresholdIssue(draft.warning_threshold, draft.critical_threshold) || confirmationDurationIssue(draft.confirmation_seconds);
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
    <div className="card">
      <div className="small-heading">Table {table.table_number} - Threshold settings</div>
      <Slider label="Warning threshold (yellow LEDs activate)" min="30" max="90" value={draft.warning_threshold} onChange={v => update("warning_threshold", Number(v))} hint="Must be less than the critical threshold." />
      <Slider label="Critical threshold (bulb trigger)" min="30" max="100" value={draft.critical_threshold} onChange={v => update("critical_threshold", Number(v))} hint="Confirmed only after the backend's 10-second sustained check." />
      <Slider label="Confirmation duration" min="0" max="30" unit="sec" value={draft.confirmation_seconds} onChange={v => update("confirmation_seconds", Number(v))} hint="Seconds a crossing must persist before it becomes a confirmed incident." />
      <Select label="Table status" value={draft.status} onChange={v => update("status", v)} options={["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"]} />
      {error && <div className="form-error">{error}</div>}
      <button className="btn btn-primary full center" onClick={save} disabled={saving}>
        <i className="ti ti-device-floppy" /> {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}
