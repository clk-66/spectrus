import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useServersStore } from '../stores/useServersStore';
import { useChannelsStore } from '../stores/useChannelsStore';
import { getStoredTokens, apiFetch } from '../api/client';
import { getCategories } from '../api/channels';
import { SpectrusSocket } from '../ws/SpectrusSocket';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { ContentArea } from './ContentArea';
import { ServerSettings } from '../views/serverSettings/ServerSettings';
import styles from './AppShell.module.css';

export function AppShell() {
  const navigate = useNavigate();
  const { currentUser, serverHost, clearAuth } = useAuthStore();
  const { setActiveServerId } = useUIStore();
  const { addServer, setSocket } = useServersStore();
  const setCategories = useChannelsStore((s) => s.setCategories);

  useEffect(() => {
    if (!currentUser || !serverHost) return;

    // socket ref so the cleanup function can always reach it, even when the
    // async IIFE sets it after this synchronous block returns.
    let socket: SpectrusSocket | undefined;

    (async () => {
      console.debug('[AppShell] bootstrap start', { serverHost });

      // serverHost is used as both the API base URL and the token storage key
      const tokens = await getStoredTokens(serverHost);
      if (!tokens) {
        console.warn('[AppShell] no stored tokens for serverHost', serverHost);
        clearAuth();
        navigate('/welcome', { replace: true });
        return;
      }
      console.debug('[AppShell] tokens found, fetching server info + categories');

      const [serverInfo, channelData] = await Promise.all([
        apiFetch<{ name: string }>(serverHost, serverHost, '/servers/@me'),
        getCategories(serverHost, serverHost),
      ]);
      console.debug('[AppShell] bootstrap API calls succeeded', { serverInfo });

      addServer({
        server: {
          id: serverHost,
          name: serverInfo.name,
          ownerId: '',
          createdAt: '',
        },
        tokens,
        currentUser,
        socket: null,
      });
      setCategories(serverHost, channelData.categories, channelData.uncategorized);
      setActiveServerId(serverHost);

      const wsHost = serverHost.replace(/^http/, 'ws');
      console.debug('[AppShell] connecting WebSocket', `${wsHost}/ws`);
      socket = new SpectrusSocket(`${wsHost}/ws`, tokens.accessToken, serverHost);
      setSocket(serverHost, socket);
      console.debug('[AppShell] bootstrap complete');
    })().catch((err: unknown) => {
      console.error('[AppShell] bootstrap failed', err);
    });

    return () => {
      socket?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ^ Intentionally runs once on mount. Auth state won't change while AppShell is mounted.

  return (
    <ErrorBoundary>
      <div className={styles.shell}>
        <ServerRail />
        <ChannelSidebar />
        <ContentArea />
        <ServerSettings />
      </div>
    </ErrorBoundary>
  );
}
