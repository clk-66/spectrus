import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useServersStore } from '../stores/useServersStore';
import { useChannelsStore } from '../stores/useChannelsStore';
import { getStoredTokens, apiFetch } from '../api/client';
import { getCategories } from '../api/channels';
import { API_BASE, WS_BASE } from '../constants';
import { SpectrusSocket } from '../ws/SpectrusSocket';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { ContentArea } from './ContentArea';
import { ServerSettings } from '../views/serverSettings/ServerSettings';
import styles from './AppShell.module.css';

export function AppShell() {
  const navigate = useNavigate();
  const { currentUser, serverId, clearAuth } = useAuthStore();
  const { setActiveServerId } = useUIStore();
  const { addServer, setSocket } = useServersStore();
  const setCategories = useChannelsStore((s) => s.setCategories);

  useEffect(() => {
    if (!currentUser || !serverId) return;

    // socket ref so the cleanup function can always reach it, even when the
    // async IIFE sets it after this synchronous block returns.
    let socket: SpectrusSocket | undefined;

    (async () => {
      const tokens = await getStoredTokens(serverId);
      if (!tokens) {
        // Tokens were cleared externally — log out
        clearAuth();
        navigate('/login', { replace: true });
        return;
      }

      // Bootstrap: fetch server identity + channel list in parallel
      const [serverInfo, channelData] = await Promise.all([
        apiFetch<{ name: string }>(API_BASE, serverId, '/servers/@me'),
        getCategories(API_BASE, serverId),
      ]);

      addServer({
        server: {
          id: serverId,
          name: serverInfo.name,
          ownerId: '',
          createdAt: '',
        },
        tokens,
        currentUser,
        socket: null,
      });
      setCategories(serverId, channelData.categories, channelData.uncategorized);
      setActiveServerId(serverId);

      // Connect WebSocket
      socket = new SpectrusSocket(
        `${WS_BASE}/ws`,
        tokens.accessToken,
        serverId
      );
      setSocket(serverId, socket);
    })().catch((err: unknown) => {
      console.error('AppShell bootstrap failed', err);
    });

    return () => {
      socket?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ^ Intentionally runs once on mount. Auth state won't change while AppShell is mounted.

  return (
    <div className={styles.shell}>
      <ServerRail />
      <ChannelSidebar />
      <ContentArea />
      <ServerSettings />
    </div>
  );
}
