import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '../types';

interface AuthState {
  /** The authenticated user, null if not logged in. Persisted to localStorage. */
  currentUser: CurrentUser | null;
  /**
   * Base URL of the server this session is associated with.
   * Example: "https://myserver.com" or "http://192.168.1.5:3000".
   * Empty string means no server has been joined yet.
   */
  serverHost: string;

  setAuth: (user: CurrentUser, serverHost: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      serverHost: '',

      setAuth: (user, serverHost) => set({ currentUser: user, serverHost }),
      clearAuth: () => set({ currentUser: null, serverHost: '' }),
    }),
    {
      name: 'spectrus-auth',
      partialize: (s) => ({ currentUser: s.currentUser, serverHost: s.serverHost }),
    }
  )
);
