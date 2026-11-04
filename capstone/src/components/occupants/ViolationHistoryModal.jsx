import { Modal } from "../common/Modal";
import { LoadingState, EmptyState, ErrorState } from "../common/UiStates";
import { formatDateTime } from "../../utils/formatting";

export function ViolationHistoryModal({ open, occupant, violations, loading, error, onRetry, onClose }) {
  if (!open) return null;
  return (
    <Modal open={open} title={`Violation history - ${occupant?.full_name || ""}`} onClose={onClose} wide>
      {loading && <LoadingState label="Loading violation history..." />}
      {!loading && error && <ErrorState message={error.message} onRetry={onRetry} />}
      {!loading && !error && (!violations || !violations.length) && <EmptyState icon="ti-shield-check" title="No violations on record" />}
      {!loading && !error && violations && violations.length > 0 && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Incident</th>
                <th>Table</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {violations.map(v => (
                <tr key={v.id}>
                  <td className="mono-cell">{v.violation_number}</td>
                  <td className="mono-cell dark">#{v.incident_id}</td>
                  <td className="muted-small">Table {v.table_id}</td>
                  <td className="mono-cell dark">{formatDateTime(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
