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
import { exportsApi } from "../services/exports";
import { formatDb, formatTime } from "../utils/formatting";
import { rangeParams } from "../utils/dates";
import { useToast } from "../context/ToastContext";

// Live view of every table. Updates arrive over the WebSocket (with
// polling as a fallback), the same way as the Real-Time Feed page.
export default function LiveOverview() {
  const [todayRange] = useState(() => rangeParams("today"));
  const tablesQuery = useTables();
  const incidentsQuery = useIncidents(todayRange);
  const [modalOpen, setModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  const { connected } = useRealtime({
    fetcher: async () => {
      const [tableData, incidentData] = await Promise.all([tablesApi.list(), incidentsApi.list(rangeParams("today"))]);
      return { tableData, incidentData };
    },
    onData: ({ tableData, incidentData }) => {
      tablesQuery.setData(tableData);
      incidentsQuery.setData(incidentData);
      setLastUpdated(new Date());
    }
  });

  const tables = tablesQuery.data?.tables ?? [];
  const incidents = incidentsQuery.data?.incidents ?? [];
  const withReading = tables.filter(t => t.current_db != null);
  const avgDb = withReading.length ? withReading.reduce((sum, t) => sum + Number(t.current_db), 0) / withReading.length : null;
  const online = tables.filter(t => t.is_online).length;
  const critical = tables.filter(t => t.status === "CRITICAL").length;

  const logIncident = async payload => {
    await incidentsApi.create(payload);
    showToast("Incident saved");
    setModalOpen(false);
    incidentsQuery.reload();
    tablesQuery.reload();
  };

  const refresh = async () => {
    await Promise.all([tablesQuery.reload(), incidentsQuery.reload()]);
    setLastUpdated(new Date());
  };

  const exportToday = async () => {
    setExporting(true);
    try {
      await exportsApi.readings(rangeParams("today"));
    } catch (err) {
      showToast(err.message || "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <Topbar title="Live Overview" subtitle={`Last updated ${formatTime(lastUpdated)}`}>
        <span className={`badge ${connected ? "badge-safe" : "badge-neu"}`} title={connected ? "Receiving live updates" : "Live connection down, refreshing every few seconds"}>
          <i className={`ti ${connected ? "ti-plug-connected" : "ti-refresh"}`} /> {connected ? "Live" : "Polling"}
        </span>
        <button type="button" className="btn" onClick={refresh} disabled={tablesQuery.loading}>
          <i className="ti ti-refresh" /> Refresh
        </button>
        <button type="button" className="btn" onClick={exportToday} disabled={exporting}>
          <i className="ti ti-download" /> {exporting ? "Exporting..." : "Export today"}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={!tables.length}>
          <i className="ti ti-plus" /> Log incident
        </button>
      </Topbar>

      <div className="metrics-grid">
        <MetricCard label="Average noise now" value={avgDb != null ? formatDb(avgDb) : "--"} unit="dB" icon="ti-chart-bar" iconClass="ico-g" />
        <MetricCard label="Sensors online" value={tables.length ? `${online}/${tables.length}` : "--"} icon="ti-access-point" iconClass="ico-b" />
        <MetricCard label="Incidents today" value={incidentsQuery.error ? "--" : incidents.length} icon="ti-alert-triangle" iconClass="ico-a" />
        <MetricCard label="Tables at critical" value={critical} icon="ti-bulb" iconClass="ico-r" />
      </div>

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        loadingLabel="Loading tables..."
        emptyProps={{ icon: "ti-table", title: "No tables configured yet", subtitle: "Add tables under Table Configuration to start monitoring." }}
      >
        {data => (
          <div className="tables-grid">
            {data.map(table => <TableCard key={table.id} table={table} />)}
          </div>
        )}
      </AsyncSection>

      <IncidentModal open={modalOpen} tables={tables} onClose={() => setModalOpen(false)} onSubmit={logIncident} />
    </div>
  );
}
