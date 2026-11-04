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
  return useAsync(useCallback(() => tablesApi.readings(id, params), [id, key]), [id, key]);
}
