/**
 * VoiceService — manages the full WebRTC lifecycle for one voice channel session.
 *
 * Signal flow:
 *  join()
 *    → VOICE_STATE_UPDATE (ws)  →  server calls media.Join()
 *    ← VOICE_SIGNAL {type:'join_response'}  →  load Device, create transports
 *  sendTransport 'connect' event  →  VOICE_SIGNAL {type:'connect-send-transport'}
 *  sendTransport 'produce' event  →  VOICE_SIGNAL {type:'produce'}
 *  recvTransport 'connect' event  →  VOICE_SIGNAL {type:'connect-recv-transport'}
 *  consumeAll()                   →  VOICE_SIGNAL {type:'consume'}
 *  for each consumer              →  VOICE_SIGNAL {type:'resume-consumer'}
 *
 * leave()
 *  → VOICE_STATE_UPDATE {channel_id:null}  →  server calls media.Leave()
 */

import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer } from 'mediasoup-client/types';
import { sendVoiceStateUpdate, sendVoiceSignal } from '../api/voice';
import { useVoiceStore } from '../stores/useVoiceStore';
import type { SpectrusSocket } from '../ws/SpectrusSocket';

// ---- Audio-level speaking detector --------------------------------------

/**
 * Uses the Web Audio API to detect whether a MediaStreamTrack carries speech.
 * Polls every animation frame using RMS of time-domain data.
 */
class AudioLevelDetector {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly data: Uint8Array<ArrayBuffer>;
  private frameId: number | null = null;
  private speaking = false;

  constructor(
    track: MediaStreamTrack,
    private readonly threshold = 8,
    private readonly onSpeaking: (speaking: boolean) => void,
  ) {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.5;
    // Explicit ArrayBuffer to satisfy strict Uint8Array<ArrayBuffer> signature.
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    this.source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.source.connect(this.analyser);

    // AudioContext may be suspended if created outside a user-gesture handler.
    void this.ctx.resume();
    this.poll();
  }

  private poll = (): void => {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] - 128; // 128 = silence in uint8 time-domain
      sum += d * d;
    }
    const rms = Math.sqrt(sum / this.data.length);
    const isSpeaking = rms > this.threshold;
    if (isSpeaking !== this.speaking) {
      this.speaking = isSpeaking;
      this.onSpeaking(isSpeaking);
    }
    this.frameId = requestAnimationFrame(this.poll);
  };

  destroy(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.source.disconnect();
    void this.ctx.close();
  }
}

// ---- Wire types ---------------------------------------------------------

interface TransportParams {
  id:             string;
  iceParameters:  unknown;
  iceCandidates:  unknown[];
  dtlsParameters: unknown;
}

interface JoinResponse {
  routerRtpCapabilities: unknown;
  sendTransport:         TransportParams;
  recvTransport:         TransportParams;
}

interface ConsumerInfo {
  id:             string;
  producerId:     string;
  producerUserId: string;
  kind:           string;
  rtpParameters:  unknown;
}

interface PendingSignal {
  resolve: (data: unknown) => void;
  reject:  (err: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
}

// ---- Service ------------------------------------------------------------

export class VoiceService {
  private readonly device: Device;
  private sendTransport:  Transport | null = null;
  private recvTransport:  Transport | null = null;
  private producer:       Producer | null  = null;
  /** consumerId → { consumer, producerUserId } */
  private consumers = new Map<string, { consumer: Consumer; producerUserId: string }>();
  private micTrack:       MediaStreamTrack | null = null;
  private audioElements:  HTMLAudioElement[] = [];
  private detectors:      AudioLevelDetector[] = [];
  private pendingSignals  = new Map<string, PendingSignal>();
  private voiceStateUnsub: (() => void) | null = null;
  private prevMemberCount = 0;
  private consumeInProgress = false;
  private destroyed = false;

  constructor(
    private readonly socket:       SpectrusSocket,
    private readonly channelId:    string,
    private readonly localUserId:  string,
  ) {
    this.device = new Device();
  }

  // ---- Public lifecycle --------------------------------------------------

  async join(): Promise<void> {
    // Register handler BEFORE sending VOICE_STATE_UPDATE so we never miss the response.
    this.socket.setVoiceSignalHandler(this.handleSignal);

    // Tell server (and other clients) we're joining this channel.
    sendVoiceStateUpdate(this.socket, this.channelId);

    // Wait for mediasoup join parameters.
    const joinData = await this.waitFor<JoinResponse>('join_response', 15_000);

    // ---- Load device ---------------------------------------------------
    await this.device.load({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routerRtpCapabilities: joinData.routerRtpCapabilities as any,
    });

    // ---- Send transport (mic → server) ---------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendTx = this.device.createSendTransport(joinData.sendTransport as any);
    this.sendTransport = sendTx;

    sendTx.on('connect', ({ dtlsParameters }, callback, errback) => {
      void this.sendSignal('connect-send-transport', { dtlsParameters })
        .then(callback)
        .catch(errback);
    });

    sendTx.on('produce', ({ kind, rtpParameters }, callback, errback) => {
      void this.sendSignal<{ producerId: string }>('produce', { kind, rtpParameters })
        .then(({ producerId }) => callback({ id: producerId }))
        .catch(errback);
    });

    // ---- Recv transport (server → speakers) ----------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recvTx = this.device.createRecvTransport(joinData.recvTransport as any);
    this.recvTransport = recvTx;

    recvTx.on('connect', ({ dtlsParameters }, callback, errback) => {
      void this.sendSignal('connect-recv-transport', { dtlsParameters })
        .then(callback)
        .catch(errback);
    });

    // ---- Microphone ----------------------------------------------------
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.micTrack = stream.getAudioTracks()[0];

    // Produce the local audio track to the server.
    this.producer = await sendTx.produce({ track: this.micTrack });

    // Speaking detection for local user.
    this.addSpeakingDetector(this.micTrack, this.localUserId);

    // ---- Consume existing producers ------------------------------------
    await this.consumeAll();

    // ---- Watch for new peers -------------------------------------------
    this.prevMemberCount =
      useVoiceStore.getState().channelMembers.get(this.channelId)?.size ?? 0;

    this.voiceStateUnsub = useVoiceStore.subscribe((state) => {
      if (this.destroyed) return;
      const count = state.channelMembers.get(this.channelId)?.size ?? 0;
      if (count > this.prevMemberCount) {
        void this.consumeAll();
      }
      this.prevMemberCount = count;
    });
  }

