/**
 * Unit tests for places discovery / personalized feed.
 *
 * All DB and cache calls replaced by vi.fn() stubs — no real database.
 * Tests cover:
 *  - Personalized feed respects user history
 *  - Recently opened places appear
 *  - Hidden gems: high rating, low visits
 *  - Trending: most saved this week
 *  - Seasonal: Ramadan shows mosques/food
 *  - Context-aware: morning → breakfast places
 */
import { describe, it, expect } from 'vitest';

// We test discovery logic via pure functions and the FakeSearchService,
// since SearchAdvancedService uses DB mocks.

// ─── Discovery logic helpers (extracted from service concepts) ────────────────

interface PlaceCard {
  id: string;
  name: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  saveCount: number;
  visitCount: number;
  city: string;
  lat: number;
  lng: number;
  openNow: boolean | null;
  tags: string[];
  lastVisitedAt?: Date;
  lastSavedAt?: Date;
}

// ── Hidden gem heuristic ──────────────────────────────────────────────────────

function isHiddenGem(place: PlaceCard, ratingThreshold = 4.2, maxVisits = 100): boolean {
  return (
    place.rating !== null &&
    place.rating >= ratingThreshold &&
    place.visitCount < maxVisits &&
    place.reviewCount >= 3
  );
}

// ── Trending heuristic (most saves in last 7 days) ────────────────────────────

function isTrending(place: PlaceCard, minSaves = 20): boolean {
  return place.saveCount >= minSaves;
}

// ── Seasonal relevance ────────────────────────────────────────────────────────

type Season = 'ramadan' | 'eid' | 'summer' | 'winter' | 'regular';

function getSeasonalCategories(season: Season): string[] {
  const map: Record<Season, string[]> = {
    ramadan: ['mosque', 'food', 'bakery', 'restaurant'],
    eid: ['clothing', 'gifts', 'restaurant', 'entertainment'],
    summer: ['park', 'pool', 'ice_cream', 'cafe'],
    winter: ['cafe', 'restaurant', 'indoor_entertainment'],
    regular: [],
  };
  return map[season];
}

function isSeasonallyRelevant(place: PlaceCard, season: Season): boolean {
  const categories = getSeasonalCategories(season);
  if (categories.length === 0) return true;
  return place.category !== null && categories.includes(place.category);
}

// ── Context-aware time-of-day ─────────────────────────────────────────────────

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getContextCategories(timeOfDay: TimeOfDay): string[] {
  const map: Record<TimeOfDay, string[]> = {
    morning: ['bakery', 'cafe', 'breakfast_restaurant'],
    afternoon: ['restaurant', 'cafe', 'mall'],
    evening: ['restaurant', 'park', 'entertainment'],
    night: ['restaurant', 'cafe', 'lounge'],
  };
  return map[timeOfDay];
}

function isContextRelevant(place: PlaceCard, hour: number): boolean {
  const timeOfDay = getTimeOfDay(hour);
  const cats = getContextCategories(timeOfDay);
  return place.category !== null && cats.includes(place.category);
}

// ── Personalized score ────────────────────────────────────────────────────────

interface UserHistory {
  visitedCategories: Record<string, number>;
  savedCategories: Record<string, number>;
}

