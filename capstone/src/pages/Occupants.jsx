import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { Input } from "../components/common/FormFields";
import { OccupantTable } from "../components/occupants/OccupantTable";
import { OccupantModal } from "../components/occupants/OccupantModal";
import { AssignModal } from "../components/occupants/AssignModal";
import { ViolationHistoryModal } from "../components/occupants/ViolationHistoryModal";
import { ConfirmDialog } from "../components/common/Modal";
import { AsyncSection } from "../components/common/UiStates";
import { useOccupants } from "../hooks/useOccupants";
import { useTables } from "../hooks/useTables";
import { occupantsApi } from "../services/occupants";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";

export default function Occupants() {
  const [search, setSearch] = useState("");
  const occupantsQuery = useOccupants(search ? { q: search } : undefined);
  const tablesQuery = useTables();
  const { showToast } = useToast();

  const [editModal, setEditModal] = useState({ open: false, occupant: null });
  const [assignModal, setAssignModal] = useState({ open: false, occupant: null });
  const [violationsFor, setViolationsFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const occupants = Array.isArray(occupantsQuery.data) ? occupantsQuery.data : occupantsQuery.data?.occupants ?? [];
  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];

  const violationsQuery = useAsync(
    () => (violationsFor ? occupantsApi.violations(violationsFor.id) : Promise.resolve(null)),
    [violationsFor?.id]
  );

  const saveOccupant = async payload => {
    if (editModal.occupant) await occupantsApi.update(editModal.occupant.id, payload);
    else await occupantsApi.create(payload);
    showToast("Occupant saved");
    setEditModal({ open: false, occupant: null });
    occupantsQuery.reload();
  };

  const assign = async tableId => {
    await occupantsApi.assign(assignModal.occupant.id, tableId);
    showToast("Occupant assigned to table");
    setAssignModal({ open: false, occupant: null });
    occupantsQuery.reload();
    tablesQuery.reload();
  };

  const release = async occupant => {
    try {
      await occupantsApi.release(occupant.id);
      showToast("Occupant released from table");
      occupantsQuery.reload();
      tablesQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not release occupant", "error");
    }
  };

  const remove = async () => {
    try {
      await occupantsApi.remove(confirmDelete.id);
      showToast("Occupant removed");
      occupantsQuery.reload();
    } catch (err) {
      showToast(err.message || "Could not delete occupant", "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="page active">
      <Topbar title="Occupants" subtitle="Administrator-assigned occupant identification and violation tracking">
        <button className="btn btn-primary" onClick={() => setEditModal({ open: true, occupant: null })}>
          <i className="ti ti-plus" /> New Occupant
        </button>
      </Topbar>

      <div className="card card-sm occupant-search">
        <Input label="Search occupants" value={search} onChange={setSearch} placeholder="Search by name to avoid duplicate records" />
      </div>

      <AsyncSection loading={occupantsQuery.loading} error={occupantsQuery.error} data={occupants} isEmpty={() => false} onRetry={occupantsQuery.reload}>
        {data => (
          <OccupantTable
            occupants={data}
            onAssign={o => setAssignModal({ open: true, occupant: o })}
            onRelease={release}
            onEdit={o => setEditModal({ open: true, occupant: o })}
            onDelete={setConfirmDelete}
            onViewViolations={setViolationsFor}
          />
        )}
      </AsyncSection>

      <OccupantModal open={editModal.open} initial={editModal.occupant} onClose={() => setEditModal({ open: false, occupant: null })} onSubmit={saveOccupant} />
      <AssignModal open={assignModal.open} occupant={assignModal.occupant} tables={tables} onClose={() => setAssignModal({ open: false, occupant: null })} onSubmit={assign} />
      <ViolationHistoryModal
        open={!!violationsFor}
        occupant={violationsFor}
        violations={Array.isArray(violationsQuery.data) ? violationsQuery.data : violationsQuery.data?.violations}
        loading={violationsQuery.loading}
        error={violationsQuery.error}
        onRetry={violationsQuery.reload}
        onClose={() => setViolationsFor(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete occupant"
        message={`Delete ${confirmDelete?.full_name}? This cannot be undone.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
