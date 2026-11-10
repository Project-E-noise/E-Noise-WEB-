import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { LedArray } from "../components/tables/LedArray";
import { ClassificationChip } from "../components/tables/ClassificationChip";
import { STATUS_BADGE } from "../components/tables/TableCard";
import { AsyncSection, LoadingState, ErrorState, EmptyState } from "../components/common/UiStates";
import { NoiseTrendChart } from "../components/analytics/Charts";
import { useTables, useTable, useTableReadings } from "../hooks/useTables";
import { useRealtime } from "../hooks/useRealtime";
import { tablesApi } from "../services/tables";
import { formatDb, formatDateTime, formatTime, tableLabel } from "../utils/formatting";
import { rangeParams } from "../utils/dates";

export default function TableMonitoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tablesQuery = useTables();
  const tables = tablesQuery.data?.tables ?? [];

  // /tables without an id: open the first table.
  useEffect(() => {
    if (!id && tables.length) navigate(`/tables/${tables[0].id}`, { replace: true });
  }, [id, navigate, tables]);

  return (
    <div className="page">
      <Topbar title="Table Monitoring" subtitle="One table in detail: sensor, LEDs, classification and today's trend" />

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

  useRealtime({
    fetcher: async () => {
      const [tableData, readingsData] = await Promise.all([tablesApi.get(id), tablesApi.readings(id, { ...rangeParams("today"), group: "minute" })]);
      return { tableData, readingsData };
    },
    onData: ({ tableData, readingsData }) => {
      tableQuery.setData(tableData);
      readingsQuery.setData(readingsData);
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
  const critical = table.status === "CRITICAL";

  return (
    <>
      <div className="detail-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{tableLabel(table)}</h2>
              <div className="card-sub mono">{table.sensor_node_id}{table.description ? ` - ${table.description}` : ""}</div>
            </div>
            <div className="row-inline">
              {table.is_online && <span className={`badge ${STATUS_BADGE[table.status]}`}>{table.status}</span>}
              <span className={`badge ${table.is_online ? "badge-safe" : "badge-neu"}`}>{table.is_online ? "Online" : "Offline"}</span>
            </div>
          </div>
          {table.is_monitoring && <div className="alert alert-info">Loud for a moment: confirming whether it lasts {table.confirmation_seconds} seconds...</div>}
          <LedArray ledState={table.led_state} large />
          <div className="stat-grid">
            <div className="mini-stat"><div className="mini-label">{table.is_online ? "Now" : "Last reading"}</div><div className="mini-value">{formatDb(table.current_db)}</div><div className="mini-unit">dB(A)</div></div>
            <div className="mini-stat"><div className="mini-label">24h avg</div><div className="mini-value">{formatDb(table.avg_db)}</div><div className="mini-unit">dB(A)</div></div>
            <div className="mini-stat"><div className="mini-label">24h peak</div><div className="mini-value">{formatDb(table.peak_db)}</div><div className="mini-unit">dB(A)</div></div>
          </div>
          <div className="muted-small">
            Thresholds: warning {table.warning_threshold} dB, critical {table.critical_threshold} dB, confirmed after {table.confirmation_seconds}s.
            Last seen {table.sensor_status?.last_seen ? formatDateTime(table.sensor_status.last_seen) : "never"}.
          </div>
        </section>

        <section className="card stack">
          <h2 className="card-title">Occupant and classification</h2>
          <ClassificationChip classification={table.classification} confidence={table.confidence} critical={critical} />
          <div className="divider" />
          <div>{table.occupant ? <>Assigned to <strong>{table.occupant.full_name}</strong></> : <span className="muted">No occupant assigned</span>}</div>
          <div className={table.violation_count > 0 ? "alert-text" : "muted-small"}>{table.violation_count} violation(s) on record for this occupant</div>
          {table.last_incident_at && <div className="muted-small">Last incident at this table: {formatDateTime(table.last_incident_at)}</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Noise today (1-minute averages)</h2>
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
