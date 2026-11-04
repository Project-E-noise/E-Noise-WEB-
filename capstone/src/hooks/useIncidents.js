import { useCallback } from "react";
import { useAsync } from "./useAsync";
import { incidentsApi } from "../services/incidents";

export function useIncidents(params) {
  const key = JSON.stringify(params || {});
  return useAsync(useCallback(() => incidentsApi.list(params), [key]), [key]);
}
