import { useEffect, useState, useCallback } from 'react';
import { Hash } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useMessagesStore } from '../../stores/useMessagesStore';
import { getMessages } from '../../api/messages';
import { API_BASE } from '../../constants';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import styles from './TextChannel.module.css';

interface Props {
  channelId:   string;
  channelName: string;
  topic?:      string;
}

export function TextChannel({ channelId, channelName, topic }: Props) {
  const serverId = useAuthStore((s) => s.serverId);

  const channelData = useMessagesStore((s) => s.channels.get(channelId));
  const messages    = channelData?.messages   ?? [];
  const hasMore     = channelData?.hasMore    ?? true;
  const cursor      = channelData?.cursor     ?? null;

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);

  // ---- Initial load ------------------------------------------------------

  useEffect(() => {
    if (!serverId) return;

    // Skip fetch if we already have messages for this channel
    const existing = useMessagesStore.getState().channels.get(channelId);
    if (existing && existing.messages.length > 0) return;

    setLoadingInitial(true);
    getMessages(API_BASE, serverId, channelId, { limit: 50 })
      .then((page) => {
        useMessagesStore
          .getState()
          .setMessages(channelId, page.messages, page.has_more);
      })
      .catch((err: unknown) => console.error('Failed to load messages', err))
      .finally(() => setLoadingInitial(false));
  }, [channelId, serverId]);

  // ---- Pagination --------------------------------------------------------

  const handleLoadMore = useCallback(async () => {
    if (!serverId || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getMessages(API_BASE, serverId, channelId, {
        before: cursor,
        limit:  50,
      });
      useMessagesStore
        .getState()
        .prependMessages(channelId, page.messages, page.has_more);
    } catch (err: unknown) {
      console.error('Failed to load older messages', err);
    } finally {
      setLoadingMore(false);
    }
  }, [serverId, channelId, cursor, hasMore, loadingMore]);

  // ---- Render ------------------------------------------------------------

  return (
    <div className={styles.textChannel}>
      {/* Header */}
      <div className={styles.header}>
        <Hash size={18} className={styles.headerIcon} aria-hidden />
        <span className={styles.headerName}>{channelName}</span>
        {topic && (
          <>
            <span className={styles.headerSep} aria-hidden>|</span>
            <span className={styles.headerTopic}>{topic}</span>
          </>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {loadingInitial ? (
          <div className={styles.loading}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <EmptyChannel channelName={channelName} />
        ) : (
          <MessageList
            messages={messages}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        )}
        <TypingIndicator channelId={channelId} />
        <MessageInput channelId={channelId} channelName={channelName} />
      </div>
    </div>
  );
}

// ---- Empty state ---------------------------------------------------------

function EmptyChannel({ channelName }: { channelName: string }) {
  return (
    <div className={styles.emptyChannel}>
      <div className={styles.emptyChannelIcon} aria-hidden>
        <Hash size={28} />
      </div>
      <h2 className={styles.emptyChannelTitle}>Welcome to #{channelName}</h2>
      <p className={styles.emptyChannelBody}>
        This is the beginning of the <strong>#{channelName}</strong> channel.
        Send a message to get the conversation started.
      </p>
    </div>
  );
}
