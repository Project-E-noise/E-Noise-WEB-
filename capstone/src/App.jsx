import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { PublicOnly } from "./components/auth/PublicOnly";
import { AppLayout } from "./components/layout/AppLayout";
import { LoadingState } from "./components/common/UiStates";

// Pages are loaded only when first opened, so the first download stays
// small (Chart.js is only fetched for the pages with charts).
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const LiveOverview = lazy(() => import("./pages/LiveOverview"));
const TableMonitoring = lazy(() => import("./pages/TableMonitoring"));
const RealTimeFeed = lazy(() => import("./pages/RealTimeFeed"));
const IncidentLogs = lazy(() => import("./pages/IncidentLogs"));
const Occupants = lazy(() => import("./pages/Occupants"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Thresholds = lazy(() => import("./pages/Thresholds"));
const TableConfiguration = lazy(() => import("./pages/TableConfiguration"));
const DataExport = lazy(() => import("./pages/DataExport"));
const AdminProfile = lazy(() => import("./pages/AdminProfile"));
const ClientLogin = lazy(() => import("./pages/ClientLogin"));
const ClientRegister = lazy(() => import("./pages/ClientRegister"));
const ClientSetPassword = lazy(() => import("./pages/ClientSetPassword"));
const ClientLayout = lazy(() => import("./components/layout/ClientLayout"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const ClientLogs = lazy(() => import("./pages/ClientLogs"));
const ClientViolations = lazy(() => import("./pages/ClientViolations"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<div className="auth-shell"><LoadingState label="Loading..." /></div>}>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/client/login" element={<PublicOnly><ClientLogin /></PublicOnly>} />
            <Route path="/client/register" element={<PublicOnly><ClientRegister /></PublicOnly>} />
            <Route path="/client/set-password" element={<ClientSetPassword />} />
            {/* Old email links used /client/verify-email; they now go to the password setup page. */}
            <Route path="/client/verify-email" element={<RedirectWithSearch to="/client/set-password" />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
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

            <Route element={<ProtectedRoute role="client"><ClientLayout /></ProtectedRoute>}>
              <Route path="/client/dashboard" element={<ClientDashboard />} />
              <Route path="/client/logs" element={<ClientLogs />} />
              <Route path="/client/violations" element={<ClientViolations />} />
              <Route path="/client/profile" element={<ClientProfile />} />
            </Route>

            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/client" element={<Navigate to="/client/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  );
}

function RedirectWithSearch({ to }) {
  return <Navigate to={`${to}${window.location.search}`} replace />;
}
