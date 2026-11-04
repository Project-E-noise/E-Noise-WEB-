import { useCallback, useEffect, useRef, useState } from "react";

// Generic loading/data/error hook backing every list/detail page. Centralizing
// this means every page gets the same loading, empty, and error handling
// instead of re-implementing it (and instead of silently pretending a failed
// request succeeded).
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const mounted = useRef(false);
  const requestId = useRef(0);

  useEffect(
    () => {
      // React Strict Mode replays effects in development. Reset the flag on
      // every setup so the replayed request can still update this component.
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    },
    []
  );

  const reload = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mounted.current && currentRequestId === requestId.current) {
        setState({ data, loading: false, error: null });
      }
      return { data, error: null };
    } catch (error) {
      if (mounted.current && currentRequestId === requestId.current) {
        setState({ data: null, loading: false, error });
      }
      return { data: null, error };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  const setData = data => {
    // A realtime result is newer than any in-flight REST request.
    requestId.current += 1;
    if (mounted.current) setState({ data, loading: false, error: null });
  };

  return { ...state, setData, reload };
}
