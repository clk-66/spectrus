/**
 * Base fetch wrapper.
 *
 * Token storage is delegated to KeychainService, which uses the native OS
 * credential store when running inside Tauri and falls back to localStorage
 * in a plain browser.
 *
 * All storage functions are async because the Tauri invoke bridge is async.
 * Callers inside useEffect should use async IIFEs or await them normally.
 */

import {
  keychainGet,
  keychainSet,
  keychainDelete,
} from '../services/KeychainService';

const STORAGE_KEY = (serverId: string) => `spectrus:tokens:${serverId}`;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function getStoredTokens(
  serverId: string
): Promise<StoredTokens | null> {
  const raw = await keychainGet(STORAGE_KEY(serverId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export async function setStoredTokens(
  serverId: string,
  tokens: StoredTokens
): Promise<void> {
  await keychainSet(STORAGE_KEY(serverId), JSON.stringify(tokens));
}

export async function clearStoredTokens(serverId: string): Promise<void> {
  await keychainDelete(STORAGE_KEY(serverId));
}

// ---- API client ----------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Makes an authenticated request to the server at `baseURL`.
 * Automatically injects Authorization header and handles 401 refresh.
 */
export async function apiFetch<T>(
  baseURL: string,
  serverId: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const tokens = await getStoredTokens(serverId);
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  if (tokens) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const url = `${baseURL}${path}`;
  let res = await fetch(url, { ...init, headers });

  // Attempt token refresh on first 401
  if (res.status === 401 && tokens?.refreshToken) {
    const refreshed = await tryRefresh(baseURL, serverId, tokens.refreshToken);
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      res = await fetch(url, { ...init, headers });
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;

  return res.json() as Promise<T>;
}

async function tryRefresh(
  baseURL: string,
  serverId: string,
  refreshToken: string
): Promise<StoredTokens | null> {
  try {
    const res = await fetch(`${baseURL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await clearStoredTokens(serverId);
      return null;
    }
    const data = await res.json() as { access_token: string; refresh_token: string };
    const tokens: StoredTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
    await setStoredTokens(serverId, tokens);
    return tokens;
  } catch {
    return null;
  }
}
