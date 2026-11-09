import { useRef, useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { AsyncSection, EmptyState } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { useRealtime } from "../hooks/useRealtime";
import { tablesApi } from "../services/tables";
import { formatDb, formatPercent, formatTime, tableLabel } from "../utils/formatting";

// Live event stream. Every entry is a real reading from the API: a new
// entry is added only when a table's level actually changes.
export default function RealTimeFeed() {
  const tablesQuery = useTables();
  const [events, setEvents] = useState([]);
  const [paused, setPaused] = useState(false);
  const lastLevels = useRef({});

  const { connected } = useRealtime({
    enabled: !paused,
    interval: 5000,
    fetcher: () => tablesApi.list(),
    onData: data => {
      const list = data?.tables ?? [];
      tablesQuery.setData(data);
      const now = new Date();
      const fresh = list
        .filter(table => table.current_db != null && lastLevels.current[table.id] !== table.current_db)
        .map(table => ({ id: `${table.id}-${now.getTime()}`, table, time: now }));
      lastLevels.current = Object.fromEntries(list.map(t => [t.id, t.current_db]));
      if (fresh.length) setEvents(prev => [...fresh, ...prev].slice(0, 50));
    }
  });

  const tables = tablesQuery.data?.tables ?? [];

  return (
    <div className="page">
      <Topbar title="Real-Time Feed" subtitle="Live readings across all tables">
        <span className={`badge ${paused ? "badge-neu" : connected ? "badge-safe" : "badge-warn"}`}>
          <i className={`ti ${paused ? "ti-player-pause" : connected ? "ti-plug-connected" : "ti-refresh"}`} />
          {paused ? "Paused" : connected ? "Live" : "Polling (reconnecting)"}
        </span>
        <button type="button" className={`btn ${paused ? "btn-primary" : ""}`} onClick={() => setPaused(p => !p)}>
          <i className={`ti ${paused ? "ti-player-play" : "ti-player-pause"}`} /> {paused ? "Resume" : "Pause"}
        </button>
      </Topbar>

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        emptyProps={{ icon: "ti-table", title: "No tables configured yet" }}
      >
        {data => (
          <div className="status-grid">
            {data.map(t => (
              <div key={t.id} className="m-card">
                <div className="m-head">
                  <div className="m-label">{tableLabel(t)}</div>
                  <span className={`badge ${t.is_online ? "badge-info" : "badge-neu"}`}>{t.is_online ? `${formatDb(t.current_db)} dB` : "Offline"}</span>
                </div>
                <div className="muted-small">{t.classification || "No label yet"}</div>
              </div>
            ))}
          </div>
        )}
      </AsyncSection>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Event stream</h2>
          {events.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setEvents([])}>Clear</button>}
        </div>
        {!events.length && <EmptyState icon="ti-activity" title={paused ? "Feed paused" : "Waiting for the next reading..."} subtitle="New readings from the sensors show up here as they arrive." />}
        <div aria-live="polite">
          {events.map(ev => (
            <div className="feed-item" key={ev.id}>
              <span className={`feed-dot ${String(ev.table.status).toLowerCase()}`} aria-hidden="true" />
              <div className="feed-content">
                <div className="feed-title">{tableLabel(ev.table)}: {formatDb(ev.table.current_db)} dB ({ev.table.status})</div>
                <div className="feed-desc">
                  {ev.table.classification || "No label"}{ev.table.classification && ev.table.confidence != null ? ` - ${formatPercent(ev.table.confidence)}%` : ""}
                </div>
              </div>
              <div className="feed-time">{formatTime(ev.time)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
