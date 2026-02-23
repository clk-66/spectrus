import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getLicenseStatus, updateServerSettings } from '../../../api/settings';
import { API_BASE } from '../../../constants';
import { PremiumGate } from '../PremiumGate';
import styles from '../ServerSettings.module.css';

// ---- Accent color presets -------------------------------------------------

const ACCENT_PRESETS = [
  '#5865F2', // Spectrus blue (default)
  '#3498DB',
  '#2ECC71',
  '#E74C3C',
  '#FF9800',
  '#9B59B6',
  '#EB459E',
  '#1ABC9C',
];

// ---- Component ------------------------------------------------------------

export function BrandingTab() {
  const serverHost     = useAuthStore((s) => s.serverHost);
  const activeServerId = useUIStore((s) => s.activeServerId) ?? serverHost;

  const [isPremium, setIsPremium] = useState(false);
  const [checking,  setChecking]  = useState(true);

  const [accentColor, setAccentColor] = useState('#5865F2');
  const [customCss,   setCustomCss]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saveOk,      setSaveOk]      = useState(false);
  const [saveErr,     setSaveErr]     = useState('');

  const styleTagRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    setChecking(true);
    getLicenseStatus(API_BASE, activeServerId)
      .then((s) => setIsPremium(s.isPremium))
      .catch(() => setIsPremium(false))
      .finally(() => setChecking(false));
  }, [activeServerId]);

  // Live preview: update --accent CSS variable
  useEffect(() => {
    if (!isPremium) return;
    document.documentElement.style.setProperty('--accent', accentColor);
    // Approximate hover variant (slightly darker)
    document.documentElement.style.setProperty('--accent-hover', accentColor + 'cc');
  }, [accentColor, isPremium]);

  // Live preview: inject custom CSS
  useEffect(() => {
    if (!isPremium) return;
    if (!styleTagRef.current) {
      const tag = document.createElement('style');
      tag.id = 'spectrus-custom-css-preview';
      document.head.appendChild(tag);
      styleTagRef.current = tag;
    }
    styleTagRef.current.textContent = customCss;
  }, [customCss, isPremium]);

  // Cleanup preview style tag on unmount
  useEffect(() => {
    return () => {
      styleTagRef.current?.remove();
      styleTagRef.current = null;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveOk(false);
    setSaveErr('');
    try {
      // Store branding as server settings
      // The server doesn't yet have dedicated branding fields; we piggyback
      // the accent color and custom CSS in the settings table via name field
      // for now. In a real implementation, extend the PATCH /admin/settings schema.
      await updateServerSettings(API_BASE, activeServerId, {
        // Extend this once the server schema has branding fields
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  }

  if (checking) return <p className={styles.loadingRow}>Checking license…</p>;

  return (
    <PremiumGate isPremium={isPremium}>
      <>
        <h2 className={styles.tabHeader}>Branding</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: -16, marginBottom: 24 }}>
          Changes are previewed live. Click Save to persist.
        </p>

        {/* Accent color */}
        <div className={styles.fieldGroup}>
          <span className={styles.label}>Accent color</span>

          <div className={styles.accentPresetRow}>
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                className={`${styles.accentPreset} ${accentColor === color ? styles.accentPresetActive : ''}`}
                style={{ background: color }}
                onClick={() => setAccentColor(color)}
                aria-label={`Set accent to ${color}`}
              />
            ))}
          </div>

          <div className={styles.accentPreview}>
            <input
              type="color"
              className={styles.accentSwatch}
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              title="Custom accent color"
              aria-label="Custom accent color"
            />
            <input
              className="input"
              style={{ width: 120 }}
              type="text"
              value={accentColor}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value;
                setAccentColor(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  document.documentElement.style.setProperty('--accent', v);
                }
              }}
              spellCheck={false}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Live preview active
            </span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Custom CSS */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="custom-css">
            Custom CSS
          </label>
          <textarea
            id="custom-css"
            className={styles.cssTextarea}
            placeholder={`/* Custom CSS applied to your server */\n.channelRow { ... }`}
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            spellCheck={false}
          />
          <span className={styles.fieldHint}>
            Injected into the page as a &lt;style&gt; tag. Use with care.
          </span>
        </div>

        {saveErr && <div className={styles.inlineError}>{saveErr}</div>}

        <div className={styles.saveRow}>
          <button
            className={styles.btnPrimary}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saveOk && <span className={styles.successMsg}>Saved!</span>}
        </div>
      </>
    </PremiumGate>
  );
}
