import { useState, useEffect, useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useServersStore } from '../../../stores/useServersStore';
import { getServerSettings, updateServerSettings } from '../../../api/settings';
import { API_BASE, DEFAULT_SERVER_ID } from '../../../constants';
import styles from '../ServerSettings.module.css';

export function OverviewTab() {
  const activeServerId    = useUIStore((s) => s.activeServerId) ?? DEFAULT_SERVER_ID;
  const updateServer      = useServersStore((s) => s.updateServer);

  const [name,          setName]          = useState('');
  const [iconPreview,   setIconPreview]   = useState('');
  const [bannerPreview, setBannerPreview] = useState('');
  const [iconBase64,    setIconBase64]    = useState<string | undefined>(undefined);
  const [bannerBase64,  setBannerBase64]  = useState<string | undefined>(undefined);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const iconInputRef   = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Load current settings on mount
  useEffect(() => {
    setLoading(true);
    getServerSettings(API_BASE, activeServerId)
      .then((s) => {
        setName(s.name);
        setIconPreview(s.icon);
        setBannerPreview(s.banner);
      })
      .catch(() => { /* best effort */ })
      .finally(() => setLoading(false));
  }, [activeServerId]);

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsBase64(file);
    setIconPreview(dataUrl);
    setIconBase64(dataUrl);
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsBase64(file);
    setBannerPreview(dataUrl);
    setBannerBase64(dataUrl);
  }

  async function handleSave() {
    setSaving(true);
    setSaveOk(false);
    setSaveErr('');
    try {
      await updateServerSettings(API_BASE, activeServerId, {
        name:   name.trim() || undefined,
        icon:   iconBase64,
        banner: bannerBase64,
      });
      // Optimistic update in sidebar
      updateServer(activeServerId, {
        name: name.trim() || undefined,
        icon: iconBase64 ?? iconPreview,
      });
      setSaveOk(true);
      setIconBase64(undefined);
      setBannerBase64(undefined);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className={styles.loadingRow}>Loading…</p>;
  }

  return (
    <>
      <h2 className={styles.tabHeader}>Server Overview</h2>

      {/* Server icon + banner */}
      <div className={styles.fieldGroup}>
        <span className={styles.sectionTitle}>Server icon</span>
        <div className={styles.iconUploadRow}>
          <button
            type="button"
            className={styles.iconUploadBtn}
            onClick={() => iconInputRef.current?.click()}
            aria-label="Upload server icon"
          >
            {iconPreview ? (
              <img className={styles.iconPreview} src={iconPreview} alt="Server icon" />
            ) : (
              <>
                <ImagePlus size={20} />
                <span>Upload</span>
              </>
            )}
          </button>
          <input
            ref={iconInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleIconChange}
          />
          <span className={styles.fieldHint}>
            Recommended: 512×512px PNG or JPEG.<br />
            Click to change.
          </span>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.sectionTitle}>Server banner</span>
        <button
          type="button"
          className={styles.bannerUpload}
          onClick={() => bannerInputRef.current?.click()}
          aria-label="Upload server banner"
        >
          {bannerPreview ? (
            <img className={styles.bannerPreview} src={bannerPreview} alt="Server banner" />
          ) : (
            <>
              <ImagePlus size={18} />
              <span>Upload banner image</span>
            </>
          )}
        </button>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleBannerChange}
        />
        <span className={styles.fieldHint}>Recommended: 1920×480px. Shown at the top of the server.</span>
      </div>

      <div className={styles.divider} />

      {/* Server name */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="settings-server-name">
          Server name
        </label>
        <input
          id="settings-server-name"
          className="input"
          type="text"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {saveErr && <div className={styles.inlineError}>{saveErr}</div>}

      <div className={styles.saveRow}>
        <button
          className={styles.btnPrimary}
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saveOk && <span className={styles.successMsg}>Saved!</span>}
      </div>
    </>
  );
}
