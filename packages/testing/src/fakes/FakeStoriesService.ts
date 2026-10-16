/**
 * FakeStoriesService — in-memory stories service fake for testing.
 *
 * Covers:
 *  - createStory, getStory, deleteStory
 *  - listFeed, listMine, listByUser
 *  - viewStory, getViewers
 *  - replyToStory
 *  - 24h expiry logic (isExpired, listActive)
 *  - Consent and ownership guards
 */
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoryType = 'text' | 'photo' | 'video';

export interface StoryLocation {
  lat: number;
  lon: number;
  name?: string;
}

export interface CreateStoryDto {
  type: StoryType;
  body: string;
  mediaId?: string;
  location?: StoryLocation;
  ttlMs?: number; // defaults to 24h
}

export interface Story {
  id: string;
  authorId: string;
  type: StoryType;
  body: string;
  mediaId?: string;
  location?: StoryLocation;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}

export interface StoryView {
  storyId: string;
  userId: string;
  viewedAt: Date;
}

export interface StoryReply {
  id: string;
  storyId: string;
  authorId: string;
  text: string;
  createdAt: Date;
}

export class FakeStoriesServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FakeStoriesServiceError';
  }
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── FakeStoriesService ───────────────────────────────────────────────────────

export class FakeStoriesService {
  private readonly stories: Map<string, Story> = new Map();
  private readonly views: StoryView[] = [];
  private readonly replies: Map<string, StoryReply[]> = new Map();

  /** Controllable clock for testing expiry. */
  private _now: () => Date = () => new Date();

  /** Override the clock (e.g. advance time to trigger expiry). */
  setNow(fn: () => Date): void {
    this._now = fn;
  }

