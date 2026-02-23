import { create } from 'zustand';
import type { Server, CurrentUser, AuthTokens } from '../types';
import type { SpectrusSocket } from '../ws/SpectrusSocket';

interface ServerEntry {
  server: Server;
  tokens: AuthTokens;
  currentUser: CurrentUser;
  socket: SpectrusSocket | null;
}

interface ServersState {
  // Map of serverId → connection entry
  servers: Map<string, ServerEntry>;

  addServer: (entry: ServerEntry) => void;
  removeServer: (serverId: string) => void;
  setSocket: (serverId: string, socket: SpectrusSocket) => void;

  // Optimistic server metadata update (e.g. after saving server settings)
  updateServer: (serverId: string, patch: Partial<Pick<Server, 'name' | 'icon' | 'banner'>>) => void;

  // Quick lookup helpers
  getServer: (serverId: string) => ServerEntry | undefined;
  serverList: () => ServerEntry[];
}

export const useServersStore = create<ServersState>()((set, get) => ({
  servers: new Map(),

  addServer: (entry) =>
    set((s) => {
      const next = new Map(s.servers);
      next.set(entry.server.id, entry);
      return { servers: next };
    }),

  removeServer: (serverId) =>
    set((s) => {
      const next = new Map(s.servers);
      next.get(serverId)?.socket?.destroy();
      next.delete(serverId);
      return { servers: next };
    }),

  setSocket: (serverId, socket) =>
    set((s) => {
      const entry = s.servers.get(serverId);
      if (!entry) return s;
      const next = new Map(s.servers);
      next.set(serverId, { ...entry, socket });
      return { servers: next };
    }),

  updateServer: (serverId, patch) =>
    set((s) => {
      const entry = s.servers.get(serverId);
      if (!entry) return s;
      const next = new Map(s.servers);
      next.set(serverId, { ...entry, server: { ...entry.server, ...patch } });
      return { servers: next };
    }),

  getServer: (serverId) => get().servers.get(serverId),

  serverList: () => Array.from(get().servers.values()),
}));
