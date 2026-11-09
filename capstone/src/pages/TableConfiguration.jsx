import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { Input, Select } from "../components/common/FormFields";
import { ConfirmDialog } from "../components/common/Modal";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { tablesApi } from "../services/tables";
import { duplicateTableIssue } from "../utils/validation";
import { TABLE_STATUSES } from "../constants";
import { useToast } from "../context/ToastContext";

const NEW_TABLE = { table_number: "", sensor_node_id: "", description: "", status: "AVAILABLE", warning_threshold: 50, critical_threshold: 60, confirmation_seconds: 10 };

export default function TableConfiguration() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const [newTable, setNewTable] = useState(NEW_TABLE);
  const [drafts, setDrafts] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [formError, setFormError] = useState(null);

  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];
  // Table summaries expose live SAFE/WARNING/CRITICAL as `status`; this form edits the persisted table status instead.
  const draftFor = t => drafts[t.id] ?? { ...t, status: t.configured_status ?? "AVAILABLE" };
  const updateDraft = (id, field, value) => setDrafts(prev => ({ ...prev, [id]: { ...draftFor(tables.find(t => t.id === id)), ...prev[id], [field]: value } }));

  const create = async () => {
    if (!newTable.table_number || !newTable.sensor_node_id) return setFormError("Table number and sensor node ID are required.");
    const issue = duplicateTableIssue(tables, { tableNumber: newTable.table_number, sensorNodeId: newTable.sensor_node_id });
    if (issue) return setFormError(issue);
    setFormError(null);
    try {
      await tablesApi.create(newTable);
      showToast("Table created");
      setNewTable(NEW_TABLE);
      tablesQuery.reload();
    } catch (err) {
      setFormError(err.message || "Could not create this table.");
    }
  };

  const update = async table => {
    const draft = draftFor(table);
    const issue = duplicateTableIssue(tables, { tableNumber: draft.table_number, sensorNodeId: draft.sensor_node_id, excludeId: table.id });
    if (issue) return showToast(issue, "error");
    try {
      await tablesApi.update(table.id, draft);
      showToast("Table updated");
      tablesQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not update this table", "error");
    }
  };

  const remove = async () => {
    try {
      await tablesApi.remove(confirmDelete.id);
      showToast("Table removed");
      tablesQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not delete this table", "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="page active">
      <Topbar title="Table Configuration" subtitle="Create, update, and manage table definitions - CRUD" />

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={() => false}
        onRetry={tablesQuery.reload}
      >
        {data => (
          <div className="zones-config-grid">
            {data.map(table => (
              <div className="card" key={table.id}>
                <div className="split-heading compact">
                  <div className="small-heading no-margin">Table {table.table_number}</div>
                  <span className={`badge ${draftFor(table).status === "OFFLINE" ? "badge-neu" : "badge-safe"}`}>{draftFor(table).status}</span>
                </div>
                <div className="mono-muted form-intro">Sensor Node ID: {table.sensor_node_id}</div>
                <Input label="Table number" value={draftFor(table).table_number} onChange={v => updateDraft(table.id, "table_number", v)} />
                <Input label="Sensor node ID" value={draftFor(table).sensor_node_id} onChange={v => updateDraft(table.id, "sensor_node_id", v)} />
                <Input label="Description" value={draftFor(table).description || ""} onChange={v => updateDraft(table.id, "description", v)} />
                <Select label="Status" value={draftFor(table).status} onChange={v => updateDraft(table.id, "status", v)} options={TABLE_STATUSES} />
                <div className="divider" />
                <div className="row-inline stretch">
                  <button className="btn grow center" onClick={() => update(table)}>
                    <i className="ti ti-edit" /> Update
                  </button>
                  <button className="btn btn-danger center" onClick={() => setConfirmDelete(table)}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AsyncSection>

      <div className="card">
        <div className="small-heading">Add new table</div>
        <div className="muted-small form-intro">Research scope is fixed to approximately 7 tables on Studify's 2nd floor.</div>
        <div className="form-row">
          <Input label="Table number" value={newTable.table_number} onChange={v => setNewTable(p => ({ ...p, table_number: v }))} placeholder="e.g. 8" />
          <Input label="Sensor Node ID" value={newTable.sensor_node_id} onChange={v => setNewTable(p => ({ ...p, sensor_node_id: v }))} placeholder="e.g. NODE-008" />
        </div>
        <Input label="Description" value={newTable.description} onChange={v => setNewTable(p => ({ ...p, description: v }))} placeholder="Brief description of the physical location" />
        {formError && <div className="form-error">{formError}</div>}
        <button className="btn btn-primary" onClick={create}>
          <i className="ti ti-plus" /> Create table
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete table"
        message={`Delete Table ${confirmDelete?.table_number}? This cannot be undone.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