  now(): Date {
    return this._now();
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createStory(authorId: string, dto: CreateStoryDto): Promise<Story> {
    if (!dto.body && dto.type === 'text') {
      throw new FakeStoriesServiceError('body required for text stories', 'body_required', 400);
    }
    if (dto.type === 'photo' && !dto.mediaId) {
      throw new FakeStoriesServiceError('mediaId required for photo stories', 'media_required', 400);
    }
    if (dto.body.length > 5000) {
      throw new FakeStoriesServiceError('body too long', 'body_too_long', 422);
    }

    const createdAt = this.now();
    const ttl = dto.ttlMs ?? DEFAULT_TTL_MS;
    const story: Story = {
      id: randomUUID(),
      authorId,
      type: dto.type,
      body: dto.body,
      mediaId: dto.mediaId,
      location: dto.location,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + ttl),
      viewCount: 0,
    };
    this.stories.set(story.id, story);
    return story;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────────

  async getStory(storyId: string): Promise<Story> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new FakeStoriesServiceError('Story not found', 'not_found', 404);
    }
    return story;
  }

  async listFeed(viewerId: string, opts: { limit?: number; cursor?: string } = {}): Promise<{
    items: Story[];
    nextCursor: string | null;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;
    const now = this.now();

    let items = Array.from(this.stories.values())
      .filter((s) => s.authorId !== viewerId && s.expiresAt > now);

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (cursorDate) {
      items = items.filter((s) => s.createdAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async listMine(authorId: string, opts: { includeExpired?: boolean } = {}): Promise<Story[]> {
    const now = this.now();
    return Array.from(this.stories.values())
      .filter(
        (s) =>
          s.authorId === authorId &&
          (opts.includeExpired || s.expiresAt > now),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByUser(
    authorId: string,
    viewerId: string,
    opts: { limit?: number } = {},
  ): Promise<Story[]> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = this.now();
    return Array.from(this.stories.values())
      .filter((s) => s.authorId === authorId && s.expiresAt > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async listActive(): Promise<Story[]> {
    const now = this.now();
    return Array.from(this.stories.values()).filter((s) => s.expiresAt > now);
  }

  async listExpired(): Promise<Story[]> {
    const now = this.now();
    return Array.from(this.stories.values()).filter((s) => s.expiresAt <= now);
  }

  isExpired(story: Story): boolean {
    return story.expiresAt <= this.now();
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async deleteStory(authorId: string, storyId: string): Promise<void> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new FakeStoriesServiceError('Story not found', 'not_found', 404);
    }
    if (story.authorId !== authorId) {
      throw new FakeStoriesServiceError('Forbidden', 'forbidden', 403);
    }
    this.stories.delete(storyId);
    // Remove views
    const idx = this.views.findIndex((v) => v.storyId === storyId);
    if (idx !== -1) this.views.splice(idx, 1);
    this.replies.delete(storyId);
  }

  // ─── Views ────────────────────────────────────────────────────────────────────

  async viewStory(viewerId: string, storyId: string): Promise<void> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new FakeStoriesServiceError('Story not found', 'not_found', 404);
    }
    if (this.isExpired(story)) {
      throw new FakeStoriesServiceError('Story expired', 'story_expired', 410);
    }

    // Deduplicate views per viewer
    const existing = this.views.find((v) => v.storyId === storyId && v.userId === viewerId);
    if (!existing) {
      this.views.push({ storyId, userId: viewerId, viewedAt: this.now() });
      story.viewCount++;
    }
  }

  async getViewers(
    authorId: string,
    storyId: string,
    opts: { limit?: number } = {},
  ): Promise<{ items: Array<{ userId: string; viewedAt: string }> }> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new FakeStoriesServiceError('Story not found', 'not_found', 404);
    }
    if (story.authorId !== authorId) {
      throw new FakeStoriesServiceError('Forbidden', 'forbidden', 403);
    }

    const limit = Math.min(opts.limit ?? 50, 200);
    const items = this.views
      .filter((v) => v.storyId === storyId)
      .sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime())
      .slice(0, limit)
      .map((v) => ({ userId: v.userId, viewedAt: v.viewedAt.toISOString() }));

    return { items };
  }

  async hasViewed(viewerId: string, storyId: string): Promise<boolean> {
    return this.views.some((v) => v.storyId === storyId && v.userId === viewerId);
  }

  // ─── Replies ──────────────────────────────────────────────────────────────────

  async replyToStory(
    authorId: string,
    storyId: string,
    text: string,
  ): Promise<StoryReply> {
    if (!text.trim()) {
      throw new FakeStoriesServiceError('Reply text required', 'text_required', 400);
    }
    const story = this.stories.get(storyId);
    if (!story) {
      throw new FakeStoriesServiceError('Story not found', 'not_found', 404);
    }
    if (this.isExpired(story)) {
      throw new FakeStoriesServiceError('Cannot reply to expired story', 'story_expired', 410);
    }

    const reply: StoryReply = {
      id: randomUUID(),
      storyId,
      authorId,
      text,
      createdAt: this.now(),
    };

    const existing = this.replies.get(storyId) ?? [];
    existing.push(reply);
    this.replies.set(storyId, existing);

    return reply;
  }

  async getReplies(storyId: string, limit = 50): Promise<StoryReply[]> {
    return (this.replies.get(storyId) ?? []).slice(0, limit);
  }

  // ─── Cleanup helpers ──────────────────────────────────────────────────────────

  async purgeExpired(): Promise<number> {
    const now = this.now();
    let count = 0;
    for (const [id, story] of this.stories.entries()) {
      if (story.expiresAt <= now) {
        this.stories.delete(id);
        this.replies.delete(id);
        count++;
      }
    }
    // Remove views for deleted stories
    const validIds = new Set(this.stories.keys());
    const toRemove = this.views.filter((v) => !validIds.has(v.storyId));
    for (const v of toRemove) {
      const idx = this.views.indexOf(v);
      if (idx !== -1) this.views.splice(idx, 1);
    }
    return count;
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  getTotalStoriesCount(): number {
    return this.stories.size;
  }

  getActiveStoriesCount(): number {
    const now = this.now();
    return Array.from(this.stories.values()).filter((s) => s.expiresAt > now).length;
  }

  getTotalViewsForStory(storyId: string): number {
    return this.views.filter((v) => v.storyId === storyId).length;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────

  reset(): void {
    this.stories.clear();
    this.views.length = 0;
    this.replies.clear();
    this._now = () => new Date();
  }
}
