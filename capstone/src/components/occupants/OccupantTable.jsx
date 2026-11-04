import { formatDate, tableLabel } from "../../utils/formatting";
import { EmptyState } from "../common/UiStates";

export function OccupantTable({ occupants, onAssign, onRelease, onEdit, onDelete, onViewViolations }) {
  if (!occupants.length) {
    return <EmptyState icon="ti-users" title="No occupants yet" subtitle="Create an occupant record to assign them to a table." />;
  }
  return (
    <div className="card card-sm">
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Table</th>
              <th>Violations</th>
              <th>Ban until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {occupants.map(o => (
              <tr key={o.id}>
                <td>{o.full_name}</td>
                <td>
                  <span className={`badge ${o.status === "BANNED" ? "badge-crit" : o.status === "WARNED" ? "badge-warn" : "badge-safe"}`}>{o.status}</span>
                </td>
                <td className="muted-small">{o.table ? tableLabel(o.table) : "Unassigned"}</td>
                <td>
                  <button className="link-btn" onClick={() => onViewViolations(o)}>
                    {o.violation_count ?? 0}
                  </button>
                </td>
                <td className="mono-cell dark">{o.ban_until ? formatDate(o.ban_until) : "--"}</td>
                <td>
                  <div className="row-inline">
                    {o.table ? (
                      <button className="btn table-btn" onClick={() => onRelease(o)}>
                        Release
                      </button>
                    ) : (
                      <button className="btn table-btn" onClick={() => onAssign(o)}>
                        Assign
                      </button>
                    )}
                    <button className="btn table-btn" onClick={() => onEdit(o)}>
                      <i className="ti ti-edit" />
                    </button>
                    <button className="btn btn-danger table-btn" onClick={() => onDelete(o)}>
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
