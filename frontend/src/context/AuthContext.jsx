import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/endpoints';
import { TOKEN_KEY } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

/**
 * Gere la session du personnel (ADMIN / SERVEUSE) :
 * jeton JWT, profil, restaurant et connexion Socket.IO associee.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaure la session au chargement de l'application.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((data) => {
        setUser(data.user);
        setRestaurant(data.restaurant);
        connectSocket(token);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setRestaurant(data.restaurant);
    connectSocket(data.token);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // La deconnexion reste locale même si l'API est injoignable.
    }
    localStorage.removeItem(TOKEN_KEY);
    disconnectSocket();
    setUser(null);
    setRestaurant(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      restaurant,
      setRestaurant,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'ADMIN',
      isServer: user?.role === 'SERVER',
    }),
    [user, restaurant, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilise dans un AuthProvider');
  return context;
}
