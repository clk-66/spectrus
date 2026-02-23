import { apiFetch } from './client';

export interface ServerSettings {
  name: string;
  icon: string;
  banner: string;
}

export interface SettingsPatch {
  name?: string;
  icon?: string;
  banner?: string;
}

export function getServerSettings(
  baseURL: string,
  serverId: string
): Promise<ServerSettings> {
  return apiFetch(baseURL, serverId, '/admin/settings');
}

export function updateServerSettings(
  baseURL: string,
  serverId: string,
  patch: SettingsPatch
): Promise<void> {
  return apiFetch(baseURL, serverId, '/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function getLicenseStatus(
  baseURL: string,
  serverId: string
): Promise<{ isPremium: boolean }> {
  return apiFetch<{ is_premium: boolean }>(baseURL, serverId, '/license/status').then(
    (r) => ({ isPremium: r.is_premium })
  );
}

export function kickMember(
  baseURL: string,
  serverId: string,
  userId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/members/${userId}`, { method: 'DELETE' });
}
