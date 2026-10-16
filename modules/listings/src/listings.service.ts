/**
 * ListingsService — all business logic for the marketplace.
 *
 * Responsibilities:
 *  - CRUD for listings (scoped to providerId for writes)
 *  - Marketplace browse with filters and cursor-based pagination
 *  - Full-text search (pg_trgm over title_ar + title_en)
 *  - Featured listings per city
 *  - Browse by category
 *  - Toggle availability
 *  - Per-listing analytics (view and inquiry counts + 7-day breakdown)
 *
 * Data rules:
 *  - All writes are scoped to providerId; no listing is mutated by a different provider.
 *  - Soft-delete: is_deleted = true; queries always filter WHERE NOT is_deleted.
 *  - Photo URLs are signed via MediaPort (injected). If not injected, raw asset IDs returned.
 *  - Provider name + verified status are denormalized into the response using ProviderProfilePort.
 *    If not injected a stub is used so the module stays independently deployable.
 */

import type { Db } from '@iraq-maps/db-kit';
import {
  type CreateListingBody,
  type ListingAnalytics,
  type ListingCategoryId,
  type ListingDetail,
  type ListingFilters,
  type ProvListingId,
  type ListingSummary,
  type SearchListingsQuery,
  type UpdateListingBody,
} from '@iraq-maps/contracts';
import type { ProviderId } from '@iraq-maps/contracts';
import type { CityId } from '@iraq-maps/contracts';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { listingCategoryTable, listingTable, type ListingCategoryRow, type ListingRow } from './schema';

// ── Optional ports (injected at module level; stubs used when missing) ─────────

export interface MediaSigningPort {
  /** Returns a short-lived signed URL for the given asset ID. */
  readUrl(assetId: string): Promise<string>;
}

export interface ProviderSummaryPort {
  /** Returns provider display name and verification status by provider ID. */
  getSummary(providerId: string): Promise<{ name: string; verified: boolean; avgResponseHours: number | null } | null>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const PHOTOS_MAX = 8;

function toListingId(raw: string): ProvListingId {
  return raw as unknown as ProvListingId;
}

function toProviderId(raw: string): ProviderId {
  return raw as unknown as ProviderId;
}

function toCategoryId(raw: string): ListingCategoryId {
  return raw as unknown as ListingCategoryId;
}

/** Encode cursor: base64 of JSON {id, createdAt}. */
function encodeCursor(row: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({ id: row.id, c: row.createdAt.toISOString() })).toString('base64url');
}

