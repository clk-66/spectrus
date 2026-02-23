import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { useServersStore } from '../../stores/useServersStore';
import { useChannelsStore } from '../../stores/useChannelsStore';
import { getInvitePreview, useInvite } from '../../api/invites';
import { apiFetch, ApiError, getStoredTokens } from '../../api/client';
import { getCategories } from '../../api/channels';
import { SpectrusSocket } from '../../ws/SpectrusSocket';
import type { InvitePreview } from '../../types';
import styles from './JoinServer.module.css';

// ---- State machine -------------------------------------------------------

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready';    preview: InvitePreview }
  | { phase: 'expired' }
  | { phase: 'exhausted' }
  | { phase: 'not-found' }
  | { phase: 'error' };

// ---- Sad-face SVG (inline — no external file needed) --------------------

function SadFace({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="40" cy="40" r="37" stroke="currentColor" strokeWidth="3" />
      <circle cx="28" cy="33" r="4" fill="currentColor" />
      <circle cx="52" cy="33" r="4" fill="currentColor" />
      <path
        d="M27 58 Q40 47 53 58"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ---- Main component ------------------------------------------------------

export function JoinServer() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate       = useNavigate();
  const location       = useLocation();
  const [searchParams] = useSearchParams();

  // Resolve the server host in priority order:
  //  1. ?host= query param (set by Welcome / ServerRail "+" flow)
  //  2. sessionStorage (set by Tauri deep-link handler)
  //  3. Current window origin (fallback for bare-token invites on same server)
  const serverHost = (
    searchParams.get('host') ??
    sessionStorage.getItem('spectrus:join-host') ??
    window.location.origin
  );
  const wsHost = serverHost.replace(/^http/, 'ws');

  const currentUser       = useAuthStore((s) => s.currentUser);
  const authServerHost    = useAuthStore((s) => s.serverHost);
  const setActiveServerId = useUIStore((s) => s.setActiveServerId);
  const { addServer, setSocket } = useServersStore();
  const setCategories     = useChannelsStore((s) => s.setCategories);

  // Is the user already authenticated against THIS server?
  const isAuthenticated = !!currentUser && authServerHost === serverHost;

  // Is this server already loaded into the in-memory store?
  const serverInStore = useServersStore((s) => s.servers.has(serverHost));

  const [loadState, setLoadState] = useState<LoadState>({ phase: 'loading' });
  const [joining,   setJoining]   = useState(false);
  const [joinError, setJoinError] = useState('');

  // Prevent double-execution of autoJoin in StrictMode
  const autoJoinFiredRef = useRef(false);

  // Whether we should auto-join upon mount (user returned from login)
  const autoJoin = searchParams.get('join') === '1';

  // ---- Fetch invite preview ----------------------------------------------

  const fetchPreview = useCallback(() => {
    setLoadState({ phase: 'loading' });
    setJoinError('');

    getInvitePreview(serverHost, token)
      .then((preview) => setLoadState({ phase: 'ready', preview }))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 410) {
            const isExhausted =
              err.message.toLowerCase().includes('exhaust') ||
              err.message.toLowerCase().includes('max') ||
              err.message.toLowerCase().includes('use');
            setLoadState({ phase: isExhausted ? 'exhausted' : 'expired' });
          } else if (err.status === 404) {
            setLoadState({ phase: 'not-found' });
          } else {
            setLoadState({ phase: 'error' });
          }
        } else {
          setLoadState({ phase: 'error' });
        }
      });
  }, [serverHost, token]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // ---- Bootstrap after a successful join ---------------------------------

  const bootstrapAndNavigate = useCallback(async () => {
    // serverHost is used as both the API base URL and the client-side map key
    const tokens = await getStoredTokens(serverHost);
    if (!tokens || !currentUser) return;

    const [serverInfo, channelData] = await Promise.all([
      apiFetch<{ name: string }>(serverHost, serverHost, '/servers/@me'),
      getCategories(serverHost, serverHost),
    ]);

    addServer({
      server: { id: serverHost, name: serverInfo.name, ownerId: '', createdAt: '' },
      tokens,
      currentUser,
      socket: null,
    });
    setCategories(serverHost, channelData.categories, channelData.uncategorized);

    const socket = new SpectrusSocket(`${wsHost}/ws`, tokens.accessToken, serverHost);
    setSocket(serverHost, socket);
    setActiveServerId(serverHost);

    navigate('/', { replace: true });
  }, [
    serverHost, wsHost, currentUser,
    addServer, setCategories, setSocket, setActiveServerId, navigate,
  ]);

  // ---- Join handler -------------------------------------------------------

  const handleJoin = useCallback(async () => {
    // Gate 1: must be authenticated against this specific server
    if (!isAuthenticated) {
      navigate(`/login?host=${encodeURIComponent(serverHost)}`, {
        state: { from: `${location.pathname}${location.search}${location.search ? '&' : '?'}join=1` },
      });
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      await useInvite(serverHost, serverHost, token);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Already a member — skip join, just navigate to the server
        if (serverInStore) {
          navigate('/', { replace: true });
        } else {
          await bootstrapAndNavigate();
        }
        return;
      }
      setJoinError(
        err instanceof Error ? err.message : 'Failed to join. Please try again.'
      );
      setJoining(false);
      return;
    }

    try {
      await bootstrapAndNavigate();
    } catch (err: unknown) {
      console.error('Bootstrap after join failed', err);
      setJoinError('Joined, but failed to connect. Please go to the home page.');
      setJoining(false);
    }
  }, [
    isAuthenticated, serverHost, token, serverInStore, location,
    navigate, bootstrapAndNavigate,
  ]);

  // ---- Auto-join when returning from login --------------------------------

  useEffect(() => {
    if (
      autoJoin &&
      isAuthenticated &&
      loadState.phase === 'ready' &&
      !autoJoinFiredRef.current
    ) {
      autoJoinFiredRef.current = true;
      void handleJoin();
    }
  }, [autoJoin, isAuthenticated, loadState.phase, handleJoin]);

  // ---- Render helpers -----------------------------------------------------

  if (loadState.phase === 'loading') {
    return (
      <div className={styles.viewport}>
        <div className={styles.card}>
          <div className={styles.loadingPulse}>
            <div className={styles.loadingCircle} />
            <div className={styles.loadingBar} />
            <div className={styles.loadingBar} />
          </div>
        </div>
      </div>
    );
  }

  if (loadState.phase === 'expired') {
    return (
      <ErrorCard
        title="This invite has expired"
        desc="The invite link you used is no longer active. Ask the server owner for a new one."
        showSadFace
      />
    );
  }

  if (loadState.phase === 'exhausted') {
    return (
      <ErrorCard
        title="This invite is no longer valid"
        desc="The maximum number of uses for this invite has been reached."
        showSadFace
      />
    );
  }

  if (loadState.phase === 'not-found') {
    return (
      <ErrorCard
        title="Unknown invite"
        desc="This invite link doesn't exist or has already been deleted."
        showSadFace
      />
    );
  }

  if (loadState.phase === 'error') {
    return (
      <ErrorCard
        title="Something went wrong"
        desc="Could not load the invite. Check your connection and try again."
        onRetry={() => navigate('/welcome')}
      />
    );
  }

  // ---- Happy path ---------------------------------------------------------

  const { preview } = loadState;

  const alreadyMember = isAuthenticated && serverInStore;
  const buttonLabel   = joining
    ? 'Joining…'
    : alreadyMember
    ? 'Open Server'
    : isAuthenticated
    ? 'Join Server'
    : 'Sign in to Join';

  return (
    <div className={styles.viewport}>
      <div className={styles.card}>

        {/* Server icon */}
        <div className={styles.serverIconWrap}>
          {preview.serverIcon ? (
            <img
              className={styles.serverIcon}
              src={preview.serverIcon}
              alt={preview.serverName}
            />
          ) : (
            <div className={styles.serverIconPlaceholder} aria-hidden>
              {preview.serverName[0]?.toUpperCase() ?? 'S'}
            </div>
          )}
        </div>

        {/* Server name */}
        <h1 className={styles.serverName}>{preview.serverName}</h1>

        {/* Member count */}
        <p className={styles.memberCount}>
          <span className={styles.memberDot} aria-hidden />
          <Users size={13} aria-hidden />
          {preview.memberCount.toLocaleString()}
          {preview.memberCount === 1 ? ' member' : ' members'}
        </p>

        <div className={styles.divider} />

        {/* Description */}
        <p className={styles.description}>
          Spectrus is a self-hosted voice and text platform.
          This server is running their own instance.
        </p>

        {/* Creator note */}
        <p className={styles.creatorNote}>
          Invited by <strong>@{preview.creatorUsername}</strong>
          {preview.expiresAt && (
            <> · expires {new Date(preview.expiresAt).toLocaleDateString()}</>
          )}
        </p>

        {/* Action */}
        <button
          className={`${styles.actionBtn} ${alreadyMember ? styles.actionBtnOpen : ''}`}
          onClick={() => void handleJoin()}
          disabled={joining}
        >
          {buttonLabel}
        </button>

        {joinError && (
          <div className={styles.formError} role="alert">
            {joinError}
          </div>
        )}

      </div>
    </div>
  );
}

// ---- Error card sub-component -------------------------------------------

function ErrorCard({
  title,
  desc,
  showSadFace = false,
  onRetry,
}: {
  title:        string;
  desc:         string;
  showSadFace?: boolean;
  onRetry?:     () => void;
}) {
  return (
    <div className={styles.viewport}>
      <div className={styles.card}>
        <div className={styles.errorBody}>
          {showSadFace && <SadFace className={styles.sadFace} />}
          <h2 className={styles.errorTitle}>{title}</h2>
          <p className={styles.errorDesc}>{desc}</p>
          {onRetry && (
            <button className={styles.retryBtn} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
