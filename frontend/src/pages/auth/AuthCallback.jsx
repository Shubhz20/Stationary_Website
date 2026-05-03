import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../../components/common/Spinner';

/**
 * OAuth callback page. Reads token from URL fragment, then redirects.
 * The AuthContext handles actually setting the token — this page just redirects.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, user } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      // Redirect based on role
      if (user?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (user?.role === 'delivery') {
        navigate('/delivery', { replace: true });
      } else {
        navigate('/products', { replace: true });
      }
    } else if (!loading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [loading, isAuthenticated, user, navigate]);

  return <Spinner />;
}
