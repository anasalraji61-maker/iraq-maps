import { describe, it, expect, vi } from 'vitest';
import { ReviewsService } from './reviews';

const PLACE_ID = 'place_01';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const REVIEW_ID = '00000000-0000-0000-0000-000000000002';

function makeReviewRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: REVIEW_ID,
    placeId: PLACE_ID,
    userId: USER_ID,
    rating: 4,
    text: 'Great place!',
    photoAssetIds: [],
    createdAt: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDb(reviewRows: ReturnType<typeof makeReviewRow>[] = [makeReviewRow()]) {
  const returning = vi.fn().mockResolvedValue(reviewRows.slice(0, 1));
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insertFn = vi.fn().mockReturnValue({ values: insertValues });

  const deleteReturning = vi.fn().mockResolvedValue([{ id: REVIEW_ID }]);
  const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning });
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });

  const where = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(reviewRows) }),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  const from = vi.fn().mockReturnValue({ where });
  const selectFn = vi.fn().mockReturnValue({ from });

  return { insert: insertFn, delete: deleteFn, select: selectFn };
}

describe('ReviewsService', () => {
  it('submit returns shaped review with photoAssetIds', async () => {
    const db = makeDb();
    const svc = new ReviewsService(db as never);
    const review = await svc.submit(PLACE_ID as never, USER_ID as never, 4, 'Nice!', ['asset-uuid']);
    expect(review.rating).toBe(4);
    expect(review.placeId).toBe(PLACE_ID);
    expect(review.photoAssetIds).toEqual([]);
  });

  it('deleteOwn returns true when review found', async () => {
    const db = makeDb();
    const svc = new ReviewsService(db as never);
    const result = await svc.deleteOwn(PLACE_ID as never, USER_ID as never);
    expect(result).toBe(true);
  });

  it('deleteOwn returns false when no review found', async () => {
    const db = makeDb();
    // Override delete to return empty
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });
    const svc = new ReviewsService(db as never);
    const result = await svc.deleteOwn(PLACE_ID as never, USER_ID as never);
    expect(result).toBe(false);
  });
});
