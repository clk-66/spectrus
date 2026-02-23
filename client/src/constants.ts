/**
 * Runtime constants derived from Vite env vars.
 *
 * In development set VITE_API_URL / VITE_WS_URL in .env.local.
 * In production (client served from the same origin as the Go server)
 * leave them unset — the defaults point at the same host.
 *
 * Example .env.local for local dev:
 *   VITE_API_URL=http://localhost:3000
 *   VITE_WS_URL=ws://localhost:3000
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export const WS_BASE: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  API_BASE.replace(/^http/, 'ws');

/**
 * For the single-server MVP, every connection targets the same instance.
 * The server's SQLite `servers` table has exactly one row with id = 'main'.
 */
export const DEFAULT_SERVER_ID = 'main';
