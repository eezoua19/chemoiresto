import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import ServerLayout from './layouts/ServerLayout';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

import ClientMenuPage from './pages/client/ClientMenuPage';
import OrderTrackingPage from './pages/client/OrderTrackingPage';

import ServerDashboardPage from './pages/server/ServerDashboardPage';
import ServerMenuPage from './pages/server/ServerMenuPage';
import ServerOrdersPage from './pages/server/ServerOrdersPage';
import ServerRequestsPage from './pages/server/ServerRequestsPage';

import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminMenuCalendarPage from './pages/admin/AdminMenuCalendarPage';
import AdminMenuEditorPage from './pages/admin/AdminMenuEditorPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';
import AdminTablesPage from './pages/admin/AdminTablesPage';
import AdminQRCodesPage from './pages/admin/AdminQRCodesPage';
import AdminServersPage from './pages/admin/AdminServersPage';
import AdminHistoryPage from './pages/admin/AdminHistoryPage';
import AdminStatsPage from './pages/admin/AdminStatsPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';

export default function App() {
  return (
    <Routes>
      {/* ---------------------- Public ---------------------- */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* ------------------ Client (QR Code) ---------------- */}
      <Route path="/menu/table/:token" element={<ClientMenuPage />} />
      <Route path="/menu/emporter/:token" element={<ClientMenuPage service="TAKEAWAY" />} />
      <Route path="/commande/:trackingToken" element={<OrderTrackingPage />} />

      {/* --------------------- Serveuse --------------------- */}
      <Route
        path="/serveuse"
        element={
          <ProtectedRoute roles={['SERVER', 'ADMIN']}>
            <ServerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/serveuse/dashboard" replace />} />
        <Route path="dashboard" element={<ServerDashboardPage />} />
        <Route path="commandes" element={<ServerOrdersPage />} />
        <Route path="demandes" element={<ServerRequestsPage />} />
        <Route path="carte" element={<ServerMenuPage />} />
      </Route>

      {/* ------------------ Administration ------------------ */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="commandes" element={<AdminOrdersPage />} />
        <Route path="menus" element={<AdminMenuCalendarPage />} />
        <Route path="menus/:date" element={<AdminMenuEditorPage />} />
        <Route path="produits" element={<AdminProductsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="tables" element={<AdminTablesPage />} />
        <Route path="qrcodes" element={<AdminQRCodesPage />} />
        <Route path="serveuses" element={<AdminServersPage />} />
        <Route path="historique" element={<AdminHistoryPage />} />
        <Route path="statistiques" element={<AdminStatsPage />} />
        <Route path="parametres" element={<AdminSettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
