import express, { Request, Response, NextFunction } from 'express';
import { getWorker } from './worker';
import { Room, PeerNotFoundError, SignalPayload } from './Room';

const app = express();
app.use(express.json());

// In-memory room registry. One Room per voice channel_id.
const rooms = new Map<string, Room>();

// ---- Health --------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- Join ----------------------------------------------------------------

/**
 * POST /rooms/:channel_id/join
 * Body: { user_id: string }
 *
 * Creates the room if it doesn't exist, adds the peer, and returns the
 * WebRTC transport parameters + router RTP capabilities the client needs
 * to initialise its local mediasoup device.
 */
app.post('/rooms/:channel_id/join', async (req: Request, res: Response) => {
  const channelId = req.params.channel_id;
  const userId: string | undefined = req.body.user_id;

  if (!userId) {
    res.status(400).json({ error: 'user_id required' });
    return;
  }

  try {
    let room = rooms.get(channelId);
    if (!room) {
      const worker = await getWorker();
      room = await Room.create(channelId, worker);
      rooms.set(channelId, room);
      console.log(`[room:${channelId}] created`);
    }

    const result = await room.join(userId);
    console.log(`[room:${channelId}] peer joined: ${userId}`);
    res.json(result);
  } catch (err) {
    console.error(`[room:${channelId}] join error`, err);
    res.status(500).json({ error: 'join failed' });
  }
});

// ---- Signal --------------------------------------------------------------

/**
 * POST /rooms/:channel_id/signal
 * Body: { user_id: string, signal: { type: string, data: object } }
 *
 * Handles all WebRTC negotiation signals for a peer:
 *   connect-send-transport — peer provides DTLS params for their send transport
 *   connect-recv-transport — peer provides DTLS params for their recv transport
 *   produce               — peer starts sending audio; returns { producerId }
 *   consume               — peer requests to receive all current producers; returns { consumers }
 *   resume-consumer       — peer unpauses a consumer after track setup
 */
app.post('/rooms/:channel_id/signal', async (req: Request, res: Response) => {
  const channelId = req.params.channel_id;
  const { user_id: userId, signal } = req.body as {
    user_id: string;
    signal: { type: string; data: Record<string, unknown> };
  };

  if (!userId || !signal?.type) {
    res.status(400).json({ error: 'user_id and signal.type required' });
    return;
  }

  const room = rooms.get(channelId);
  if (!room) {
    res.status(404).json({ error: 'room not found' });
    return;
  }

  const validTypes = [
    'connect-send-transport',
    'connect-recv-transport',
    'produce',
    'consume',
    'resume-consumer',
  ];
  if (!validTypes.includes(signal.type)) {
    res.status(400).json({ error: `unknown signal type: ${signal.type}` });
    return;
  }

  try {
    const result = await room.signal(userId, signal as SignalPayload);
    res.json(result);
  } catch (err) {
    if (err instanceof PeerNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error(`[room:${channelId}] signal error`, { userId, type: signal.type, err });
    res.status(500).json({ error: 'signal handling failed' });
  }
});

// ---- Leave ---------------------------------------------------------------

/**
 * DELETE /rooms/:channel_id/leave
 * Body: { user_id: string }
 *
 * Closes the peer's transports, removes them from the room, and destroys
 * the room if it is now empty. Idempotent: returns 204 even if the room
 * or peer didn't exist.
 */
app.delete('/rooms/:channel_id/leave', (req: Request, res: Response) => {
  const channelId = req.params.channel_id;
  const userId: string | undefined = req.body.user_id;

  if (!userId) {
    res.status(400).json({ error: 'user_id required' });
    return;
  }

  const room = rooms.get(channelId);
  if (room) {
    const empty = room.removePeer(userId);
    console.log(`[room:${channelId}] peer left: ${userId}`);

    if (empty) {
      room.close();
      rooms.delete(channelId);
      console.log(`[room:${channelId}] destroyed (no peers remaining)`);
    }
  }

  res.status(204).end();
});

// ---- Error handler -------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('unhandled error', err);
  res.status(500).json({ error: 'internal server error' });
});

// ---- Startup -------------------------------------------------------------

const PORT = parseInt(process.env.MEDIA_PORT ?? '3001', 10);

async function main(): Promise<void> {
  // MEDIASOUP_ANNOUNCED_IP must be set to the server's public IP address.
  // Without it, the ICE candidates sent to remote WebRTC clients will contain
  // an unroutable address and voice connections will silently fail.
  if (!process.env.MEDIASOUP_ANNOUNCED_IP) {
    console.error(
      'FATAL: MEDIASOUP_ANNOUNCED_IP is not set.\n' +
      'Set it to your server\'s public IP address so that WebRTC ICE\n' +
      'candidates are reachable by remote clients.\n' +
      'Example: MEDIASOUP_ANNOUNCED_IP=203.0.113.10'
    );
    process.exit(1);
  }

  // Eagerly create the worker so any startup failure (missing native build,
  // port conflicts) surfaces immediately rather than on the first request.
  await getWorker();
  console.log('mediasoup worker ready');

  app.listen(PORT, () => {
    console.log(`media service listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('startup failed', err);
  process.exit(1);
});
