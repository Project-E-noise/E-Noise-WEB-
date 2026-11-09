import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../components/common/UiStates";
import { clientApi } from "../services/client";

const PAGE_SIZE = 20;
const rowKey = row => `${row.type}-${row.occurred_at}-${row.table_name}-${row.category || ""}`;

function formatDb(value) {
  return value == null ? "n/a" : `${Number(value).toFixed(1)} dB`;
}

export default function ClientLogs() {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [fromInput, setFromInput] = useState(""), [toInput, setToInput] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true), [request, setRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientApi.logs({ from, to, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(data => { if (!cancelled) setResult(data); })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, page, request]);

  const applyFilters = event => {
    event.preventDefault();
    setFrom(fromInput);
    setTo(toInput);
    setPage(0);
  };
  const clearFilters = () => {
    setFromInput("");
    setToInput("");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const items = result?.items || [];
  const hasFilters = Boolean(from || to || fromInput || toInput);

  return <div className="client-data-page">
    <form className="client-filter" onSubmit={applyFilters}>
      <label>From<input type="date" value={fromInput} onChange={event => setFromInput(event.target.value)} /></label>
      <label>To<input type="date" value={toInput} onChange={event => setToInput(event.target.value)} /></label>
      <div className="client-filter-actions">
        <button className="btn btn-primary" type="submit">Apply</button>
        <button className="btn" type="button" onClick={clearFilters} disabled={!hasFilters}>Clear</button>
      </div>
    </form>

    <section className="card client-results-panel" aria-live="polite">
      {loading ? <LoadingState label="Loading your logs…" />
        : error ? <ErrorState message={error.message} onRetry={() => setRequest(value => value + 1)} />
          : !items.length ? <EmptyState title="No logs found" subtitle="Try a different date range." />
            : <div className="client-table-scroll">
              <table className="client-data-table">
                <thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Table</th><th scope="col">Category</th><th scope="col" className="is-numeric">dB level</th><th scope="col">Status</th></tr></thead>
                <tbody>{items.map(row => <tr key={rowKey(row)}>
                  <td data-label="Date">{new Date(row.occurred_at).toLocaleString()}</td>
                  <td data-label="Activity">{row.type === "session" ? "Table assignment" : "Incident"}</td>
                  <td data-label="Table">{row.table_name ? `Table ${row.table_name}` : <span className="client-muted-value">n/a</span>}</td>
                  <td data-label="Category">{row.category || <span className="client-muted-value">n/a</span>}</td>
                  <td data-label="dB level" className="client-numeric">{formatDb(row.db_level)}</td>
                  <td data-label="Status">{row.status || <span className="client-muted-value">n/a</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>}
    </section>

    {!loading && !error && items.length > 0 && <nav className="client-pager" aria-label="Log pages">
      <span className="client-page-count">{result.total} records</span>
      <button className="btn" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page + 1}</span>
      <button className="btn" disabled={(result.offset + items.length) >= result.total} onClick={() => setPage(value => value + 1)}>Next</button>
    </nav>}
  </div>;
}
