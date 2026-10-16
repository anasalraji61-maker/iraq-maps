/**
 * FakeListingsService — in-memory listings service fake for testing.
 * Covers create, browse, search, filter, availability toggle, delete, featured.
 */

type UserId = string;
type ListingId = string;

export type ListingCategory =
  | 'electronics'
  | 'furniture'
  | 'clothing'
  | 'vehicles'
  | 'real_estate'
  | 'services'
  | 'food'
  | 'beauty'
  | 'sports'
  | 'books'
  | 'other';

export type ListingCurrency = 'IQD' | 'USD' | 'EUR';

export interface Listing {
  id: ListingId;
  ownerId: UserId;
  title: string;
  description: string;
  price: number;
  currency: ListingCurrency;
  category: ListingCategory;
  cityId: string;
  available: boolean;
  featured: boolean;
  images: string[];
  tags: string[];
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export type CreateListingInput = {
  title: string;
  description?: string;
  price: number;
  currency?: ListingCurrency;
  category: ListingCategory;
  cityId: string;
  available?: boolean;
  featured?: boolean;
  images?: string[];
  tags?: string[];
};

export type UpdateListingInput = Partial<
  Pick<Listing, 'title' | 'description' | 'price' | 'available' | 'featured' | 'images' | 'tags'>
> & { currency?: ListingCurrency };

export type ListingFilter = {
  q?: string;
  category?: ListingCategory;
  cityId?: string;
  minPrice?: number;
  maxPrice?: number;
  available?: boolean;
  ownerId?: UserId;
  featured?: boolean;
};

const VALID_CATEGORIES: ListingCategory[] = [
  'electronics', 'furniture', 'clothing', 'vehicles', 'real_estate',
  'services', 'food', 'beauty', 'sports', 'books', 'other',
];

export class FakeListingsService {
  private readonly listings = new Map<ListingId, Listing>();
  private seq = 0;

  // ─── Create ───────────────────────────────────────────────────────────────

