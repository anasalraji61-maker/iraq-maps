/**
 * Place Collections service.
 *
 * DB tables (places schema):
 *   collection        – owned by a user; metadata only (no OSM fields → ODbL clean)
 *   collection_place  – ordered join between a collection and a place
 *   collection_follow – follow relationship (many users → many public collections)
 */

import {
  type CollectionDetail,
  type CollectionId,
  type CollectionPlace,
  type CollectionSummary,
  type CollectionType,
  type CollectionVisibility,
  type CreateCollectionBody,
  type PlaceId,
  type UpdateCollectionBody,
  type UserId,
} from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import {
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Schema ─────────────────────────────────────────────────────────────────

const placesSchema = pgSchema('places');

export const collectionTable = placesSchema.table('collection', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en'),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  coverUrl: text('cover_url'),
  emoji: text('emoji'),
  visibility: text('visibility').notNull().default('public'),
  type: text('type').notNull().default('custom'),
  city: text('city'),
  placeCount: integer('place_count').notNull().default(0),
  followerCount: integer('follower_count').notNull().default(0),
  isStaffPick: boolean('is_staff_pick').notNull().default(false),
  ownerName: text('owner_name'),
  ownerAvatarUrl: text('owner_avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collectionPlaceTable = placesSchema.table('collection_place', {
  collectionId: uuid('collection_id').notNull(),
  placeId: text('place_id').notNull(),
  note: text('note'),
  position: integer('position').notNull().default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  // Denormalised place fields (user-owned metadata layer — not OSM-derived)
  placeName: text('place_name').notNull().default(''),
  placeNameAr: text('place_name_ar'),
  placeCategory: text('place_category'),
  locationLng: text('location_lng'),
  locationLat: text('location_lat'),
  coverImageUrl: text('cover_image_url'),
  rating: text('rating'),
});

export const collectionFollowTable = placesSchema.table('collection_follow', {
  userId: uuid('user_id').notNull(),
  collectionId: uuid('collection_id').notNull(),
  followedAt: timestamp('followed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Service ────────────────────────────────────────────────────────────────

export class CollectionsService {
  constructor(private readonly db: Db) {}

  // ── Create ───────────────────────────────────────────────────────────────

  async createCollection(
    userId: UserId,
    data: CreateCollectionBody,
    ownerName?: string,
    ownerAvatarUrl?: string | null,
  ): Promise<CollectionSummary> {
    const [row] = await this.db
      .insert(collectionTable)
      .values({
        userId,
        nameAr: data.nameAr,
        nameEn: data.nameEn ?? null,
        descriptionAr: data.descriptionAr ?? null,
        descriptionEn: data.descriptionEn ?? null,
        emoji: data.emoji ?? null,
        visibility: data.visibility ?? 'public',
        type: data.type ?? 'custom',
        city: data.city ?? null,
        ownerName: ownerName ?? null,
        ownerAvatarUrl: ownerAvatarUrl ?? null,
      })
      .returning();

    if (!row) throw new Error('collection insert failed');
    return this.toSummary(row, userId);
  }

  // ── Update ───────────────────────────────────────────────────────────────

  async updateCollection(
    userId: UserId,
    collectionId: CollectionId,
    data: UpdateCollectionBody,
  ): Promise<CollectionSummary> {
    const existing = await this.requireOwned(collectionId, userId);

    const updates: Partial<typeof collectionTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.nameAr !== undefined) updates.nameAr = data.nameAr;
    if (data.nameEn !== undefined) updates.nameEn = data.nameEn;
    if (data.descriptionAr !== undefined) updates.descriptionAr = data.descriptionAr;
    if (data.descriptionEn !== undefined) updates.descriptionEn = data.descriptionEn;
    if (data.emoji !== undefined) updates.emoji = data.emoji;
    if (data.coverUrl !== undefined) updates.coverUrl = data.coverUrl;
    if (data.visibility !== undefined) updates.visibility = data.visibility;
    if (data.type !== undefined) updates.type = data.type;
    if (data.city !== undefined) updates.city = data.city;

    const [updated] = await this.db
      .update(collectionTable)
      .set(updates)
      .where(eq(collectionTable.id, collectionId))
      .returning();

    if (!updated) throw new Error('collection update failed');
    return this.toSummary({ ...existing, ...updated }, userId);
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async deleteCollection(userId: UserId, collectionId: CollectionId): Promise<void> {
    await this.requireOwned(collectionId, userId);

    await this.db
      .delete(collectionPlaceTable)
      .where(eq(collectionPlaceTable.collectionId, collectionId));

    await this.db
      .delete(collectionFollowTable)
      .where(eq(collectionFollowTable.collectionId, collectionId));

    await this.db
      .delete(collectionTable)
      .where(eq(collectionTable.id, collectionId));
  }

  // ── Add place ─────────────────────────────────────────────────────────────

  async addPlaceToCollection(
    userId: UserId,
    collectionId: CollectionId,
    placeId: PlaceId,
    note?: string,
    placeMetadata?: {
      placeName?: string;
      placeNameAr?: string;
      placeCategory?: string;
      location?: [number, number];
      coverImageUrl?: string;
      rating?: number;
    },
  ): Promise<CollectionPlace> {
    await this.requireOwned(collectionId, userId);

    // Check for duplicate
    const [existing] = await this.db
      .select()
      .from(collectionPlaceTable)
      .where(
        and(
          eq(collectionPlaceTable.collectionId, collectionId),
          eq(collectionPlaceTable.placeId, placeId),
        ),
      )
      .limit(1);

    if (existing) {
      const err = Object.assign(new Error('place already in collection'), { code: 'CONFLICT' });
      throw err;
    }

    // Determine next position
    const [posResult] = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${collectionPlaceTable.position}), -1)` })
      .from(collectionPlaceTable)
      .where(eq(collectionPlaceTable.collectionId, collectionId));

    const nextPosition = (posResult?.maxPos ?? -1) + 1;

    const [row] = await this.db
      .insert(collectionPlaceTable)
      .values({
        collectionId,
        placeId,
        note: note ?? null,
        position: nextPosition,
        placeName: placeMetadata?.placeName ?? '',
        placeNameAr: placeMetadata?.placeNameAr ?? null,
        placeCategory: placeMetadata?.placeCategory ?? null,
        locationLng: placeMetadata?.location ? String(placeMetadata.location[0]) : null,
        locationLat: placeMetadata?.location ? String(placeMetadata.location[1]) : null,
        coverImageUrl: placeMetadata?.coverImageUrl ?? null,
        rating: placeMetadata?.rating != null ? String(placeMetadata.rating) : null,
      })
      .returning();

    if (!row) throw new Error('collection_place insert failed');

    // Increment place_count
    await this.db
      .update(collectionTable)
      .set({
        placeCount: sql`${collectionTable.placeCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(collectionTable.id, collectionId));

    return this.toCollectionPlace(row);
  }

  // ── Remove place ──────────────────────────────────────────────────────────

  async removePlaceFromCollection(
    userId: UserId,
    collectionId: CollectionId,
    placeId: PlaceId,
  ): Promise<void> {
    await this.requireOwned(collectionId, userId);

    const deleted = await this.db
      .delete(collectionPlaceTable)
      .where(
        and(
          eq(collectionPlaceTable.collectionId, collectionId),
          eq(collectionPlaceTable.placeId, placeId),
        ),
      )
      .returning({ id: collectionPlaceTable.collectionId });

    if (deleted.length > 0) {
      await this.db
        .update(collectionTable)
        .set({
          placeCount: sql`greatest(${collectionTable.placeCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(collectionTable.id, collectionId));
    }
  }

  // ── Reorder ───────────────────────────────────────────────────────────────

  async reorderCollectionPlaces(
    userId: UserId,
    collectionId: CollectionId,
    placeIds: PlaceId[],
  ): Promise<void> {
    await this.requireOwned(collectionId, userId);

    await this.db.transaction(async (tx) => {
      for (let i = 0; i < placeIds.length; i++) {
        await tx
          .update(collectionPlaceTable)
          .set({ position: i })
          .where(
            and(
              eq(collectionPlaceTable.collectionId, collectionId),
              eq(collectionPlaceTable.placeId, placeIds[i]!),
            ),
          );
      }
    });
  }

  // ── My collections ────────────────────────────────────────────────────────

  async getMyCollections(userId: UserId): Promise<CollectionSummary[]> {
    const rows = await this.db
      .select()
      .from(collectionTable)
      .where(eq(collectionTable.userId, userId))
      .orderBy(desc(collectionTable.updatedAt));

    return rows.map((r) => this.toSummary(r, userId));
  }

  // ── Collection detail ─────────────────────────────────────────────────────

  async getCollectionDetail(
    collectionId: CollectionId,
    viewerId: UserId | null,
  ): Promise<CollectionDetail> {
    const [row] = await this.db
      .select()
      .from(collectionTable)
      .where(eq(collectionTable.id, collectionId))
      .limit(1);

    if (!row) {
      const err = Object.assign(new Error('collection not found'), { code: 'NOT_FOUND' });
      throw err;
    }

    // Visibility check
    const isOwner = viewerId != null && row.userId === viewerId;
    if (!isOwner) {
      if (row.visibility === 'private') {
        const err = Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
        throw err;
      }
      if (row.visibility === 'followers') {
        // Check follow relationship
        if (viewerId == null) {
          const err = Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
          throw err;
        }
        const [follow] = await this.db
          .select()
          .from(collectionFollowTable)
          .where(
            and(
              eq(collectionFollowTable.collectionId, collectionId),
              eq(collectionFollowTable.userId, viewerId),
            ),
          )
          .limit(1);
        if (!follow) {
          const err = Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
          throw err;
        }
      }
    }

    const placeRows = await this.db
      .select()
      .from(collectionPlaceTable)
      .where(eq(collectionPlaceTable.collectionId, collectionId))
      .orderBy(asc(collectionPlaceTable.position));

    const isFollowing = viewerId != null && !isOwner
      ? await this.isFollowing(viewerId, collectionId)
      : false;

    const summary = this.toSummary(row, viewerId ?? ('' as UserId), isFollowing);

    return {
      ...summary,
      places: placeRows.map((p) => this.toCollectionPlace(p)),
    };
  }

  // ── Follow ────────────────────────────────────────────────────────────────

  async followCollection(userId: UserId, collectionId: CollectionId): Promise<void> {
    const [collection] = await this.db
      .select()
      .from(collectionTable)
      .where(eq(collectionTable.id, collectionId))
      .limit(1);

    if (!collection) {
      const err = Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
      throw err;
    }
    if (collection.visibility === 'private' && collection.userId !== userId) {
      const err = Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      throw err;
    }

    try {
      await this.db.insert(collectionFollowTable).values({ userId, collectionId });
      await this.db
        .update(collectionTable)
        .set({ followerCount: sql`${collectionTable.followerCount} + 1` })
        .where(eq(collectionTable.id, collectionId));
    } catch {
      const err = Object.assign(new Error('already following'), { code: 'CONFLICT' });
      throw err;
    }
  }

  // ── Unfollow ──────────────────────────────────────────────────────────────

  async unfollowCollection(userId: UserId, collectionId: CollectionId): Promise<void> {
    const deleted = await this.db
      .delete(collectionFollowTable)
      .where(
        and(
          eq(collectionFollowTable.userId, userId),
          eq(collectionFollowTable.collectionId, collectionId),
        ),
      )
      .returning({ cid: collectionFollowTable.collectionId });

    if (deleted.length > 0) {
      await this.db
        .update(collectionTable)
        .set({ followerCount: sql`greatest(${collectionTable.followerCount} - 1, 0)` })
        .where(eq(collectionTable.id, collectionId));
    }
  }

  // ── Followed collections ──────────────────────────────────────────────────

  async getFollowedCollections(userId: UserId): Promise<CollectionSummary[]> {
    const follows = await this.db
      .select({ collectionId: collectionFollowTable.collectionId })
      .from(collectionFollowTable)
      .where(eq(collectionFollowTable.userId, userId))
      .orderBy(desc(collectionFollowTable.followedAt));

    if (follows.length === 0) return [];

    const ids = follows.map((f) => f.collectionId);
    const rows = await this.db
      .select()
      .from(collectionTable)
      .where(inArray(collectionTable.id, ids));

    return rows.map((r) => this.toSummary(r, userId, true));
  }

  // ── Featured ──────────────────────────────────────────────────────────────

  async getFeaturedCollections(
    city?: string,
    cursor?: string,
  ): Promise<{ collections: CollectionSummary[]; nextCursor: string | null }> {
    const limit = 20;

    const conditions = [
      eq(collectionTable.isStaffPick, true),
      eq(collectionTable.visibility, 'public'),
    ];
    if (city) conditions.push(eq(collectionTable.city, city));
    if (cursor) conditions.push(lt(collectionTable.updatedAt, new Date(cursor)));

    const rows = await this.db
      .select()
      .from(collectionTable)
      .where(and(...conditions))
      .orderBy(desc(collectionTable.followerCount), desc(collectionTable.updatedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore
      ? items[items.length - 1]?.updatedAt?.toISOString() ?? null
      : null;

    return {
      collections: items.map((r) => this.toSummary(r, null as unknown as UserId)),
      nextCursor,
    };
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async searchCollections(
    query: string,
    city?: string,
    cursor?: string,
  ): Promise<{ collections: CollectionSummary[]; nextCursor: string | null }> {
    const limit = 20;
    const term = `%${query}%`;

    const conditions = [
      eq(collectionTable.visibility, 'public'),
      or(
        ilike(collectionTable.nameAr, term),
        ilike(collectionTable.nameEn, term),
        ilike(collectionTable.descriptionAr, term),
      ),
    ];
    if (city) conditions.push(eq(collectionTable.city, city));
    if (cursor) conditions.push(lt(collectionTable.updatedAt, new Date(cursor)));

    const rows = await this.db
      .select()
      .from(collectionTable)
      .where(and(...conditions))
      .orderBy(desc(collectionTable.followerCount), desc(collectionTable.updatedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore
      ? items[items.length - 1]?.updatedAt?.toISOString() ?? null
      : null;

    return {
      collections: items.map((r) => this.toSummary(r, null as unknown as UserId)),
      nextCursor,
    };
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────

  async duplicateCollection(
    userId: UserId,
    collectionId: CollectionId,
    ownerName?: string,
    ownerAvatarUrl?: string | null,
  ): Promise<CollectionSummary> {
    const original = await this.getCollectionDetail(collectionId, userId);

    const [newRow] = await this.db
      .insert(collectionTable)
      .values({
        userId,
        nameAr: original.nameAr,
        nameEn: original.nameEn ?? null,
        descriptionAr: original.descriptionAr ?? null,
        descriptionEn: original.descriptionEn ?? null,
        emoji: original.emoji ?? null,
        coverUrl: original.coverUrl ?? null,
        visibility: 'private' as CollectionVisibility,
        type: original.type as CollectionType,
        city: original.city ?? null,
        ownerName: ownerName ?? null,
        ownerAvatarUrl: ownerAvatarUrl ?? null,
        placeCount: original.places.length,
      })
      .returning();

    if (!newRow) throw new Error('duplicate insert failed');

    if (original.places.length > 0) {
      await this.db.insert(collectionPlaceTable).values(
        original.places.map((p) => ({
          collectionId: newRow.id as CollectionId,
          placeId: p.placeId,
          note: p.note,
          position: p.position,
          placeName: p.placeName,
          placeNameAr: p.placeNameAr ?? null,
          placeCategory: p.placeCategory ?? null,
          locationLng: p.location ? String(p.location[0]) : null,
          locationLat: p.location ? String(p.location[1]) : null,
          coverImageUrl: p.coverImageUrl ?? null,
          rating: p.rating != null ? String(p.rating) : null,
        })),
      );
    }

    return this.toSummary(newRow, userId);
  }

  // ── Collections containing a place ───────────────────────────────────────

  async getPlaceCollections(userId: UserId, placeId: PlaceId): Promise<CollectionId[]> {
    const rows = await this.db
      .select({ collectionId: collectionPlaceTable.collectionId })
      .from(collectionPlaceTable)
      .innerJoin(
        collectionTable,
        and(
          eq(collectionTable.id, collectionPlaceTable.collectionId),
          eq(collectionTable.userId, userId),
        ),
      )
      .where(eq(collectionPlaceTable.placeId, placeId));

    return rows.map((r) => r.collectionId as CollectionId);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getCollectionStats(
    collectionId: CollectionId,
  ): Promise<{ placeCount: number; followerCount: number }> {
    const [row] = await this.db
      .select({
        placeCount: collectionTable.placeCount,
        followerCount: collectionTable.followerCount,
      })
      .from(collectionTable)
      .where(eq(collectionTable.id, collectionId))
      .limit(1);

    return { placeCount: row?.placeCount ?? 0, followerCount: row?.followerCount ?? 0 };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireOwned(
    collectionId: CollectionId,
    userId: UserId,
  ): Promise<typeof collectionTable.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(collectionTable)
      .where(eq(collectionTable.id, collectionId))
      .limit(1);

    if (!row) {
      const err = Object.assign(new Error('collection not found'), { code: 'NOT_FOUND' });
      throw err;
    }
    if (row.userId !== userId) {
      const err = Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      throw err;
    }
    return row;
  }

  private async isFollowing(userId: UserId, collectionId: CollectionId): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(collectionFollowTable)
      .where(
        and(
          eq(collectionFollowTable.userId, userId),
          eq(collectionFollowTable.collectionId, collectionId),
        ),
      )
      .limit(1);
    return row != null;
  }

  private toSummary(
    row: typeof collectionTable.$inferSelect,
    viewerId: UserId,
    isFollowing = false,
  ): CollectionSummary {
    return {
      id: row.id as CollectionId,
      userId: row.userId as UserId,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? null,
      descriptionAr: row.descriptionAr ?? null,
      descriptionEn: row.descriptionEn ?? null,
      coverUrl: row.coverUrl ?? null,
      emoji: row.emoji ?? null,
      visibility: row.visibility as CollectionVisibility,
      type: row.type as CollectionType,
      city: row.city ? (row.city as import('@iraq-maps/contracts').CityId) : null,
      placeCount: row.placeCount,
      followerCount: row.followerCount,
      isOwner: row.userId === viewerId,
      isFollowing,
      isStaffPick: row.isStaffPick,
      ownerName: row.ownerName ?? null,
      ownerAvatarUrl: row.ownerAvatarUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCollectionPlace(
    row: typeof collectionPlaceTable.$inferSelect,
  ): CollectionPlace {
    let location: [number, number] | null = null;
    if (row.locationLng != null && row.locationLat != null) {
      const lng = parseFloat(row.locationLng);
      const lat = parseFloat(row.locationLat);
      if (!isNaN(lng) && !isNaN(lat)) location = [lng, lat];
    }

    return {
      collectionId: row.collectionId as CollectionId,
      placeId: row.placeId as PlaceId,
      note: row.note ?? null,
      position: row.position,
      addedAt: row.addedAt.toISOString(),
      placeName: row.placeName,
      placeNameAr: row.placeNameAr ?? null,
      placeCategory: row.placeCategory ?? null,
      location,
      coverImageUrl: row.coverImageUrl ?? null,
      rating: row.rating != null ? parseFloat(row.rating) : null,
    };
  }
}
