import { useRef, useState, useCallback } from 'react';
import { useServersStore } from '../../stores/useServersStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { sendMessage } from '../../api/messages';
import { API_BASE } from '../../constants';
import styles from './TextChannel.module.css';

const MAX_LENGTH      = 2000;
const WARN_THRESHOLD  = 1800;
const TYPING_INTERVAL = 3_000; // min ms between TYPING_START sends
const TYPING_STOP_MS  = 5_000; // ms of inactivity before we stop sending

interface Props {
  channelId:   string;
  channelName: string;
}

export function MessageInput({ channelId, channelName }: Props) {
  const [value, setValue]     = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef           = useRef<HTMLTextAreaElement>(null);

  const serverId      = useAuthStore((s) => s.serverId);
  const currentUser   = useAuthStore((s) => s.currentUser);
  const activeServerId = useUIStore((s) => s.activeServerId);
  const socket        = useServersStore((s) =>
    activeServerId ? (s.servers.get(activeServerId)?.socket ?? null) : null
  );

  // ---- Typing indicator throttle ----------------------------------------
  const lastTypingSentRef  = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTypingStart = useCallback(() => {
    if (!socket || !currentUser) return;
    socket.send({
      op: 'TYPING_START',
      d:  { channel_id: channelId, username: currentUser.displayName },
    });
    lastTypingSentRef.current = Date.now();
  }, [socket, channelId, currentUser]);

  const handleTyping = useCallback(() => {
    // Throttle: send TYPING_START at most once per TYPING_INTERVAL
    if (Date.now() - lastTypingSentRef.current > TYPING_INTERVAL) {
      sendTypingStart();
    }
    // Reset stop timer on every keystroke
    if (typingStopTimerRef.current !== null) {
      clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      // We simply stop sending — SpectrusSocket's 6s expiry will clear the indicator
    }, TYPING_STOP_MS);
  }, [sendTypingStart]);

  // ---- Auto-resize -------------------------------------------------------

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    const maxH = 8 * 20; // 8 rows × 20px line-height
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, []);

  // ---- Submit ------------------------------------------------------------

  const submit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH || sending || !serverId) return;

    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '0';
      textareaRef.current.style.height = '20px';
    }
    // Cancel pending typing stop timer
    if (typingStopTimerRef.current !== null) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    setSending(true);
    try {
      await sendMessage(API_BASE, serverId, channelId, trimmed);
    } catch (err) {
      console.error('Failed to send message', err);
      // Restore value on failure
      setValue(trimmed);
    } finally {
      setSending(false);
      // Re-focus after send
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [value, sending, serverId, channelId]);

  // ---- Handlers ----------------------------------------------------------

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length > MAX_LENGTH) return; // silently block
    setValue(next);
    resize();
    if (next.trim()) handleTyping();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const remaining = MAX_LENGTH - value.length;
  const showCount = value.length >= WARN_THRESHOLD;

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputBox}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={`Message #${channelName}`}
          value={value}
          rows={1}
          disabled={sending}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={`Message #${channelName}`}
          maxLength={MAX_LENGTH}
        />
        {showCount && (
          <span
            className={`${styles.charCount} ${remaining <= 0 ? styles.charCountWarn : ''}`}
            aria-live="polite"
          >
            {remaining}
          </span>
        )}
      </div>
    </div>
  );
}
