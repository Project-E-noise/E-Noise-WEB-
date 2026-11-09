import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { LoadingState } from "../common/UiStates";
import { useTables } from "../../hooks/useTables";

// Shell for every admin page: sidebar + page content. On phones and
// tablets the sidebar is hidden behind a menu button in the top bar.
export function AppLayout() {
  const { data } = useTables();
  const tables = data?.tables ?? [];
  const online = tables.filter(t => t.is_online).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the menu after navigating, and with the Escape key.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = event => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={`layout ${menuOpen ? "menu-open" : ""}`}>
      <header className="mobile-bar">
        <button type="button" className="btn btn-icon btn-ghost" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="app-sidebar">
          <i className="ti ti-menu-2 icon-lg" />
        </button>
        <div className="sb-name">E-Noise</div>
        <span className="badge badge-neu">{tables.length ? `${online}/${tables.length} online` : "--"}</span>
      </header>

      <Sidebar id="app-sidebar" tablesOnline={online} tablesTotal={tables.length} onClose={() => setMenuOpen(false)} />
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <main className="main">
        <Suspense fallback={<LoadingState label="Loading page..." />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
