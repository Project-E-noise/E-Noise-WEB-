import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { LedArray } from "../components/tables/LedArray";
import { AsyncSection, LoadingState, ErrorState, EmptyState } from "../components/common/UiStates";
import { NoiseTrendChart } from "../components/analytics/Charts";
import { useTables, useTable, useTableReadings } from "../hooks/useTables";
import { useRealtime } from "../hooks/useRealtime";
import { tablesApi } from "../services/tables";
import { formatDb, formatDateTime, tableLabel } from "../utils/formatting";

export default function TableMonitoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tablesQuery = useTables();
  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];

  useRealtime({
    fetcher: () => tablesApi.list(),
    onData: data => tablesQuery.setData(data)
  });

  useEffect(() => {
    if (!id && tables.length) navigate(`/tables/${tables[0].id}`, { replace: true });
  }, [id, navigate, tables]);

  return (
    <div className="page active">
      <Topbar title="Table Monitoring" subtitle="Per-table deep dive - sensor node, classification, and incident history" />

      <AsyncSection loading={tablesQuery.loading} error={tablesQuery.error} data={tables} isEmpty={d => !d.length} onRetry={tablesQuery.reload} emptyProps={{ icon: "ti-table", title: "No tables configured yet" }}>
        {list => (
          <div className="zone-selector">
            {list.map(t => (
              <button key={t.id} className={`zone-tab ${String(t.id) === String(id) ? "active" : ""}`} onClick={() => navigate(`/tables/${t.id}`)}>
                Table {t.table_number}
              </button>
            ))}
          </div>
        )}
      </AsyncSection>

      {id && <TableDetail id={id} />}
    </div>
  );
}

function TableDetail({ id }) {
  const tableQuery = useTable(id);
  const readingsQuery = useTableReadings(id, { range: "today" });
  useRealtime({
    fetcher: async () => {
      const [tableData, readingsData] = await Promise.all([tablesApi.get(id), tablesApi.readings(id, { range: "today" })]);
      return { tableData, readingsData };
    },
    onData: ({ tableData, readingsData }) => {
      tableQuery.setData(tableData);
      readingsQuery.setData(readingsData);
    }
  });

  if (tableQuery.loading) return <LoadingState label="Loading table detail..." />;
  if (tableQuery.error) return <ErrorState message={tableQuery.error.message} onRetry={tableQuery.reload} />;
  const table = tableQuery.data?.table ?? tableQuery.data;
  if (!table) return <EmptyState icon="ti-table" title="Table not found" />;

  const readings = Array.isArray(readingsQuery.data) ? readingsQuery.data : readingsQuery.data?.readings ?? [];
  const online = table.sensor_status?.is_online ?? table.is_online;

  return (
    <>
      <div className="detail-grid">
        <div className="card">
          <div className="split-heading">
            <div>
              <div className="card-title-lg">{tableLabel(table)}</div>
              <div className="mono-muted">{table.sensor_node_id} - {table.description || "No description"}</div>
            </div>
            <span className={`badge ${online ? "badge-safe" : "badge-neu"}`}>{online ? "Online" : "Offline"}</span>
          </div>
          <LedArray ledState={table.led_state} large />
          <div className="stat-grid">
            <div className="mini-stat">
              <div className="mini-label">Current</div>
              <div className="mini-value">{formatDb(table.current_db)}</div>
              <div className="mini-unit">dB(A)</div>
            </div>
            <div className="mini-stat">
              <div className="mini-label">Average</div>
              <div className="mini-value">{formatDb(table.avg_db)}</div>
              <div className="mini-unit">dB(A)</div>
            </div>
            <div className="mini-stat">
              <div className="mini-label">Peak</div>
              <div className="mini-value">{formatDb(table.peak_db)}</div>
              <div className="mini-unit">dB(A)</div>
            </div>
          </div>
          <div className="mono-muted table-lastseen">Last seen: {formatDateTime(table.sensor_status?.last_seen)}</div>
        </div>

        <div className="card">
          <div className="small-heading">Occupant &amp; classification</div>
          <div className="classify-chip">
            <div className="chip-ico ico-g">
              <i className="ti ti-waveform" />
            </div>
            <div className="flex-1">
              <div className="chip-lbl">ML Classification</div>
              <div className="chip-val">{table.classification || "No reading yet"}</div>
              {table.confidence != null && <div className="chip-conf">Confidence: {Math.round(table.confidence <= 1 ? table.confidence * 100 : table.confidence)}%</div>}
            </div>
          </div>
          <div className="divider" />
          <div className="muted-small">{table.occupant?.full_name ? `Assigned to ${table.occupant.full_name}` : "No occupant currently assigned"}</div>
          <div className={table.violation_count > 0 ? "zone-alert-text" : "muted-small"}>{table.violation_count ?? 0} violation(s) on record</div>
        </div>
      </div>

      <div className="card">
        <div className="small-heading">{tableLabel(table)} - dB trend today</div>
        <AsyncSection loading={readingsQuery.loading} error={readingsQuery.error} data={readings} isEmpty={d => !d.length} onRetry={readingsQuery.reload} emptyProps={{ icon: "ti-chart-line", title: "No readings yet" }}>
          {data => <NoiseTrendChart labels={data.map(r => formatDateTime(r.recorded_at))} series={[{ label: tableLabel(table), values: data.map(r => r.db_level), color: "#0F6E56" }]} />}
        </AsyncSection>
      </div>
    </>
  );
}
