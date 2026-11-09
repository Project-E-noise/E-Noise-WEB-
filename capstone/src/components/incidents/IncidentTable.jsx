import { DataTable } from "../common/DataTable";
import { formatDateTime, formatDb, formatPercent, tableLabel } from "../../utils/formatting";

const STATUS_BADGE = { CONFIRMED: "badge-crit", MONITORING: "badge-warn", DISMISSED: "badge-neu" };

export function IncidentTable({ incidents, onEdit, onDelete }) {
  const columns = [
    { key: "id", label: "ID", render: i => <span className="mono">#{i.id}</span> },
    { key: "occurred_at", label: "Time", render: i => formatDateTime(i.occurred_at) },
    { key: "table", label: "Table", render: i => <span className="badge badge-info">{tableLabel(i.table)}</span> },
    { key: "occupant", label: "Occupant", render: i => i.occupant?.full_name || <span className="muted">--</span> },
    { key: "category", label: "Category" },
    { key: "db_level", label: "dB", numeric: true, render: i => formatDb(i.db_level) },
    { key: "duration", label: "Duration", numeric: true, render: i => (i.duration_seconds != null ? `${i.duration_seconds}s` : "--") },
    {
      key: "confidence",
      label: "Confidence",
      render: i => i.confidence == null ? <span className="muted">--</span> : (
        <div className="confidence"><div><span style={{ width: `${formatPercent(i.confidence)}%` }} /></div><em>{formatPercent(i.confidence)}%</em></div>
      )
    },
    { key: "status", label: "Status", render: i => <span className={`badge ${STATUS_BADGE[i.status] || "badge-neu"}`}>{i.status}</span> },
    {
      key: "actions",
      label: "Actions",
      render: i => (
        <div className="row-inline">
          <button type="button" className="btn btn-sm btn-icon" onClick={() => onEdit(i)} aria-label={`Edit incident ${i.id}`}><i className="ti ti-edit" /></button>
          <button type="button" className="btn btn-sm btn-icon btn-danger" onClick={() => onDelete(i)} aria-label={`Delete incident ${i.id}`}><i className="ti ti-trash" /></button>
        </div>
      )
    }
  ];
  return <DataTable columns={columns} rows={incidents} caption="Incidents" />;
}
