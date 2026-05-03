import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Public pages
import LandingPage from './pages/landing/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import AuthCallback from './pages/auth/AuthCallback';

// Catalog (public browse)
import ProductListPage from './pages/catalog/ProductListPage';
import ProductDetailPage from './pages/catalog/ProductDetailPage';

// Client pages
import CartPage from './pages/cart/CartPage';
import OrderListPage from './pages/orders/OrderListPage';
import OrderDetailPage from './pages/orders/OrderDetailPage';
import ProfilePage from './pages/auth/ProfilePage';
import CompanySetupPage from './pages/auth/CompanySetupPage';

// Admin pages
import AdminDashboard from './pages/dashboard/AdminDashboard';

// Delivery partner pages
import DeliveryDashboard from './pages/dashboard/DeliveryDashboard';

export default function App() {
  return (
    <Routes>
      {/* Auth routes (no layout) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* All other routes use shared layout */}
      <Route element={<Layout />}>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/products" element={<ProductListPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />

        {/* Authenticated (any role) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Client routes */}
        <Route element={<ProtectedRoute allowedRoles={['client']} />}>
          <Route path="/cart" element={<CartPage />} />
          <Route path="/orders" element={<OrderListPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/company" element={<CompanySetupPage />} />
        </Route>

        {/* Admin routes */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        {/* Delivery partner routes */}
        <Route element={<ProtectedRoute allowedRoles={['delivery']} />}>
          <Route path="/deliveries" element={<DeliveryDashboard />} />
        </Route>
      </Route>
    </Routes>
  );
}
