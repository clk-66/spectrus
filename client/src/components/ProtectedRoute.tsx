import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Wraps protected routes. When unauthenticated:
 *  - Tauri desktop app  → /welcome (invite/join flow)
 *  - Browser            → /login   (admin login form)
 */
export function ProtectedRoute() {
  const { currentUser, serverHost } = useAuthStore();

  if (!currentUser || !serverHost) {
    const isTauri = '__TAURI__' in window;
    return <Navigate to={isTauri ? '/welcome' : '/login'} replace />;
  }

  return <Outlet />;
}
