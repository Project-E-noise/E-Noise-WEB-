import { useMemo, useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { IncidentTable } from "../components/incidents/IncidentTable";
import { IncidentModal } from "../components/incidents/IncidentModal";
import { ConfirmDialog } from "../components/common/Modal";
import { Select } from "../components/common/FormFields";
import { AsyncSection } from "../components/common/UiStates";
import { useIncidents } from "../hooks/useIncidents";
import { useTables } from "../hooks/useTables";
import { incidentsApi } from "../services/incidents";
import { exportsApi } from "../services/exports";
import { rangeParams } from "../utils/dates";
import { useToast } from "../context/ToastContext";

const RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
];

export default function IncidentLogs() {
  const [range, setRange] = useState("all");
  const [tableId, setTableId] = useState("");
  const params = useMemo(() => ({ ...rangeParams(range), table_id: tableId }), [range, tableId]);

  const incidentsQuery = useIncidents(params);
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const [modal, setModal] = useState({ open: false, incident: null });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const incidents = incidentsQuery.data?.incidents ?? [];
  const tables = tablesQuery.data?.tables ?? [];
  const count = word => incidents.filter(i => i.category.includes(word)).length;

  const save = async payload => {
    if (modal.incident) await incidentsApi.update(modal.incident.id, payload);
    else await incidentsApi.create(payload);
    showToast("Incident saved");
    setModal({ open: false, incident: null });
    incidentsQuery.reload();
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await incidentsApi.remove(confirmDelete.id);
      showToast("Incident deleted");
      incidentsQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not delete incident", "error");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const exportCsv = () => exportsApi.incidents(params).catch(err => showToast(err.message || "Export failed", "error"));

  return (
    <div className="page">
      <Topbar title="Incident Logs" subtitle="Confirmed and logged noise incidents">
        <button type="button" className="btn" onClick={exportCsv}><i className="ti ti-download" /> Export CSV</button>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ open: true, incident: null })} disabled={!tables.length}>
          <i className="ti ti-plus" /> Add incident
        </button>
      </Topbar>

      <div className="metrics-grid">
        <MetricCard label="Incidents shown" value={incidents.length} icon="ti-list" iconClass="ico-a" />
        <MetricCard label="Loud conversation" value={count("Conversation")} icon="ti-message-circle" iconClass="ico-r" />
        <MetricCard label="Mobile phone" value={count("Phone")} icon="ti-device-mobile" iconClass="ico-a" />
        <MetricCard label="Impact noise" value={count("Impact")} icon="ti-bolt" iconClass="ico-b" />
      </div>

      <div className="card card-flush">
        <div className="card-section">
          <div className="filter-bar">
            <Select label="Period" value={range} onChange={setRange} options={RANGES} />
            <Select label="Table" value={tableId} onChange={setTableId} options={[{ value: "", label: "All tables" }, ...tables.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))]} />
          </div>
        </div>
        <AsyncSection
          loading={incidentsQuery.loading}
          error={incidentsQuery.error}
          data={incidents}
          isEmpty={d => !d.length}
          onRetry={incidentsQuery.reload}
          loadingLabel="Loading incidents..."
          emptyProps={{ icon: "ti-mood-smile", title: "No incidents found", subtitle: "Nothing matches these filters. Confirmed incidents from the sensors appear here automatically." }}
        >
          {data => <IncidentTable incidents={data} onEdit={incident => setModal({ open: true, incident })} onDelete={setConfirmDelete} />}
        </AsyncSection>
      </div>

      <IncidentModal open={modal.open} tables={tables} initial={modal.incident} onClose={() => setModal({ open: false, incident: null })} onSubmit={save} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete incident"
        message={`Delete incident #${confirmDelete?.id}? Its violation (if any) is removed too. This cannot be undone.`}
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
