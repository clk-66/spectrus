import { apiFetch } from './client';
import type { Role } from '../types';

export function createRole(
  baseURL: string,
  serverId: string,
  input: { name: string; color?: number; permissions?: string[] }
): Promise<Role> {
  return apiFetch(baseURL, serverId, '/roles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRole(
  baseURL: string,
  serverId: string,
  roleId: string,
  patch: Partial<{ name: string; color: number; permissions: string[]; position: number }>
): Promise<Role> {
  return apiFetch(baseURL, serverId, `/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteRole(
  baseURL: string,
  serverId: string,
  roleId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/roles/${roleId}`, {
    method: 'DELETE',
  });
}