  createListing(ownerId: UserId, input: CreateListingInput): Listing {
    if (!input.title || input.title.trim().length === 0) {
      throw Object.assign(new Error('Title is required'), { code: 'VALIDATION_ERROR' });
    }
    if (input.title.length > 200) {
      throw Object.assign(new Error('Title too long (max 200)'), { code: 'VALIDATION_ERROR' });
    }
    if (input.price < 0) {
      throw Object.assign(new Error('Price cannot be negative'), { code: 'VALIDATION_ERROR' });
    }
    if (!VALID_CATEGORIES.includes(input.category)) {
      throw Object.assign(new Error(`Invalid category: ${input.category}`), {
        code: 'VALIDATION_ERROR',
      });
    }
    if (!input.cityId || input.cityId.trim().length === 0) {
      throw Object.assign(new Error('cityId is required'), { code: 'VALIDATION_ERROR' });
    }

    const id: ListingId = `listing-${++this.seq}`;
    const now = new Date();
    const listing: Listing = {
      id,
      ownerId,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      price: input.price,
      currency: (input.currency ?? 'IQD') as ListingCurrency,
      category: input.category,
      cityId: input.cityId,
      available: input.available ?? true,
      featured: input.featured ?? false,
      images: input.images ?? [],
      tags: input.tags ?? [],
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.listings.set(id, listing);
    return listing;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  getListing(id: ListingId): Listing | null {
    const listing = this.listings.get(id);
    if (!listing || listing.deletedAt) return null;
    return listing;
  }

  requireListing(id: ListingId): Listing {
    const listing = this.getListing(id);
    if (!listing) throw Object.assign(new Error('Listing not found'), { code: 'NOT_FOUND' });
    return listing;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  updateListing(id: ListingId, actorId: UserId, input: UpdateListingInput): Listing {
    const listing = this.requireListing(id);
    if (listing.ownerId !== actorId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    if (input.title !== undefined) {
      if (input.title.length > 200) {
        throw Object.assign(new Error('Title too long'), { code: 'VALIDATION_ERROR' });
      }
      if (input.title.trim().length === 0) {
        throw Object.assign(new Error('Title cannot be empty'), { code: 'VALIDATION_ERROR' });
      }
    }

    if (input.price !== undefined && input.price < 0) {
      throw Object.assign(new Error('Price cannot be negative'), { code: 'VALIDATION_ERROR' });
    }

    const updated: Listing = {
      ...listing,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.available !== undefined ? { available: input.available } : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      updatedAt: new Date(),
    };
    this.listings.set(id, updated);
    return updated;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  deleteListing(id: ListingId, actorId: UserId): void {
    const listing = this.requireListing(id);
    if (listing.ownerId !== actorId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }
    this.listings.set(id, { ...listing, deletedAt: new Date() });
  }

  // ─── Browse ───────────────────────────────────────────────────────────────

  browse(
    filter: ListingFilter = {},
    opts: { limit?: number; offset?: number; sortBy?: 'price_asc' | 'price_desc' | 'newest' } = {},
  ): { items: Listing[]; total: number; hasMore: boolean } {
    const { limit = 20, offset = 0, sortBy = 'newest' } = opts;

    let results = [...this.listings.values()].filter((l) => !l.deletedAt);

    // Validate category
    if (filter.category !== undefined && !VALID_CATEGORIES.includes(filter.category)) {
      throw Object.assign(new Error(`Invalid category: ${filter.category}`), {
        code: 'VALIDATION_ERROR',
      });
    }

    // Full-text search
    if (filter.q !== undefined && filter.q.length >= 2) {
      const q = filter.q.toLowerCase().trim();
      results = results.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filter.category !== undefined) results = results.filter((l) => l.category === filter.category);
    if (filter.cityId !== undefined) results = results.filter((l) => l.cityId === filter.cityId);
    if (filter.minPrice !== undefined) results = results.filter((l) => l.price >= filter.minPrice!);
    if (filter.maxPrice !== undefined) results = results.filter((l) => l.price <= filter.maxPrice!);
    if (filter.available !== undefined) results = results.filter((l) => l.available === filter.available);
    if (filter.ownerId !== undefined) results = results.filter((l) => l.ownerId === filter.ownerId);
    if (filter.featured !== undefined) results = results.filter((l) => l.featured === filter.featured);

    // Sort
    if (sortBy === 'price_asc') results.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') results.sort((a, b) => b.price - a.price);
    else results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = results.length;
    const items = results.slice(offset, offset + limit);
    return { items, total, hasMore: offset + items.length < total };
  }

  // ─── Featured ─────────────────────────────────────────────────────────────

  getFeatured(
    opts: { cityId?: string; category?: ListingCategory; limit?: number } = {},
  ): Listing[] {
    const { cityId, category, limit = 10 } = opts;

    return [...this.listings.values()]
      .filter((l) => !l.deletedAt && l.featured && l.available)
      .filter((l) => (cityId ? l.cityId === cityId : true))
      .filter((l) => (category ? l.category === category : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ─── View count ───────────────────────────────────────────────────────────

  incrementViewCount(id: ListingId): void {
    const listing = this.getListing(id);
    if (!listing) return;
    this.listings.set(id, { ...listing, viewCount: listing.viewCount + 1 });
  }

  // ─── Owner listings ────────────────────────────────────────────────────────

  getOwnerListings(
    ownerId: UserId,
    opts: { includeDeleted?: boolean; limit?: number } = {},
  ): Listing[] {
    const { includeDeleted = false, limit = 50 } = opts;
    return [...this.listings.values()]
      .filter((l) => l.ownerId === ownerId)
      .filter((l) => (includeDeleted ? true : !l.deletedAt))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ─── Search suggestions ────────────────────────────────────────────────────

  suggest(q: string, opts: { limit?: number } = {}): string[] {
    const { limit = 5 } = opts;
    if (q.length < 2) return [];

    const lower = q.toLowerCase();
    const titles = [...this.listings.values()]
      .filter((l) => !l.deletedAt && l.title.toLowerCase().startsWith(lower))
      .map((l) => l.title);

    return [...new Set(titles)].slice(0, limit);
  }

  // ─── Statistics ────────────────────────────────────────────────────────────

  getStats(): {
    total: number;
    available: number;
    featured: number;
    deleted: number;
    byCategory: Record<string, number>;
    byCity: Record<string, number>;
  } {
    const all = [...this.listings.values()];
    const byCategory: Record<string, number> = {};
    const byCity: Record<string, number> = {};

    for (const l of all) {
      if (!l.deletedAt) {
        byCategory[l.category] = (byCategory[l.category] ?? 0) + 1;
        byCity[l.cityId] = (byCity[l.cityId] ?? 0) + 1;
      }
    }

    return {
      total: all.filter((l) => !l.deletedAt).length,
      available: all.filter((l) => !l.deletedAt && l.available).length,
      featured: all.filter((l) => !l.deletedAt && l.featured).length,
      deleted: all.filter((l) => !!l.deletedAt).length,
      byCategory,
      byCity,
    };
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  reset(): void {
    this.listings.clear();
    this.seq = 0;
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  get count(): number {
    return [...this.listings.values()].filter((l) => !l.deletedAt).length;
  }

  get all(): Listing[] {
    return [...this.listings.values()];
  }
}
