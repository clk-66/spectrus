/**
 * KeychainService — thin async key/value store.
 *
 * In Tauri: delegates to the native OS credential store via Rust commands
 *   (macOS Keychain, Windows Credential Manager, Linux libsecret).
 * In browser: falls back to localStorage.
 *
 * Operates on raw strings only; callers handle serialisation.
 */

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI__' in window;

export async function keychainGet(key: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('keychain_get', { key });
  }
  return localStorage.getItem(key);
}

export async function keychainSet(key: string, value: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<void>('keychain_set', { key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

export async function keychainDelete(key: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<void>('keychain_delete', { key });
  } else {
    localStorage.removeItem(key);
  }
}
