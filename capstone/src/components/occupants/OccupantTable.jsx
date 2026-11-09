import { DataTable } from "../common/DataTable";
import { formatDate, tableLabel } from "../../utils/formatting";
import { BAN_VIOLATION_THRESHOLD } from "../../constants";

export function OccupantTable({ occupants, onAssign, onRelease, onEdit, onDelete, onViewViolations, onLiftBan }) {
  const columns = [
    { key: "full_name", label: "Name", render: o => <div><div>{o.full_name}</div>{o.email && <div className="muted mono">{o.email}</div>}</div> },
    {
      key: "status",
      label: "Status",
      render: o => o.status === "BANNED"
        ? <span className="badge badge-crit" title={`Ban ends ${formatDate(o.ban_until)}`}>BANNED until {formatDate(o.ban_until)}</span>
        : <span className="badge badge-safe">ACTIVE</span>
    },
    { key: "table", label: "Table", render: o => (o.table ? tableLabel(o.table) : <span className="muted">Unassigned</span>) },
    {
      key: "strikes",
      label: "Strikes",
      render: o => <span className={o.strikes >= BAN_VIOLATION_THRESHOLD - 1 ? "alert-text" : ""}>{o.strikes} / {BAN_VIOLATION_THRESHOLD}</span>
    },
    {
      key: "violations",
      label: "Violations",
      render: o => <button type="button" className="link-btn" onClick={() => onViewViolations(o)} aria-label={`View ${o.violation_count} violations for ${o.full_name}`}>{o.violation_count}</button>
    },
    {
      key: "actions",
      label: "Actions",
      render: o => (
        <div className="row-inline">
          {o.status === "BANNED" && <button type="button" className="btn btn-sm" onClick={() => onLiftBan(o)}>Lift ban</button>}
          {o.table
            ? <button type="button" className="btn btn-sm" onClick={() => onRelease(o)}>Release</button>
            : <button type="button" className="btn btn-sm" onClick={() => onAssign(o)} disabled={o.status === "BANNED"}>Assign</button>}
          <button type="button" className="btn btn-sm btn-icon" onClick={() => onEdit(o)} aria-label={`Edit ${o.full_name}`}><i className="ti ti-edit" /></button>
          <button type="button" className="btn btn-sm btn-icon btn-danger" onClick={() => onDelete(o)} aria-label={`Delete ${o.full_name}`}><i className="ti ti-trash" /></button>
        </div>
      )
    }
  ];
  return <DataTable columns={columns} rows={occupants} caption="Occupants" />;
}
