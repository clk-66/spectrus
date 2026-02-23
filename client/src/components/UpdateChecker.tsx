import { useEffect, useState } from 'react';
import styles from './UpdateChecker.module.css';

interface UpdateInfo {
  version: string;
}

/**
 * Checks for a new Tauri app version on mount and shows a non-blocking toast
 * if one is available. Does nothing when running in a browser.
 */
export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('__TAURI__' in window)) return;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const result = await check();
        if (result) setUpdate({ version: result.version });
      } catch (err) {
        // Update check failures are silent — never block the user.
        console.warn('[UpdateChecker] update check failed', err);
      }
    })();
  }, []);

  async function handleInstall() {
    if (!update || installing) return;
    setInstalling(true);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const result = await check();
      if (result) {
        await result.downloadAndInstall();
        await relaunch();
      }
    } catch (err) {
      console.error('[UpdateChecker] install failed', err);
      setInstalling(false);
    }
  }

  if (!update || dismissed) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <div className={styles.message}>
        <span className={styles.dot} aria-hidden="true" />
        <span>Spectrus {update.version} is available</span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.updateBtn}
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? 'Installing…' : 'Update & Relaunch'}
        </button>
        <button
          className={styles.laterBtn}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notification"
        >
          Later
        </button>
      </div>
    </div>
  );
}
