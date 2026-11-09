import { useEffect, useState } from "react";
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
import { useAsync } from "../hooks/useAsync";
import { occupantsApi } from "../services/occupants";
import { useToast } from "../context/ToastContext";

export default function Occupants() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // Wait until the user stops typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const occupantsQuery = useOccupants(query ? { q: query } : undefined);
  const tablesQuery = useTables();
  const { showToast } = useToast();

  const [editModal, setEditModal] = useState({ open: false, occupant: null });
  const [assignModal, setAssignModal] = useState({ open: false, occupant: null });
  const [violationsFor, setViolationsFor] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: "delete" | "lift", occupant }
  const [busy, setBusy] = useState(false);

  const occupants = occupantsQuery.data?.occupants ?? [];
  const tables = tablesQuery.data?.tables ?? [];

  const violationsQuery = useAsync(() => (violationsFor ? occupantsApi.violations(violationsFor.id) : Promise.resolve(null)), [violationsFor?.id]);

  const refresh = () => {
    occupantsQuery.reload();
    tablesQuery.reload();
  };

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
    refresh();
  };

  const release = async occupant => {
    try {
      await occupantsApi.release(occupant.id);
      showToast("Occupant released from table");
      refresh();
    } catch (err) {
      showToast(err.message || "Could not release occupant", "error");
    }
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm.type === "delete") {
        await occupantsApi.remove(confirm.occupant.id);
        showToast("Occupant deleted");
      } else {
        await occupantsApi.update(confirm.occupant.id, { status: "ACTIVE" });
        showToast("Ban lifted");
      }
      refresh();
    } catch (err) {
      showToast(err.message || "Something went wrong", "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="page">
      <Topbar title="Occupants" subtitle="Who sits where, and their violation record">
        <button type="button" className="btn btn-primary" onClick={() => setEditModal({ open: true, occupant: null })}>
          <i className="ti ti-plus" /> New occupant
        </button>
      </Topbar>

      <div className="card card-flush">
        <div className="card-section">
          <div className="filter-bar">
            <Input label="Search by name or email" type="search" value={search} onChange={setSearch} placeholder="Search to avoid duplicate records" />
          </div>
        </div>
        <AsyncSection
          loading={occupantsQuery.loading}
          error={occupantsQuery.error}
          data={occupants}
          isEmpty={d => !d.length}
          onRetry={occupantsQuery.reload}
          loadingLabel="Loading occupants..."
          emptyProps={query
            ? { icon: "ti-search", title: "No matches", subtitle: `Nobody matches "${query}".` }
            : { icon: "ti-users", title: "No occupants yet", subtitle: "Create an occupant record to assign them to a table." }}
        >
          {data => (
            <OccupantTable
              occupants={data}
              onAssign={o => setAssignModal({ open: true, occupant: o })}
              onRelease={release}
              onEdit={o => setEditModal({ open: true, occupant: o })}
              onDelete={o => setConfirm({ type: "delete", occupant: o })}
              onLiftBan={o => setConfirm({ type: "lift", occupant: o })}
              onViewViolations={setViolationsFor}
            />
          )}
        </AsyncSection>
      </div>

      <OccupantModal open={editModal.open} initial={editModal.occupant} onClose={() => setEditModal({ open: false, occupant: null })} onSubmit={saveOccupant} />
      <AssignModal open={assignModal.open} occupant={assignModal.occupant} tables={tables} onClose={() => setAssignModal({ open: false, occupant: null })} onSubmit={assign} />
      <ViolationHistoryModal
        open={!!violationsFor}
        occupant={violationsFor}
        violations={violationsQuery.data?.violations}
        loading={violationsQuery.loading}
        error={violationsQuery.error}
        onRetry={violationsQuery.reload}
        onClose={() => setViolationsFor(null)}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === "lift" ? "Lift ban" : "Delete occupant"}
        message={confirm?.type === "lift"
          ? `End ${confirm?.occupant.full_name}'s ban now? Their strikes stay at 0 and they can be assigned to a table again.`
          : `Delete ${confirm?.occupant.full_name}? Their violation history is deleted too. This cannot be undone.`}
        confirmLabel={confirm?.type === "lift" ? "Lift ban" : "Delete"}
        danger={confirm?.type !== "lift"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}
