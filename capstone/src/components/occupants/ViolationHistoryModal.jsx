import { Modal } from "../common/Modal";
import { DataTable } from "../common/DataTable";
import { LoadingState, EmptyState, ErrorState } from "../common/UiStates";
import { formatDateTime, formatDb } from "../../utils/formatting";

export function ViolationHistoryModal({ open, occupant, violations, loading, error, onRetry, onClose }) {
  const columns = [
    { key: "violation_number", label: "#", render: v => <span className="mono">{v.violation_number}</span> },
    { key: "created_at", label: "Date", render: v => formatDateTime(v.created_at) },
    { key: "table_number", label: "Table", render: v => `Table ${v.table_number}` },
    { key: "category", label: "Category", render: v => v.category || "--" },
    { key: "db_level", label: "dB", numeric: true, render: v => formatDb(v.db_level) },
    { key: "incident_id", label: "Incident", render: v => <span className="mono">#{v.incident_id}</span> }
  ];

  return (
    <Modal open={open} title={`Violation history: ${occupant?.full_name || ""}`} subtitle="Every violation stays on record. Strikes reset after a ban ends." onClose={onClose} wide>
      {loading && <LoadingState label="Loading violation history..." />}
      {!loading && error && <ErrorState message={error.message} onRetry={onRetry} />}
      {!loading && !error && !violations?.length && <EmptyState icon="ti-shield-check" title="No violations on record" />}
      {!loading && !error && violations?.length > 0 && <DataTable columns={columns} rows={violations} caption="Violation history" />}
    </Modal>
  );
}
