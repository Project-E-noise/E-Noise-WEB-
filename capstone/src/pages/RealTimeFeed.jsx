import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { useRealtime } from "../hooks/useRealtime";
import { tablesApi } from "../services/tables";
import { formatDb, formatTime, tableLabel } from "../utils/formatting";

// Live event stream. It never fabricates values — every entry comes from a
// real poll of the tables endpoint, snapshotted as an event only when a
// table's live reading actually changes since the last poll.
export default function RealTimeFeed() {
  const tablesQuery = useTables();
  const [events, setEvents] = useState([]);
  const [paused, setPaused] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState({});

  const { connected } = useRealtime({
    enabled: !paused,
    interval: 5000,
    fetcher: () => tablesApi.list(),
    onData: data => {
      const list = Array.isArray(data) ? data : data?.tables ?? [];
      setEvents(prev => {
        const next = [...prev];
        for (const table of list) {
          const prevReading = lastSnapshot[table.id];
          if (prevReading === table.current_db) continue;
          next.unshift({
            id: `${table.id}-${Date.now()}`,
            table,
            time: new Date()
          });
        }
        return next.slice(0, 50);
      });
      setLastSnapshot(Object.fromEntries(list.map(t => [t.id, t.current_db])));
    }
  });

  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];

  return (
    <div className="page active">
      <Topbar title="Real-Time Feed" subtitle="Live event stream across all tables">
        <span className={`badge ${connected ? "badge-safe" : "badge-neu"}`}>
          <i className={`ti ${connected ? "ti-plug-connected" : "ti-refresh"}`} /> {connected ? "Live" : "Polling (reconnecting...)"}
        </span>
        <button className={`btn ${paused ? "btn-primary" : ""}`} onClick={() => setPaused(p => !p)}>
          <i className={`ti ${paused ? "ti-player-play" : "ti-player-pause"}`} /> {paused ? "Resume" : "Pause"}
        </button>
      </Topbar>

      <AsyncSection loading={tablesQuery.loading} error={tablesQuery.error} data={tables} isEmpty={d => !d.length} onRetry={tablesQuery.reload} emptyProps={{ icon: "ti-table", title: "No tables configured yet" }}>
        {data => (
          <div className="status-grid">
            {data.map(t => (
              <div key={t.id} className="m-card">
                <div className="m-head">
                  <div className="m-label">{tableLabel(t)}</div>
                  <span className="badge badge-info">{formatDb(t.current_db)} dB</span>
                </div>
                <div className="muted-small">{t.classification || "No reading yet"}</div>
              </div>
            ))}
          </div>
        )}
      </AsyncSection>

      <div className="panel">
        <div className="panel-hd">
          <div className="panel-title">Live event stream</div>
          <div className="feed-time">{formatTime(new Date())}</div>
        </div>
        {!events.length && <div className="empty-sub feed-empty">Waiting for the next reading...</div>}
        {events.map(ev => (
          <div className="feed-item" key={ev.id}>
            <div className="feed-dot-wrap">
              <div className="feed-dot" style={{ background: statusColor(ev.table) }} />
              <div className="feed-line" />
            </div>
            <div className="feed-content">
              <div className="feed-title">
                {tableLabel(ev.table)} - {formatDb(ev.table.current_db)} dB
              </div>
              <div className="feed-desc">
                {ev.table.classification || "Ambient Baseline"} {ev.table.confidence != null && `- ${Math.round(ev.table.confidence <= 1 ? ev.table.confidence * 100 : ev.table.confidence)}%`}
              </div>
            </div>
            <div className="feed-time">{formatTime(ev.time)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusColor(table) {
  const status = (table.status || "").toUpperCase();
  if (status === "CRITICAL") return "var(--r600)";
  if (status === "WARNING") return "var(--a400)";
  return "var(--g400)";
}
