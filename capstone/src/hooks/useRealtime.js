import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "../services/apiClient";

// Transport-agnostic real-time abstraction (spec section 35 / src/hooks/useRealtime.js).
//
// Phase 6: prefers a WebSocket push connection. The backend sends a small
// event (e.g. "table:update") whenever MQTT ingestion changes something;
// on receiving one, this hook re-runs `fetcher` and hands the result to
// `onData` -- so consumers keep receiving exactly the same shape of data
// they always did (a full re-fetch via the existing REST call), just
// triggered by a real event instead of a fixed timer. If the socket can't
// connect or drops, it transparently falls back to polling `fetcher` on
// `interval` until the socket reconnects. Consumers never change: same
// {fetcher, onData, interval, enabled} call signature as before.
//
// It never invents data: every onData call is the result of a real
// fetcher() call, whether triggered by a WS event or a poll tick. A failed
// fetch is simply skipped -- the page's own useAsync call already surfaces
// a proper error state, so this stays silent.
export function useRealtime({ fetcher, onData, interval = 5000, enabled = true }) {
  const savedFetcher = useRef(fetcher);
  const savedOnData = useRef(onData);
  savedFetcher.current = fetcher;
  savedOnData.current = onData;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !savedFetcher.current) return undefined;
    let cancelled = false;
    let socket = null;
    let pollId = null;
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
        if (msg.type === "table:update" || msg.type === "incident:created") debouncedRefetch();
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnected(false);
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
      clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled, interval]);

  return { connected };
}
