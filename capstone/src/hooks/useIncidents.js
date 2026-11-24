import { useCallback } from "react";
import { useAsync } from "./useAsync";
import { incidentsApi } from "../services/incidents";

export function useIncidents(params) {
  const key = JSON.stringify(params || {});
  // `key` (params as JSON) is the dependency on purpose: a new params object
  // with the same values must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsync(useCallback(() => incidentsApi.list(params), [key]), [key]);
}
