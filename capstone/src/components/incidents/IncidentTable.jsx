import { DataTable } from "../common/DataTable";
import { formatDateTime, formatDb, formatPercent, tableLabel } from "../../utils/formatting";
import { FILTER_REASON_LABELS } from "../../constants";

const STATUS_BADGE = { CONFIRMED: "badge-crit", MONITORING: "badge-warn", DISMISSED: "badge-neu", IGNORED: "badge-neu", UNVERIFIED: "badge-warn" };

function Confidence({ value }) {
  if (value == null) return <span className="muted">--</span>;
  return <div className="confidence"><div><span style={{ width: `${formatPercent(value)}%` }} /></div><em>{formatPercent(value)}%</em></div>;
}

// mode: "violations" | "filtered" | "dismissed". Filtered rows show why the
// server did not confirm them and offer "Confirm as violation" / "Keep ignored".
export function IncidentTable({ incidents, mode = "violations", busyId, onEdit, onDelete, onConfirm, onKeepIgnored }) {
  const filtered = mode === "filtered";
  const columns = [
    { key: "id", label: "ID", render: i => <span className="mono">#{i.id}</span> },
    { key: "occurred_at", label: "Time", render: i => formatDateTime(i.occurred_at) },
    { key: "table", label: "Table", render: i => <span className="badge badge-info">{tableLabel(i.table)}</span> },
    { key: "occupant", label: "Occupant", render: i => i.occupant?.full_name || <span className="muted">--</span> },
    filtered
      ? { key: "reason", label: "Reason", render: i => <span className="badge badge-neu">{FILTER_REASON_LABELS[i.filter_reason] || i.filter_reason || "--"}</span> }
      : { key: "category", label: "Category", render: i => i.category || <span className="muted">--</span> },
    {
      key: "sound",
      label: filtered ? "Heard as" : "Top class",
      render: i => (
        <span>
          {i.top_class || <span className="muted">no label</span>}
          {filtered && i.category && <span className="muted-small"> ({i.category})</span>}
        </span>
      )
    },
    { key: "db_level", label: "Peak dB", numeric: true, render: i => formatDb(i.peak_db ?? i.db_level) },
    { key: "duration", label: "Duration", numeric: true, render: i => (i.duration_seconds != null ? `${i.duration_seconds}s` : "--") },
    { key: "confidence", label: "Confidence", render: i => <Confidence value={i.confidence} /> },
    { key: "status", label: "Status", render: i => <span className={`badge ${STATUS_BADGE[i.status] || "badge-neu"}`}>{i.status}</span> },
    {
      key: "actions",
      label: "Actions",
      render: i => (
        <div className="row-inline">
          {filtered && (
            <>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => onConfirm(i)} disabled={busyId === i.id}>
                <i className="ti ti-alert-triangle" /> Confirm as violation
              </button>
              <button type="button" className="btn btn-sm" onClick={() => onKeepIgnored(i)} disabled={busyId === i.id}>
                <i className="ti ti-check" /> Keep ignored
              </button>
            </>
          )}
          <button type="button" className="btn btn-sm btn-icon" onClick={() => onEdit(i)} aria-label={`Edit incident ${i.id}`}><i className="ti ti-edit" /></button>
          <button type="button" className="btn btn-sm btn-icon btn-danger" onClick={() => onDelete(i)} aria-label={`Delete incident ${i.id}`}><i className="ti ti-trash" /></button>
        </div>
      )
    }
  ];
  return <DataTable columns={columns} rows={incidents} caption="Incidents" />;
}
