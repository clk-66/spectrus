import { apiFetch } from './client';
import type { Message } from '../types';

interface MessagesPage {
  messages: Message[];
  has_more: boolean;
  next_cursor: string | null;
}

export function getMessages(
  baseURL: string,
  serverId: string,
  channelId: string,
  options?: { before?: string; limit?: number }
): Promise<MessagesPage> {
  const params = new URLSearchParams();
  if (options?.before) params.set('before', options.before);
  if (options?.limit) params.set('limit', String(options.limit));

  const qs = params.size > 0 ? `?${params}` : '';
  return apiFetch(baseURL, serverId, `/channels/${channelId}/messages${qs}`);
}

export function sendMessage(
  baseURL: string,
  serverId: string,
  channelId: string,
  content: string
): Promise<Message> {
  return apiFetch(baseURL, serverId, `/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
