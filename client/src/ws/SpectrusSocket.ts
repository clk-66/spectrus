/**
 * SpectrusSocket — one WebSocket connection per server instance.
 *
 * Lifecycle:
 *  1. Connects to `wsURL` (ws[s]://host/ws)
 *  2. On open: waits for the server's auth handshake (the server validates the
 *     JWT from the upgrade HTTP headers — no explicit auth message needed here,
 *     the Vite proxy forwards the Authorization header on the WS upgrade).
 *  3. Incoming events are dispatched to registered handlers.
 *  4. On unexpected close: reconnects with exponential back-off (1→2→4→8→…→30s).
 *  5. `destroy()` tears down permanently (no reconnect).
 */

import { useVoiceStore } from '../stores/useVoiceStore';
import { useChannelsStore } from '../stores/useChannelsStore';
import { useMessagesStore } from '../stores/useMessagesStore';
import { useMembersStore } from '../stores/useMembersStore';
import { useUIStore } from '../stores/useUIStore';
import type { WSEvent } from '../types';

const TYPING_EXPIRY_MS = 6_000;

type OutgoingMessage = Record<string, unknown>;

const BACKOFF_BASE = 1_000;
const BACKOFF_MAX  = 30_000;

export class SpectrusSocket {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  // key: `${channelId}:${userId}` → expiry timer
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Routed to VoiceService while a voice session is active
  private voiceSignalHandler: ((signal: Record<string, unknown>) => void) | null = null;

  constructor(
    private readonly wsURL: string,
    private readonly accessToken: string,
    private readonly serverId: string
  ) {
    this.connect();
  }

  // ---- Public API --------------------------------------------------------

  send(msg: OutgoingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Permanently close — no reconnect. */
  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const timer of this.typingTimers.values()) clearTimeout(timer);
    this.typingTimers.clear();
    this.voiceSignalHandler = null;
    this.ws?.close(1000, 'destroyed');
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /** Register (or clear) the handler that receives VOICE_SIGNAL envelopes. */
  setVoiceSignalHandler(
    handler: ((signal: Record<string, unknown>) => void) | null
  ): void {
    this.voiceSignalHandler = handler;
  }

  // ---- Connection management ---------------------------------------------

  private connect(): void {
    if (this.destroyed) return;

    // Pass JWT as a query param because browsers don't allow custom headers
    // on WebSocket upgrades. The server reads ?token= on the WS endpoint.
    const url = `${this.wsURL}?token=${encodeURIComponent(this.accessToken)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
    });

    ws.addEventListener('message', (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as WSEvent;
        this.dispatch(event);
      } catch { /* ignore malformed frames */ }
    });

    ws.addEventListener('close', (ev) => {
      if (this.destroyed) return;
      // Don't reconnect on clean close initiated by us
      if (ev.code === 1000) return;
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(BACKOFF_BASE * 2 ** this.attempt, BACKOFF_MAX);
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  // ---- Event dispatch ----------------------------------------------------

  private dispatch(event: WSEvent): void {
    const sid = this.serverId;

    switch (event.t) {
      case 'MESSAGE_CREATE':
        useMessagesStore.getState().appendMessage(
          event.d.channelId,
          event.d.message
        );
        break;

      case 'MESSAGE_UPDATE':
        useMessagesStore.getState().updateMessage(
          event.d.channelId,
          event.d.messageId,
          event.d.content
        );
        break;

      case 'MESSAGE_DELETE':
        useMessagesStore.getState().deleteMessage(
          event.d.channelId,
          event.d.messageId
        );
        break;

      case 'CHANNEL_CREATE':
        if (event.d.channel) {
          useChannelsStore.getState().upsertChannel(sid, event.d.channel);
        }
        break;

      case 'CHANNEL_UPDATE':
        useChannelsStore.getState().upsertChannel(sid, event.d.channel);
        break;

      case 'CHANNEL_DELETE':
        useChannelsStore.getState().removeChannel(sid, event.d.channelId);
        break;

      case 'VOICE_STATE_UPDATE':
        useVoiceStore.getState().setVoiceState(event.d.userId, event.d.channelId);
        break;

      case 'ROLE_UPDATE':
        useMembersStore.getState().upsertRole(sid, event.d.role);
        break;

      case 'MEMBER_UPDATE':
        useMembersStore.getState().upsertMember(sid, event.d.member);
        break;

      case 'VOICE_SIGNAL':
        this.voiceSignalHandler?.(event.d as Record<string, unknown>);
        break;

      case 'TYPING_START': {
        const { userId, channelId, username } = event.d;
        const key = `${channelId}:${userId}`;
        // Clear any previous expiry timer for this user
        const prev = this.typingTimers.get(key);
        if (prev !== undefined) clearTimeout(prev);
        // Upsert typing user in store
        useUIStore.getState().setTypingUser(channelId, {
          userId,
          username,
          expiresAt: Date.now() + TYPING_EXPIRY_MS,
        });
        // Schedule automatic removal after expiry
        this.typingTimers.set(
          key,
          setTimeout(() => {
            this.typingTimers.delete(key);
            useUIStore.getState().clearTypingUser(channelId, userId);
          }, TYPING_EXPIRY_MS)
        );
        break;
      }

      // VOICE_SIGNAL is handled directly by the voice engine (post-MVP)
      // PRESENCE_UPDATE and PLUGIN_EVENT are no-ops for now
      default:
        break;
    }
  }
}
