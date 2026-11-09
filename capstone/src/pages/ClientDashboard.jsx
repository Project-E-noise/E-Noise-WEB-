import { Link } from "react-router-dom";
import { AsyncSection, ErrorState, LoadingState } from "../components/common/UiStates";
import { DataTable } from "../components/common/DataTable";
import { useAsync } from "../hooks/useAsync";
import { clientApi } from "../services/client";
import { BAN_VIOLATION_THRESHOLD } from "../constants";
import { formatDateTime, formatDb } from "../utils/formatting";

const recentColumns = [
  { key: "when", label: "Date", render: r => formatDateTime(r.occurred_at || r.date) },
  { key: "table", label: "Table", render: r => `Table ${r.table_name}` },
  { key: "what", label: "Activity", render: r => (r.type === "session" ? "Table assignment" : r.category || r.noise_category || "Incident") },
  { key: "db", label: "dB", numeric: true, render: r => formatDb(r.db_level) }
];

function StandingCard({ query }) {
  if (query.loading && !query.data) return <section className="card"><LoadingState label="Loading your standing..." /></section>;
  if (query.error) return <section className="card"><ErrorState message={query.error.message} onRetry={query.reload} /></section>;
  const { current_violation_count: strikes, is_banned: banned, ban_until: banUntil } = query.data;
  return (
    <div className="two-grid">
      <section className="card">
        <div className="m-label">Current strikes</div>
        <div className="m-val">{strikes} <span className="m-unit">of {BAN_VIOLATION_THRESHOLD}</span></div>
        <div className="strike-meter" role="progressbar" aria-label="Current strikes" aria-valuemin={0} aria-valuemax={BAN_VIOLATION_THRESHOLD} aria-valuenow={strikes}>
          {Array.from({ length: BAN_VIOLATION_THRESHOLD }, (_, i) => <span key={i} className={i < strikes ? "is-filled" : ""} />)}
        </div>
        <p className="muted-small">{BAN_VIOLATION_THRESHOLD} confirmed strikes lead to a one-week ban. Strikes start again from 0 after a ban.</p>
      </section>
      <section className="card">
        <div className="m-label">Ban status</div>
        <div className="m-val">
          <span className={`badge ${banned ? "badge-crit" : "badge-safe"}`}>{banned ? "Banned" : "Clear"}</span>
        </div>
        <p className="muted-small mt-3">
          {banned ? `Your ban ends ${formatDateTime(banUntil)}.` : "You can be assigned to a table."}
        </p>
      </section>
    </div>
  );
}

function RecentPanel({ title, to, query }) {
  return (
    <section className="card card-flush">
      <div className="card-section row-between">
        <h2 className="card-title">{title}</h2>
        <Link to={to} className="btn btn-sm">View all</Link>
      </div>
      <AsyncSection
        loading={query.loading}
        error={query.error}
        data={query.data}
        isEmpty={d => !d.items.length}
        onRetry={query.reload}
        emptyProps={{ icon: "ti-mood-smile", title: "Nothing yet" }}
      >
        {data => <DataTable columns={recentColumns} rows={data.items} rowKey={(r, i) => i} caption={title} />}
      </AsyncSection>
    </section>
  );
}

export default function ClientDashboard() {
  const logs = useAsync(() => clientApi.logs({ limit: 5 }), []);
  const violations = useAsync(() => clientApi.violations({ limit: 5 }), []);
  return (
    <>
      <StandingCard query={violations} />
      <div className="two-grid">
        <RecentPanel title="Recent activity" to="/client/logs" query={logs} />
        <RecentPanel title="Recent violations" to="/client/violations" query={violations} />
      </div>
    </>
  );
}
