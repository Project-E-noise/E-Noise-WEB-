import { useCallback } from "react";
import { useAsync } from "./useAsync";
import { tablesApi } from "../services/tables";

export function useTables() {
  return useAsync(useCallback(() => tablesApi.list(), []));
}

export function useTable(id) {
  return useAsync(useCallback(() => tablesApi.get(id), [id]), [id]);
}

export function useTableReadings(id, params) {
  const key = JSON.stringify(params || {});
  // `key` (params as JSON) is the dependency on purpose: a new params object
  // with the same values must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsync(useCallback(() => tablesApi.readings(id, params), [id, key]), [id, key]);
}
