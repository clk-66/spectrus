import { useUIStore } from '../stores/useUIStore';
import { useChannelsStore } from '../stores/useChannelsStore';
import { TextChannel } from '../views/textChannel/TextChannel';
import { VoiceChannel } from '../views/voiceChannel/VoiceChannel';
import styles from './ContentArea.module.css';

/**
 * ContentArea renders the main content column plus the optional member sidebar.
 */
export function ContentArea() {
  const { activeChannelId, activeServerId, isMemberSidebarOpen } = useUIStore();

  // Look up active channel from categories + uncategorized
  const activeChannel = useChannelsStore((s) => {
    if (!activeServerId || !activeChannelId) return null;
    const cats = s.categories.get(activeServerId) ?? [];
    for (const cat of cats) {
      for (const ch of cat.channels) {
        if (ch.id === activeChannelId) return ch;
      }
    }
    return (s.uncategorized.get(activeServerId) ?? []).find(
      (ch) => ch.id === activeChannelId
    ) ?? null;
  });

  const emptyReason = !activeServerId
    ? 'no-server'
    : !activeChannelId
    ? 'no-channel'
    : null;

  return (
    <div className={styles.outer}>
      {/* Main content */}
      <div className={styles.main}>
        {emptyReason === 'no-server' && (
          <EmptyState
            title="No server selected"
            body="Choose a server from the rail on the left, or add a new one."
          />
        )}
        {emptyReason === 'no-channel' && (
          <EmptyState
            title="No channel selected"
            body="Pick a text or voice channel from the sidebar."
          />
        )}

        {activeChannel?.type === 'text' && (
          <TextChannel
            key={activeChannel.id}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
            topic={activeChannel.topic}
          />
        )}

        {activeChannel?.type === 'voice' && (
          <VoiceChannel
            key={activeChannel.id}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
          />
        )}
      </div>

      {/* Member sidebar — only shown when a server is active */}
      {activeServerId && isMemberSidebarOpen && (
        <aside className={styles.memberSidebar}>
          <p className={styles.memberSidebarLabel}>Members</p>
          {/* MemberList view will go here */}
        </aside>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon} aria-hidden>✦</span>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyBody}>{body}</p>
    </div>
  );
}