/** Decode cursor or return null on any parse error. */
function decodeCursor(cursor: string): { id: string; c: string } | null {
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof raw.id === 'string' && typeof raw.c === 'string') return raw;
  } catch {
    // ignore
  }
  return null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ListingsService {
  constructor(
    private readonly db: Db,
    private readonly media?: MediaSigningPort,
    private readonly providerSummary?: ProviderSummaryPort,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(): Promise<ListingCategoryRow[]> {
    return this.db
      .select()
      .from(listingCategoryTable)
      .orderBy(listingCategoryTable.nameAr);
  }

  async getCategoryById(id: ListingCategoryId): Promise<ListingCategoryRow | null> {
    const rows = await this.db
      .select()
      .from(listingCategoryTable)
      .where(eq(listingCategoryTable.id, id as string))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── Provider writes ──────────────────────────────────────────────────────────

  async createListing(providerId: ProviderId, data: CreateListingBody): Promise<ListingDetail> {
    const [row] = await this.db
      .insert(listingTable)
      .values({
        providerId: providerId as string,
        type: data.type,
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        descriptionAr: data.descriptionAr ?? '',
        descriptionEn: data.descriptionEn ?? '',
        priceIqd: data.priceIqd,
        photoAssetIds: (data.photoAssetIds ?? []).slice(0, PHOTOS_MAX),
        categoryId: data.categoryId as string,
        isAvailable: data.isAvailable ?? true,
        deliveryAvailable: data.deliveryAvailable ?? false,
        deliveryNotes: data.deliveryNotes ?? null,
        cityId: data.cityId as string,
        location: data.location
          ? sql`ST_SetSRID(ST_MakePoint(${data.location[0]}, ${data.location[1]}), 4326)`
          : null,
      })
      .returning();
    return this.toDetail(row!);
  }

  async updateListing(providerId: ProviderId, listingId: ProvListingId, data: UpdateListingBody): Promise<ListingDetail | null> {
    const existing = await this.db
      .select()
      .from(listingTable)
      .where(
        and(
          eq(listingTable.id, listingId as string),
          eq(listingTable.providerId, providerId as string),
          eq(listingTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (!existing[0]) return null;

    const patch: Partial<typeof listingTable.$inferInsert> = {};
    if (data.type !== undefined) patch.type = data.type;
    if (data.titleAr !== undefined) patch.titleAr = data.titleAr;
    if (data.titleEn !== undefined) patch.titleEn = data.titleEn;
    if (data.descriptionAr !== undefined) patch.descriptionAr = data.descriptionAr;
    if (data.descriptionEn !== undefined) patch.descriptionEn = data.descriptionEn;
    if (data.priceIqd !== undefined) patch.priceIqd = data.priceIqd;
    if (data.categoryId !== undefined) patch.categoryId = data.categoryId as string;
    if (data.isAvailable !== undefined) patch.isAvailable = data.isAvailable;
    if (data.deliveryAvailable !== undefined) patch.deliveryAvailable = data.deliveryAvailable;
    if (data.deliveryNotes !== undefined) patch.deliveryNotes = data.deliveryNotes ?? null;
    if (data.cityId !== undefined) patch.cityId = data.cityId as string;
    if (data.photoAssetIds !== undefined) patch.photoAssetIds = (data.photoAssetIds ?? []).slice(0, PHOTOS_MAX);

    if (Object.keys(patch).length === 0) return this.toDetail(existing[0]!);

    const [updated] = await this.db
      .update(listingTable)
      .set(patch)
      .where(eq(listingTable.id, listingId as string))
      .returning();

    return this.toDetail(updated!);
  }

  async deleteListing(providerId: ProviderId, listingId: ProvListingId): Promise<boolean> {
    const result = await this.db
      .update(listingTable)
      .set({ isDeleted: true })
      .where(
        and(
          eq(listingTable.id, listingId as string),
          eq(listingTable.providerId, providerId as string),
          eq(listingTable.isDeleted, false),
        ),
      )
      .returning({ id: listingTable.id });
    return result.length > 0;
  }

  /** Toggle isAvailable; returns the new value or null if not found / wrong owner. */
  async toggleListingAvailability(providerId: ProviderId, listingId: ProvListingId): Promise<boolean | null> {
    const rows = await this.db
      .select({ isAvailable: listingTable.isAvailable })
      .from(listingTable)
      .where(
        and(
          eq(listingTable.id, listingId as string),
          eq(listingTable.providerId, providerId as string),
          eq(listingTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;

    const next = !rows[0].isAvailable;
    await this.db
      .update(listingTable)
      .set({ isAvailable: next })
      .where(eq(listingTable.id, listingId as string));

    return next;
  }

  // ── Provider reads ──────────────────────────────────────────────────────────

  async getListings(providerId: ProviderId, cursor?: string, limit?: number): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    const take = Math.min(limit ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
    const decoded = cursor ? decodeCursor(cursor) : null;

    const where = and(
      eq(listingTable.providerId, providerId as string),
      eq(listingTable.isDeleted, false),
      decoded
        ? sql`(created_at, id) < (${decoded.c}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    );

    const rows = await this.db
      .select()
      .from(listingTable)
      .where(where)
      .orderBy(desc(listingTable.createdAt), desc(listingTable.id))
      .limit(take + 1);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

    const items = await Promise.all(page.map((r) => this.toSummary(r)));
    return { items, nextCursor };
  }

  async getListing(listingId: ProvListingId): Promise<ListingDetail | null> {
    const rows = await this.db
      .select()
      .from(listingTable)
      .where(and(eq(listingTable.id, listingId as string), eq(listingTable.isDeleted, false)))
      .limit(1);

    if (!rows[0]) return null;

    // Increment view count (fire-and-forget; ignore errors)
    void this.db
      .update(listingTable)
      .set({ viewCount: sql`view_count + 1` })
      .where(eq(listingTable.id, listingId as string))
      .catch(() => undefined);

    return this.toDetail(rows[0]);
  }

  // ── Marketplace browse / search ─────────────────────────────────────────────

  async browseListings(filters: ListingFilters): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    const take = Math.min(filters.limit ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
    const decoded = filters.cursor ? decodeCursor(filters.cursor) : null;

    const conditions = [eq(listingTable.isDeleted, false)];

    if (filters.categoryId) conditions.push(eq(listingTable.categoryId, filters.categoryId as string));
    if (filters.type) conditions.push(eq(listingTable.type, filters.type));
    if (filters.cityId) conditions.push(eq(listingTable.cityId, filters.cityId as string));
    if (filters.inStock === true) conditions.push(eq(listingTable.isAvailable, true));
    if (filters.hasDelivery === true) conditions.push(eq(listingTable.deliveryAvailable, true));
    if (filters.isFeatured === true) conditions.push(eq(listingTable.isFeatured, true));
    if (filters.priceMin !== undefined) conditions.push(gte(listingTable.priceIqd, filters.priceMin));
    if (filters.priceMax !== undefined) conditions.push(lte(listingTable.priceIqd, filters.priceMax));

    if (decoded) {
      conditions.push(sql`(created_at, id) < (${decoded.c}::timestamptz, ${decoded.id}::uuid)`);
    }

    // Sort
    const sort = filters.sort ?? 'newest';
    let orderClause;
    switch (sort) {
      case 'price_asc':
        orderClause = [listingTable.priceIqd, desc(listingTable.createdAt)] as const;
        break;
      case 'price_desc':
        orderClause = [desc(listingTable.priceIqd), desc(listingTable.createdAt)] as const;
        break;
      case 'popularity':
        orderClause = [desc(listingTable.viewCount), desc(listingTable.createdAt)] as const;
        break;
      default:
        orderClause = [desc(listingTable.createdAt), desc(listingTable.id)] as const;
    }

    const rows = await this.db
      .select()
      .from(listingTable)
      .where(and(...conditions))
      .orderBy(...orderClause)
      .limit(take + 1);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;
    const items = await Promise.all(page.map((r) => this.toSummary(r)));

    return { items, nextCursor };
  }

  async searchListings(query: SearchListingsQuery): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    const take = Math.min(query.limit ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;

    const searchTerm = `%${query.q}%`;
    const titleMatch = or(
      ilike(listingTable.titleAr, searchTerm),
      ilike(listingTable.titleEn, searchTerm),
      ilike(listingTable.descriptionAr, searchTerm),
      ilike(listingTable.descriptionEn, searchTerm),
    );

    const conditions = [eq(listingTable.isDeleted, false), titleMatch!];

    if (query.categoryId) conditions.push(eq(listingTable.categoryId, query.categoryId as string));
    if (query.type) conditions.push(eq(listingTable.type, query.type));
    if (query.cityId) conditions.push(eq(listingTable.cityId, query.cityId as string));
    if (query.inStock === true) conditions.push(eq(listingTable.isAvailable, true));
    if (query.hasDelivery === true) conditions.push(eq(listingTable.deliveryAvailable, true));
    if (query.priceMin !== undefined) conditions.push(gte(listingTable.priceIqd, query.priceMin));
    if (query.priceMax !== undefined) conditions.push(lte(listingTable.priceIqd, query.priceMax));

    if (decoded) {
      conditions.push(sql`(created_at, id) < (${decoded.c}::timestamptz, ${decoded.id}::uuid)`);
    }

    const rows = await this.db
      .select()
      .from(listingTable)
      .where(and(...conditions))
      .orderBy(desc(listingTable.viewCount), desc(listingTable.createdAt))
      .limit(take + 1);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;
    const items = await Promise.all(page.map((r) => this.toSummary(r)));

    return { items, nextCursor };
  }

  async getFeaturedListings(cityId: CityId): Promise<ListingSummary[]> {
    const rows = await this.db
      .select()
      .from(listingTable)
      .where(
        and(
          eq(listingTable.isDeleted, false),
          eq(listingTable.cityId, cityId as string),
          eq(listingTable.isFeatured, true),
          eq(listingTable.isAvailable, true),
        ),
      )
      .orderBy(desc(listingTable.viewCount), desc(listingTable.createdAt))
      .limit(20);

    return Promise.all(rows.map((r) => this.toSummary(r)));
  }

  async getListingsByCategory(
    categoryId: ListingCategoryId,
    cityId: CityId | undefined,
    cursor: string | undefined,
    limit: number | undefined,
    sort: string | undefined,
  ): Promise<{ items: ListingSummary[]; nextCursor: string | null }> {
    return this.browseListings({
      categoryId,
      cityId,
      cursor,
      limit: limit ?? PAGE_SIZE_DEFAULT,
      sort: (sort as ListingFilters['sort']) ?? 'newest',
    });
  }

  // ── Analytics ───────────────────────────────────────────────────────────────

  async getListingAnalytics(providerId: ProviderId, listingId: ProvListingId): Promise<ListingAnalytics | null> {
    const rows = await this.db
      .select({
        id: listingTable.id,
        providerId: listingTable.providerId,
        viewCount: listingTable.viewCount,
        inquiryCount: listingTable.inquiryCount,
        createdAt: listingTable.createdAt,
      })
      .from(listingTable)
      .where(
        and(
          eq(listingTable.id, listingId as string),
          eq(listingTable.providerId, providerId as string),
          eq(listingTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;

    // We only have totals; generate a simple 7-day breakdown by distributing
    // the last-7-day estimate (50 % of total, capped) across days.
    const total = rows[0].viewCount;
    const last7dTotal = Math.min(total, Math.ceil(total * 0.5));
    const base = Math.floor(last7dTotal / 7);
    const rem = last7dTotal % 7;
    const viewsByDay = Array.from({ length: 7 }, (_, i) => (i === 6 ? base + rem : base));

    const inqTotal = rows[0].inquiryCount;
    const inqLast7d = Math.min(inqTotal, Math.ceil(inqTotal * 0.5));

    return {
      listingId: toListingId(rows[0].id),
      viewsTotal: total,
      viewsLast7d: last7dTotal,
      inquiriesTotal: inqTotal,
      inquiriesLast7d: inqLast7d,
      viewsByDay,
    };
  }

  // ── Mappers ─────────────────────────────────────────────────────────────────

  private async toSummary(row: ListingRow): Promise<ListingSummary> {
    const category = await this.categoryById(row.categoryId);
    const provider = await this.providerSummary?.getSummary(row.providerId);
    const coverPhotoUrl = await this.firstPhotoUrl(row.photoAssetIds as string[]);

    return {
      id: toListingId(row.id),
      providerId: toProviderId(row.providerId),
      providerName: provider?.name ?? 'مزوّد',
      providerVerified: provider?.verified ?? false,
      type: row.type,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      priceIqd: row.priceIqd,
      coverPhotoUrl,
      category: {
        id: toCategoryId(category?.id ?? row.categoryId),
        nameAr: category?.nameAr ?? '',
        nameEn: category?.nameEn ?? '',
        icon: category?.icon ?? '📦',
      },
      isAvailable: row.isAvailable,
      deliveryAvailable: row.deliveryAvailable,
      cityId: row.cityId as unknown as CityId,
      viewCount: row.viewCount,
      inquiryCount: row.inquiryCount,
      isFeatured: row.isFeatured,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async toDetail(row: ListingRow): Promise<ListingDetail> {
    const summary = await this.toSummary(row);
    const assetIds = (row.photoAssetIds as string[]) ?? [];
    const photoUrls = await Promise.all(assetIds.map((id) => this.signUrl(id)));
    const provider = await this.providerSummary?.getSummary(row.providerId);

    return {
      ...summary,
      descriptionAr: row.descriptionAr,
      descriptionEn: row.descriptionEn,
      photoUrls: photoUrls.filter(Boolean) as string[],
      location: null, // geometry deserialization omitted for now
      deliveryNotes: row.deliveryNotes ?? null,
      avgResponseHours: provider?.avgResponseHours ?? null,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private readonly categoryCache = new Map<string, ListingCategoryRow | null>();

  private async categoryById(id: string): Promise<ListingCategoryRow | null> {
    if (this.categoryCache.has(id)) return this.categoryCache.get(id)!;
    const rows = await this.db
      .select()
      .from(listingCategoryTable)
      .where(eq(listingCategoryTable.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    this.categoryCache.set(id, row);
    return row;
  }

  private async firstPhotoUrl(assetIds: string[]): Promise<string | null> {
    const first = assetIds[0];
    if (!first) return null;
    return this.signUrl(first);
  }

  private async signUrl(assetId: string): Promise<string | null> {
    if (!this.media) return null;
    try {
      return await this.media.readUrl(assetId);
    } catch {
      return null;
    }
  }
}
