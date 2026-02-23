import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Welcome } from './views/welcome/Welcome';
import { Login } from './views/auth/Login';
import { Register } from './views/auth/Register';
import { JoinServer } from './views/joinServer/JoinServer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UpdateChecker } from './components/UpdateChecker';
import { useUIStore } from './stores/useUIStore';

/**
 * Applies the persisted theme to <html data-theme="…"> before first paint.
 */
function ThemeSync() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return null;
}

/**
 * Handles spectrus:// deep links.
 *
 * URL format: spectrus://join/<host>/<token>
 *   → navigates to /invite/<token> and stores <host> in sessionStorage
 *     so JoinServer can construct the correct API base URL.
 *
 * Two code paths:
 *  1. Cold start  — Tauri launches the app via the URI scheme.
 *     We call getCurrent() from the deep-link plugin to read the URL.
 *  2. App already open — Rust emits a "spectrus://deep-link" Tauri event
 *     which we listen to here. Tauri also focuses the window automatically.
 */
function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('__TAURI__' in window)) return;

    function handleUrl(raw: string) {
      try {
        const url = new URL(raw);
        if (url.protocol !== 'spectrus:' || url.hostname !== 'join') return;
        // pathname: "/<host>/<token>"  (host may include a port)
        const [serverHost, token] = url.pathname.split('/').filter(Boolean);
        if (!token) return;
        sessionStorage.setItem('spectrus:join-host', serverHost ?? '');
        navigate(`/invite/${token}`);
      } catch { /* malformed URL — ignore */ }
    }

    let unlisten: (() => void) | undefined;

    // Path 1: already-open — listen for the Tauri event emitted by main.rs
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('spectrus://deep-link', (event) => {
        handleUrl(event.payload);
      }).then((fn) => { unlisten = fn; });
    });

    // Path 2: cold start — read URL that triggered the launch
    import('@tauri-apps/plugin-deep-link').then(({ getCurrent }) => {
      getCurrent().then((urls) => {
        if (urls && urls.length > 0) handleUrl(urls[0]);
      });
    });

    return () => { unlisten?.(); };
  }, [navigate]);

  return null;
}

/**
 * Detects Tauri on macOS and adds `tauri-macos` to <body> so that
 * AppShell can apply 40 px top padding to clear the traffic-light buttons.
 */
function MacOSTitleBarGuard() {
  useEffect(() => {
    if ('__TAURI__' in window && /Mac/i.test(navigator.platform)) {
      document.body.classList.add('tauri-macos');
    }
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeSync />
      <MacOSTitleBarGuard />
      <DeepLinkHandler />
      <UpdateChecker />
      <Routes>
        {/* Entry point for new users / users with no servers */}
        <Route path="/welcome"         element={<Welcome />} />

        {/* Server-contextual auth — host passed as ?host= query param */}
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />

        {/* Invite flow — host passed as ?host= query param */}
        <Route path="/invite/:token"   element={<JoinServer />} />

        {/* Protected app shell */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppShell />} />
        </Route>

        {/* Catch-all → root (ProtectedRoute redirects to /welcome if needed) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
