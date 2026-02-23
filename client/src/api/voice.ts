/**
 * Voice signaling API helpers.
 * These wrap the VOICE_STATE_UPDATE / VOICE_SIGNAL WebSocket ops — actual
 * mediasoup negotiation happens over the WebSocket, not REST.
 */

import type { SpectrusSocket } from '../ws/SpectrusSocket';

/** Tell the server the client is joining (or leaving) a voice channel. */
export function sendVoiceStateUpdate(
  socket: SpectrusSocket,
  channelId: string | null
): void {
  socket.send({ op: 'VOICE_STATE_UPDATE', d: { channel_id: channelId } });
}

/** Forward a mediasoup signaling payload (offer/answer/ICE) to the server. */
export function sendVoiceSignal(
  socket: SpectrusSocket,
  channelId: string,
  type: string,
  data: unknown
): void {
  socket.send({ op: 'VOICE_SIGNAL', d: { channel_id: channelId, type, data } });
}
