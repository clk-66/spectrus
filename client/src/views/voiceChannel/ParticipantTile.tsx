import { MicOff } from 'lucide-react';
import styles from './VoiceChannel.module.css';

interface Props {
  userId:      string;
  displayName: string;
  avatarUrl?:  string;
  isSpeaking:  boolean;
  isMuted:     boolean;
  isLocalUser: boolean;
}

export function ParticipantTile({
  displayName,
  avatarUrl,
  isSpeaking,
  isMuted,
  isLocalUser,
}: Props) {
  return (
    <div className={`${styles.tile} ${isSpeaking ? styles.tileSpeaking : ''}`}>
      <div className={styles.avatarWrap}>
        {avatarUrl ? (
          <img className={styles.avatar} src={avatarUrl} alt={displayName} />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden>
            {displayName[0]?.toUpperCase() ?? '?'}
          </div>
        )}

        {isMuted && (
          <span className={styles.mutedBadge} aria-label="Muted">
            <MicOff size={11} strokeWidth={2.5} />
          </span>
        )}
      </div>

      <span className={styles.participantName}>
        {displayName}
        {isLocalUser && (
          <span className={styles.participantYou}> (you)</span>
        )}
      </span>
    </div>
  );
}
