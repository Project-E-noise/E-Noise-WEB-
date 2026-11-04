import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useTables } from "../../hooks/useTables";

// Shell for every authenticated page: sidebar + routed page content.
// Table online/offline counts live here so the sidebar summary stays in
// sync no matter which page is active.
export function AppLayout() {
  const { data: tables } = useTables();
  const list = Array.isArray(tables) ? tables : tables?.tables ?? [];
  const online = list.filter(t => t.sensor_status?.is_online ?? t.is_online).length;

  return (
    <div className="layout">
      <Sidebar tablesOnline={list.length ? online : undefined} tablesTotal={list.length || undefined} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
