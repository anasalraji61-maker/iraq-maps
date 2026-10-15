import { Worker, type Job } from 'bullmq';
import type { Logger } from '@iraq-maps/observability';
import type { JobDataMap, JobName, JobResultMap } from './jobs.js';

export type JobHandler<N extends JobName> = (job: Job<JobDataMap[N], JobResultMap[N]>) => Promise<JobResultMap[N]>;

/**
 * JobWorker base class: wraps BullMQ Worker with typed job handlers and structured logging.
 */
export class JobWorker {
  private readonly worker: Worker;

  constructor(
    queueName: string,
    redisUrl: string,
    private readonly handlers: Partial<{ [N in JobName]: JobHandler<N> }>,
    private readonly log?: Logger,
  ) {
    this.worker = new Worker(
      queueName,
      async (job: Job) => {
        const name = job.name as JobName;
        const handler = this.handlers[name];
        if (!handler) {
          this.log?.warn({ jobName: name, jobId: job.id }, 'no handler registered for job');
          return;
        }
        this.log?.info({ jobName: name, jobId: job.id }, 'processing job');
        try {
          const result = await (handler as JobHandler<JobName>)(job as Job<JobDataMap[JobName], JobResultMap[JobName]>);
          this.log?.info({ jobName: name, jobId: job.id, result }, 'job completed');
          return result;
        } catch (err) {
          this.log?.error({ jobName: name, jobId: job.id, err }, 'job failed');
          throw err;
        }
      },
      { connection: { url: redisUrl }, concurrency: 5 },
    );
  }

  get raw(): Worker {
    return this.worker;
  }

  async close() {
    await this.worker.close();
  }
}
