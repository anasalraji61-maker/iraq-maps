/**
 * FakeCollectionsService — in-memory collections service fake for testing.
 *
 * Covers:
 *  - createCollection, getCollection, updateCollection, deleteCollection
 *  - listMine, listPublic, listFollowed
 *  - addPlace, removePlace, listPlaces
 *  - followCollection, unfollowCollection
 *  - Visibility guards (private not visible to non-owners)
 */
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  placeCount: number;
  followerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionPlace {
  collectionId: string;
  placeId: string;
  note?: string;
  addedAt: Date;
  addedBy: string;
}

export interface CollectionFollow {
  collectionId: string;
  followerId: string;
  followedAt: Date;
}

export interface CreateCollectionDto {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface UpdateCollectionDto {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

export class FakeCollectionsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FakeCollectionsServiceError';
  }
}

// ─── FakeCollectionsService ───────────────────────────────────────────────────

export class FakeCollectionsService {
  private readonly collections: Map<string, Collection> = new Map();
  private readonly places: CollectionPlace[] = [];
  private readonly follows: CollectionFollow[] = [];

  // ─── Create / Update / Delete ─────────────────────────────────────────────────

  async createCollection(ownerId: string, dto: CreateCollectionDto): Promise<Collection> {
    if (!dto.name?.trim()) {
      throw new FakeCollectionsServiceError('name is required', 'name_required', 400);
    }
    const now = new Date();
    const collection: Collection = {
      id: randomUUID(),
      ownerId,
      name: dto.name.trim(),
      description: dto.description,
      isPublic: dto.isPublic ?? false,
      placeCount: 0,
      followerCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.collections.set(collection.id, collection);
    return collection;
  }

  async getCollection(collectionId: string, requesterId?: string): Promise<Collection> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (!col.isPublic && col.ownerId !== requesterId) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    return col;
  }

