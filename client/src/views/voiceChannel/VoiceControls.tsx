import { Mic, MicOff, Headphones, PhoneOff } from 'lucide-react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { Tooltip } from '../../components/Tooltip';
import styles from './VoiceChannel.module.css';

interface Props {
  onLeave: () => void;
}

export function VoiceControls({ onLeave }: Props) {
  const { isMuted, isDeafened, setMuted, setDeafened } = useVoiceStore();

  return (
    <div className={styles.controls}>
      <Tooltip content={isMuted ? 'Unmute' : 'Mute'} side="top">
        <button
          className={`${styles.controlBtn} ${isMuted ? styles.controlBtnActive : ''}`}
          onClick={() => setMuted(!isMuted)}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMuted}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
      </Tooltip>

      <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'} side="top">
        <button
          className={`${styles.controlBtn} ${isDeafened ? styles.controlBtnActive : ''}`}
          onClick={() => setDeafened(!isDeafened)}
          aria-label={isDeafened ? 'Undeafen' : 'Deafen'}
          aria-pressed={isDeafened}
        >
          <Headphones size={20} />
        </button>
      </Tooltip>

      <Tooltip content="Leave voice channel" side="top">
        <button
          className={styles.leaveBtn}
          onClick={onLeave}
          aria-label="Leave voice channel"
        >
          <PhoneOff size={15} />
          Leave
        </button>
      </Tooltip>
    </div>
  );
}
