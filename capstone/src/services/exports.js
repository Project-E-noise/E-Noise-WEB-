import { API_BASE_URL, getToken, toQueryString } from "./apiClient";

// Data export downloads a file straight from the backend rather than faking
// a frontend-only download — the browser is redirected to an authenticated
// backend endpoint that streams the file.
async function download(path, params) {
  const url = `${API_BASE_URL}${path}${toQueryString(params)}`;
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "export.csv";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export const exportsApi = {
  readings: params => download("/api/export/readings", params),
  incidents: params => download("/api/export/incidents", params),
  violations: params => download("/api/export/violations", params),
  tables: params => download("/api/export/tables", params)
};