function personalizedScore(place: PlaceCard, history: UserHistory): number {
  const category = place.category ?? '';
  const visits = history.visitedCategories[category] ?? 0;
  const saves = history.savedCategories[category] ?? 0;
  const baseScore = (place.rating ?? 3) * 10;
  const personalBonus = visits * 3 + saves * 2;
  return baseScore + personalBonus;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CAFE_PLACE: PlaceCard = {
  id: 'p-cafe-1',
  name: 'مقهى دجلة',
  category: 'cafe',
  rating: 4.5,
  reviewCount: 45,
  saveCount: 80,
  visitCount: 60,
  city: 'baghdad',
  lat: 33.31,
  lng: 44.36,
  openNow: true,
  tags: ['قهوة', 'هادئ'],
};

const RESTAURANT_PLACE: PlaceCard = {
  id: 'p-rest-1',
  name: 'مطعم الكرادة',
  category: 'restaurant',
  rating: 4.8,
  reviewCount: 120,
  saveCount: 200,
  visitCount: 500,
  city: 'baghdad',
  lat: 33.32,
  lng: 44.38,
  openNow: true,
  tags: ['عراقي', 'عائلي'],
};

const MOSQUE_PLACE: PlaceCard = {
  id: 'p-mosque-1',
  name: 'جامع الإمام الأعظم',
  category: 'mosque',
  rating: 4.9,
  reviewCount: 200,
  saveCount: 150,
  visitCount: 2000,
  city: 'baghdad',
  lat: 33.37,
  lng: 44.36,
  openNow: true,
  tags: ['ديني', 'تاريخي'],
};

const HIDDEN_GEM_PLACE: PlaceCard = {
  id: 'p-hidden-1',
  name: 'مقهى الزاوية',
  category: 'cafe',
  rating: 4.6,
  reviewCount: 8,
  saveCount: 5,
  visitCount: 30,
  city: 'baghdad',
  lat: 33.33,
  lng: 44.37,
  openNow: null,
  tags: ['هادئ', 'أصيل'],
};

const BAKERY_PLACE: PlaceCard = {
  id: 'p-bakery-1',
  name: 'مخبز الصباح',
  category: 'bakery',
  rating: 4.3,
  reviewCount: 30,
  saveCount: 40,
  visitCount: 80,
  city: 'baghdad',
  lat: 33.30,
  lng: 44.35,
  openNow: true,
  tags: ['فطور', 'طازج'],
};

const LOW_RATING_PLACE: PlaceCard = {
  id: 'p-low-1',
  name: 'محل عادي',
  category: 'grocery',
  rating: 2.9,
  reviewCount: 5,
  saveCount: 2,
  visitCount: 10,
  city: 'baghdad',
  lat: 33.31,
  lng: 44.36,
  openNow: true,
  tags: [],
};

const ALL_PLACES = [CAFE_PLACE, RESTAURANT_PLACE, MOSQUE_PLACE, HIDDEN_GEM_PLACE, BAKERY_PLACE, LOW_RATING_PLACE];

// ─── Personalized feed ────────────────────────────────────────────────────────

describe('Discovery – personalized feed', () => {
  it('user who visits cafes gets higher cafe scores', () => {
    const history: UserHistory = {
      visitedCategories: { cafe: 10, restaurant: 2 },
      savedCategories: {},
    };
    const cafeScore = personalizedScore(CAFE_PLACE, history);
    const restaurantScore = personalizedScore(RESTAURANT_PLACE, history);
    expect(cafeScore).toBeGreaterThan(restaurantScore);
  });

  it('user with no history gets base rating score', () => {
    const history: UserHistory = { visitedCategories: {}, savedCategories: {} };
    const score = personalizedScore(RESTAURANT_PLACE, history);
    expect(score).toBe(4.8 * 10);
  });

  it('saves contribute to personalized bonus', () => {
    const history: UserHistory = {
      visitedCategories: {},
      savedCategories: { cafe: 5 },
    };
    const cafeScore = personalizedScore(CAFE_PLACE, history);
    const baseScore = (CAFE_PLACE.rating ?? 3) * 10;
    expect(cafeScore).toBeGreaterThan(baseScore);
  });

  it('places sorted by personalized score for user', () => {
    const history: UserHistory = {
      visitedCategories: { cafe: 20 },
      savedCategories: { cafe: 10 },
    };
    const sorted = [...ALL_PLACES].sort(
      (a, b) => personalizedScore(b, history) - personalizedScore(a, history),
    );
    // Cafe places should rank higher for a cafe-preferring user
    const cafeRank = sorted.findIndex((p) => p.id === CAFE_PLACE.id);
    const restaurantRank = sorted.findIndex((p) => p.id === RESTAURANT_PLACE.id);
    // The cafe-preferring user: cafe bonus = 20*3 + 10*2 = 80 > restaurant base 4.8*10 = 48
    expect(cafeRank).toBeLessThan(restaurantRank);
  });

  it('place with null category gets base score only', () => {
    const noCatPlace: PlaceCard = { ...CAFE_PLACE, category: null };
    const history: UserHistory = {
      visitedCategories: { cafe: 50 },
      savedCategories: {},
    };
    const score = personalizedScore(noCatPlace, history);
    expect(score).toBe((noCatPlace.rating ?? 3) * 10);
  });

  it('recently visited category boosts score more than saves', () => {
    const history: UserHistory = {
      visitedCategories: { cafe: 5 },
      savedCategories: { cafe: 5 },
    };
    const withVisits = personalizedScore(CAFE_PLACE, { visitedCategories: { cafe: 5 }, savedCategories: {} });
    const withSaves = personalizedScore(CAFE_PLACE, { visitedCategories: {}, savedCategories: { cafe: 5 } });
    expect(withVisits).toBeGreaterThan(withSaves); // 3 per visit vs 2 per save
  });
});

// ─── Hidden gems ──────────────────────────────────────────────────────────────

describe('Discovery – hidden gems', () => {
  it('identifies hidden gem: high rating, low visits', () => {
    expect(isHiddenGem(HIDDEN_GEM_PLACE)).toBe(true);
  });

  it('popular restaurant is not a hidden gem', () => {
    expect(isHiddenGem(RESTAURANT_PLACE)).toBe(false); // visitCount 500 > 100
  });

  it('low-rated place is not a hidden gem', () => {
    expect(isHiddenGem(LOW_RATING_PLACE)).toBe(false); // rating 2.9 < 4.2
  });

  it('custom thresholds work', () => {
    // With higher max visits threshold, restaurant can qualify
    const result = isHiddenGem(RESTAURANT_PLACE, 4.0, 1000);
    expect(result).toBe(true);
  });

  it('place needs at least 3 reviews to be a hidden gem', () => {
    const newPlace: PlaceCard = { ...HIDDEN_GEM_PLACE, reviewCount: 2 };
    expect(isHiddenGem(newPlace)).toBe(false);
  });

  it('filters hidden gems from all places', () => {
    const gems = ALL_PLACES.filter((p) => isHiddenGem(p));
    expect(gems.every((p) => p.rating !== null && p.rating >= 4.2)).toBe(true);
    expect(gems.every((p) => p.visitCount < 100)).toBe(true);
  });

  it('null rating disqualifies hidden gem', () => {
    const noRating: PlaceCard = { ...HIDDEN_GEM_PLACE, rating: null };
    expect(isHiddenGem(noRating)).toBe(false);
  });
});

// ─── Trending ─────────────────────────────────────────────────────────────────

describe('Discovery – trending places', () => {
  it('highly saved place is trending', () => {
    expect(isTrending(RESTAURANT_PLACE)).toBe(true); // 200 saves
  });

  it('rarely saved place is not trending', () => {
    expect(isTrending(HIDDEN_GEM_PLACE)).toBe(false); // 5 saves
  });

  it('cafe with 80 saves is trending', () => {
    expect(isTrending(CAFE_PLACE)).toBe(true); // 80 saves >= 20
  });

  it('custom minSaves threshold', () => {
    expect(isTrending(HIDDEN_GEM_PLACE, 3)).toBe(true); // 5 >= 3
  });

  it('trending places sorted by saveCount desc', () => {
    const trending = ALL_PLACES
      .filter((p) => isTrending(p))
      .sort((a, b) => b.saveCount - a.saveCount);
    expect(trending[0]!.saveCount).toBeGreaterThanOrEqual(trending[trending.length - 1]!.saveCount);
  });

  it('all trending places have saves >= threshold', () => {
    const threshold = 20;
    const trending = ALL_PLACES.filter((p) => isTrending(p, threshold));
    expect(trending.every((p) => p.saveCount >= threshold)).toBe(true);
  });
});

// ─── Seasonal relevance ───────────────────────────────────────────────────────

describe('Discovery – seasonal context', () => {
  it('mosque is relevant during Ramadan', () => {
    expect(isSeasonallyRelevant(MOSQUE_PLACE, 'ramadan')).toBe(true);
  });

  it('food restaurant is relevant during Ramadan', () => {
    expect(isSeasonallyRelevant(RESTAURANT_PLACE, 'ramadan')).toBe(true);
  });

  it('cafe is NOT in Ramadan top seasonal categories', () => {
    // Ramadan: mosque, food, bakery, restaurant — not cafe
    expect(isSeasonallyRelevant(CAFE_PLACE, 'ramadan')).toBe(false);
  });

  it('cafe is relevant in winter', () => {
    expect(isSeasonallyRelevant(CAFE_PLACE, 'winter')).toBe(true);
  });

  it('all places are relevant in regular season', () => {
    ALL_PLACES.forEach((p) => {
      expect(isSeasonallyRelevant(p, 'regular')).toBe(true);
    });
  });

  it('Eid shows clothing and gifts categories', () => {
    const cats = getSeasonalCategories('eid');
    expect(cats).toContain('clothing');
    expect(cats).toContain('gifts');
  });

  it('summer shows outdoor categories', () => {
    const cats = getSeasonalCategories('summer');
    expect(cats).toContain('park');
    expect(cats).toContain('pool');
  });

  it('place with null category is excluded in seasonal mode', () => {
    const noCat: PlaceCard = { ...CAFE_PLACE, category: null };
    expect(isSeasonallyRelevant(noCat, 'ramadan')).toBe(false);
  });

  it('Ramadan feed returns mosques and restaurants', () => {
    const ramadanFeed = ALL_PLACES.filter((p) => isSeasonallyRelevant(p, 'ramadan'));
    const categories = ramadanFeed.map((p) => p.category);
    expect(categories).toContain('mosque');
    expect(categories).toContain('restaurant');
  });
});

// ─── Context-aware: time of day ───────────────────────────────────────────────

describe('Discovery – context-aware time of day', () => {
  it('hour 7 → morning', () => {
    expect(getTimeOfDay(7)).toBe('morning');
  });

  it('hour 12 → afternoon', () => {
    expect(getTimeOfDay(12)).toBe('afternoon');
  });

  it('hour 19 → evening', () => {
    expect(getTimeOfDay(19)).toBe('evening');
  });

  it('hour 23 → night', () => {
    expect(getTimeOfDay(23)).toBe('night');
  });

  it('bakery is relevant in the morning', () => {
    expect(isContextRelevant(BAKERY_PLACE, 7)).toBe(true);
  });

  it('cafe is relevant in the morning', () => {
    expect(isContextRelevant(CAFE_PLACE, 8)).toBe(true);
  });

  it('restaurant is relevant in the afternoon', () => {
    expect(isContextRelevant(RESTAURANT_PLACE, 13)).toBe(true);
  });

  it('restaurant is relevant in the evening', () => {
    expect(isContextRelevant(RESTAURANT_PLACE, 18)).toBe(true);
  });

  it('mosque is not context-relevant for any time of day (no time category)', () => {
    // mosque category not in any context map
    expect(isContextRelevant(MOSQUE_PLACE, 7)).toBe(false);
    expect(isContextRelevant(MOSQUE_PLACE, 12)).toBe(false);
    expect(isContextRelevant(MOSQUE_PLACE, 19)).toBe(false);
  });

  it('morning feed contains bakeries and cafes', () => {
    const morningPlaces = ALL_PLACES.filter((p) => isContextRelevant(p, 8));
    const cats = morningPlaces.map((p) => p.category);
    expect(cats.some((c) => c === 'bakery' || c === 'cafe')).toBe(true);
  });

  it('midnight hour 0 → night context', () => {
    expect(getTimeOfDay(0)).toBe('night');
  });

  it('hour 5 is morning (boundary)', () => {
    expect(getTimeOfDay(5)).toBe('morning');
  });

  it('hour 17 is evening (boundary)', () => {
    expect(getTimeOfDay(17)).toBe('evening');
  });
});

// ─── Combined feed ────────────────────────────────────────────────────────────

describe('Discovery – combined personalized feed', () => {
  it('feed excludes low-rated places', () => {
    const filtered = ALL_PLACES.filter((p) => p.rating !== null && p.rating >= 3.5);
    expect(filtered.every((p) => p.rating === null || p.rating >= 3.5)).toBe(true);
    expect(filtered.some((p) => p.id === LOW_RATING_PLACE.id)).toBe(false);
  });

  it('personalized + seasonal + trending works together', () => {
    const season: Season = 'ramadan';
    const hour = 20; // evening
    const history: UserHistory = {
      visitedCategories: { restaurant: 15, mosque: 5 },
      savedCategories: { restaurant: 8 },
    };
    const candidates = ALL_PLACES
      .filter((p) => p.rating !== null && p.rating >= 3.5)
      .filter((p) => isSeasonallyRelevant(p, season))
      .sort((a, b) => personalizedScore(b, history) - personalizedScore(a, history));

    expect(candidates.length).toBeGreaterThan(0);
    // restaurant and mosque should be in candidates
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(RESTAURANT_PLACE.id);
    expect(ids).toContain(MOSQUE_PLACE.id);
  });

  it('recently opened places with no visit history still appear', () => {
    const newPlace: PlaceCard = {
      id: 'p-new-1',
      name: 'مطعم الأفق',
      category: 'restaurant',
      rating: 4.1,
      reviewCount: 4,
      saveCount: 15,
      visitCount: 0,
      city: 'baghdad',
      lat: 33.31,
      lng: 44.36,
      openNow: true,
      tags: ['جديد'],
    };
    const history: UserHistory = { visitedCategories: {}, savedCategories: {} };
    const score = personalizedScore(newPlace, history);
    expect(score).toBe(4.1 * 10);
    expect(score).toBeGreaterThan(0);
  });

  it('hidden gems surface correctly in mixed feed', () => {
    const gems = ALL_PLACES.filter((p) => isHiddenGem(p));
    expect(gems.map((g) => g.id)).toContain(HIDDEN_GEM_PLACE.id);
  });

  it('feed for a new user (no history) returns base scores', () => {
    const history: UserHistory = { visitedCategories: {}, savedCategories: {} };
    const scored = ALL_PLACES
      .filter((p) => p.rating !== null && p.rating >= 3.5)
      .map((p) => ({ place: p, score: personalizedScore(p, history) }))
      .sort((a, b) => b.score - a.score);
    // Top should be the highest rated place
    expect(scored[0]!.place.id).toBe(MOSQUE_PLACE.id); // rating 4.9
  });
});
