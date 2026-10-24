import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PageLoader from './components/PageLoader';
import { getUser, hasActiveSession } from './utils/auth';
import useInactivityLogout from './hooks/useInactivityLogout';

const Login = lazy(() => import('./pages/Login'));
const OwnerLogin = lazy(() => import('./pages/OwnerLogin'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const Customers = lazy(() => import('./pages/Customers'));
const POS = lazy(() => import('./pages/POS'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Shops = lazy(() => import('./pages/Shops'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const ShopDetail = lazy(() => import('./pages/ShopDetail'));
const Expenses = lazy(() => import('./pages/Expenses'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const StockReconciliation = lazy(() => import('./pages/StockReconciliation'));
const Returns = lazy(() => import('./pages/Returns'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Profile = lazy(() => import('./pages/Profile'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Billing = lazy(() => import('./pages/Billing'));
const OwnerBilling = lazy(() => import('./pages/OwnerBilling'));
const OwnerMessages = lazy(() => import('./pages/OwnerMessages'));

function App() {
  const [session, setSession] = useState({
    isAuthenticated: hasActiveSession(),
    user: getUser(),
  });
  const currentUser = session.user;
  const isSuperAdmin = currentUser?.role === 'SuperAdmin';
  const isStaff = currentUser?.role === 'Staff';
  // Pages staff (cashiers) are NOT allowed to access
  const staffBlocked = <Navigate to="/app" replace />;

  useInactivityLogout(session.isAuthenticated);

  useEffect(() => {
    const checkAuth = () => {
      setSession({
        isAuthenticated: hasActiveSession(),
        user: getUser(),
      });
    };

    window.addEventListener('auth-changed', checkAuth);
    window.addEventListener('storage', checkAuth);
    return () => {
      window.removeEventListener('auth-changed', checkAuth);
      window.removeEventListener('storage', checkAuth);
    };
  }, []);

  return (
    <Suspense fallback={<PageLoader fullPage />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={session.isAuthenticated && !isSuperAdmin ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/signup" element={session.isAuthenticated && !isSuperAdmin ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/owner-login" element={<Navigate to="/owner" replace />} />
        <Route path="/owner" element={session.isAuthenticated ? <Navigate to={isSuperAdmin ? '/app/owner' : '/app'} replace /> : <OwnerLogin />} />
        <Route path="/app" element={session.isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={isSuperAdmin ? <Navigate to="/owner" replace /> : <Dashboard />} />
          <Route path="owner" element={isSuperAdmin ? <OwnerDashboard /> : <Navigate to="/app" replace />} />
          <Route path="shops" element={isSuperAdmin ? <Shops /> : <Navigate to="/app" replace />} />
          <Route path="shops/:id" element={isSuperAdmin ? <ShopDetail /> : <Navigate to="/app" replace />} />
          <Route path="owner-billing" element={isSuperAdmin ? <OwnerBilling /> : <Navigate to="/app" replace />} />
          <Route path="messages" element={isSuperAdmin ? <OwnerMessages /> : <Navigate to="/app" replace />} />
          <Route path="billing" element={isSuperAdmin ? <Navigate to="/app/owner-billing" replace /> : isStaff ? staffBlocked : <Billing />} />
          <Route path="products" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : <Products />} />
          <Route path="customers" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : <Customers />} />
          <Route path="pos" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : <POS />} />
          <Route path="reports" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <Reports />} />
          <Route path="expenses" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <Expenses />} />
          <Route path="stock-reconciliation" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <StockReconciliation />} />
          <Route path="suppliers" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <Suppliers />} />
          <Route path="returns" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : <Returns />} />
          <Route path="audit-logs" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <AuditLogs />} />
          <Route path="settings" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : isStaff ? staffBlocked : <Settings />} />
          <Route path="users" element={isSuperAdmin ? <Navigate to="/app/shops" replace /> : <Users />} />
          <Route path="profile" element={isStaff ? staffBlocked : <Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={session.isAuthenticated ? '/app' : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
