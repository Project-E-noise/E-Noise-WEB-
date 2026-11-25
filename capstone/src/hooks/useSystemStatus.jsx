import { useEffect, useState } from "react";
import { systemApi } from "../services/system";

// Polls /api/system/status (ML service health etc.) every `ms`. The ML
// badge only needs to be roughly right, so once a minute is enough.
export function useSystemStatus(ms = 60000) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => systemApi.status().then(s => { if (!cancelled) setStatus(s); }).catch(() => {});
    load();
    const id = setInterval(load, ms);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ms]);
  return status;
}

/** Badge for the ML service state. Renders nothing while unknown/not configured. */
export function MlServiceBadge({ status }) {
  const state = status?.ml_service;
  if (state === "offline") {
    return (
      <span className="badge badge-warn" title="The sound classifier is not answering. Loud events are logged as UNVERIFIED until it is back.">
        <i className="ti ti-ear-off" aria-hidden="true" /> ML service offline
      </span>
    );
  }
  if (state === "not_configured") {
    return <span className="badge badge-neu" title="No ML_SERVICE_URL configured: loud events are logged as UNVERIFIED."><i className="ti ti-ear-off" aria-hidden="true" /> No classifier</span>;
  }
  return null;
}
