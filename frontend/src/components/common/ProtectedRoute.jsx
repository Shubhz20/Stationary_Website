import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from './Spinner';

/**
 * Protects routes by auth status and role.
 *
 * Used as a layout route element in App.jsx:
 *   <Route element={<ProtectedRoute allowedRoles={['client']} />}>
 *     <Route path="/cart" element={<CartPage />} />
 *   </Route>
 *
 * Can also wrap a single child:
 *   <ProtectedRoute><Page /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;

  // If used as a layout route (no children), render Outlet for nested routes
  return children || <Outlet />;
}
