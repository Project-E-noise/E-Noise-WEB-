import { Link } from "react-router-dom";
import { LedArray } from "./LedArray";
import { ClassificationChip } from "./ClassificationChip";
import { ConfirmationProgress } from "./ConfirmationProgress";
import { secondsSince, useTick } from "../../hooks/useTick";
import { formatDateTime, formatDb, formatTimeAgo, tableLabel, DB_UNIT } from "../../utils/formatting";
import { STALE_AFTER_SECONDS } from "../../constants";

export const STATUS_BADGE = { SAFE: "badge-safe", WARNING: "badge-warn", CRITICAL: "badge-crit" };

// One table on the Live Overview page.
export function TableCard({ table }) {
  const now = useTick();
  const status = table.status || "SAFE";
  const critical = status === "CRITICAL";
  const violation = Boolean(table.led_state?.critical);
  const silentFor = secondsSince(table.sensor_status?.last_seen, now);
  // Online according to the server, but nothing for a few seconds.
  const stale = table.is_online && silentFor != null && silentFor >= STALE_AFTER_SECONDS;

  return (
    <Link to={`/tables/${table.id}`} className={`table-card ${critical ? "is-critical" : ""} ${violation ? "is-violation" : ""}`}>
      <div className="zone-hdr">
        <div>
          <div className="zone-name">{tableLabel(table)}</div>
          <div className="zone-node">{table.sensor_node_id}</div>
        </div>
        <div className="row-inline">
          {violation && <span className="badge badge-crit"><i className="ti ti-alert-octagon" aria-hidden="true" /> VIOLATION</span>}
          <span className={`badge ${table.is_online ? STATUS_BADGE[status] : "badge-neu"}`}>{table.is_online ? status : "OFFLINE"}</span>
        </div>
      </div>

      {table.is_monitoring && <ConfirmationProgress table={table} compact />}

      <div className="db-readout">
        <div className={`db-val ${critical ? "crit-col" : ""} ${stale ? "is-stale" : ""}`}>{formatDb(table.current_db)}</div>
        <div className="db-lbl">
          {!table.is_online
            ? `${DB_UNIT} last reading - last seen ${formatTimeAgo(table.sensor_status?.last_seen)}`
            : stale
              ? `${DB_UNIT} - no data for ${silentFor}s`
              : `${DB_UNIT} live`}
        </div>
      </div>

      <LedArray ledState={table.led_state} stale={stale || !table.is_online} />

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
