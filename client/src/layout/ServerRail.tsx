import { Plus, Settings } from 'lucide-react';
import { useUIStore } from '../stores/useUIStore';
import { useServersStore } from '../stores/useServersStore';
import { Tooltip } from '../components/Tooltip';
import styles from './ServerRail.module.css';

/** Returns initials from a server name for the icon placeholder. */
function nameInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Deterministic color derived from the server id string for placeholder icons.
 * Uses a simple djb2 hash → hsl.
 */
function idToHue(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 33) ^ id.charCodeAt(i);
  }
  return Math.abs(hash) % 360;
}

export function ServerRail() {
  const { activeServerId, setActiveServerId, openServerSettings } = useUIStore();
  // Select the Map reference — only changes when the store actually mutates.
  // Calling s.serverList() inside the selector returns a new Array on every
  // invocation, which makes Object.is always return false and causes an
  // infinite re-render loop.
  const servers = useServersStore((s) => s.servers);
  const serverList = Array.from(servers.values());

  return (
    <nav className={styles.rail} aria-label="Servers">
      {/* Separator pill at top */}
      <div className={styles.separator} />

      {/* Server list */}
      <div className={styles.serverList}>
        {serverList.map(({ server }) => {
          const isActive = server.id === activeServerId;
          const hue = idToHue(server.id);

          return (
            <Tooltip key={server.id} content={server.name} side="right">
              <button
                className={`${styles.serverBtn} ${isActive ? styles.active : ''}`}
                onClick={() => setActiveServerId(server.id)}
                aria-label={server.name}
                aria-pressed={isActive}
              >
                {/* Active / hover indicator bar */}
                <span className={styles.indicator} aria-hidden />

                {/* Server icon — image if available, else colored initials */}
                {server.icon ? (
                  <img
                    className={styles.icon}
                    src={server.icon}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <span
                    className={`${styles.icon} ${styles.iconPlaceholder}`}
                    style={{ '--hue': hue } as React.CSSProperties}
                  >
                    {nameInitials(server.name)}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Spacer pushes bottom actions down */}
      <div className={styles.spacer} />

      {/* Add server */}
      <Tooltip content="Add a Server" side="right">
        <button
          className={`${styles.serverBtn} ${styles.actionBtn}`}
          aria-label="Add a server"
          onClick={() => { /* TODO: open add-server modal */ }}
        >
          <span className={styles.indicator} aria-hidden />
          <span className={`${styles.icon} ${styles.addIcon}`}>
            <Plus size={20} />
          </span>
        </button>
      </Tooltip>

      <div className={styles.divider} />

      {/* Server / user settings */}
      <Tooltip content="User Settings" side="right">
        <button
          className={`${styles.serverBtn} ${styles.actionBtn}`}
          aria-label="User settings"
          onClick={() => openServerSettings('overview')}
        >
          <span className={styles.indicator} aria-hidden />
          <span className={`${styles.icon} ${styles.settingsIcon}`}>
            <Settings size={18} />
          </span>
        </button>
      </Tooltip>

      <div className={styles.bottomPad} />
    </nav>
  );
}
