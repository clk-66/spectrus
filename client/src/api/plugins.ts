import { apiFetch } from './client';
import type { Plugin } from '../types';

export function getPlugins(baseURL: string, serverId: string): Promise<Plugin[]> {
  return apiFetch(baseURL, serverId, '/plugins');
}

export function installPlugin(
  baseURL: string,
  serverId: string,
  repoUrl: string
): Promise<Plugin> {
  return apiFetch(baseURL, serverId, '/plugins', {
    method: 'POST',
    body: JSON.stringify({ repo_url: repoUrl }),
  });
}

export function setPluginEnabled(
  baseURL: string,
  serverId: string,
  pluginId: string,
  enabled: boolean
): Promise<Plugin> {
  return apiFetch(baseURL, serverId, `/plugins/${pluginId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function deletePlugin(
  baseURL: string,
  serverId: string,
  pluginId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/plugins/${pluginId}`, {
    method: 'DELETE',
  });
}
