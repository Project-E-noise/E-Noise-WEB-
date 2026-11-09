import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AsyncSection, EmptyState } from "../components/common/UiStates";
import { clientApi } from "../services/client";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function RecentRows({ items, dateField, categoryField, empty }) {
  if (!items.length) return <EmptyState title={empty} />;

  return <>
    <div className="client-list-head" aria-hidden="true">
      <span>Date / table</span><span>Activity</span><span>Reading / status</span>
    </div>
    <ul className="client-list-rows">
      {items.slice(0, 5).map((row, index) => {
        const activity = row[categoryField] || row.type || row.category || "Activity";
        const date = row[dateField] || row.occurred_at || row.date;
        return <li className="client-list-row" key={`${date || "row"}-${row.table_name || "activity"}-${row.violation_number ?? index}`}>
          <div className="client-list-primary">
            <strong>{row.table_name ? `Table ${row.table_name}` : "Activity"}</strong>
            <time dateTime={date || undefined}>{formatDate(date)}</time>
          </div>
          <span className="client-list-category">{activity === "session" ? "Table assignment" : activity}</span>
          <div className="client-list-meta">
            {row.db_level != null && <span className="client-db-value">{Number(row.db_level).toFixed(1)} dB</span>}
            {row.status && <span className={`client-row-status${String(row.status).toLowerCase() === "confirmed" ? " is-alert" : ""}`}>{row.status}</span>}
          </div>
        </li>;
      })}
    </ul>
  </>;
}

function RecentPanel({ title, to, items, dateField, categoryField, empty, loading, error, onRetry }) {
  return <section className="card client-dashboard-panel">
    <div className="client-panel-header">
      <h2>{title}</h2>
      <Link className="client-view-all" to={to}>View all</Link>
    </div>
    <AsyncSection
      loading={loading}
      error={error}
      data={items}
      onRetry={onRetry}
      loadingLabel={`Loading ${title.toLowerCase()}…`}
    >
      {data => <RecentRows items={data.items || []} dateField={dateField} categoryField={categoryField} empty={empty} />}
    </AsyncSection>
  </section>;
}

export default function ClientDashboard() {
  const [logs, setLogs] = useState(null), [violations, setViolations] = useState(null);
  const [logsError, setLogsError] = useState(null), [violationsError, setViolationsError] = useState(null);
  const [logsLoading, setLogsLoading] = useState(true), [violationsLoading, setViolationsLoading] = useState(true);
  const [logsReload, setLogsReload] = useState(0), [violationsReload, setViolationsReload] = useState(0);
  const retryLogs = useCallback(() => setLogsReload(value => value + 1), []);
  const retryViolations = useCallback(() => setViolationsReload(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);
    clientApi.logs({ limit: 5, offset: 0 })
      .then(result => { if (!cancelled) setLogs(result); })
      .catch(error => { if (!cancelled) setLogsError(error); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [logsReload]);

  useEffect(() => {
    let cancelled = false;
    setViolationsLoading(true);
    setViolationsError(null);
    clientApi.violations({ limit: 5, offset: 0 })
      .then(result => { if (!cancelled) setViolations(result); })
      .catch(error => { if (!cancelled) setViolationsError(error); })
      .finally(() => { if (!cancelled) setViolationsLoading(false); });
    return () => { cancelled = true; };
  }, [violationsReload]);

  const strikes = Math.min(violations?.current_violation_count || 0, 3);
  const strikeValue = violationsLoading ? "Loading…" : violationsError ? "Unavailable" : `${violations?.current_violation_count ?? 0} of 3`;
  const isBanned = Boolean(violations?.is_banned);

  return <div className="client-dashboard">
    <div className="client-summary-grid">
      <section className="summary-card client-summary-card client-strike-card">
        <div className="client-summary-label">Current strikes</div>
        <strong className="client-strike-value">{strikeValue}</strong>
        <div className="client-strike-meter" role="progressbar" aria-label="Current strikes" aria-valuemin="0" aria-valuemax="3" aria-valuenow={strikes}>
          {[0, 1, 2].map(index => <span key={index} className={index < strikes ? "is-filled" : ""} />)}
        </div>
        <p className="client-summary-help">Three confirmed strikes may result in a temporary ban.</p>
      </section>

      <section className="summary-card client-summary-card client-ban-card">
        <div className="client-summary-label">Ban status</div>
        {violationsLoading || violationsError
          ? <span className="client-status-badge is-neutral">{violationsLoading ? "Loading…" : "Unavailable"}</span>
          : <span className={`client-status-badge${isBanned ? " is-banned" : " is-clear"}`}>{isBanned ? "Banned" : "Clear"}</span>}
        {isBanned && violations?.ban_until && <p className="client-ban-date">Ban ends {new Date(violations.ban_until).toLocaleString()}</p>}
      </section>
    </div>

    <div className="client-dashboard-grid">
      <RecentPanel
        title="Recent logs"
        to="/client/logs"
        items={logs}
        dateField="occurred_at"
        categoryField="category"
        empty="No recent activity."
        loading={logsLoading}
        error={logsError}
        onRetry={retryLogs}
      />
      <RecentPanel
        title="Recent violations"
        to="/client/violations"
        items={violations}
        dateField="date"
        categoryField="noise_category"
        empty="No violations recorded."
        loading={violationsLoading}
        error={violationsError}
        onRetry={retryViolations}
      />
    </div>
  </div>;
}
