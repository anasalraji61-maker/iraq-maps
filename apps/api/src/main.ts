import { createLogger } from '@iraq-maps/observability';
import { apiConfig, createApp } from './app.js';
import { createJobQueue, createJobWorker } from './workers/index.js';

const config = apiConfig();
const log = createLogger({ name: 'api', level: config.LOG_LEVEL });

const app = await createApp({ logger: true });
app.enableShutdownHooks();

// Background jobs
const jobQueue = await createJobQueue(config.REDIS_URL);
const { createDb } = await import('@iraq-maps/db-kit');
const { db, close } = createDb(config.DATABASE_URL);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobWorker = createJobWorker(config.REDIS_URL, db as any, log);

// Graceful shutdown
const shutdown = async () => {
  await jobWorker.close();
  await jobQueue.close();
  await close();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
