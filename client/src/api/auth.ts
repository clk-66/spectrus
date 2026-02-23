import type { AuthTokens, CurrentUser } from '../types';
import { setStoredTokens, clearStoredTokens } from './client';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export async function login(
  baseURL: string,
  serverId: string,
  username: string,
  password: string
): Promise<{ tokens: AuthTokens; user: CurrentUser }> {
  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Login failed');
  }

  const data = await res.json() as LoginResponse;
  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
  setStoredTokens(serverId, tokens);

  return {
    tokens,
    user: {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.display_name,
      avatarUrl: data.user.avatar_url,
    },
  };
}

export async function register(
  baseURL: string,
  serverId: string,
  username: string,
  password: string
): Promise<{ tokens: AuthTokens; user: CurrentUser }> {
  const res = await fetch(`${baseURL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, display_name: username }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Registration failed');
  }

  const data = await res.json() as LoginResponse;
  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
  setStoredTokens(serverId, tokens);

  return {
    tokens,
    user: {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.display_name,
      avatarUrl: data.user.avatar_url,
    },
  };
}

export function logout(serverId: string): void {
  clearStoredTokens(serverId);
}
