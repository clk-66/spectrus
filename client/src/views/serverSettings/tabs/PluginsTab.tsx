import { useState, useEffect } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getPlugins, installPlugin, setPluginEnabled, deletePlugin } from '../../../api/plugins';
import { API_BASE } from '../../../constants';
import type { Plugin, PluginManifest } from '../../../types';
import { ApiError } from '../../../api/client';
import styles from '../ServerSettings.module.css';

// ---- Helpers --------------------------------------------------------------

/**
 * Given a GitHub repo URL like https://github.com/user/repo,
 * derive the raw manifest URL. Falls back to null if not GitHub.
 */
function rawManifestUrl(repoUrl: string): string | null {
  try {
    const url = new URL(repoUrl);
    if (!url.hostname.includes('github.com')) return null;
    const [, owner, repo] = url.pathname.split('/');
    if (!owner || !repo) return null;
    const cleanRepo = repo.replace(/\.git$/, '');
    return `https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/spectrus-plugin.json`;
  } catch {
    return null;
  }
}

// ---- Component ------------------------------------------------------------

export function PluginsTab() {
  const serverHost     = useAuthStore((s) => s.serverHost);
  const activeServerId = useUIStore((s) => s.activeServerId) ?? serverHost;

  const [plugins,    setPlugins]   = useState<Plugin[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Install panel
  const [repoUrl,     setRepoUrl]     = useState('');
  const [previewing,  setPreviewing]  = useState(false);
  const [preview,     setPreview]     = useState<PluginManifest | null>(null);
  const [previewErr,  setPreviewErr]  = useState('');
  const [installing,  setInstalling]  = useState(false);
  const [installErr,  setInstallErr]  = useState('');

  useEffect(() => {
    setLoading(true);
    getPlugins(API_BASE, activeServerId)
      .then(setPlugins)
      .finally(() => setLoading(false));
  }, [activeServerId]);

  async function handlePreview() {
    setPreviewErr('');
    setPreview(null);
    const manifestUrl = rawManifestUrl(repoUrl.trim());

    if (!manifestUrl) {
      // Not GitHub — skip preview, go straight to confirm
      setPreview(null);
      setPreviewErr('');
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error('Manifest not found');
      const data = await res.json() as PluginManifest;
      setPreview(data);
    } catch {
      // Preview failed — user can still install directly
      setPreviewErr('Could not fetch manifest preview. You can still install directly.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleInstall() {
    if (!repoUrl.trim()) return;
    setInstalling(true);
    setInstallErr('');
    try {
      const plugin = await installPlugin(API_BASE, activeServerId, repoUrl.trim());
      setPlugins((prev) => [plugin, ...prev]);
      setRepoUrl('');
      setPreview(null);
      setPreviewErr('');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) setInstallErr('Invalid plugin manifest.');
        else if (err.status === 502) setInstallErr('Could not fetch plugin from repository.');
        else if (err.status === 409) setInstallErr('Plugin from this repository is already installed.');
        else setInstallErr(err.message);
      } else {
        setInstallErr(err instanceof Error ? err.message : 'Installation failed.');
      }
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggle(plugin: Plugin) {
    setTogglingId(plugin.id);
    try {
      const updated = await setPluginEnabled(API_BASE, activeServerId, plugin.id, !plugin.enabled);
      setPlugins((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    } catch { /* ignore */ }
    finally { setTogglingId(null); }
  }

  async function handleDelete(pluginId: string) {
    setDeletingId(pluginId);
    try {
      await deletePlugin(API_BASE, activeServerId, pluginId);
      setPlugins((prev) => prev.filter((p) => p.id !== pluginId));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  if (loading) return <p className={styles.loadingRow}>Loading plugins…</p>;

  return (
    <>
      <h2 className={styles.tabHeader}>Plugins</h2>

      {/* Installed plugins */}
      {plugins.length === 0 ? (
        <div className={styles.emptyState}>
          <Package size={32} style={{ opacity: 0.3 }} />
          <span>No plugins installed.</span>
        </div>
      ) : (
        <div className={styles.pluginList}>
          {plugins.map((plugin) => (
            <div key={plugin.id} className={styles.pluginCard}>
              <div className={styles.pluginIconWrap}>
                <Package size={20} />
              </div>
              <div className={styles.pluginInfo}>
                <p className={styles.pluginName}>{plugin.manifest.name}</p>
                <p className={styles.pluginMeta}>
                  v{plugin.manifest.version} · by {plugin.manifest.author}
                  {plugin.manifest.description && ` · ${plugin.manifest.description}`}
                </p>
              </div>
              <div className={styles.pluginCardActions}>
                {/* Enable toggle */}
                <label className={styles.toggle} title={plugin.enabled ? 'Disable' : 'Enable'}>
                  <input
                    type="checkbox"
                    checked={plugin.enabled}
                    disabled={togglingId === plugin.id}
                    onChange={() => void handleToggle(plugin)}
                  />
                  <span className={styles.toggleTrack} />
                  <span className={styles.toggleThumb} />
                </label>

                {/* Delete */}
                <button
                  className={styles.btnDanger}
                  style={{ height: 28, padding: '0 8px' }}
                  disabled={deletingId === plugin.id}
                  onClick={() => void handleDelete(plugin.id)}
                  aria-label={`Remove ${plugin.manifest.name}`}
                  title="Remove plugin"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.divider} />

      {/* Install panel */}
      <div className={styles.installPanel}>
        <h3 className={styles.installTitle}>
          <Plus size={16} style={{ marginRight: 6 }} />
          Install plugin
        </h3>

        <div className={styles.installRow}>
          <input
            className="input"
            style={{ flex: 1 }}
            type="url"
            placeholder="https://github.com/user/spectrus-plugin"
            value={repoUrl}
            onChange={(e) => { setRepoUrl(e.target.value); setPreview(null); setPreviewErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handlePreview(); }}
          />
          <button
            className={styles.btnSecondary}
            disabled={!repoUrl.trim() || previewing}
            onClick={() => void handlePreview()}
          >
            {previewing ? 'Fetching…' : 'Preview'}
          </button>
        </div>

        {/* Preview card */}
        {preview && (
          <div className={styles.manifestPreview}>
            <p className={styles.manifestTitle}>{preview.name}</p>
            <p className={styles.manifestMeta}>
              v{preview.version} · by {preview.author}
              {preview.description && ` · ${preview.description}`}
            </p>
            {preview.permissions.length > 0 && (
              <div className={styles.manifestPerms}>
                {preview.permissions.map((p) => (
                  <span key={p} className={styles.manifestPermBadge}>{p}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {previewErr && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8 }}>
            {previewErr}
          </p>
        )}

        {installErr && <div className={styles.inlineError} style={{ marginTop: 8 }}>{installErr}</div>}

        <div className={styles.saveRow}>
          <button
            className={styles.btnPrimary}
            disabled={!repoUrl.trim() || installing}
            onClick={() => void handleInstall()}
          >
            {installing ? 'Installing…' : 'Confirm Install'}
          </button>
          {repoUrl && (
            <button
              className={styles.btnSecondary}
              onClick={() => { setRepoUrl(''); setPreview(null); setPreviewErr(''); setInstallErr(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </>
  );
}
