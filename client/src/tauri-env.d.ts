/**
 * Ambient module declarations for Tauri v2 packages.
 *
 * These are used by the TypeScript compiler when the packages are not yet
 * installed (e.g. CI that only builds the browser bundle). When the packages
 * ARE installed, their own bundled type declarations take precedence and
 * these declarations are ignored.
 */

declare module '@tauri-apps/api/core' {
  export function invoke<T = void>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T>;
}

declare module '@tauri-apps/api/event' {
  export type UnlistenFn = () => void;
  export interface TauriEvent<T> {
    event: string;
    id: number;
    payload: T;
    windowLabel: string;
  }
  export function listen<T>(
    event: string,
    handler: (event: TauriEvent<T>) => void
  ): Promise<UnlistenFn>;
}

declare module '@tauri-apps/plugin-deep-link' {
  export function getCurrent(): Promise<string[] | null>;
  export function onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>;
}

declare module '@tauri-apps/plugin-updater' {
  export interface Update {
    version: string;
    date?: string;
    body?: string;
    downloadAndInstall(): Promise<void>;
  }
  export function check(): Promise<Update | null>;
}

declare module '@tauri-apps/plugin-process' {
  export function relaunch(): Promise<void>;
}
