import { useEffect, useState } from "react";

// Re-renders the component every `ms` (default once a second) and returns
// the current time. Used for countdowns and "no data for Xs" labels.
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Whole seconds since an ISO time, or null when unknown. */
export function secondsSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 1000));
}
