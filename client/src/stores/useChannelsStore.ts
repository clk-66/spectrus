import { create } from 'zustand';
import type { Category, Channel } from '../types';

interface ChannelsState {
  // keyed by serverId
  categories: Map<string, Category[]>;
  uncategorized: Map<string, Channel[]>;

  setCategories: (
    serverId: string,
    categories: Category[],
    uncategorized: Channel[]
  ) => void;

  upsertChannel: (serverId: string, channel: Channel) => void;
  removeChannel: (serverId: string, channelId: string) => void;
}

export const useChannelsStore = create<ChannelsState>()((set) => ({
  categories: new Map(),
  uncategorized: new Map(),

  setCategories: (serverId, cats, uncategorized) =>
    set((s) => {
      const nextCats = new Map(s.categories);
      nextCats.set(serverId, cats);
      const nextUncat = new Map(s.uncategorized);
      nextUncat.set(serverId, uncategorized);
      return { categories: nextCats, uncategorized: nextUncat };
    }),

  upsertChannel: (serverId, channel) =>
    set((s) => {
      // Try to update in categories first, then uncategorized
      const cats = s.categories.get(serverId) ?? [];
      let updated = false;

      const nextCats = cats.map((cat) => {
        const idx = cat.channels.findIndex((c) => c.id === channel.id);
        if (idx === -1) return cat;
        updated = true;
        const channels = [...cat.channels];
        channels[idx] = channel;
        return { ...cat, channels };
      });

      if (!updated) {
        // Check uncategorized
        const uncat = s.uncategorized.get(serverId) ?? [];
        const idx = uncat.findIndex((c) => c.id === channel.id);
        const nextUncat = new Map(s.uncategorized);
        if (idx !== -1) {
          const arr = [...uncat];
          arr[idx] = channel;
          nextUncat.set(serverId, arr);
        } else {
          nextUncat.set(serverId, [...uncat, channel]);
        }
        return { uncategorized: nextUncat };
      }

      const nextCatsMap = new Map(s.categories);
      nextCatsMap.set(serverId, nextCats);
      return { categories: nextCatsMap };
    }),

  removeChannel: (serverId, channelId) =>
    set((s) => {
      const cats = (s.categories.get(serverId) ?? []).map((cat) => ({
        ...cat,
        channels: cat.channels.filter((c) => c.id !== channelId),
      }));
      const nextCats = new Map(s.categories);
      nextCats.set(serverId, cats);

      const nextUncat = new Map(s.uncategorized);
      nextUncat.set(
        serverId,
        (s.uncategorized.get(serverId) ?? []).filter((c) => c.id !== channelId)
      );

      return { categories: nextCats, uncategorized: nextUncat };
    }),
}));
