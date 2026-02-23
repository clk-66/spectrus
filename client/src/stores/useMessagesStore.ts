import { create } from 'zustand';
import type { Message } from '../types';

interface ChannelMessages {
  messages: Message[];
  /** cursor for the next page (oldest message id loaded) */
  cursor: string | null;
  hasMore: boolean;
}

interface MessagesState {
  // keyed by channelId
  channels: Map<string, ChannelMessages>;

  setMessages: (channelId: string, messages: Message[], hasMore: boolean) => void;
  prependMessages: (channelId: string, messages: Message[], hasMore: boolean) => void;
  appendMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, messageId: string, content: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
}

function emptyChannel(): ChannelMessages {
  return { messages: [], cursor: null, hasMore: true };
}

export const useMessagesStore = create<MessagesState>()((set) => ({
  channels: new Map(),

  setMessages: (channelId, messages, hasMore) =>
    set((s) => {
      const next = new Map(s.channels);
      next.set(channelId, {
        messages,
        cursor: messages.length > 0 ? messages[0].id : null,
        hasMore,
      });
      return { channels: next };
    }),

  prependMessages: (channelId, messages, hasMore) =>
    set((s) => {
      const existing = s.channels.get(channelId) ?? emptyChannel();
      const next = new Map(s.channels);
      const merged = [...messages, ...existing.messages];
      next.set(channelId, {
        messages: merged,
        cursor: messages.length > 0 ? messages[0].id : existing.cursor,
        hasMore,
      });
      return { channels: next };
    }),

  appendMessage: (channelId, message) =>
    set((s) => {
      const existing = s.channels.get(channelId) ?? emptyChannel();
      const next = new Map(s.channels);
      next.set(channelId, {
        ...existing,
        messages: [...existing.messages, message],
      });
      return { channels: next };
    }),

  updateMessage: (channelId, messageId, content) =>
    set((s) => {
      const existing = s.channels.get(channelId);
      if (!existing) return s;
      const next = new Map(s.channels);
      next.set(channelId, {
        ...existing,
        messages: existing.messages.map((m) =>
          m.id === messageId
            ? { ...m, content, editedAt: new Date().toISOString() }
            : m
        ),
      });
      return { channels: next };
    }),

  deleteMessage: (channelId, messageId) =>
    set((s) => {
      const existing = s.channels.get(channelId);
      if (!existing) return s;
      const next = new Map(s.channels);
      next.set(channelId, {
        ...existing,
        messages: existing.messages.filter((m) => m.id !== messageId),
      });
      return { channels: next };
    }),
}));
