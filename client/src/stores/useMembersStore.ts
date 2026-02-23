import { create } from 'zustand';
import type { Member, Role } from '../types';

interface MembersState {
  // keyed by serverId
  members: Map<string, Member[]>;
  roles: Map<string, Role[]>;

  setMembers: (serverId: string, members: Member[]) => void;
  setRoles: (serverId: string, roles: Role[]) => void;
  upsertMember: (serverId: string, member: Member) => void;
  upsertRole: (serverId: string, role: Role) => void;
}

export const useMembersStore = create<MembersState>()((set) => ({
  members: new Map(),
  roles: new Map(),

  setMembers: (serverId, members) =>
    set((s) => {
      const next = new Map(s.members);
      next.set(serverId, members);
      return { members: next };
    }),

  setRoles: (serverId, roles) =>
    set((s) => {
      const next = new Map(s.roles);
      next.set(serverId, roles);
      return { roles: next };
    }),

  upsertMember: (serverId, member) =>
    set((s) => {
      const existing = s.members.get(serverId) ?? [];
      const idx = existing.findIndex((m) => m.userId === member.userId);
      const next = new Map(s.members);
      if (idx === -1) {
        next.set(serverId, [...existing, member]);
      } else {
        const arr = [...existing];
        arr[idx] = member;
        next.set(serverId, arr);
      }
      return { members: next };
    }),

  upsertRole: (serverId, role) =>
    set((s) => {
      const existing = s.roles.get(serverId) ?? [];
      const idx = existing.findIndex((r) => r.id === role.id);
      const next = new Map(s.roles);
      if (idx === -1) {
        next.set(serverId, [...existing, role]);
      } else {
        const arr = [...existing];
        arr[idx] = role;
        next.set(serverId, arr);
      }
      return { roles: next };
    }),
}));
