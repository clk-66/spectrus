import { useUIStore } from '../../stores/useUIStore';
import styles from './TextChannel.module.css';

interface Props {
  channelId: string;
}

export function TypingIndicator({ channelId }: Props) {
  const users = useUIStore((s) => s.typingUsers[channelId] ?? []);

  // Filter out any that may have expired client-side before the timer fired
  const active = users.filter((u) => u.expiresAt > Date.now());

  if (active.length === 0) {
    return <div className={styles.typingBar} aria-hidden />;
  }

  let text: React.ReactNode;

  if (active.length === 1) {
    text = (
      <>
        <span className={styles.typingName}>{active[0].username}</span>
        {' is typing…'}
      </>
    );
  } else if (active.length === 2) {
    text = (
      <>
        <span className={styles.typingName}>{active[0].username}</span>
        {' and '}
        <span className={styles.typingName}>{active[1].username}</span>
        {' are typing…'}
      </>
    );
  } else {
    text = 'Several people are typing…';
  }

  return (
    <div className={styles.typingBar} role="status" aria-live="polite">
      <span className={styles.dots} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
      <span className={styles.typingText}>{text}</span>
    </div>
  );
}