  async updateCollection(
    ownerId: string,
    collectionId: string,
    dto: UpdateCollectionDto,
  ): Promise<Collection> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (col.ownerId !== ownerId) {
      throw new FakeCollectionsServiceError('Forbidden', 'forbidden', 403);
    }
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new FakeCollectionsServiceError('name cannot be empty', 'name_required', 400);
      }
      col.name = dto.name.trim();
    }
    if (dto.description !== undefined) col.description = dto.description;
    if (dto.isPublic !== undefined) {
      // If switching to private, remove all followers
      if (!dto.isPublic && col.isPublic) {
        const toRemove = this.follows.filter((f) => f.collectionId === collectionId);
        for (const f of toRemove) {
          const idx = this.follows.indexOf(f);
          if (idx !== -1) this.follows.splice(idx, 1);
        }
        col.followerCount = 0;
      }
      col.isPublic = dto.isPublic;
    }
    col.updatedAt = new Date();
    return col;
  }

  async deleteCollection(ownerId: string, collectionId: string): Promise<void> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (col.ownerId !== ownerId) {
      throw new FakeCollectionsServiceError('Forbidden', 'forbidden', 403);
    }
    this.collections.delete(collectionId);
    // Remove places
    const placesToRemove = this.places.filter((p) => p.collectionId === collectionId);
    for (const p of placesToRemove) {
      const idx = this.places.indexOf(p);
      if (idx !== -1) this.places.splice(idx, 1);
    }
    // Remove follows
    const followsToRemove = this.follows.filter((f) => f.collectionId === collectionId);
    for (const f of followsToRemove) {
      const idx = this.follows.indexOf(f);
      if (idx !== -1) this.follows.splice(idx, 1);
    }
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

  async listMine(
    ownerId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Collection[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    let items = Array.from(this.collections.values())
      .filter((c) => c.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (cursorDate) {
      items = items.filter((c) => c.updatedAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.updatedAt.toISOString() : null,
    };
  }

  async listPublic(
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Collection[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    let items = Array.from(this.collections.values())
      .filter((c) => c.isPublic)
      .sort((a, b) => b.followerCount - a.followerCount || b.createdAt.getTime() - a.createdAt.getTime());

    if (cursorDate) {
      items = items.filter((c) => c.createdAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async listFollowed(
    followerId: string,
    opts: { limit?: number } = {},
  ): Promise<Collection[]> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const followedIds = new Set(
      this.follows
        .filter((f) => f.followerId === followerId)
        .map((f) => f.collectionId),
    );
    return Array.from(this.collections.values())
      .filter((c) => followedIds.has(c.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ─── Places ───────────────────────────────────────────────────────────────────

  async addPlace(
    requesterId: string,
    collectionId: string,
    placeId: string,
    note?: string,
  ): Promise<CollectionPlace> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (col.ownerId !== requesterId) {
      throw new FakeCollectionsServiceError('Forbidden', 'forbidden', 403);
    }

    const existing = this.places.find(
      (p) => p.collectionId === collectionId && p.placeId === placeId,
    );
    if (existing) {
      throw new FakeCollectionsServiceError('Place already in collection', 'place_exists', 409);
    }

    const entry: CollectionPlace = {
      collectionId,
      placeId,
      note,
      addedAt: new Date(),
      addedBy: requesterId,
    };
    this.places.push(entry);
    col.placeCount++;
    col.updatedAt = new Date();
    return entry;
  }

  async removePlace(
    requesterId: string,
    collectionId: string,
    placeId: string,
  ): Promise<void> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (col.ownerId !== requesterId) {
      throw new FakeCollectionsServiceError('Forbidden', 'forbidden', 403);
    }

    const idx = this.places.findIndex(
      (p) => p.collectionId === collectionId && p.placeId === placeId,
    );
    if (idx === -1) {
      throw new FakeCollectionsServiceError('Place not in collection', 'not_found', 404);
    }
    this.places.splice(idx, 1);
    col.placeCount = Math.max(0, col.placeCount - 1);
    col.updatedAt = new Date();
  }

  async listPlaces(
    collectionId: string,
    requesterId?: string,
    opts: { limit?: number } = {},
  ): Promise<{ items: CollectionPlace[] }> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (!col.isPublic && col.ownerId !== requesterId) {
      throw new FakeCollectionsServiceError('Forbidden', 'forbidden', 403);
    }
    const limit = Math.min(opts.limit ?? 50, 200);
    const items = this.places
      .filter((p) => p.collectionId === collectionId)
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, limit);
    return { items };
  }

  hasPlace(collectionId: string, placeId: string): boolean {
    return this.places.some((p) => p.collectionId === collectionId && p.placeId === placeId);
  }

  // ─── Follow / Unfollow ────────────────────────────────────────────────────────

  async followCollection(followerId: string, collectionId: string): Promise<void> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }
    if (!col.isPublic) {
      throw new FakeCollectionsServiceError('Cannot follow private collection', 'private_collection', 403);
    }
    if (col.ownerId === followerId) {
      throw new FakeCollectionsServiceError('Cannot follow own collection', 'self_follow', 400);
    }

    const exists = this.follows.some(
      (f) => f.collectionId === collectionId && f.followerId === followerId,
    );
    if (!exists) {
      this.follows.push({ collectionId, followerId, followedAt: new Date() });
      col.followerCount++;
    }
  }

  async unfollowCollection(followerId: string, collectionId: string): Promise<void> {
    const col = this.collections.get(collectionId);
    if (!col) {
      throw new FakeCollectionsServiceError('Collection not found', 'not_found', 404);
    }

    const idx = this.follows.findIndex(
      (f) => f.collectionId === collectionId && f.followerId === followerId,
    );
    if (idx !== -1) {
      this.follows.splice(idx, 1);
      col.followerCount = Math.max(0, col.followerCount - 1);
    }
  }

  isFollowing(followerId: string, collectionId: string): boolean {
    return this.follows.some(
      (f) => f.collectionId === collectionId && f.followerId === followerId,
    );
  }

  getFollowerCount(collectionId: string): number {
    return this.follows.filter((f) => f.collectionId === collectionId).length;
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  getTotalCollectionsCount(): number {
    return this.collections.size;
  }

  getPublicCollectionsCount(): number {
    return Array.from(this.collections.values()).filter((c) => c.isPublic).length;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────

  reset(): void {
    this.collections.clear();
    this.places.length = 0;
    this.follows.length = 0;
  }
}
