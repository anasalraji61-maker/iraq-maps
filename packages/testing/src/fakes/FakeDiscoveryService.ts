/**
 * FakeDiscoveryService — in-memory discovery / personalized feed service fake.
 *
 * Covers:
 *  - getPersonalizedFeed: returns places scored by user history
 *  - trackVisit: records place visit for a user
 *  - trackSave: records place save for a user
 *  - getRecentlyOpened: last N places a user viewed
 *  - getHiddenGems: high rating + low visit count
 *  - getTrending: most saved this week
 *  - getSeasonalPlaces: Ramadan / Eid / summer / winter
 *  - getContextAware: morning / afternoon / evening / night
 *  - getRecommendations: combined signal feed
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaceCategory =
  | 'restaurant'
  | 'cafe'
  | 'mosque'
  | 'hotel'
  | 'hospital'
  | 'pharmacy'
  | 'mall'
  | 'park'
  | 'bakery'
  | 'grocery'
  | 'bank'
  | 'fuel_station'
  | 'entertainment'
  | 'clothing'
  | 'gifts'
  | 'pool'
  | 'ice_cream'
  | 'lounge'
  | string;

export type Season = 'ramadan' | 'eid' | 'summer' | 'winter' | 'regular';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface DiscoveryPlace {
  id: string;
  name: string;
  category: PlaceCategory | null;
  rating: number | null;
  reviewCount: number;
  saveCount: number;
  visitCount: number;
  city: string;
  lat: number;
  lng: number;
  openNow: boolean | null;
  tags: string[];
}

export interface UserVisit {
  placeId: string;
  visitedAt: Date;
}

export interface UserSave {
  placeId: string;
  savedAt: Date;
}

export interface FeedItem {
  place: DiscoveryPlace;
  score: number;
  reason: string;
  section: 'personalized' | 'trending' | 'hidden_gem' | 'seasonal' | 'context';
}

export class FakeDiscoveryServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NO_PLACES',
  ) {
    super(message);
    this.name = 'FakeDiscoveryServiceError';
  }
}

// ─── Seasonal category map ────────────────────────────────────────────────────

const SEASONAL_CATEGORIES: Record<Season, PlaceCategory[]> = {
  ramadan: ['mosque', 'restaurant', 'bakery', 'cafe'],
  eid: ['clothing', 'gifts', 'restaurant', 'entertainment', 'mall'],
  summer: ['park', 'pool', 'ice_cream', 'cafe'],
  winter: ['cafe', 'restaurant', 'entertainment', 'lounge'],
  regular: [],
};

// ─── Context category map ─────────────────────────────────────────────────────

const CONTEXT_CATEGORIES: Record<TimeOfDay, PlaceCategory[]> = {
  morning: ['bakery', 'cafe'],
  afternoon: ['restaurant', 'cafe', 'mall'],
  evening: ['restaurant', 'park', 'entertainment'],
  night: ['restaurant', 'cafe', 'lounge'],
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class FakeDiscoveryService {
  private readonly places = new Map<string, DiscoveryPlace>();
  private readonly visits = new Map<string, UserVisit[]>();
  private readonly saves = new Map<string, UserSave[]>();

  /** Tracking calls for test assertions. */
  readonly visitCalls: Array<{ userId: string; placeId: string }> = [];
  readonly saveCalls: Array<{ userId: string; placeId: string }> = [];

  // ── seed ─────────────────────────────────────────────────────────────────────

  seedPlace(place: DiscoveryPlace): void {
    this.places.set(place.id, { ...place });
  }

  seedPlaces(places: DiscoveryPlace[]): void {
    for (const p of places) this.seedPlace(p);
  }

  // ── trackVisit ────────────────────────────────────────────────────────────────

  async trackVisit(userId: string, placeId: string): Promise<void> {
    this.visitCalls.push({ userId, placeId });
    const userVisits = this.visits.get(userId) ?? [];
    // Move to front if already visited
    const filtered = userVisits.filter((v) => v.placeId !== placeId);
    filtered.unshift({ placeId, visitedAt: new Date() });
    this.visits.set(userId, filtered.slice(0, 100));
  }

  // ── trackSave ─────────────────────────────────────────────────────────────────

  async trackSave(userId: string, placeId: string): Promise<void> {
    this.saveCalls.push({ userId, placeId });
    const userSaves = this.saves.get(userId) ?? [];
    if (userSaves.some((s) => s.placeId === placeId)) return;
    userSaves.unshift({ placeId, savedAt: new Date() });
    this.saves.set(userId, userSaves.slice(0, 500));
  }

  // ── getRecentlyOpened ─────────────────────────────────────────────────────────

  async getRecentlyOpened(userId: string, limit = 10): Promise<DiscoveryPlace[]> {
    const userVisits = this.visits.get(userId) ?? [];
    return userVisits
      .slice(0, limit)
      .map((v) => this.places.get(v.placeId))
      .filter((p): p is DiscoveryPlace => p !== undefined);
  }

  // ── getHiddenGems ─────────────────────────────────────────────────────────────

  async getHiddenGems(
    city: string,
    opts: { ratingThreshold?: number; maxVisits?: number; limit?: number } = {},
  ): Promise<DiscoveryPlace[]> {
    const { ratingThreshold = 4.2, maxVisits = 100, limit = 10 } = opts;
    return [...this.places.values()]
      .filter((p) => {
        if (p.city !== city) return false;
        if (p.rating === null || p.rating < ratingThreshold) return false;
        if (p.visitCount >= maxVisits) return false;
        if (p.reviewCount < 3) return false;
        return true;
      })
      .slice(0, limit);
  }

  // ── getTrending ───────────────────────────────────────────────────────────────

  async getTrending(
    city: string,
    opts: { minSaves?: number; limit?: number } = {},
  ): Promise<DiscoveryPlace[]> {
    const { minSaves = 20, limit = 10 } = opts;
    return [...this.places.values()]
      .filter((p) => p.city === city && p.saveCount >= minSaves)
      .sort((a, b) => b.saveCount - a.saveCount)
      .slice(0, limit);
  }

  // ── getSeasonalPlaces ─────────────────────────────────────────────────────────

  async getSeasonalPlaces(
    city: string,
    season: Season,
    limit = 10,
  ): Promise<DiscoveryPlace[]> {
    const categories = SEASONAL_CATEGORIES[season];
    return [...this.places.values()]
      .filter((p) => {
        if (p.city !== city) return false;
        if (categories.length === 0) return true;
        return p.category !== null && (categories as string[]).includes(p.category);
      })
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit);
  }

  // ── getContextAwarePlaces ─────────────────────────────────────────────────────

  async getContextAwarePlaces(
    city: string,
    hour: number,
    limit = 10,
  ): Promise<DiscoveryPlace[]> {
    const timeOfDay = this.getTimeOfDay(hour);
    const categories = CONTEXT_CATEGORIES[timeOfDay];
    return [...this.places.values()]
      .filter(
        (p) =>
          p.city === city &&
          p.category !== null &&
          (categories as string[]).includes(p.category),
      )
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit);
  }

  private getTimeOfDay(hour: number): TimeOfDay {
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  // ── getPersonalizedFeed ───────────────────────────────────────────────────────

  async getPersonalizedFeed(
    userId: string,
    city: string,
    opts: { season?: Season; hour?: number; limit?: number } = {},
  ): Promise<FeedItem[]> {
    const { season = 'regular', hour, limit = 20 } = opts;
    const userVisits = this.visits.get(userId) ?? [];
    const userSaves = this.saves.get(userId) ?? [];

    // Build category affinity
    const visitedCategories: Record<string, number> = {};
    const savedCategories: Record<string, number> = {};

    for (const v of userVisits) {
      const place = this.places.get(v.placeId);
      if (place?.category) {
        visitedCategories[place.category] = (visitedCategories[place.category] ?? 0) + 1;
      }
    }
    for (const s of userSaves) {
      const place = this.places.get(s.placeId);
      if (place?.category) {
        savedCategories[place.category] = (savedCategories[place.category] ?? 0) + 1;
      }
    }

    const seasonCategories = SEASONAL_CATEGORIES[season];
    const contextCategories = hour !== undefined ? CONTEXT_CATEGORIES[this.getTimeOfDay(hour)] : [];

    const candidates = [...this.places.values()].filter((p) => p.city === city);

    const scored: FeedItem[] = candidates.map((place) => {
      const baseScore = (place.rating ?? 3) * 10;
      const cat = place.category ?? '';
      const visitBonus = (visitedCategories[cat] ?? 0) * 3;
      const saveBonus = (savedCategories[cat] ?? 0) * 2;

      let section: FeedItem['section'] = 'personalized';
      let sectionBonus = 0;

      const isHiddenGem =
        place.rating !== null &&
        place.rating >= 4.2 &&
        place.visitCount < 100 &&
        place.reviewCount >= 3;

      const isTrending = place.saveCount >= 20;

      const isSeasonallyRelevant =
        seasonCategories.length === 0 ||
        (place.category !== null && (seasonCategories as string[]).includes(place.category));

      const isContextRelevant =
        contextCategories.length === 0 ||
        (place.category !== null && (contextCategories as string[]).includes(place.category));

      if (isHiddenGem) {
        section = 'hidden_gem';
        sectionBonus = 5;
      } else if (isTrending) {
        section = 'trending';
        sectionBonus = 3;
      } else if (isSeasonallyRelevant && season !== 'regular') {
        section = 'seasonal';
        sectionBonus = 2;
      } else if (isContextRelevant && hour !== undefined) {
        section = 'context';
        sectionBonus = 1;
      }

      const score = baseScore + visitBonus + saveBonus + sectionBonus;

      return {
        place,
        score,
        reason: section,
        section,
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ── getRecommendations ────────────────────────────────────────────────────────

  async getRecommendations(
    userId: string,
    city: string,
    limit = 10,
  ): Promise<FeedItem[]> {
    const hour = new Date().getUTCHours() + 3; // Iraq UTC+3
    const feed = await this.getPersonalizedFeed(userId, city, { hour, limit });
    return feed;
  }

  // ── reset ─────────────────────────────────────────────────────────────────────

  reset(): void {
    this.places.clear();
    this.visits.clear();
    this.saves.clear();
    this.visitCalls.length = 0;
    this.saveCalls.length = 0;
  }

  // ── Inspection helpers ─────────────────────────────────────────────────────────

  placeCount(): number {
    return this.places.size;
  }

  visitCountFor(userId: string): number {
    return (this.visits.get(userId) ?? []).length;
  }

  saveCountFor(userId: string): number {
    return (this.saves.get(userId) ?? []).length;
  }

  allPlaces(): DiscoveryPlace[] {
    return [...this.places.values()];
  }
}
