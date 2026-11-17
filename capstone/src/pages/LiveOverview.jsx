import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { TableCard } from "../components/tables/TableCard";
import { IncidentModal } from "../components/incidents/IncidentModal";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { useIncidents } from "../hooks/useIncidents";
import { useRealtime, mergeTable, prependIncident } from "../hooks/useRealtime";
import { useSystemStatus, MlServiceBadge } from "../hooks/useSystemStatus";
import { incidentsApi } from "../services/incidents";
import { tablesApi } from "../services/tables";
import { exportsApi } from "../services/exports";
import { formatDb, formatTime, DB_UNIT } from "../utils/formatting";
import { rangeParams } from "../utils/dates";
import { useToast } from "../context/ToastContext";
import { FILTERED_STATUSES } from "../constants";

// Live view of every table. Each WebSocket event is merged into the page
// state (no re-fetch per reading); everything is re-fetched once a minute
// and whenever the socket (re)connects.
export default function LiveOverview() {
  const [todayRange] = useState(() => rangeParams("today"));
  const tablesQuery = useTables();
  const incidentsQuery = useIncidents(todayRange);
  const systemStatus = useSystemStatus();
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
    },
    onEvent: msg => {
      if (msg.type === "table:update") tablesQuery.setData(prev => mergeTable(prev, msg.table));
      else if (msg.type === "incident:created" && new Date(msg.incident.occurred_at) >= new Date(todayRange.from)) {
        incidentsQuery.setData(prev => prependIncident(prev, msg.incident));
      }
      setLastUpdated(new Date());
    }
  });

  const tables = tablesQuery.data?.tables ?? [];
  const incidents = incidentsQuery.data?.incidents ?? [];
  const violationsToday = incidents.filter(i => i.status === "CONFIRMED").length;
  const filteredToday = incidents.filter(i => FILTERED_STATUSES.includes(i.status)).length;
  const withReading = tables.filter(t => t.current_db != null && t.is_online);
  const avgDb = withReading.length ? withReading.reduce((sum, t) => sum + Number(t.current_db), 0) / withReading.length : null;
  const online = tables.filter(t => t.is_online).length;
  const critical = tables.filter(t => t.led_state?.critical).length;

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
        <MlServiceBadge status={systemStatus} />
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

      <div className="metrics-grid metrics-grid-5">
        <MetricCard label="Average noise now" value={avgDb != null ? formatDb(avgDb) : "--"} unit={DB_UNIT} icon="ti-chart-bar" iconClass="ico-g" />
        <MetricCard label="Sensors online" value={tables.length ? `${online}/${tables.length}` : "--"} icon="ti-access-point" iconClass="ico-b" />
        <MetricCard label="Violations today" value={incidentsQuery.error ? "--" : violationsToday} icon="ti-alert-triangle" iconClass="ico-r" note="Confirmed only" />
        <MetricCard label="Filtered today" value={incidentsQuery.error ? "--" : filteredToday} icon="ti-filter" iconClass="ico-a" note="Loud, but not a violation" />
        <MetricCard label="Tables in violation" value={critical} icon="ti-bulb" iconClass="ico-r" />
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
