/**
 * Unit tests for createMessagingWorker.
 * Stubs BullMQ's Worker so no Redis connection is needed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// BullMQ Worker stub — captures the job handler and event listeners
// ---------------------------------------------------------------------------
type JobHandler = (job: unknown) => Promise<void>;

interface WorkerStub {
  handler: JobHandler;
  opts: Record<string, unknown>;
  listeners: Record<string, ((...args: unknown[]) => void)[]>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  fire(event: string, ...args: unknown[]): void;
}

let workerStub: WorkerStub;

vi.mock('bullmq', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WorkerCtor = function (this: any, queue: string, handler: JobHandler, opts: Record<string, unknown>) {
    workerStub = {
      handler,
      opts,
      listeners: {},
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(cb);
        return this;
      },
      fire(event: string, ...args: unknown[]) {
        (this.listeners[event] ?? []).forEach((cb) => cb(...args));
      },
    };
    Object.assign(this, workerStub);
  } as unknown as new (...args: unknown[]) => WorkerStub;
  return { Worker: WorkerCtor };
});

import { createMessagingWorker } from './messaging.worker';
import type { MessagingService } from './messaging.service';

function makeService(overrides: Partial<MessagingService> = {}): MessagingService {
  return {
    processDelivery: vi.fn().mockResolvedValue(undefined),
    createInquiry: vi.fn(),
    listInquiries: vi.fn(),
    getInquiry: vi.fn(),
    markInquiryRead: vi.fn(),
    listProviderInbox: vi.fn(),
    providerReply: vi.fn(),
    providerOptOut: vi.fn(),
    handleInbound: vi.fn(),
    ...overrides,
  } as unknown as MessagingService;
}

const CONN = { host: 'localhost', port: 6379 };

describe('createMessagingWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Worker for the messaging queue', () => {
    createMessagingWorker(makeService(), CONN);
    expect(workerStub).toBeDefined();
    expect(workerStub.opts).toMatchObject({ connection: CONN });
  });

  it('calls processDelivery with the job deliveryId', async () => {
    const svc = makeService();
    createMessagingWorker(svc, CONN);
    await workerStub.handler({ data: { deliveryId: 'dlv-1' } });
    expect(svc.processDelivery).toHaveBeenCalledWith('dlv-1');
  });

  it('registers failed and error event listeners', () => {
    createMessagingWorker(makeService(), CONN);
    expect(Object.keys(workerStub.listeners)).toContain('failed');
    expect(Object.keys(workerStub.listeners)).toContain('error');
  });

  it('does not throw when a failed event fires with a null job', () => {
    createMessagingWorker(makeService(), CONN);
    expect(() => workerStub.fire('failed', null, new Error('stale'))).not.toThrow();
  });

  it('does not throw when a failed event fires with a non-dead job (attemptsMade < 3)', () => {
    createMessagingWorker(makeService(), CONN);
    const job = { id: 'j1', name: 'deliver', data: { deliveryId: 'dlv-2' }, attemptsMade: 1 };
    expect(() => workerStub.fire('failed', job, new Error('transient'))).not.toThrow();
  });

  it('logs dead-letter when attemptsMade >= 3', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMessagingWorker(makeService(), CONN);
    const job = { id: 'j2', name: 'deliver', data: { deliveryId: 'dlv-3' }, attemptsMade: 3 };
    workerStub.fire('failed', job, new Error('fatal'));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not throw when an error event fires', () => {
    createMessagingWorker(makeService(), CONN);
    expect(() => workerStub.fire('error', new Error('conn reset'))).not.toThrow();
  });

  it('returns the worker instance', () => {
    const result = createMessagingWorker(makeService(), CONN);
    expect(result).toBeDefined();
  });
});
