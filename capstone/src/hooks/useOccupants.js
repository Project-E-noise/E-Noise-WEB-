import { useCallback } from "react";
import { useAsync } from "./useAsync";
import { occupantsApi } from "../services/occupants";

export function useOccupants(params) {
  const key = JSON.stringify(params || {});
  return useAsync(useCallback(() => occupantsApi.list(params), [key]), [key]);
}
