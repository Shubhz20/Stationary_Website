import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth.api';
import { setAccessToken, clearAccessToken, getAccessToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    const init = async () => {
      // Check if we got a token from OAuth callback (URL fragment)
      const hash = window.location.hash;
      if (hash.includes('token=')) {
        const token = hash.split('token=')[1];
        setAccessToken(token);
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
      }

      // If we have a token (from fragment or memory), fetch user
      if (getAccessToken()) {
        try {
          const { data } = await authApi.getMe();
          setUser(data.data.user);
        } catch {
          clearAccessToken();
        }
      } else {
        // Try silent refresh (cookie might have a valid refresh token)
        try {
          const { data } = await authApi.refresh();
          setAccessToken(data.data.accessToken);
          const { data: meData } = await authApi.getMe();
          setUser(meData.data.user);
        } catch {
          // Not logged in — that's fine
        }
      }

      setLoading(false);
    };

    init();
  }, []);

  const login = useCallback(() => {
    // Redirect to backend Google OAuth endpoint
    window.location.href = '/api/v1/auth/google';
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors — we're logging out anyway
    }
    clearAccessToken();
    setUser(null);
    window.location.href = '/';
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.getMe();
      setUser(data.data.user);
    } catch {
      // ignore
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isClient: user?.role === 'client',
    isDelivery: user?.role === 'delivery',
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
