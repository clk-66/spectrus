import { useState } from 'react';
import {
  Hash,
  Volume2,
  ChevronDown,
  ChevronRight,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { useUIStore } from '../stores/useUIStore';
import { useChannelsStore } from '../stores/useChannelsStore';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useMembersStore } from '../stores/useMembersStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useServersStore } from '../stores/useServersStore';
import { Tooltip } from '../components/Tooltip';
import { VoiceConnectedBar } from '../views/voiceChannel/VoiceConnectedBar';
import type { Channel, Category, Member } from '../types';
import styles from './ChannelSidebar.module.css';

// Stable empty-array sentinels. Using an inline `?? []` inside a Zustand
// selector creates a new array reference on every call, causing Object.is to
// always return false and triggering an infinite re-render loop.
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_CHANNELS: Channel[] = [];
const EMPTY_MEMBERS: Member[] = [];

/** Category section — collapsible */
function CategorySection({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={styles.category}>
      <button
        className={styles.categoryHeader}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className={styles.categoryChevron}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
        <span className={styles.categoryName}>{name}</span>
      </button>
      {!collapsed && <div className={styles.channelList}>{children}</div>}
    </div>
  );
}

/** Single channel row */
function ChannelRow({
  channel,
  active,
  onClick,
  voiceUserIds,
  memberMap,
}: {
  channel: Channel;
  active: boolean;
  onClick: () => void;
  voiceUserIds?: string[];
  memberMap: Map<string, string>; // userId → displayName
}) {
  const isVoice = channel.type === 'voice';

  return (
    <div className={styles.channelRowGroup}>
      <button
        className={`${styles.channelRow} ${active ? styles.channelActive : ''}`}
        onClick={onClick}
        title={channel.topic ?? channel.name}
      >
        <span className={styles.channelIcon}>
          {isVoice ? <Volume2 size={15} /> : <Hash size={15} />}
        </span>
        <span className={styles.channelName}>{channel.name}</span>
      </button>

      {/* Show current voice members inline under the channel */}
      {isVoice && voiceUserIds && voiceUserIds.length > 0 && (
        <ul className={styles.voiceMembers}>
          {voiceUserIds.map((uid) => (
            <li key={uid} className={styles.voiceMember}>
              <span className={styles.speakingDot} aria-hidden />
              <span>{memberMap.get(uid) ?? uid}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChannelSidebar() {
  const { activeServerId, activeChannelId, setActiveChannelId, theme, toggleTheme, openServerSettings } = useUIStore();
  const categories = useChannelsStore((s) =>
    activeServerId ? (s.categories.get(activeServerId) ?? EMPTY_CATEGORIES) : EMPTY_CATEGORIES
  );
  const uncategorized = useChannelsStore((s) =>
    activeServerId ? (s.uncategorized.get(activeServerId) ?? EMPTY_CHANNELS) : EMPTY_CHANNELS
  );
  const { isMuted, isDeafened, setMuted, setDeafened } = useVoiceStore();
  const channelMembers = useVoiceStore((s) => s.channelMembers);
  const members = useMembersStore((s) =>
    activeServerId ? (s.members.get(activeServerId) ?? EMPTY_MEMBERS) : EMPTY_MEMBERS
  );
  const currentUser = useAuthStore((s) => s.currentUser);
  const serverEntry = useServersStore((s) =>
    activeServerId ? s.servers.get(activeServerId) : undefined
  );

  // Build userId → displayName for voice member inline display
  const memberMap = new Map(members.map((m) => [m.userId, m.displayName]));

  const serverName = serverEntry?.server.name ?? (activeServerId ? 'Loading…' : 'No Server Selected');

  const handleChannelClick = (channelId: string) => {
    setActiveChannelId(channelId);
  };

  return (
    <aside className={styles.sidebar}>
      {/* ---- Header ---- */}
      <button
        className={styles.serverHeader}
        onClick={() => openServerSettings('overview')}
        aria-label="Server settings"
      >
        <span className={styles.serverName}>{serverName}</span>
        <ChevronDown size={16} className={styles.serverChevron} />
      </button>

      {/* ---- Channel list ---- */}
      <div className={styles.channelScroll}>
        {/* Uncategorized channels */}
        {uncategorized.map((ch) => (
          <ChannelRow
            key={ch.id}
            channel={ch}
            active={ch.id === activeChannelId}
            onClick={() => handleChannelClick(ch.id)}
            voiceUserIds={
              ch.type === 'voice'
                ? Array.from(channelMembers.get(ch.id) ?? [])
                : undefined
            }
            memberMap={memberMap}
          />
        ))}

        {/* Categorized channels */}
        {categories.map((cat) => (
          <CategorySection key={cat.id} name={cat.name}>
            {cat.channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                active={ch.id === activeChannelId}
                onClick={() => handleChannelClick(ch.id)}
                voiceUserIds={
                  ch.type === 'voice'
                    ? Array.from(channelMembers.get(ch.id) ?? [])
                    : undefined
                }
                memberMap={memberMap}
              />
            ))}
          </CategorySection>
        ))}

        {/* Empty state */}
        {categories.length === 0 && uncategorized.length === 0 && (
          <p className={styles.emptyHint}>
            {activeServerId
              ? 'No channels yet.'
              : 'Select a server to get started.'}
          </p>
        )}
      </div>

      {/* ---- Voice connected bar (visible while in any voice channel) ---- */}
      <VoiceConnectedBar />

      {/* ---- User strip ---- */}
      <div className={styles.userStrip}>
        {/* Avatar */}
        <div className={styles.userAvatarWrap}>
          {currentUser?.avatarUrl ? (
            <img className={styles.userAvatar} src={currentUser.avatarUrl} alt="" />
          ) : (
            <div className={styles.userAvatarPlaceholder}>
              {currentUser?.displayName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        {/* Name */}
        <div className={styles.userInfo}>
          <span className={styles.userDisplayName}>
            {currentUser?.displayName ?? '—'}
          </span>
          <span className={styles.userUsername}>
            @{currentUser?.username ?? '—'}
          </span>
        </div>

        {/* Controls */}
        <div className={styles.userControls}>
          {/* Theme toggle */}
          <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="top">
            <button
              className={styles.controlBtn}
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </Tooltip>

          <Tooltip content={isMuted ? 'Unmute' : 'Mute'} side="top">
            <button
              className={`${styles.controlBtn} ${isMuted ? styles.controlActive : ''}`}
              onClick={() => setMuted(!isMuted)}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </Tooltip>

          <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'} side="top">
            <button
              className={`${styles.controlBtn} ${isDeafened ? styles.controlActive : ''}`}
              onClick={() => setDeafened(!isDeafened)}
              aria-label={isDeafened ? 'Undeafen' : 'Deafen'}
              aria-pressed={isDeafened}
            >
              <Headphones size={16} />
            </button>
          </Tooltip>

          <Tooltip content="User settings" side="top">
            <button
              className={styles.controlBtn}
              onClick={() => openServerSettings('overview')}
              aria-label="User settings"
            >
              <Settings size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
