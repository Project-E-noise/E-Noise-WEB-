import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ToastContext = createContext(null);
const TOAST_MS = 3000;

// Small pop-up message at the bottom right. showToast("Saved") or
// showToast("Could not save", "error").
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = "success") => {
    setToast({ message, tone, key: Date.now() });
  }, []);

  // One timer per toast; showing a new toast restarts it.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite">
        {toast && (
          <div className={`toast ${toast.tone === "error" ? "toast-error" : ""}`} key={toast.key} role={toast.tone === "error" ? "alert" : "status"}>
            <i className={`ti ${toast.tone === "error" ? "ti-alert-circle" : "ti-circle-check"}`} aria-hidden="true" />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
