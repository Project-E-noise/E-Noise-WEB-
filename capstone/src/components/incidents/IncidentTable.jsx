import { formatDateTime, tableLabel } from "../../utils/formatting";
import { EmptyState } from "../common/UiStates";

export function IncidentTable({ incidents, onEdit, onDelete }) {
  if (!incidents.length) {
    return <EmptyState icon="ti-alert-triangle" title="No incidents logged" subtitle="Confirmed incidents from the backend will appear here." />;
  }
  return (
    <div className="card card-sm">
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Table</th>
              <th>Occupant</th>
              <th>Category</th>
              <th>dB</th>
              <th>Duration</th>
              <th>Confidence</th>
              <th>Bulb</th>
              <th>Status</th>
              <th>Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(incident => (
              <tr key={incident.id}>
                <td className="mono-cell">#{incident.id}</td>
                <td>
                  <span className="badge badge-info">{incident.table ? tableLabel(incident.table) : `Table ${incident.table_id}`}</span>
                </td>
                <td className="muted-small">{incident.occupant?.full_name || "--"}</td>
                <td>{incident.category}</td>
                <td className="db-cell">{Number(incident.db_level).toFixed(1)} dB</td>
                <td className="mono-cell dark">{incident.duration_seconds != null ? `${incident.duration_seconds}s` : "--"}</td>
                <td>
                  <div className="confidence">
                    <div>
                      <span style={{ width: `${Math.round((incident.confidence || 0) <= 1 ? incident.confidence * 100 : incident.confidence)}%` }} />
                    </div>
                    <em>{Math.round((incident.confidence || 0) <= 1 ? incident.confidence * 100 : incident.confidence)}%</em>
                  </div>
                </td>
                <td>
                  <span className={`badge ${incident.bulb_triggered ? "badge-crit" : "badge-neu"}`}>{incident.bulb_triggered ? "Yes" : "No"}</span>
                </td>
                <td>
                  <span className="badge badge-neu">{incident.status || "CONFIRMED"}</span>
                </td>
                <td className="mono-cell dark">{formatDateTime(incident.occurred_at)}</td>
                <td>
                  <div className="row-inline">
                    <button className="btn table-btn" onClick={() => onEdit(incident)}>
                      <i className="ti ti-edit" />
                    </button>
                    <button className="btn btn-danger table-btn" onClick={() => onDelete(incident)}>
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
