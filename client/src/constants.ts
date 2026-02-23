/**
 * Runtime constants derived from the current window location.
 *
 * Because the React client is served from the same origin as the Go server,
 * both URLs are derived from window.location so they work on any IP, domain,
 * or port without configuration.
 *
 * In development, override via .env.local:
 *   VITE_API_URL=http://localhost:3000
 *   VITE_WS_URL=ws://localhost:3000
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin;

export const WS_BASE: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  window.location.origin.replace(/^http/, 'ws');

