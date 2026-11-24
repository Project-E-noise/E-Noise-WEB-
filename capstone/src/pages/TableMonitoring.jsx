import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { LedArray } from "../components/tables/LedArray";
import { ClassificationChip } from "../components/tables/ClassificationChip";
import { ConfirmationProgress } from "../components/tables/ConfirmationProgress";
import { STATUS_BADGE } from "../components/tables/TableCard";
import { AsyncSection, LoadingState, ErrorState, EmptyState } from "../components/common/UiStates";
import { NoiseTrendChart } from "../components/analytics/Charts";
import { useTables, useTable, useTableReadings } from "../hooks/useTables";
import { useRealtime } from "../hooks/useRealtime";
import { useSystemStatus, MlServiceBadge } from "../hooks/useSystemStatus";
import { secondsSince, useTick } from "../hooks/useTick";
import { tablesApi } from "../services/tables";
import { formatDb, formatDateTime, formatTime, levelLabel, tableLabel, DB_UNIT } from "../utils/formatting";
import { READINGS_RETENTION_NOTE, STALE_AFTER_SECONDS } from "../constants";
import { rangeParams } from "../utils/dates";

export default function TableMonitoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tablesQuery = useTables();
  const systemStatus = useSystemStatus();
  const tables = tablesQuery.data?.tables ?? [];

  // /tables without an id: open the first table.
  const firstTableId = tables[0]?.id;
  useEffect(() => {
    if (!id && firstTableId) navigate(`/tables/${firstTableId}`, { replace: true });
  }, [id, navigate, firstTableId]);

  return (
    <div className="page">
      <Topbar title="Table Monitoring" subtitle="One table in detail: sensor, LEDs, classification and today's trend">
        <MlServiceBadge status={systemStatus} />
      </Topbar>

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        emptyProps={{ icon: "ti-table", title: "No tables configured yet", subtitle: "Add tables under Table Configuration first." }}
      >
        {list => (
          <div className="tabs" role="tablist" aria-label="Tables">
            {list.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={String(t.id) === String(id)} className={`tab ${String(t.id) === String(id) ? "active" : ""}`} onClick={() => navigate(`/tables/${t.id}`)}>
                Table {t.table_number}
              </button>
            ))}
          </div>
        )}
      </AsyncSection>

      {id && <TableDetail key={id} id={id} />}
    </div>
  );
}

