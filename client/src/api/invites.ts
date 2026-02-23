import { apiFetch, ApiError } from './client';
import type { Invite, InvitePreview } from '../types';

export function getInvitePreview(
  baseURL: string,
  token: string
): Promise<InvitePreview> {
  // Public endpoint — no auth required.
  // Throws ApiError so callers can inspect the HTTP status code.
  return fetch(`${baseURL}/invites/${token}`).then(async (r) => {
    if (!r.ok) {
      let message = r.statusText;
      try {
        const body = (await r.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch { /* ignore parse errors */ }
      throw new ApiError(r.status, message);
    }
    return r.json() as Promise<InvitePreview>;
  });
}

export function createInvite(
  baseURL: string,
  serverId: string,
  options?: { maxUses?: number; expiresAt?: string }
): Promise<Invite> {
  return apiFetch(baseURL, serverId, '/invites', {
    method: 'POST',
    body: JSON.stringify({
      max_uses: options?.maxUses,
      expires_at: options?.expiresAt,
    }),
  });
}

export function useInvite(
  baseURL: string,
  serverId: string,
  token: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/invites/${token}/use`, {
    method: 'POST',
  });
}

export function getInvites(
  baseURL: string,
  serverId: string
): Promise<Invite[]> {
  return apiFetch(baseURL, serverId, '/invites');
}

export function revokeInvite(
  baseURL: string,
  serverId: string,
  token: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/invites/${token}`, { method: 'DELETE' });
}
