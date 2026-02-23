import { Mic } from 'lucide-react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useChannelsStore } from '../../stores/useChannelsStore';
import { useUIStore } from '../../stores/useUIStore';
import styles from './VoiceChannel.module.css';

/**
 * Rendered in ChannelSidebar whenever the user is connected to a voice channel.
 * Persists across channel navigation so users know they're still in voice.
 */
export function VoiceConnectedBar() {
  const { activeChannelId: voiceChannelId, voiceService, setVoiceService, setActiveChannel } =
    useVoiceStore();
  const activeServerId = useUIStore((s) => s.activeServerId);

  // Look up the connected channel's name.
  const channelName = useChannelsStore((s) => {
    if (!activeServerId || !voiceChannelId) return null;
    const cats = s.categories.get(activeServerId) ?? [];
    for (const cat of cats) {
      for (const ch of cat.channels) {
        if (ch.id === voiceChannelId) return ch.name;
      }
    }
    return (
      (s.uncategorized.get(activeServerId) ?? []).find((ch) => ch.id === voiceChannelId)
        ?.name ?? null
    );
  });

  if (!voiceChannelId) return null;

  const handleLeave = () => {
    voiceService?.leave();
    setVoiceService(null);
    setActiveChannel(null);
  };

  return (
    <div className={styles.connectedBar}>
      <Mic size={16} className={styles.connectedMicIcon} aria-hidden />

      <div className={styles.connectedInfo}>
        <span className={styles.connectedStatus}>Voice Connected</span>
        <span className={styles.connectedChannel}>
          {channelName ?? 'Unknown channel'}
        </span>
      </div>

      <button
        className={styles.connectedLeave}
        onClick={handleLeave}
        aria-label="Leave voice channel"
      >
        Leave
      </button>
    </div>
  );
}
