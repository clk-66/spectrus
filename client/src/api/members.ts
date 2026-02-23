import { apiFetch } from './client';
import type { Member, Role } from '../types';

export function getMembers(baseURL: string, serverId: string): Promise<Member[]> {
  return apiFetch(baseURL, serverId, '/members');
}

export function getRoles(baseURL: string, serverId: string): Promise<Role[]> {
  return apiFetch(baseURL, serverId, '/roles');
}

export function assignRole(
  baseURL: string,
  serverId: string,
  userId: string,
  roleId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/members/${userId}/roles/${roleId}`, {
    method: 'POST',
  });
}

export function removeRole(
  baseURL: string,
  serverId: string,
  userId: string,
  roleId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}
