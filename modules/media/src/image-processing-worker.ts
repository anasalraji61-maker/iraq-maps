import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import sharp from 'sharp';
import type { ObjectStorage } from '@iraq-maps/contracts';

export const IMAGE_PROCESSING_QUEUE = 'image-processing';

export interface ImageProcessingJob {
  assetId: string;
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
}

const MAX_DIMENSION = 1920;

const log = {
  error: (meta: object, msg: string) => console.error(JSON.stringify({ level: 'error', ...meta, msg })),
  warn: (meta: object, msg: string) => console.warn(JSON.stringify({ level: 'warn', ...meta, msg })),
};

const MAX_RETRIES = 3;

/** Creates the BullMQ Queue for image processing jobs. */
export function createImageProcessingQueue(connection: ConnectionOptions): Queue<ImageProcessingJob> {
  return new Queue<ImageProcessingJob>(IMAGE_PROCESSING_QUEUE, { connection });
}

/**
 * BullMQ Worker that processes the `image-processing` queue.
 * Reads the source object from storage, resizes/converts to WebP, and writes the output.
 */
export function createImageProcessingWorker(
  storage: ObjectStorage,
  connection: ConnectionOptions,
): Worker<ImageProcessingJob> {
  const worker = new Worker<ImageProcessingJob>(
    IMAGE_PROCESSING_QUEUE,
    async (job) => {
      const { inputPath, outputPath, width, height } = job.data;

      const raw = await storage.get(inputPath);
      if (!raw) throw new Error(`Object not found in storage: ${inputPath}`);

      const maxW = width ?? MAX_DIMENSION;
      const maxH = height ?? MAX_DIMENSION;

      const processed = await sharp(Buffer.from(raw))
        .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      await storage.put(outputPath, new Uint8Array(processed), 'image/webp');
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const isDead = (job.attemptsMade ?? 0) >= MAX_RETRIES;
    if (isDead) {
      log.error(
        {
          jobId: job.id,
          queue: IMAGE_PROCESSING_QUEUE,
          assetId: (job.data as ImageProcessingJob).assetId,
          error: err?.message,
          attemptsMade: job.attemptsMade,
        },
        'image-processing job dead-lettered after max retries',
      );
    } else {
      log.warn(
        { jobId: job.id, attemptsMade: job.attemptsMade, error: err?.message },
        'image-processing job failed; will retry',
      );
    }
  });

  worker.on('error', (err) => {
    log.error({ err }, 'image-processing worker connection error');
  });

  return worker;
}
