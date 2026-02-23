import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Wraps protected routes. Redirects to /welcome if:
 *  - no persisted currentUser in useAuthStore, OR
 *  - no serverHost (user has not joined any server yet)
 */
export function ProtectedRoute() {
  const { currentUser, serverHost } = useAuthStore();

  if (!currentUser || !serverHost) {
    return <Navigate to="/welcome" replace />;
  }

  return <Outlet />;
}
