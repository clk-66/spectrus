import * as mediasoup from 'mediasoup';
import { Peer } from './Peer';

// ---- Config --------------------------------------------------------------

const OPUS_CODEC: mediasoup.types.RtpCodecCapability = {
  kind: 'audio',
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 2,
  preferredPayloadType: 100,
};

function transportOptions(): mediasoup.types.WebRtcTransportOptions {
  const listenIp = process.env.MEDIASOUP_LISTEN_IP ?? '127.0.0.1';
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

  return {
    listenIps: [{ ip: listenIp, announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800_000,
  };
}

// ---- Signal payload types ------------------------------------------------

export type SignalPayload =
  | { type: 'connect-send-transport'; data: { dtlsParameters: mediasoup.types.DtlsParameters } }
  | { type: 'connect-recv-transport'; data: { dtlsParameters: mediasoup.types.DtlsParameters } }
  | { type: 'produce';                data: { kind: mediasoup.types.MediaKind; rtpParameters: mediasoup.types.RtpParameters } }
  | { type: 'consume';                data: { rtpCapabilities: mediasoup.types.RtpCapabilities } }
  | { type: 'resume-consumer';        data: { consumerId: string } };

// ---- Transport params returned to the client -----------------------------

interface TransportParams {
  id: string;
  iceParameters: mediasoup.types.IceParameters;
  iceCandidates: mediasoup.types.IceCandidate[];
  dtlsParameters: mediasoup.types.DtlsParameters;
}

// ---- Room ----------------------------------------------------------------

/**
 * Room represents one voice channel.
 * Created on the first peer's join, destroyed when the last peer leaves.
 */
export class Room {
  readonly channelId: string;
  readonly router: mediasoup.types.Router;
  readonly peers = new Map<string, Peer>();

  private constructor(channelId: string, router: mediasoup.types.Router) {
    this.channelId = channelId;
    this.router = router;
  }

  static async create(channelId: string, worker: mediasoup.types.Worker): Promise<Room> {
    const router = await worker.createRouter({ mediaCodecs: [OPUS_CODEC] });
    return new Room(channelId, router);
  }

  /**
   * Adds a peer to the room (or replaces stale transports if they re-join).
   * Returns transport parameters the client needs to set up its local RTCPeerConnection.
   */
  async join(userId: string): Promise<{
    routerRtpCapabilities: mediasoup.types.RtpCapabilities;
    sendTransport: TransportParams;
    recvTransport: TransportParams;
  }> {
    let peer = this.peers.get(userId);
    if (!peer) {
      peer = new Peer(userId);
      this.peers.set(userId, peer);
    }

    // Replace stale transports if the peer is re-joining.
    peer.sendTransport?.close();
    peer.recvTransport?.close();

    const opts = transportOptions();
    const sendTransport = await this.router.createWebRtcTransport(opts);
    const recvTransport = await this.router.createWebRtcTransport(opts);

    peer.sendTransport = sendTransport;
    peer.recvTransport = recvTransport;

    return {
      routerRtpCapabilities: this.router.rtpCapabilities,
      sendTransport: toTransportParams(sendTransport),
      recvTransport: toTransportParams(recvTransport),
    };
  }

  /**
   * Handles all signaling operations for a peer.
   * Returns an object to be forwarded back to the client (may be empty {}).
   */
  async signal(userId: string, payload: SignalPayload): Promise<object> {
    const peer = this.peers.get(userId);
    if (!peer) throw new PeerNotFoundError(userId);

    switch (payload.type) {
      case 'connect-send-transport': {
        await peer.sendTransport!.connect({ dtlsParameters: payload.data.dtlsParameters });
        return {};
      }

      case 'connect-recv-transport': {
        await peer.recvTransport!.connect({ dtlsParameters: payload.data.dtlsParameters });
        return {};
      }

      case 'produce': {
        const producer = await peer.sendTransport!.produce({
          kind: payload.data.kind,
          rtpParameters: payload.data.rtpParameters,
        });

        peer.producers.set(producer.id, producer);

        // Clean up when transport closes.
        producer.on('transportclose', () => {
          peer.producers.delete(producer.id);
        });

        return { producerId: producer.id };
      }

      case 'consume': {
        // Create a consumer for every producer in the room that this peer
        // isn't already consuming. The client calls this after receiving a
        // VOICE_STATE_UPDATE so it can start receiving new peers' audio.
        const consumers: object[] = [];

        for (const [otherUserId, otherPeer] of this.peers) {
          if (otherUserId === userId) continue;

          for (const [producerId, producer] of otherPeer.producers) {
            if (peer.consumers.has(producerId)) continue; // already consuming

            if (!this.router.canConsume({ producerId, rtpCapabilities: payload.data.rtpCapabilities })) {
              continue;
            }

            const consumer = await peer.recvTransport!.consume({
              producerId,
              rtpCapabilities: payload.data.rtpCapabilities,
              paused: true, // client must call resume-consumer after setting up the track
            });

            peer.consumers.set(consumer.id, consumer);

            consumer.on('transportclose', () => peer.consumers.delete(consumer.id));
            consumer.on('producerclose',  () => peer.consumers.delete(consumer.id));

            consumers.push({
              id:             consumer.id,
              producerId,
              producerUserId: otherUserId,
              kind:           consumer.kind,
              rtpParameters:  consumer.rtpParameters,
            });
          }
        }

        return { consumers };
      }

      case 'resume-consumer': {
        const consumer = peer.consumers.get(payload.data.consumerId);
        if (!consumer) throw new Error(`consumer ${payload.data.consumerId} not found`);
        await consumer.resume();
        return {};
      }
    }
  }

  /**
   * Removes a peer and closes their transports.
   * Returns true if the room is now empty and should be destroyed.
   */
  removePeer(userId: string): boolean {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.close();
      this.peers.delete(userId);
    }
    return this.peers.size === 0;
  }

  close(): void {
    this.router.close();
  }
}

// ---- Errors --------------------------------------------------------------

export class PeerNotFoundError extends Error {
  constructor(userId: string) {
    super(`peer ${userId} not found in room`);
    this.name = 'PeerNotFoundError';
  }
}

// ---- Helpers -------------------------------------------------------------

function toTransportParams(t: mediasoup.types.WebRtcTransport): TransportParams {
  return {
    id:              t.id,
    iceParameters:   t.iceParameters,
    iceCandidates:   t.iceCandidates,
    dtlsParameters:  t.dtlsParameters,
  };
}
