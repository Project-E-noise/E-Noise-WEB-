import { useMemo, useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { IncidentTable } from "../components/incidents/IncidentTable";
import { IncidentModal } from "../components/incidents/IncidentModal";
import { ConfirmViolationModal } from "../components/incidents/ConfirmViolationModal";
import { ConfirmDialog } from "../components/common/Modal";
import { Select } from "../components/common/FormFields";
import { AsyncSection } from "../components/common/UiStates";
import { useIncidents } from "../hooks/useIncidents";
import { useTables } from "../hooks/useTables";
import { incidentsApi } from "../services/incidents";
import { exportsApi } from "../services/exports";
import { rangeParams } from "../utils/dates";
import { useToast } from "../context/ToastContext";
import { FILTERED_STATUSES } from "../constants";

const RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
];

// Violations = CONFIRMED (strikes). Filtered = loud events the server did
// not confirm (IGNORED: not a violation sound / paused table; UNVERIFIED:
// no usable label), kept for review. Dismissed = reviewed, not a violation.
const TABS = [
  { key: "violations", label: "Violations", statuses: ["CONFIRMED"] },
  { key: "filtered", label: "Filtered", statuses: FILTERED_STATUSES },
  { key: "dismissed", label: "Dismissed", statuses: ["DISMISSED"] }
];

const startOfToday = () => rangeParams("today").from;

export default function IncidentLogs() {
  const [range, setRange] = useState("all");
  const [tableId, setTableId] = useState("");
  const [tab, setTab] = useState("violations");
  const params = useMemo(() => ({ ...rangeParams(range), table_id: tableId }), [range, tableId]);

  const incidentsQuery = useIncidents(params);
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const [modal, setModal] = useState({ open: false, incident: null });
  const [confirmViolation, setConfirmViolation] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const incidents = incidentsQuery.data?.incidents ?? [];
  const tables = tablesQuery.data?.tables ?? [];
  const confirmed = incidents.filter(i => i.status === "CONFIRMED");
  // Exact category match (no substring matching).
  const count = category => confirmed.filter(i => i.category === category).length;
  const today = startOfToday();
  const filteredToday = incidents.filter(i => FILTERED_STATUSES.includes(i.status) && i.occurred_at >= today).length;
  const tabCounts = Object.fromEntries(TABS.map(t => [t.key, incidents.filter(i => t.statuses.includes(i.status)).length]));
  // MONITORING rows (manual/legacy) are shown with the violations tab.
  const activeTab = TABS.find(t => t.key === tab);
  const shown = incidents.filter(i => activeTab.statuses.includes(i.status) || (tab === "violations" && i.status === "MONITORING"));

  const save = async payload => {
    if (modal.incident) await incidentsApi.update(modal.incident.id, payload);
    else await incidentsApi.create(payload);
    showToast("Incident saved");
    setModal({ open: false, incident: null });
    incidentsQuery.reload();
  };

  // "Confirm as violation": the admin picked a violation category.
  const confirmAsViolation = async (incident, category) => {
    await incidentsApi.update(incident.id, { status: "CONFIRMED", category });
    showToast("Confirmed as a violation");
    setConfirmViolation(null);
    incidentsQuery.reload();
  };

  // "Keep ignored": reviewed and agreed with the filter. The row moves to
  // Dismissed so the Filtered tab only holds events still to review.
  const keepIgnored = async incident => {
    setBusyId(incident.id);
    try {
      await incidentsApi.update(incident.id, { status: "DISMISSED", notes: incident.notes ? `${incident.notes}\nReviewed: kept ignored.` : "Reviewed: kept ignored." });
      showToast("Kept as not a violation");
      incidentsQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not update incident", "error");
    } finally {
      setBusyId(null);
    }
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

  const emptyProps = {
    violations: { icon: "ti-mood-smile", title: "No violations found", subtitle: "Confirmed violations from the sensors appear here automatically." },
    filtered: { icon: "ti-filter", title: "Nothing to review", subtitle: "Loud events that were not a violation sound (door slams, coughs, typing...) or had no usable label appear here." },
    dismissed: { icon: "ti-check", title: "Nothing dismissed", subtitle: "Incidents an admin reviewed and dismissed appear here." }
  }[tab];

  return (
    <div className="page">
      <Topbar title="Incident Logs" subtitle="Confirmed violations, filtered loud events, and dismissed incidents">
        <button type="button" className="btn" onClick={exportCsv}><i className="ti ti-download" /> Export CSV</button>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ open: true, incident: null })} disabled={!tables.length}>
          <i className="ti ti-plus" /> Add incident
        </button>
      </Topbar>

      <div className="metrics-grid metrics-grid-5">
        <MetricCard label="Violations shown" value={confirmed.length} icon="ti-list" iconClass="ico-a" note="Confirmed only" />
        <MetricCard label="Loud conversation" value={count("Loud Conversation")} icon="ti-message-circle" iconClass="ico-r" />
        <MetricCard label="Mobile phone" value={count("Mobile Phone Noise")} icon="ti-device-mobile" iconClass="ico-a" />
        <MetricCard label="Music" value={count("Music")} icon="ti-music" iconClass="ico-b" />
        <MetricCard label="Filtered today" value={filteredToday} icon="ti-filter" iconClass="ico-g" note="Loud, but not a violation" />
      </div>

      <div className="card card-flush">
        <div className="card-section">
          <div className="tabs" role="tablist" aria-label="Incident types">
            {TABS.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="tab-count">{tabCounts[t.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card-section">
          <div className="filter-bar">
            <Select label="Period" value={range} onChange={setRange} options={RANGES} />
            <Select label="Table" value={tableId} onChange={setTableId} options={[{ value: "", label: "All tables" }, ...tables.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))]} />
          </div>
        </div>
        <AsyncSection
          loading={incidentsQuery.loading}
          error={incidentsQuery.error}
          data={shown}
          isEmpty={d => !d.length}
          onRetry={incidentsQuery.reload}
          loadingLabel="Loading incidents..."
          emptyProps={emptyProps}
        >
          {data => (
            <IncidentTable
              incidents={data}
              mode={tab}
              busyId={busyId}
              onEdit={incident => setModal({ open: true, incident })}
              onDelete={setConfirmDelete}
              onConfirm={setConfirmViolation}
              onKeepIgnored={keepIgnored}
            />
          )}
        </AsyncSection>
      </div>

      <IncidentModal open={modal.open} tables={tables} initial={modal.incident} onClose={() => setModal({ open: false, incident: null })} onSubmit={save} />
      <ConfirmViolationModal incident={confirmViolation} onClose={() => setConfirmViolation(null)} onConfirm={confirmAsViolation} />
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
