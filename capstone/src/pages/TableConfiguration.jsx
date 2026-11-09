import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { Input, Select } from "../components/common/FormFields";
import { ConfirmDialog } from "../components/common/Modal";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { tablesApi } from "../services/tables";
import { duplicateTableIssue, sensorNodeIssue, tableNumberIssue } from "../utils/validation";
import { TABLE_STATUSES } from "../constants";
import { useToast } from "../context/ToastContext";

const NEW_TABLE = { table_number: "", sensor_node_id: "", description: "" };

function checkTable(tables, form, excludeId) {
  const errors = {};
  const numberIssue = tableNumberIssue(form.table_number);
  if (numberIssue) errors.table_number = numberIssue;
  const nodeIssue = sensorNodeIssue(form.sensor_node_id);
  if (nodeIssue) errors.sensor_node_id = nodeIssue;
  if (String(form.description || "").length > 500) errors.description = "Description must be 500 characters or fewer.";
  if (!errors.table_number && !errors.sensor_node_id) {
    const dup = duplicateTableIssue(tables, { tableNumber: form.table_number, sensorNodeId: form.sensor_node_id, excludeId });
    if (dup) errors[dup.includes("number") ? "table_number" : "sensor_node_id"] = dup;
  }
  return errors;
}

function TableEditor({ table, tables, onSaved, onDelete }) {
  const [form, setForm] = useState({
    table_number: String(table.table_number),
    sensor_node_id: table.sensor_node_id,
    description: table.description || "",
    status: table.configured_status
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const update = field => value => setForm(prev => ({ ...prev, [field]: value }));

  const save = async e => {
    e.preventDefault();
    const found = checkTable(tables, form, table.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await tablesApi.update(table.id, { ...form, table_number: Number(form.table_number), sensor_node_id: form.sensor_node_id.trim() });
      showToast("Table updated");
      onSaved();
    } catch (err) {
      showToast(err.message || "Could not update this table", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={save} noValidate>
      <div className="card-header">
        <h2 className="card-title">Table {table.table_number}</h2>
        <span className={`badge ${form.status === "AVAILABLE" || form.status === "OCCUPIED" ? "badge-safe" : "badge-neu"}`}>{form.status}</span>
      </div>
      <div className="form-row">
        <Input label="Table number" type="number" inputMode="numeric" min="1" value={form.table_number} onChange={update("table_number")} error={errors.table_number} />
        <Input label="Sensor node ID" value={form.sensor_node_id} onChange={update("sensor_node_id")} error={errors.sensor_node_id} />
      </div>
      <Input label="Description" value={form.description} onChange={update("description")} error={errors.description} maxLength={500} />
      <Select label="Status" value={form.status} onChange={update("status")} options={TABLE_STATUSES} />
      <div className="form-actions">
        <button type="button" className="btn btn-danger" onClick={() => onDelete(table)}><i className="ti ti-trash" /> Delete</button>
        <button className="btn btn-primary" disabled={saving}><i className="ti ti-device-floppy" /> {saving ? "Saving..." : "Save"}</button>
      </div>
    </form>
  );
}

export default function TableConfiguration() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const [newTable, setNewTable] = useState(NEW_TABLE);
  const [newErrors, setNewErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const tables = tablesQuery.data?.tables ?? [];

  const create = async e => {
    e.preventDefault();
    const found = checkTable(tables, newTable);
    setNewErrors(found);
    if (Object.keys(found).length) return;
    setCreating(true);
    try {
      await tablesApi.create({ ...newTable, table_number: Number(newTable.table_number), sensor_node_id: newTable.sensor_node_id.trim() });
      showToast("Table created");
      setNewTable(NEW_TABLE);
      tablesQuery.reload();
    } catch (err) {
      setNewErrors({ form: err.message || "Could not create this table." });
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await tablesApi.remove(confirmDelete.id);
      showToast("Table deleted");
      tablesQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not delete this table", "error");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="page">
      <Topbar title="Table Configuration" subtitle="Add, edit and remove tables and their sensor nodes" />

      <form className="card" onSubmit={create} noValidate>
        <div className="card-header">
          <div>
            <h2 className="card-title">Add a table</h2>
            <div className="card-sub">The sensor node ID must match NODE_ID in the ESP32 firmware.</div>
          </div>
        </div>
        <div className="form-row">
          <Input label="Table number" type="number" inputMode="numeric" min="1" value={newTable.table_number} onChange={v => setNewTable(p => ({ ...p, table_number: v }))} placeholder="e.g. 8" error={newErrors.table_number} />
          <Input label="Sensor node ID" value={newTable.sensor_node_id} onChange={v => setNewTable(p => ({ ...p, sensor_node_id: v }))} placeholder="e.g. NODE-008" error={newErrors.sensor_node_id} />
        </div>
        <Input label="Description (optional)" value={newTable.description} onChange={v => setNewTable(p => ({ ...p, description: v }))} placeholder="Where the table is" error={newErrors.description} maxLength={500} />
        {newErrors.form && <div className="form-error" role="alert">{newErrors.form}</div>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={creating}><i className="ti ti-plus" /> {creating ? "Creating..." : "Create table"}</button>
        </div>
      </form>

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        emptyProps={{ icon: "ti-table", title: "No tables yet", subtitle: "Use the form above to add the first table." }}
      >
        {data => (
          <div className="auto-grid">
            {data.map(table => (
              <TableEditor key={`${table.id}-${table.updated_at}`} table={table} tables={data} onSaved={tablesQuery.reload} onDelete={setConfirmDelete} />
            ))}
          </div>
        )}
      </AsyncSection>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete table"
        message={`Delete Table ${confirmDelete?.table_number}? Its readings, incidents and violations are deleted too. This cannot be undone.`}
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
