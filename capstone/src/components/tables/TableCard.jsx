import { Link } from "react-router-dom";
import { LedArray } from "./LedArray";
import { ClassificationChip } from "./ClassificationChip";
import { formatDateTime, formatDb, formatTimeAgo, tableLabel } from "../../utils/formatting";

export const STATUS_BADGE = { SAFE: "badge-safe", WARNING: "badge-warn", CRITICAL: "badge-crit" };

// One table on the Live Overview page.
export function TableCard({ table }) {
  const status = table.status || "SAFE";
  const critical = status === "CRITICAL";

  return (
    <Link to={`/tables/${table.id}`} className={`table-card ${critical ? "is-critical" : ""}`}>
      <div className="zone-hdr">
        <div>
          <div className="zone-name">{tableLabel(table)}</div>
          <div className="zone-node">{table.sensor_node_id}</div>
        </div>
        <span className={`badge ${table.is_online ? STATUS_BADGE[status] : "badge-neu"}`}>{table.is_online ? status : "OFFLINE"}</span>
      </div>

      {table.is_monitoring && (
        <div className="badge badge-warn table-card-monitoring">
          <i className="ti ti-clock-hour-3" /> Confirming critical ({table.confirmation_seconds}s)
        </div>
      )}

      <div className="db-readout">
        <div className={`db-val ${critical ? "crit-col" : ""}`}>{formatDb(table.current_db)}</div>
        <div className="db-lbl">
          {table.is_online ? "dB(A) live" : `dB(A) last reading - last seen ${formatTimeAgo(table.sensor_status?.last_seen)}`}
        </div>
      </div>

      <LedArray ledState={table.led_state} />

      <div className="table-card-stats">
        <span><span className="mini-label">24h avg</span> {formatDb(table.avg_db)}</span>
        <span><span className="mini-label">24h peak</span> {formatDb(table.peak_db)}</span>
      </div>

      <ClassificationChip classification={table.classification} confidence={table.confidence} critical={critical} />

      <div className="table-card-footer">
        <span>{table.occupant ? `Occupant: ${table.occupant.full_name}` : "No occupant"}</span>
        <span className={table.violation_count > 0 ? "alert-text" : ""}>{table.violation_count ?? 0} violation(s)</span>
      </div>
      {table.last_incident_at && <div className="table-card-footer muted">Last incident: {formatDateTime(table.last_incident_at)}</div>}
    </Link>
  );
}
