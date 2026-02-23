import * as mediasoup from 'mediasoup';

let worker: mediasoup.types.Worker | null = null;

/**
 * Returns the singleton mediasoup Worker, creating it on first call.
 * RTC port range is configurable via env; defaults to 10000-10999.
 */
export async function getWorker(): Promise<mediasoup.types.Worker> {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: parseInt(process.env.RTC_MIN_PORT ?? '10000', 10),
    rtcMaxPort: parseInt(process.env.RTC_MAX_PORT ?? '10999', 10),
  });

  worker.on('died', (err) => {
    console.error('mediasoup worker died — exiting', err);
    process.exit(1);
  });

  return worker;
}
