import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import LiveOverview from "./pages/LiveOverview";
import TableMonitoring from "./pages/TableMonitoring";
import RealTimeFeed from "./pages/RealTimeFeed";
import IncidentLogs from "./pages/IncidentLogs";
import Occupants from "./pages/Occupants";
import Analytics from "./pages/Analytics";
import Thresholds from "./pages/Thresholds";
import TableConfiguration from "./pages/TableConfiguration";
import DataExport from "./pages/DataExport";
import AdminProfile from "./pages/AdminProfile";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/overview" element={<LiveOverview />} />
            <Route path="/tables" element={<TableMonitoring />} />
            <Route path="/tables/:id" element={<TableMonitoring />} />
            <Route path="/feed" element={<RealTimeFeed />} />
            <Route path="/incidents" element={<IncidentLogs />} />
            <Route path="/occupants" element={<Occupants />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/thresholds" element={<Thresholds />} />
            <Route path="/table-configuration" element={<TableConfiguration />} />
            <Route path="/export" element={<DataExport />} />
            <Route path="/profile" element={<AdminProfile />} />
          </Route>

          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
