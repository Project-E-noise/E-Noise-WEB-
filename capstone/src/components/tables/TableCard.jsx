import { Link } from "react-router-dom";
import { LedArray } from "./LedArray";
import { formatDb, tableLabel } from "../../utils/formatting";

const STATUS_BADGE = { SAFE: "badge-safe", WARNING: "badge-warn", CRITICAL: "badge-crit", OFFLINE: "badge-neu" };

export function TableCard({ table }) {
  const status = (table.status || (table.is_online === false ? "OFFLINE" : "SAFE")).toUpperCase();
  const online = table.sensor_status?.is_online ?? table.is_online ?? false;

  return (
    <Link to={`/tables/${table.id}`} className="table-card">
      <div className="zone-hdr">
        <div>
          <div className="zone-name">{tableLabel(table)}</div>
          <div className="zone-node">{table.sensor_node_id || "No sensor node assigned"}</div>
        </div>
        <span className={`badge ${STATUS_BADGE[status] || "badge-neu"}`}>{online ? status : "OFFLINE"}</span>
      </div>

      {table.is_monitoring && (
        <div className="badge badge-warn table-card-monitoring">
          <i className="ti ti-clock-hour-3" /> Confirming critical ({table.confirmation_seconds}s window)
        </div>
      )}

      <div className="db-readout">
        <div className={`db-val ${status === "CRITICAL" ? "crit-col" : ""}`}>{formatDb(table.current_db ?? table.db_level)}</div>
        <div className="db-lbl">dB(A) - live</div>
      </div>

      <LedArray ledState={table.led_state} />

      <div className="table-card-stats">
        <div>
          <span className="mini-label">Avg</span> {formatDb(table.avg_db)} dB
        </div>
        <div>
          <span className="mini-label">Peak</span> {formatDb(table.peak_db)} dB
        </div>
      </div>

      <div className={`classify-chip ${status === "CRITICAL" ? "chip-crit" : ""}`}>
        <div className="chip-ico ico-g">
          <i className="ti ti-waveform" />
        </div>
        <div className="flex-1">
          <div className="chip-lbl">ML Classification</div>
          <div className="chip-val">{table.classification || "No reading yet"}</div>
          {table.confidence != null && <div className="chip-conf">Confidence: {Math.round(table.confidence <= 1 ? table.confidence * 100 : table.confidence)}%</div>}
        </div>
      </div>

      <div className="table-card-footer">
        <span>{table.occupant?.full_name ? `Occupant: ${table.occupant.full_name}` : "No occupant assigned"}</span>
        <span className={table.violation_count > 0 ? "zone-alert-text" : "muted-small"}>{table.violation_count ?? 0} violation(s)</span>
      </div>
      {table.last_incident_at && <div className="mono-muted">Last incident: {new Date(table.last_incident_at).toLocaleString()}</div>}
    </Link>
  );
}
