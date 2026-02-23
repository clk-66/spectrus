import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '../types';
import { DEFAULT_SERVER_ID } from '../constants';

interface AuthState {
  /** The authenticated user, null if not logged in. Persisted to localStorage. */
  currentUser: CurrentUser | null;
  /** The server id associated with the current session. */
  serverId: string;

  setAuth: (user: CurrentUser) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      serverId: DEFAULT_SERVER_ID,

      setAuth: (user) => set({ currentUser: user }),
      clearAuth: () => set({ currentUser: null }),
    }),
    {
      name: 'spectrus-auth',
      // Persist only the user object — tokens live in their own storage key
      partialize: (s) => ({ currentUser: s.currentUser, serverId: s.serverId }),
    }
  )
);
