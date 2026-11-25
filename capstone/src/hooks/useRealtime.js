import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "../services/apiClient";

// Real-time data for a page.
//
// Prefers a WebSocket. The backend pushes a small event whenever MQTT
// ingestion changes something:
//   { type: "table:update", table }       one table's full live state
//   { type: "incident:created", incident } a new incident row
//
// Two ways to consume them:
// - onEvent(msg): the page merges the payload into its own state (no
//   request made). This is what the live pages use: with 7 tables sending
//   a reading every second, re-fetching everything on each message was
//   7 requests per second.
// - without onEvent: every event triggers a debounced re-fetch (fetcher ->
//   onData), the old behaviour.
//
// In both modes, fetcher() runs when the socket opens (to seed the page),
// every `refreshInterval` ms while connected (to refresh derived numbers
// such as 24 h stats and charts), and every `interval` ms while the socket
// is down (polling fallback). Close code 4001 means the token was rejected:
// the app signs out.
export function useRealtime({ fetcher, onData, onEvent, interval = 5000, refreshInterval = 60000, enabled = true }) {
  const savedFetcher = useRef(fetcher);
  const savedOnData = useRef(onData);
  const savedOnEvent = useRef(onEvent);
  savedFetcher.current = fetcher;
  savedOnData.current = onData;
  savedOnEvent.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !savedFetcher.current) return undefined;
    let cancelled = false;
    let socket = null;
    let pollId = null;
    let refreshId = null;
    let reconnectTimer = null;
    let debounceTimer = null;
    let reconnectDelay = 2000;

    const refetch = async () => {
      try {
        const data = await savedFetcher.current();
        if (!cancelled && data !== undefined) savedOnData.current?.(data);
      } catch {
        /* transient failure -- stay silent, next tick/event tries again */
      }
    };

    const debouncedRefetch = () => {
      // Coalesce bursts (e.g. several tables updating within the same
      // second) into a single re-fetch instead of one per WS message.
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refetch, 250);
    };

    const startPolling = () => {
      if (pollId) return;
      refetch();
      pollId = setInterval(refetch, interval);
    };

    const stopPolling = () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const startRefresh = () => {
      if (refreshId || !refreshInterval) return;
      refreshId = setInterval(refetch, refreshInterval);
    };

    const stopRefresh = () => {
      if (refreshId) {
        clearInterval(refreshId);
        refreshId = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectTimer = setTimeout(connectSocket, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
    };

    const connectSocket = () => {
      if (cancelled) return;
      try {
        socket = new WebSocket(getWsUrl());
      } catch {
        startPolling();
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (cancelled) return;
        reconnectDelay = 2000;
        stopPolling();
        startRefresh();
        setConnected(true);
        refetch(); // seed with current data the moment the socket is live
      };

      socket.onmessage = event => {
        if (cancelled) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type !== "table:update" && msg.type !== "incident:created") return;
        if (savedOnEvent.current) savedOnEvent.current(msg);
        else debouncedRefetch();
      };

      socket.onclose = event => {
        if (cancelled) return;
        setConnected(false);
        stopRefresh();
        if (event?.code === 4001) {
          // The server rejected the token: sign out everywhere in this tab.
          window.dispatchEvent(new Event("enoise:auth-expired"));
          return;
        }
        startPolling(); // keep the page live even while the socket is down
        scheduleReconnect();
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connectSocket();

    return () => {
      cancelled = true;
      stopPolling();
      stopRefresh();
      clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket?.readyState === WebSocket.CONNECTING) {
        // Closing a socket that is still connecting prints a browser warning
        // (happens in development, where React runs effects twice). Close it once it opens.
        socket.onopen = () => socket.close();
        socket.onclose = null;
        socket.onerror = null;
      } else {
        socket?.close();
      }
    };
  }, [enabled, interval, refreshInterval]);

  return { connected };
}

// Merge helpers for setData(prev => ...). They return undefined when nothing
// is loaded yet, which keeps the current state (the fetch on connect fills it).

/** Replaces one table in a { tables: [...] } payload (or appends a new one). */
export function mergeTable(data, table) {
  if (!data?.tables) return undefined;
  const index = data.tables.findIndex(t => t.id === table.id);
  if (index === -1) return { ...data, tables: [...data.tables, table].sort((a, b) => a.table_number - b.table_number) };
  const tables = data.tables.slice();
  tables[index] = table;
  return { ...data, tables };
}

/** Adds a new incident to the front of a { incidents: [...] } payload. */
export function prependIncident(data, incident) {
  if (!data?.incidents) return undefined;
  if (data.incidents.some(i => i.id === incident.id)) return data;
  return { ...data, incidents: [incident, ...data.incidents] };
}
