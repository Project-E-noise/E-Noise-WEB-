import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { Select, Input } from "../components/common/FormFields";
import { useTables } from "../hooks/useTables";
import { exportsApi } from "../services/exports";
import { useToast } from "../context/ToastContext";

const EXPORT_TYPES = [
  { key: "readings", icon: "ti-file-spreadsheet", iconClass: "ico-g", title: "Historical Readings", desc: "All dB readings across every table" },
  { key: "incidents", icon: "ti-file-alert", iconClass: "ico-r", title: "Incident Logs", desc: "All confirmed incidents with categories and notes" },
  { key: "violations", icon: "ti-file-settings", iconClass: "ico-b", title: "Occupant Violations", desc: "Violation records tied to occupants" },
  { key: "tables", icon: "ti-file-zip", iconClass: "ico-pu", title: "Table Configurations", desc: "Table names, thresholds, sensor node IDs" }
];

export default function DataExport() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];
  const [custom, setCustom] = useState({ type: "readings", from: "", to: "", table_id: "", format: "csv" });
  const [downloading, setDownloading] = useState(null);

  const runExport = async (key, params) => {
    setDownloading(key);
    try {
      await exportsApi[key](params);
    } catch (err) {
      showToast(err.message || "Export failed", "error");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="page active">
      <Topbar title="Data Export" subtitle="Download historical readings, incidents, and table configurations" />
      <div className="two-grid">
        <div className="card">
          <div className="small-heading">Export options</div>
          {EXPORT_TYPES.map(item => (
            <div className="export-card" key={item.key}>
              <div className={`exp-ico ${item.iconClass}`}>
                <i className={`ti ${item.icon}`} />
              </div>
              <div>
                <div className="exp-title">{item.title}</div>
                <div className="exp-desc">{item.desc}</div>
              </div>
              <button className="btn push-right" onClick={() => runExport(item.key)} disabled={downloading === item.key}>
                <i className="ti ti-download" /> {downloading === item.key ? "Preparing..." : "Export"}
              </button>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="small-heading">Custom export</div>
          <Select label="Data type" value={custom.type} onChange={v => setCustom(p => ({ ...p, type: v }))} options={EXPORT_TYPES.map(t => ({ value: t.key, label: t.title }))} />
          <div className="form-row">
            <Input label="Date from" type="date" value={custom.from} onChange={v => setCustom(p => ({ ...p, from: v }))} />
            <Input label="Date to" type="date" value={custom.to} onChange={v => setCustom(p => ({ ...p, to: v }))} />
          </div>
          <Select label="Table filter" value={custom.table_id} onChange={v => setCustom(p => ({ ...p, table_id: v }))} options={[{ value: "", label: "All tables" }, ...tables.map(t => ({ value: t.id, label: `Table ${t.table_number}` }))]} />
          <Select label="File format" value={custom.format} onChange={v => setCustom(p => ({ ...p, format: v }))} options={[{ value: "csv", label: "CSV" }, { value: "json", label: "JSON" }, { value: "xlsx", label: "XLSX" }]} />
          <div className="divider" />
          <button
            className="btn btn-primary full center"
            disabled={downloading === "custom"}
            onClick={() => runExport(custom.type, { from: custom.from, to: custom.to, table_id: custom.table_id, format: custom.format })}
          >
            <i className="ti ti-download" /> {downloading === "custom" ? "Preparing..." : "Generate & Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
