import { create } from 'zustand';
import type { VoiceService } from '../services/VoiceService';

interface VoiceState {
  /** channelId → Set of userIds currently in the channel */
  channelMembers: Map<string, Set<string>>;
  /** userId → channelId they're in (reverse index) */
  userChannel: Map<string, string>;

  /** Local client voice state */
  isMuted:         boolean;
  isDeafened:      boolean;
  activeChannelId: string | null;

  /** Active WebRTC session — null when not in voice */
  voiceService: VoiceService | null;

  /** Set of userIds currently speaking (detected via audio levels) */
  speakingUsers: Set<string>;

  // Actions
  setVoiceState:   (userId: string, channelId: string | null) => void;
  setMuted:        (muted: boolean) => void;
  setDeafened:     (deafened: boolean) => void;
  setActiveChannel:(channelId: string | null) => void;
  setVoiceService: (svc: VoiceService | null) => void;
  setSpeaking:     (userId: string, speaking: boolean) => void;
  clearSpeakingAll:() => void;
  membersInChannel:(channelId: string) => string[];
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  channelMembers:  new Map(),
  userChannel:     new Map(),
  isMuted:         false,
  isDeafened:      false,
  activeChannelId: null,
  voiceService:    null,
  speakingUsers:   new Set(),

  setVoiceState: (userId, channelId) =>
    set((s) => {
      const channelMembers = new Map(s.channelMembers);
      const userChannel    = new Map(s.userChannel);

      // Remove from previous channel
      const prev = userChannel.get(userId);
      if (prev) {
        const members = new Set(channelMembers.get(prev));
        members.delete(userId);
        if (members.size === 0) {
          channelMembers.delete(prev);
        } else {
          channelMembers.set(prev, members);
        }
      }

      if (channelId === null) {
        userChannel.delete(userId);
      } else {
        userChannel.set(userId, channelId);
        const members = new Set(channelMembers.get(channelId));
        members.add(userId);
        channelMembers.set(channelId, members);
      }

      return { channelMembers, userChannel };
    }),

  setMuted: (muted) => {
    // Propagate to active WebRTC session immediately
    get().voiceService?.setMuted(muted);
    set({ isMuted: muted });
  },

  setDeafened: (deafened) => {
    get().voiceService?.setDeafened(deafened);
    set({ isDeafened: deafened });
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  setVoiceService: (svc) => set({ voiceService: svc }),

  setSpeaking: (userId, speaking) =>
    set((s) => {
      const next = new Set(s.speakingUsers);
      if (speaking) next.add(userId);
      else          next.delete(userId);
      return { speakingUsers: next };
    }),

  clearSpeakingAll: () => set({ speakingUsers: new Set() }),

  membersInChannel: (channelId) => {
    const members = get().channelMembers.get(channelId);
    return members ? Array.from(members) : [];
  },
}));
