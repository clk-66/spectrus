import { useEffect } from 'react';
import { X, Settings, Shield, Hash, Users, Link2, Package, Palette, type LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { OverviewTab } from './tabs/OverviewTab';
import { RolesTab } from './tabs/RolesTab';
import { ChannelsTab } from './tabs/ChannelsTab';
import { MembersTab } from './tabs/MembersTab';
import { InvitesTab } from './tabs/InvitesTab';
import { PluginsTab } from './tabs/PluginsTab';
import { BrandingTab } from './tabs/BrandingTab';
import styles from './ServerSettings.module.css';

// ---- Tab registry ---------------------------------------------------------

const TABS: ReadonlyArray<{
  id:       string;
  label:    string;
  Icon:     LucideIcon;
  premium?: boolean;
}> = [
  { id: 'overview',  label: 'Overview',  Icon: Settings },
  { id: 'roles',     label: 'Roles',     Icon: Shield },
  { id: 'channels',  label: 'Channels',  Icon: Hash },
  { id: 'members',   label: 'Members',   Icon: Users },
  { id: 'invites',   label: 'Invites',   Icon: Link2 },
  { id: 'plugins',   label: 'Plugins',   Icon: Package },
  { id: 'branding',  label: 'Branding',  Icon: Palette,  premium: true },
];

type TabId = 'overview' | 'roles' | 'channels' | 'members' | 'invites' | 'plugins' | 'branding';

// ---- Component ------------------------------------------------------------

export function ServerSettings() {
  const activeServerSettingsTab = useUIStore((s) => s.activeServerSettingsTab);
  const openServerSettings      = useUIStore((s) => s.openServerSettings);
  const closeServerSettings     = useUIStore((s) => s.closeServerSettings);

  const isOpen = activeServerSettingsTab !== null;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeServerSettings();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeServerSettings]);

  if (!isOpen) return null;

  const activeTab = activeServerSettingsTab as TabId;

  return (
    <div
      className={styles.overlay}
      onClick={closeServerSettings}
      role="dialog"
      aria-modal="true"
      aria-label="Server settings"
    >
      {/* Stop clicks inside the panel from closing the overlay */}
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>

        {/* ---- Left: tab navigation ---- */}
        <nav className={styles.tabNav} aria-label="Settings sections">
          <p className={styles.tabNavSection}>Server settings</p>
          {TABS.map(({ id, label, Icon, premium }) => (
            <button
              key={id}
              className={`${styles.tabBtn} ${activeTab === id ? styles.tabActive : ''}`}
              onClick={() => openServerSettings(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <Icon size={14} />
              <span>{label}</span>
              {premium && <span className={styles.premiumBadge}>PRO</span>}
            </button>
          ))}
        </nav>

        {/* ---- Right: content + close btn ---- */}
        <div className={styles.tabContent}>
          <button
            className={styles.closeBtn}
            onClick={closeServerSettings}
            aria-label="Close server settings"
          >
            <X size={16} />
          </button>

          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'roles'    && <RolesTab />}
          {activeTab === 'channels' && <ChannelsTab />}
          {activeTab === 'members'  && <MembersTab />}
          {activeTab === 'invites'  && <InvitesTab />}
          {activeTab === 'plugins'  && <PluginsTab />}
          {activeTab === 'branding' && <BrandingTab />}
        </div>

      </div>
    </div>
  );
}
