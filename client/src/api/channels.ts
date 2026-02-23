import { apiFetch } from './client';
import type { Category, Channel } from '../types';

interface CategoriesResponse {
  categories: Category[];
  uncategorized: Channel[];
}

export function getCategories(
  baseURL: string,
  serverId: string
): Promise<CategoriesResponse> {
  return apiFetch(baseURL, serverId, '/categories');
}

export function createCategory(
  baseURL: string,
  serverId: string,
  name: string,
  position?: number
): Promise<Category> {
  return apiFetch(baseURL, serverId, '/categories', {
    method: 'POST',
    body: JSON.stringify({ name, position }),
  });
}

export function createChannel(
  baseURL: string,
  serverId: string,
  input: {
    name: string;
    type: 'text' | 'voice';
    categoryId?: string;
    position?: number;
    topic?: string;
  }
): Promise<Channel> {
  return apiFetch(baseURL, serverId, '/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      type: input.type,
      category_id: input.categoryId,
      position: input.position,
      topic: input.topic,
    }),
  });
}

export function updateChannel(
  baseURL: string,
  serverId: string,
  channelId: string,
  patch: Partial<{ name: string; topic: string | null; position: number; categoryId: string | null }>
): Promise<Channel> {
  return apiFetch(baseURL, serverId, `/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteChannel(
  baseURL: string,
  serverId: string,
  channelId: string
): Promise<void> {
  return apiFetch(baseURL, serverId, `/channels/${channelId}`, {
    method: 'DELETE',
  });
}
