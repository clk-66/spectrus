import type { Message } from '../../types';
import { formatRelative, formatTime } from '../../utils/time';
import styles from './TextChannel.module.css';

export interface GroupedMessage {
  message: Message;
  /** true = first message in a visual group (shows avatar + header) */
  isGroupStart: boolean;
}

export function MessageItem({
  grouped,
  style,
}: {
  grouped: GroupedMessage;
  style?: React.CSSProperties;
}) {
  const { message: m, isGroupStart } = grouped;

  if (isGroupStart) {
    return (
      <div
        className={`${styles.messageRow} ${styles.messageRowStart}`}
        style={style}
      >
        {/* Avatar column */}
        <div className={styles.avatarCol}>
          {m.authorAvatarUrl ? (
            <img
              className={styles.avatar}
              src={m.authorAvatarUrl}
              alt={m.authorDisplayName}
            />
          ) : (
            <div className={styles.avatarPlaceholder} aria-hidden>
              {m.authorDisplayName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className={styles.messageContent}>
          <div className={styles.messageHeader}>
            <span className={styles.authorName}>{m.authorDisplayName}</span>
            <time
              className={styles.timestamp}
              dateTime={m.createdAt}
              title={formatRelative(m.createdAt)}
            >
              {formatRelative(m.createdAt)}
            </time>
          </div>
          <p className={styles.messageText}>
            {m.content}
            {m.editedAt && (
              <span className={styles.messageEdited}>(edited)</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  // Continuation row — no avatar, hover reveals short time
  return (
    <div className={styles.messageRow} style={style}>
      <div className={styles.avatarCol}>
        <span
          className={styles.continuationTs}
          aria-hidden
        >
          {formatTime(m.createdAt)}
        </span>
      </div>
      <div className={styles.messageContent}>
        <p className={styles.messageText}>
          {m.content}
          {m.editedAt && (
            <span className={styles.messageEdited}>(edited)</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ---- Grouping utility ----------------------------------------------------

const GROUP_WINDOW_MS = 5 * 60 * 1_000;

export function groupMessages(messages: Message[]): GroupedMessage[] {
  return messages.map((msg, i) => {
    if (i === 0) return { message: msg, isGroupStart: true };
    const prev = messages[i - 1];
    const sameAuthor = prev.authorId === msg.authorId;
    const withinWindow =
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() <
      GROUP_WINDOW_MS;
    return { message: msg, isGroupStart: !sameAuthor || !withinWindow };
  });
}
