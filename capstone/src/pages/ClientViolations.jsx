import { PagedList } from "../components/common/PagedList";
import { clientApi } from "../services/client";
import { formatDateTime, formatDb } from "../utils/formatting";

const columns = [
  { key: "violation_number", label: "#", render: r => <span className="mono">{r.violation_number}</span> },
  { key: "date", label: "Date", render: r => formatDateTime(r.date) },
  { key: "table_name", label: "Table", render: r => `Table ${r.table_name}` },
  { key: "noise_category", label: "Noise category", render: r => r.noise_category || "--" },
  { key: "db_level", label: "dB", numeric: true, render: r => formatDb(r.db_level) }
];

export default function ClientViolations() {
  return (
    <PagedList
      fetchPage={clientApi.violations}
      columns={columns}
      rowKey={r => `${r.violation_number}-${r.date}`}
      emptyTitle="No violations found"
      loadingLabel="Loading your violations..."
      label="My violations"
    />
  );
}