  leave(): void {
    this.destroyed = true;

    this.voiceStateUnsub?.();
    this.voiceStateUnsub = null;

    // Reject all pending signal promises.
    for (const p of this.pendingSignals.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('VoiceService destroyed'));
    }
    this.pendingSignals.clear();

    this.socket.setVoiceSignalHandler(null);

    // Closing transports automatically closes all server-side producers/consumers.
    this.sendTransport?.close();
    this.sendTransport = null;
    this.recvTransport?.close();
    this.recvTransport = null;

    this.micTrack?.stop();
    this.micTrack = null;

    for (const el of this.audioElements) {
      el.pause();
      el.srcObject = null;
      el.remove();
    }
    this.audioElements = [];

    for (const det of this.detectors) det.destroy();
    this.detectors = [];

    useVoiceStore.getState().clearSpeakingAll();

    // Tell server we've left.
    sendVoiceStateUpdate(this.socket, null);
  }

  // ---- Mute / Deafen ----------------------------------------------------

  setMuted(muted: boolean): void {
    if (this.producer) {
      if (muted) this.producer.pause();
      else       this.producer.resume();
    }
    if (this.micTrack) this.micTrack.enabled = !muted;
  }

  setDeafened(deafened: boolean): void {
    for (const { consumer } of this.consumers.values()) {
      if (deafened) consumer.pause();
      else          consumer.resume();
    }
    for (const el of this.audioElements) {
      el.muted = deafened;
    }
  }

  // ---- Internal ----------------------------------------------------------

  private async consumeAll(): Promise<void> {
    if (this.consumeInProgress || !this.recvTransport || this.destroyed) return;
    this.consumeInProgress = true;
    try {
      const { consumers } = await this.sendSignal<{ consumers: ConsumerInfo[] }>(
        'consume',
        { rtpCapabilities: this.device.rtpCapabilities },
      );
      for (const info of consumers) {
        if (this.destroyed) break;
        await this.setupConsumer(info);
      }
    } catch (err) {
      if (!this.destroyed) console.error('[VoiceService] consumeAll failed', err);
    } finally {
      this.consumeInProgress = false;
    }
  }

  private async setupConsumer(info: ConsumerInfo): Promise<void> {
    if (!this.recvTransport || this.destroyed) return;

    const consumer = await this.recvTransport.consume({
      id:            info.id,
      producerId:    info.producerId,
      kind:          info.kind as 'audio',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rtpParameters: info.rtpParameters as any,
    });

    this.consumers.set(info.id, { consumer, producerUserId: info.producerUserId });

    // Resume on server side first, then locally.
    await this.sendSignal('resume-consumer', { consumerId: consumer.id });
    await consumer.resume();

    // Attach track to a hidden <audio> element for playback.
    const audio = new Audio();
    audio.srcObject = new MediaStream([consumer.track]);
    audio.autoplay  = true;
    document.body.appendChild(audio);
    void audio.play().catch(() => {
      /* Autoplay policy — user must interact first; voice join IS a user gesture. */
    });
    this.audioElements.push(audio);

    // Speaking detection for the remote user.
    this.addSpeakingDetector(consumer.track, info.producerUserId);
  }

  private addSpeakingDetector(track: MediaStreamTrack, userId: string): void {
    try {
      const detector = new AudioLevelDetector(track, 8, (speaking) => {
        if (!this.destroyed) {
          useVoiceStore.getState().setSpeaking(userId, speaking);
        }
      });
      this.detectors.push(detector);
    } catch (err) {
      // Gracefully degrade — no speaking indicators if AudioContext is unavailable.
      console.warn('[VoiceService] speaking detection unavailable', err);
    }
  }

  // ---- Signal promise machinery ------------------------------------------

  private handleSignal = (envelope: Record<string, unknown>): void => {
    const type      = envelope['type']       as string;
    const channelId = envelope['channel_id'] as string;
    if (channelId !== this.channelId) return;

    const pending = this.pendingSignals.get(type);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingSignals.delete(type);
      pending.resolve(envelope['data']);
    }
  };

  /** Wait for a specific response type with a timeout. */
  private waitFor<T>(responseType: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSignals.delete(responseType);
        reject(new Error(`[VoiceService] timed out waiting for "${responseType}"`));
      }, timeoutMs);
      this.pendingSignals.set(responseType, {
        resolve: resolve as (d: unknown) => void,
        reject,
        timer,
      });
    });
  }

  /** Send a VOICE_SIGNAL op and return a promise that resolves with the response payload. */
  private sendSignal<T = void>(type: string, data: unknown): Promise<T> {
    const responseType = `${type}_response`;
    const p = this.waitFor<T>(responseType, 10_000);
    sendVoiceSignal(this.socket, this.channelId, type, data);
    return p;
  }
}
