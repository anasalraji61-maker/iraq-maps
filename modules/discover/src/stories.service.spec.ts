import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoverService } from './discover.service';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

// ─── Minimal DB mock ──────────────────────────────────────────────────────────

const STORY_ID = '00000000-0000-0000-0000-000000000001' as const;
const USER_ID = '00000000-0000-0000-0000-000000000002' as const;
const OTHER_ID = '00000000-0000-0000-0000-000000000003' as const;

function makeStoryRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: STORY_ID,
    authorId: USER_ID,
    mediaUrl: 'https://example.com/story.jpg',
    mediaType: 'image',
    duration: 5,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDb(overrides?: Partial<{
  storyRows: ReturnType<typeof makeStoryRow>[];
  viewRows: { storyId: string; userId: string }[];
  followRows: { followedId: string }[];
}>) {
  const storyRows = overrides?.storyRows ?? [];
  const viewRows = overrides?.viewRows ?? [];
  const followRows = overrides?.followRows ?? [];

  const insertReturning = vi.fn().mockResolvedValue(storyRows.slice(0, 1));
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning, onConflictDoNothing: vi.fn().mockResolvedValue([]) });
  const insertFn = vi.fn().mockReturnValue({ values: insertValues });

  const selectFrom = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(storyRows.slice(0, 1)),
      orderBy: vi.fn().mockResolvedValue(storyRows),
    }),
    orderBy: vi.fn().mockResolvedValue(storyRows),
  });
  const selectFn = vi.fn().mockReturnValue({ from: selectFrom });

  const deleteFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });

  return {
    insert: insertFn,
    select: selectFn,
    delete: deleteFn,
    _storyRows: storyRows,
    _viewRows: viewRows,
    _followRows: followRows,
  };
}

function makeService(db: ReturnType<typeof makeDb>) {
  return new DiscoverService(db as never);
}

describe('DiscoverService – stories', () => {
  let db: ReturnType<typeof makeDb>;
  let svc: DiscoverService;

  beforeEach(() => {
    db = makeDb({ storyRows: [makeStoryRow()] });
    svc = makeService(db);
  });

  it('createStory returns shaped story', async () => {
    const story = await svc.createStory(USER_ID as never, 'https://example.com/s.jpg', 'image', 5);
    expect(story.id).toBe(STORY_ID);
    expect(story.mediaType).toBe('image');
    expect(story.duration).toBe(5);
    expect(story.viewedByMe).toBe(false);
  });

  it('deleteStory throws NotFoundException for missing story', async () => {
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(svc.deleteStory(USER_ID as never, STORY_ID as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteStory throws UnprocessableEntityException when not author', async () => {
    // story authorId is USER_ID, we're deleting as OTHER_ID
    await expect(svc.deleteStory(OTHER_ID as never, STORY_ID as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('deleteStory succeeds when caller is author', async () => {
    await expect(svc.deleteStory(USER_ID as never, STORY_ID as never)).resolves.toBeUndefined();
    expect(db.delete).toHaveBeenCalled();
  });
});
