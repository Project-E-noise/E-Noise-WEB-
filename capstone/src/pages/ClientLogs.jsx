import { PagedList } from "../components/common/PagedList";
import { clientApi } from "../services/client";
import { formatDateTime, formatDb } from "../utils/formatting";

const columns = [
  { key: "occurred_at", label: "Date", render: r => formatDateTime(r.occurred_at) },
  { key: "type", label: "Activity", render: r => (r.type === "session" ? "Table assignment" : "Incident") },
  { key: "table_name", label: "Table", render: r => `Table ${r.table_name}` },
  { key: "category", label: "Category", render: r => r.category || <span className="muted">--</span> },
  { key: "db_level", label: "dB", numeric: true, render: r => formatDb(r.db_level) },
  { key: "status", label: "Status", render: r => (r.status ? <span className={`badge ${r.status === "CONFIRMED" ? "badge-crit" : "badge-neu"}`}>{r.status}</span> : <span className="muted">--</span>) }
];

export default function ClientLogs() {
  return (
    <PagedList
      fetchPage={clientApi.logs}
      columns={columns}
      rowKey={(r, i) => `${r.type}-${r.occurred_at}-${i}`}
      emptyTitle="No activity found"
      loadingLabel="Loading your logs..."
      label="My activity"
    />
  );
}
