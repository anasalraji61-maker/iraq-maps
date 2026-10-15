import { Queue, type JobsOptions } from 'bullmq';
import type { JobDataMap, JobName } from './jobs.js';

/**
 * JobQueue wraps BullMQ Queue with typed job definitions.
 * One instance per queue name; share it across the process.
 */
export class JobQueue {
  private readonly queue: Queue;

  constructor(
    readonly name: string,
    redisUrl: string,
  ) {
    this.queue = new Queue(name, { connection: { url: redisUrl } });
  }

  /** Add a typed job to the queue. */
  async add<N extends JobName>(jobName: N, data: JobDataMap[N], opts?: JobsOptions) {
    return this.queue.add(jobName, data as object, opts);
  }

  /** Schedule a repeating job using a cron expression. */
  async schedule<N extends JobName>(jobName: N, cron: string, data: JobDataMap[N]) {
    return this.queue.upsertJobScheduler(jobName, { pattern: cron }, { name: jobName, data: data as object });
  }

  /** Raw BullMQ Queue for health checks / direct use. */
  get raw(): Queue {
    return this.queue;
  }

  async close() {
    await this.queue.close();
  }
}
