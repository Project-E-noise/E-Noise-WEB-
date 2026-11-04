import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { IncidentTable } from "../components/incidents/IncidentTable";
import { IncidentModal } from "../components/incidents/IncidentModal";
import { ConfirmDialog } from "../components/common/Modal";
import { AsyncSection } from "../components/common/UiStates";
import { useIncidents } from "../hooks/useIncidents";
import { useTables } from "../hooks/useTables";
import { incidentsApi } from "../services/incidents";
import { exportsApi } from "../services/exports";
import { useToast } from "../context/ToastContext";

export default function IncidentLogs() {
  const incidentsQuery = useIncidents();
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const [modal, setModal] = useState({ open: false, incident: null });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const incidents = Array.isArray(incidentsQuery.data) ? incidentsQuery.data : incidentsQuery.data?.incidents ?? [];
  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];

  const counts = {
    convo: incidents.filter(i => i.category?.includes("Conversation")).length,
    phone: incidents.filter(i => i.category?.includes("Phone")).length,
    impact: incidents.filter(i => i.category?.includes("Impact")).length
  };

  const save = async payload => {
    if (modal.incident) await incidentsApi.update(modal.incident.id, payload);
    else await incidentsApi.create(payload);
    showToast("Incident saved");
    setModal({ open: false, incident: null });
    incidentsQuery.reload();
  };

  const remove = async () => {
    try {
      await incidentsApi.remove(confirmDelete.id);
      showToast("Incident removed");
      incidentsQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not delete incident", "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="page active">
      <Topbar title="Incident Logs" subtitle="Full CRUD management - confirmed violations and logged events">
        <button className="btn" onClick={() => exportsApi.incidents().catch(() => showToast("Export failed", "error"))}>
          <i className="ti ti-download" /> Export CSV
        </button>
        <button className="btn btn-primary" onClick={() => setModal({ open: true, incident: null })}>
          <i className="ti ti-plus" /> Add Incident
        </button>
      </Topbar>

      <div className="metrics-grid">
        <MetricCard label="Total incidents" value={incidents.length} icon="ti-list" iconClass="ico-a" />
        <MetricCard label="Loud conversation" value={counts.convo} icon="ti-microphone" iconClass="ico-r" />
        <MetricCard label="Mobile phone" value={counts.phone} icon="ti-device-mobile" iconClass="ico-a" />
        <MetricCard label="Impact noise" value={counts.impact} icon="ti-bolt" iconClass="ico-b" />
      </div>

      <AsyncSection
        loading={incidentsQuery.loading}
        error={incidentsQuery.error}
        data={incidents}
        isEmpty={() => false}
        onRetry={incidentsQuery.reload}
      >
        {data => <IncidentTable incidents={data} onEdit={incident => setModal({ open: true, incident })} onDelete={setConfirmDelete} />}
      </AsyncSection>

      <IncidentModal open={modal.open} tables={tables} initial={modal.incident} onClose={() => setModal({ open: false, incident: null })} onSubmit={save} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete incident"
        message={`Delete incident #${confirmDelete?.id}? This cannot be undone.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
