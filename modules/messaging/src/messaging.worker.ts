import { Worker, type ConnectionOptions } from 'bullmq';
import type { MessagingService } from './messaging.service';

const log = {
  error: (meta: object, msg: string) => console.error(JSON.stringify({ level: 'error', ...meta, msg })),
  warn: (meta: object, msg: string) => console.warn(JSON.stringify({ level: 'warn', ...meta, msg })),
};

const MAX_RETRIES = 3;

/**
 * BullMQ Worker that processes the `messaging` queue.
 * On failure after MAX_RETRIES the job is moved to the BullMQ failed set and logged
 * as a dead-letter event for observability.
 */
export function createMessagingWorker(
  svc: MessagingService,
  connection: ConnectionOptions,
): Worker {
  const worker = new Worker(
    'messaging',
    async (job) => {
      const { deliveryId } = job.data as { deliveryId: string };
      await svc.processDelivery(deliveryId);
    },
    {
      connection,
      // BullMQ retries: attempt the job up to MAX_RETRIES+1 times with exponential backoff.
      // After all attempts are exhausted BullMQ moves the job to the failed set automatically.
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const isDead = (job.attemptsMade ?? 0) >= MAX_RETRIES;
    if (isDead) {
      log.error(
        {
          jobId: job.id,
          jobName: job.name,
          queue: 'messaging',
          deliveryId: (job.data as { deliveryId?: string }).deliveryId,
          error: err?.message,
          attemptsMade: job.attemptsMade,
        },
        'messaging job dead-lettered after max retries',
      );
    } else {
      log.warn(
        { jobId: job.id, attemptsMade: job.attemptsMade, error: err?.message },
        'messaging job failed; will retry',
      );
    }
  });

  worker.on('error', (err) => {
    log.error({ err }, 'messaging worker connection error');
  });

  return worker;
}