function TableDetail({ id }) {
  // Readings since local midnight, averaged per minute (one reading per second is too many to draw).
  const [readingParams] = useState(() => ({ ...rangeParams("today"), group: "minute" }));
  const tableQuery = useTable(id);
  const readingsQuery = useTableReadings(id, readingParams);
  const now = useTick();

  // Live: table:update events are merged straight into the table state.
  // The chart is re-fetched once a minute (and on connect), not per reading.
  useRealtime({
    fetcher: async () => {
      const [tableData, readingsData] = await Promise.all([tablesApi.get(id), tablesApi.readings(id, { ...rangeParams("today"), group: "minute" })]);
      return { tableData, readingsData };
    },
    onData: ({ tableData, readingsData }) => {
      tableQuery.setData(tableData);
      readingsQuery.setData(readingsData);
    },
    onEvent: msg => {
      if (msg.type === "table:update" && String(msg.table.id) === String(id)) tableQuery.setData({ table: msg.table });
    }
  });

  if (tableQuery.loading && !tableQuery.data) return <LoadingState label="Loading table..." />;
  if (tableQuery.error) {
    return tableQuery.error.status === 404
      ? <EmptyState icon="ti-table-off" title="Table not found" subtitle="It may have been deleted. Pick another table above." />
      : <ErrorState message={tableQuery.error.message} onRetry={tableQuery.reload} />;
  }
  const table = tableQuery.data?.table;
  if (!table) return null;
  const readings = readingsQuery.data?.readings ?? [];
  const loud = table.status === "CRITICAL";
  const violation = Boolean(table.led_state?.critical);
  const silentFor = secondsSince(table.sensor_status?.last_seen, now);
  const stale = table.is_online && silentFor != null && silentFor >= STALE_AFTER_SECONDS;

  return (
    <>
      <div className="detail-grid">
        <section className={`card ${violation ? "is-violation" : ""}`}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{tableLabel(table)}</h2>
              <div className="card-sub mono">{table.sensor_node_id}{table.description ? ` - ${table.description}` : ""}</div>
            </div>
            <div className="row-inline">
              {violation && <span className="badge badge-crit"><i className="ti ti-alert-octagon" aria-hidden="true" /> VIOLATION</span>}
              {table.is_online && <span className={`badge ${STATUS_BADGE[table.status]}`}>{levelLabel(table.status)}</span>}
              <span className={`badge ${table.is_online ? "badge-safe" : "badge-neu"}`}>{table.is_online ? "Online" : "Offline"}</span>
              {table.configured_status === "PAUSED" && <span className="badge badge-neu">Paused</span>}
            </div>
          </div>
          {table.is_monitoring && <ConfirmationProgress table={table} />}
          {stale && <div className="alert alert-info" role="status">No data for {silentFor}s. The sensor is online but hasn't sent a reading.</div>}
          <LedArray ledState={table.led_state} large stale={stale || !table.is_online} />
          <div className="stat-grid">
            <div className="mini-stat"><div className="mini-label">{table.is_online ? "Now" : "Last reading"}</div><div className={`mini-value ${stale ? "is-stale" : ""}`}>{formatDb(table.current_db)}</div><div className="mini-unit">{DB_UNIT}</div></div>
            <div className="mini-stat"><div className="mini-label">24h avg</div><div className="mini-value">{formatDb(table.avg_db)}</div><div className="mini-unit">{DB_UNIT}</div></div>
            <div className="mini-stat"><div className="mini-label">24h peak</div><div className="mini-value">{formatDb(table.peak_db)}</div><div className="mini-unit">{DB_UNIT}</div></div>
          </div>
          <div className="muted-small">
            Thresholds: warning {table.warning_threshold} dB, critical {table.critical_threshold} dB, decided after {table.confirmation_seconds}s of sustained noise.
            Last seen {table.sensor_status?.last_seen ? formatDateTime(table.sensor_status.last_seen) : "never"}.
            {table.cooldown_until && <> Cooldown until {formatTime(table.cooldown_until)}.</>}
          </div>
        </section>

        <section className="card stack">
          <h2 className="card-title">Occupant and classification</h2>
          <ClassificationChip classification={table.classification} confidence={table.confidence} critical={loud} />
          <div className="divider" />
          <div>{table.occupant ? <>Assigned to <strong>{table.occupant.full_name}</strong></> : <span className="muted">No occupant assigned</span>}</div>
          <div className={table.violation_count > 0 ? "alert-text" : "muted-small"}>{table.violation_count} violation(s) on record for this occupant</div>
          {table.last_incident_at && <div className="muted-small">Last incident at this table: {formatDateTime(table.last_incident_at)}</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Noise today (1-minute averages)</h2>
            <div className="card-sub">{READINGS_RETENTION_NOTE} Chart refreshes every minute.</div>
          </div>
        </div>
        <AsyncSection
          loading={readingsQuery.loading}
          error={readingsQuery.error}
          data={readings}
          isEmpty={d => !d.length}
          onRetry={readingsQuery.reload}
          emptyProps={{ icon: "ti-chart-line", title: "No readings today", subtitle: "Readings appear here once the sensor sends data." }}
        >
          {data => (
            <NoiseTrendChart
              height="tall"
              labels={data.map(r => formatTime(r.recorded_at).replace(/:\d\d(?=\s|$)/, ""))}
              series={[{ label: tableLabel(table), values: data.map(r => r.db_level), color: "#0f6e56" }]}
            />
          )}
        </AsyncSection>
      </section>
    </>
  );
}
