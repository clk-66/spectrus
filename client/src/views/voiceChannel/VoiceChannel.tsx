import { useState, useCallback } from 'react';
import { Volume2 } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useServersStore } from '../../stores/useServersStore';
import { useMembersStore } from '../../stores/useMembersStore';
import { useUIStore } from '../../stores/useUIStore';
import { VoiceService } from '../../services/VoiceService';
import { ParticipantTile } from './ParticipantTile';
import { VoiceControls } from './VoiceControls';
import styles from './VoiceChannel.module.css';

interface Props {
  channelId:   string;
  channelName: string;
}

// ---- Grid class based on participant count --------------------------------

function gridClass(count: number): string {
  if (count <= 1) return styles.grid1;
  if (count <= 4) return styles.grid2;
  if (count <= 9) return styles.grid5;
  return styles.gridMany;
}

// ---- Main view (shown when connected to THIS channel) --------------------

function VoiceChannelConnected({ channelId, channelName }: Props) {
  const currentUser    = useAuthStore((s) => s.currentUser);
  const activeServerId = useUIStore((s) => s.activeServerId);
  const speakingUsers  = useVoiceStore((s) => s.speakingUsers);
  const isMuted        = useVoiceStore((s) => s.isMuted);
  const { setVoiceService, setActiveChannel, voiceService } = useVoiceStore();

  // Member IDs currently in this voice channel
  const memberIds = useVoiceStore((s) =>
    Array.from(s.channelMembers.get(channelId) ?? [])
  );

  // Member details from the members store
  const memberMap = useMembersStore((s) => {
    const list = activeServerId ? (s.members.get(activeServerId) ?? []) : [];
    return new Map(list.map((m) => [m.userId, m]));
  });

  // Build participant list — ensure local user always appears
  const participantIds = new Set(memberIds);
  if (currentUser) participantIds.add(currentUser.id);

  const handleLeave = useCallback(() => {
    voiceService?.leave();
    setVoiceService(null);
    setActiveChannel(null);
  }, [voiceService, setVoiceService, setActiveChannel]);

  const participants = Array.from(participantIds);

  return (
    <div className={styles.voiceChannel}>
      {/* Header */}
      <div className={styles.header}>
        <Volume2 size={18} className={styles.headerIcon} aria-hidden />
        <span className={styles.headerName}>{channelName}</span>
      </div>

      {/* Participant grid */}
      <div className={`${styles.grid} ${gridClass(participants.length)}`}>
        {participants.map((uid) => {
          const member      = memberMap.get(uid);
          const isLocal     = uid === currentUser?.id;
          const displayName = member?.displayName ?? currentUser?.displayName ?? uid;
          const avatarUrl   = member?.avatarUrl   ?? currentUser?.avatarUrl;
          const isSpeaking  = speakingUsers.has(uid);
          // Show muted indicator only for local user (no server-side mute broadcast yet)
          const showMuted   = isLocal && isMuted;

          return (
            <ParticipantTile
              key={uid}
              userId={uid}
              displayName={displayName}
              avatarUrl={avatarUrl}
              isSpeaking={isSpeaking}
              isMuted={showMuted}
              isLocalUser={isLocal}
            />
          );
        })}
      </div>

      {/* Controls */}
      <VoiceControls onLeave={handleLeave} />
    </div>
  );
}

// ---- Join view (shown when NOT connected to this channel) ----------------

function VoiceJoinView({ channelId, channelName }: Props) {
  const [joining,   setJoining]   = useState(false);
  const [joinError, setJoinError] = useState('');

  const currentUser    = useAuthStore((s) => s.currentUser);
  const serverId       = useAuthStore((s) => s.serverId);   // unused but keeps serverId in scope
  const activeServerId = useUIStore((s) => s.activeServerId);
  const socket         = useServersStore((s) =>
    activeServerId ? (s.servers.get(activeServerId)?.socket ?? null) : null
  );
  const { setVoiceService, setActiveChannel, activeChannelId: currentVoiceId } = useVoiceStore();

  // If the user is in a different voice channel, tell them.
  const inDifferentChannel = currentVoiceId !== null && currentVoiceId !== channelId;

  const handleJoin = useCallback(async () => {
    if (!socket || !currentUser) {
      setJoinError('Not connected to server. Please wait and try again.');
      return;
    }

    setJoining(true);
    setJoinError('');

    const svc = new VoiceService(socket, channelId, currentUser.id);
    setVoiceService(svc);

    try {
      await svc.join();
      setActiveChannel(channelId);
    } catch (err: unknown) {
      svc.leave();
      setVoiceService(null);
      const msg =
        err instanceof Error && err.message.includes('Permission')
          ? 'Microphone permission denied. Please allow access and try again.'
          : 'Could not join voice channel. Check your microphone and try again.';
      setJoinError(msg);
    } finally {
      setJoining(false);
    }
  }, [socket, currentUser, channelId, setVoiceService, setActiveChannel]);

  // Suppress unused variable warning — serverId is kept for potential future use
  void serverId;

  return (
    <div className={styles.voiceChannel}>
      {/* Header */}
      <div className={styles.header}>
        <Volume2 size={18} className={styles.headerIcon} aria-hidden />
        <span className={styles.headerName}>{channelName}</span>
      </div>

      {/* Join prompt */}
      <div className={styles.joinView}>
        <div className={styles.joinIcon} aria-hidden>
          <Volume2 size={32} />
        </div>

        <h2 className={styles.joinTitle}>{channelName}</h2>

        <p className={styles.joinBody}>
          {inDifferentChannel
            ? `You'll leave your current voice channel and join #${channelName}.`
            : `Join #${channelName} to talk with others in this channel.`}
        </p>

        {joinError && <p className={styles.joinError}>{joinError}</p>}

        <button
          className={styles.joinBtn}
          onClick={() => void handleJoin()}
          disabled={joining}
        >
          <Volume2 size={16} />
          {joining ? 'Joining…' : 'Join Voice'}
        </button>
      </div>
    </div>
  );
}

// ---- Exported component — routes between connected and join views --------

export function VoiceChannel({ channelId, channelName }: Props) {
  const voiceActiveChannelId = useVoiceStore((s) => s.activeChannelId);
  const isConnected          = voiceActiveChannelId === channelId;

  if (isConnected) {
    return <VoiceChannelConnected channelId={channelId} channelName={channelName} />;
  }
  return <VoiceJoinView channelId={channelId} channelName={channelName} />;
}
