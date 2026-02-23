import * as mediasoup from 'mediasoup';

/**
 * Peer represents a single connected user inside a Room.
 * Each peer owns exactly two WebRTC transports:
 *   - sendTransport: the peer publishes their audio through this
 *   - recvTransport: the peer receives other peers' audio through this
 */
export class Peer {
  readonly userId: string;

  sendTransport: mediasoup.types.WebRtcTransport | null = null;
  recvTransport: mediasoup.types.WebRtcTransport | null = null;

  /** Outbound producers keyed by producer.id */
  readonly producers = new Map<string, mediasoup.types.Producer>();

  /** Inbound consumers keyed by consumer.id */
  readonly consumers = new Map<string, mediasoup.types.Consumer>();

  constructor(userId: string) {
    this.userId = userId;
  }

  /** Closes all transports (which implicitly closes all producers and consumers). */
  close(): void {
    this.sendTransport?.close();
    this.recvTransport?.close();
  }
}
