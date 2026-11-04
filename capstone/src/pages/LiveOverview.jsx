import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { TableCard } from "../components/tables/TableCard";
import { IncidentModal } from "../components/incidents/IncidentModal";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { useIncidents } from "../hooks/useIncidents";
import { useRealtime } from "../hooks/useRealtime";
import { incidentsApi } from "../services/incidents";
import { tablesApi } from "../services/tables";
import { formatDb, formatTime } from "../utils/formatting";
import { useToast } from "../context/ToastContext";
import { exportsApi } from "../services/exports";

export default function LiveOverview() {
  const tablesQuery = useTables();
  const incidentsQuery = useIncidents({ range: "today" });
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();

  const { connected } = useRealtime({
    fetcher: async () => {
      const [tableData, incidentData] = await Promise.all([tablesApi.list(), incidentsApi.list({ range: "today" })]);
      return { tableData, incidentData };
    },
    onData: ({ tableData, incidentData }) => {
      tablesQuery.setData(tableData);
      incidentsQuery.setData(incidentData);
    }
  });

  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];
  const incidents = Array.isArray(incidentsQuery.data) ? incidentsQuery.data : incidentsQuery.data?.incidents ?? [];

  const avgDb = tables.length ? tables.reduce((sum, t) => sum + (Number(t.current_db) || 0), 0) / tables.length : null;
  const online = tables.filter(t => t.sensor_status?.is_online ?? t.is_online).length;
  const activeViolators = tables.filter(t => (t.violation_count ?? 0) > 0).length;

  const logIncident = async payload => {
    await incidentsApi.create(payload);
    showToast("Incident saved");
    setModalOpen(false);
    incidentsQuery.reload();
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([tablesQuery.reload(), incidentsQuery.reload()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="page active">
      <Topbar title="Live Overview" subtitle={`Last updated: ${formatTime(new Date())}`}>
        <span className={`badge ${connected ? "badge-safe" : "badge-neu"}`}>
          <i className={`ti ${connected ? "ti-plug-connected" : "ti-refresh"}`} /> {connected ? "Live" : "Polling"}
        </span>
        <button className="btn" onClick={refresh} disabled={refreshing}>
          <i className="ti ti-refresh" /> Refresh
        </button>
        <button className="btn" onClick={() => exportsApi.readings({ range: "today" }).catch(() => showToast("Export failed", "error"))}>
          <i className="ti ti-download" /> Export
        </button>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <i className="ti ti-plus" /> Log Incident
        </button>
      </Topbar>

      <div className="sec-label">Summary</div>
      <div className="metrics-grid">
        <MetricCard label="Average Noise Level" value={avgDb != null ? formatDb(avgDb) : "--"} unit="dB" icon="ti-chart-bar" iconClass="ico-g" />
        <MetricCard label="Tables Online" value={tables.length ? `${online}/${tables.length}` : "--"} icon="ti-table" iconClass="ico-b" />
        <MetricCard label="Incidents Today" value={incidents.length} icon="ti-alert-triangle" iconClass="ico-a" />
        <MetricCard label="Active Violators" value={activeViolators} icon="ti-bulb" iconClass="ico-r" />
      </div>

      <div className="sec-label">Table status</div>
      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        emptyProps={{ icon: "ti-table", title: "No tables configured yet", subtitle: "Add tables under Table Configuration to start monitoring." }}
      >
        {data => (
          <div className="tables-grid">
            {data.map(table => (
              <TableCard key={table.id} table={table} />
            ))}
          </div>
        )}
      </AsyncSection>

      <IncidentModal open={modalOpen} tables={tables} onClose={() => setModalOpen(false)} onSubmit={logIncident} />
    </div>
  );
}
