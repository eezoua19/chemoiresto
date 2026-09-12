import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './ui';

/**
 * Protege une route : vérifie la session et, si des roles sont fournis,
 * que l'utilisateur possède bien l'un d'eux.
 * Une serveuse redirigee depuis /admin retombe sur son propre tableau.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Vérification de votre session..." />;

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/serveuse/dashboard'} replace />;
  }

  return children;
}
