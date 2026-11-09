import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { Select, Input } from "../components/common/FormFields";
import { useTables } from "../hooks/useTables";
import { exportsApi } from "../services/exports";
import { rangeParams } from "../utils/dates";
import { useToast } from "../context/ToastContext";

const EXPORT_TYPES = [
  { key: "readings", icon: "ti-file-spreadsheet", iconClass: "ico-g", title: "Noise readings", desc: "Every dB reading from every table" },
  { key: "incidents", icon: "ti-file-alert", iconClass: "ico-r", title: "Incident logs", desc: "Incidents with categories, status and notes" },
  { key: "violations", icon: "ti-file-certificate", iconClass: "ico-b", title: "Occupant violations", desc: "Violation records tied to occupants" },
  { key: "tables", icon: "ti-file-settings", iconClass: "ico-pu", title: "Table configuration", desc: "Table numbers, node IDs and thresholds" }
];

export default function DataExport() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const tables = tablesQuery.data?.tables ?? [];
  const [custom, setCustom] = useState({ type: "readings", from: "", to: "", table_id: "", format: "csv" });
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState("");

  const runExport = async (key, type, params) => {
    setDownloading(key);
    try {
      await exportsApi[type](params);
      showToast("Download started");
    } catch (err) {
      showToast(err.message || "Export failed", "error");
    } finally {
      setDownloading(null);
    }
  };

  const runCustom = () => {
    if (custom.from && custom.to && custom.from > custom.to) return setError("The start date must be on or before the end date.");
    setError("");
    const dates = custom.type === "tables" ? {} : rangeParams("custom", custom);
    runExport("custom", custom.type, { ...dates, table_id: custom.table_id, format: custom.format });
  };

  const update = field => value => setCustom(p => ({ ...p, [field]: value }));

  return (
    <div className="page">
      <Topbar title="Data Export" subtitle="Download readings, incidents, violations and table settings" />
      <div className="two-grid">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Quick export (CSV, all data)</h2></div>
          {EXPORT_TYPES.map(item => (
            <div className="export-card" key={item.key}>
              <div className={`exp-ico ${item.iconClass}`}><i className={`ti ${item.icon}`} aria-hidden="true" /></div>
              <div>
                <div className="exp-title">{item.title}</div>
                <div className="exp-desc">{item.desc}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => runExport(item.key, item.key)} disabled={downloading === item.key}>
                <i className="ti ti-download" /> {downloading === item.key ? "Preparing..." : "Export"}
              </button>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-header"><h2 className="card-title">Custom export</h2></div>
          <Select label="Data" value={custom.type} onChange={update("type")} options={EXPORT_TYPES.map(t => ({ value: t.key, label: t.title }))} />
          {custom.type !== "tables" && (
            <div className="form-row">
              <Input label="From" type="date" value={custom.from} onChange={update("from")} max={custom.to || undefined} />
              <Input label="To" type="date" value={custom.to} onChange={update("to")} min={custom.from || undefined} error={error} />
            </div>
          )}
          <Select
            label="Table"
            value={custom.table_id}
            onChange={update("table_id")}
            options={[{ value: "", label: "All tables" }, ...tables.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))]}
          />
          <Select label="File format" value={custom.format} onChange={update("format")} options={[{ value: "csv", label: "CSV (Excel, Google Sheets)" }, { value: "json", label: "JSON" }]} />
          <button type="button" className="btn btn-primary btn-block" disabled={downloading === "custom"} onClick={runCustom}>
            <i className="ti ti-download" /> {downloading === "custom" ? "Preparing..." : "Download"}
          </button>
        </section>
      </div>
    </div>
  );
}
