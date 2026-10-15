import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import { LikeBatcher } from './like-batcher';

describe('LikeBatcher', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends a single notification after window expires', async () => {
    const sendToUser = vi.fn().mockResolvedValue('id-1');
    const svc = { sendToUser } as unknown as import('./notifications.service').NotificationsService;
    const batcher = new LikeBatcher(svc, 30_000);
    const authorId = 'author-1' as UserId;

    batcher.add('post-1', authorId);
    expect(sendToUser).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(sendToUser).toHaveBeenCalledOnce();
    expect(sendToUser.mock.calls[0]?.[1]?.body).toContain('شخص');
  });

  it('batches multiple likes into one notification with count', async () => {
    const sendToUser = vi.fn().mockResolvedValue('id-1');
    const svc = { sendToUser } as unknown as import('./notifications.service').NotificationsService;
    const batcher = new LikeBatcher(svc, 30_000);
    const authorId = 'author-1' as UserId;

    batcher.add('post-1', authorId);
    batcher.add('post-1', authorId);
    batcher.add('post-1', authorId);

    await vi.runAllTimersAsync();
    expect(sendToUser).toHaveBeenCalledOnce();
    const body: string = sendToUser.mock.calls[0]?.[1]?.body ?? '';
    expect(body).toContain('3');
  });
});
