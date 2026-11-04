import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToastState] = useState(null);

  const showToast = useCallback((message, tone = "success") => {
    setToastState({ message, tone, key: Date.now() });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDone={() => setToastState(null)} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast, onDone }) {
  if (!toast) return <div className="toast" aria-hidden="true" />;
  setTimeout(onDone, 2800);
  return (
    <div className={`toast show ${toast.tone === "error" ? "toast-error" : ""}`} key={toast.key}>
      <i className={`ti ${toast.tone === "error" ? "ti-alert-circle" : "ti-circle-check"}`} />
      <span>{toast.message}</span>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
