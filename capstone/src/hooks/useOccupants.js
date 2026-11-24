import { useCallback } from "react";
import { useAsync } from "./useAsync";
import { occupantsApi } from "../services/occupants";

export function useOccupants(params) {
  const key = JSON.stringify(params || {});
  // `key` (params as JSON) is the dependency on purpose: a new params object
  // with the same values must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsync(useCallback(() => occupantsApi.list(params), [key]), [key]);
}
