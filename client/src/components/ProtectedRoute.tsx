import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { getStoredTokens } from '../api/client';

/**
 * Wraps protected routes. Redirects to /login if:
 *  - no persisted currentUser in useAuthStore, OR
 *  - no stored tokens in localStorage (tokens were manually cleared)
 */
export function ProtectedRoute() {
  const { currentUser, serverId } = useAuthStore();
  const hasTokens = getStoredTokens(serverId) !== null;

  if (!currentUser || !hasTokens) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
