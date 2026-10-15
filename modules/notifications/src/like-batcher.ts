import type { UserId } from '@iraq-maps/contracts';
import type { NotificationsService } from './notifications.service';

interface PendingBatch {
  count: number;
  authorId: UserId;
  timer: ReturnType<typeof setTimeout>;
}

/** Batches `discover.post.liked` events: waits `windowMs` after the first like, then sends
 * a single notification with the accumulated count. Subsequent likes within the window
 * just increment the counter; only one push is sent per window. */
export class LikeBatcher {
  private readonly pending = new Map<string, PendingBatch>();

  constructor(
    private readonly svc: NotificationsService,
    private readonly windowMs: number = 30_000,
  ) {}

  add(postId: string, postAuthorId: UserId): void {
    const existing = this.pending.get(postId);
    if (existing) {
      existing.count++;
      return;
    }

    const batch: PendingBatch = {
      count: 1,
      authorId: postAuthorId,
      timer: setTimeout(() => {
        void this.flush(postId);
      }, this.windowMs),
    };
    this.pending.set(postId, batch);
  }

  private async flush(postId: string): Promise<void> {
    const batch = this.pending.get(postId);
    if (!batch) return;
    this.pending.delete(postId);

    const n = batch.count;
    const body = n === 1
      ? 'أعجب شخص بمنشورك.'
      : `أعجب ${n} أشخاص بمنشورك.`;

    await this.svc.sendToUser(batch.authorId, {
      title: 'إعجابات جديدة',
      body,
      data: { type: 'post_liked', postId, likeCount: String(n) },
    });
  }

  /** Flush all pending batches immediately (used on shutdown). */
  async flushAll(): Promise<void> {
    const ids = [...this.pending.keys()];
    for (const postId of ids) {
      const batch = this.pending.get(postId);
      if (batch) clearTimeout(batch.timer);
    }
    await Promise.allSettled(ids.map((id) => this.flush(id)));
  }
}
