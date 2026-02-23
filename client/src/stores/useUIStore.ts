import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, TypingUser } from '../types';

interface UIState {
  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // Active navigation
  activeServerId: string | null;
  setActiveServerId: (id: string | null) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;

  // Sidebar visibility
  isMemberSidebarOpen: boolean;
  toggleMemberSidebar: () => void;

  // Server settings panel
  activeServerSettingsTab: string | null;
  openServerSettings: (tab: string) => void;
  closeServerSettings: () => void;

  // Typing indicators — keyed by channelId
  typingUsers: Record<string, TypingUser[]>;
  setTypingUser: (channelId: string, user: TypingUser) => void;
  clearTypingUser: (channelId: string, userId: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      activeServerId: null,
      setActiveServerId: (id) => set({ activeServerId: id }),

      activeChannelId: null,
      setActiveChannelId: (id) => set({ activeChannelId: id }),

      isMemberSidebarOpen: true,
      toggleMemberSidebar: () =>
        set((s) => ({ isMemberSidebarOpen: !s.isMemberSidebarOpen })),

      activeServerSettingsTab: null,
      openServerSettings: (tab) => set({ activeServerSettingsTab: tab }),
      closeServerSettings: () => set({ activeServerSettingsTab: null }),

      typingUsers: {},
      setTypingUser: (channelId, user) =>
        set((s) => {
          const existing = s.typingUsers[channelId] ?? [];
          const filtered = existing.filter((u) => u.userId !== user.userId);
          return { typingUsers: { ...s.typingUsers, [channelId]: [...filtered, user] } };
        }),
      clearTypingUser: (channelId, userId) =>
        set((s) => {
          const existing = s.typingUsers[channelId] ?? [];
          return {
            typingUsers: {
              ...s.typingUsers,
              [channelId]: existing.filter((u) => u.userId !== userId),
            },
          };
        }),
    }),
    {
      name: 'spectrus-ui',
      // Only persist theme preference — nav state resets on reload
      partialize: (s) => ({ theme: s.theme }),
    }
  )
);
