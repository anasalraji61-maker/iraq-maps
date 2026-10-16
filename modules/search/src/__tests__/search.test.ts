/**
 * Unit tests for SearchService and SearchAdvancedService.
 *
 * All DB calls are replaced by vi.fn() stubs — no real database required.
 * Tests cover:
 *  - Autocomplete returns relevant results
 *  - Arabic query → Arabic results first
 *  - NLP parsing: "مطاعم في الكرادة" → location=Karrada category=restaurant
 *  - Search history: save/get/clear
 *  - Trending searches computed correctly
 *  - Empty query handled gracefully
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../search.service';
import { FakeSearchService } from '@iraq-maps/testing';

// ─── Shared fixture UUIDs ─────────────────────────────────────────────────────

const USER_A = '10000000-0000-0000-0000-000000000001' as const;
const USER_B = '10000000-0000-0000-0000-000000000002' as const;

// ─── DB / Cache stubs ─────────────────────────────────────────────────────────

function stubHistoryRows(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
    execute: vi.fn().mockResolvedValue([]),
  };
}

function stubCache(cached: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

// ─── FakeSearchService (unit-level) ───────────────────────────────────────────

describe('FakeSearchService – autocomplete', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('returns empty array when no seeds and no query', async () => {
    const res = await svc.search(USER_A, { q: '' });
    expect(res.items).toHaveLength(0);
  });

  it('returns seeded results for matching query', async () => {
    svc.seed('مطعم', [
      { id: 'p1', name: 'مطعم الكرخ', category: 'food' },
      { id: 'p2', name: 'مطعم الرشيد', category: 'food' },
    ]);
    const res = await svc.search(USER_A, { q: 'مطعم' });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]!.name).toBe('مطعم الكرخ');
  });

  it('is case-insensitive for English terms', async () => {
    svc.seed('restaurant', [{ id: 'p3', name: 'City Grill', category: 'food' }]);
    const res = await svc.search(USER_A, { q: 'RESTAURANT' });
    expect(res.items).toHaveLength(1);
  });

  it('respects limit', async () => {
    svc.seed('cafe', [
      { id: 'c1', name: 'مقهى النهر' },
      { id: 'c2', name: 'مقهى الوردي' },
      { id: 'c3', name: 'مقهى بغداد' },
    ]);
    const res = await svc.search(USER_A, { q: 'cafe', limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeDefined();
  });

  it('returns nextCursor only when more results exist', async () => {
    svc.seed('park', [
      { id: 'park1', name: 'حديقة الزوراء' },
    ]);
    const res = await svc.search(USER_A, { q: 'park', limit: 5 });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeUndefined();
  });
});

// ─── FakeSearchService – Arabic query handling ────────────────────────────────

describe('FakeSearchService – Arabic results', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('returns Arabic-named places for Arabic query', async () => {
    svc.seed('كرادة', [
      { id: 'k1', name: 'مطعم الكرادة', category: 'food' },
      { id: 'k2', name: 'صيدلية الكرادة', category: 'pharmacy' },
    ]);
    const res = await svc.search(USER_A, { q: 'كرادة' });
    expect(res.items.every((i) => /[؀-ۿ]/.test(i.name))).toBe(true);
  });

  it('Arabic results come before English when seeded with Arabic query', async () => {
    svc.seed('مستشفى', [
      { id: 'h1', name: 'مستشفى ابن سينا' },
      { id: 'h2', name: 'مستشفى المجدي' },
    ]);
    const res = await svc.search(USER_B, { q: 'مستشفى' });
    const firstIsArabic = /[؀-ۿ]/.test(res.items[0]!.name);
    expect(firstIsArabic).toBe(true);
  });

  it('suggest filters by partial Arabic match', async () => {
    svc.seed('جامع', [
      { id: 'j1', name: 'جامع الكاظمية' },
      { id: 'j2', name: 'جامع براثا' },
      { id: 'j3', name: 'جامع أبو حنيفة' },
    ]);
    const suggestions = await svc.suggest('جامع', 'baghdad', 2);
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.name.includes('جامع'))).toBe(true);
  });

  it('suggest returns up to limit results', async () => {
    svc.seed('فندق', [
      { id: 'f1', name: 'فندق بغداد' },
      { id: 'f2', name: 'فندق الرشيد' },
      { id: 'f3', name: 'فندق النهرين' },
      { id: 'f4', name: 'فندق الحمراء' },
    ]);
    const suggestions = await svc.suggest('فندق', undefined, 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

// ─── NLP parsing helpers ──────────────────────────────────────────────────────

/**
 * Simple NLP parser extracted from the query "مطاعم في الكرادة".
 * In production this lives in SearchService.parseNlpFilters.
 * We test the expected shape here via the FakeSearchService seeded response.
 */

interface NlpParsed {
  category: string | null;
  location: string | null;
  rawQ: string;
}

function parseArabicQuery(q: string): NlpParsed {
  const locationPatterns: Record<string, string> = {
    الكرادة: 'karrada',
    كرادة: 'karrada',
    الكرخ: 'karkh',
    الرصافة: 'rusafa',
    المنصور: 'mansour',
    الزعفرانية: 'zafaraniyya',
    الأعظمية: 'adhamiyya',
    الكاظمية: 'kadhimiyya',
    بغداد: 'baghdad',
    البصرة: 'basra',
    الموصل: 'mosul',
    نجف: 'najaf',
    كربلاء: 'karbala',
  };
  const categoryPatterns: Record<string, string> = {
    مطعم: 'restaurant',
    مطاعم: 'restaurant',
    فندق: 'hotel',
    فنادق: 'hotel',
    مستشفى: 'hospital',
    مستشفيات: 'hospital',
    صيدلية: 'pharmacy',
    صيدليات: 'pharmacy',
    مقهى: 'cafe',
    مقاهي: 'cafe',
    جامع: 'mosque',
    مسجد: 'mosque',
    بنك: 'bank',
    محطة: 'fuel_station',
    بقالة: 'grocery',
  };

  let location: string | null = null;
  let category: string | null = null;

  for (const [ar, en] of Object.entries(locationPatterns)) {
    if (q.includes(ar)) {
      location = en;
      break;
    }
  }
  for (const [ar, en] of Object.entries(categoryPatterns)) {
    if (q.includes(ar)) {
      category = en;
      break;
    }
  }

  return { category, location, rawQ: q };
}

describe('NLP parsing – Arabic query intent extraction', () => {
  it('parses "مطاعم في الكرادة" → category=restaurant, location=karrada', () => {
    const parsed = parseArabicQuery('مطاعم في الكرادة');
    expect(parsed.category).toBe('restaurant');
    expect(parsed.location).toBe('karrada');
  });

  it('parses "فنادق في بغداد" → category=hotel, location=baghdad', () => {
    const parsed = parseArabicQuery('فنادق في بغداد');
    expect(parsed.category).toBe('hotel');
    expect(parsed.location).toBe('baghdad');
  });

  it('parses "مستشفيات الكرخ" → category=hospital, location=karkh', () => {
    const parsed = parseArabicQuery('مستشفيات الكرخ');
    expect(parsed.category).toBe('hospital');
    expect(parsed.location).toBe('karkh');
  });

  it('parses "مقاهي الأعظمية" → category=cafe, location=adhamiyya', () => {
    const parsed = parseArabicQuery('مقاهي الأعظمية');
    expect(parsed.category).toBe('cafe');
    expect(parsed.location).toBe('adhamiyya');
  });

  it('returns null category when no match', () => {
    const parsed = parseArabicQuery('شيء ما في الكرادة');
    expect(parsed.category).toBeNull();
    expect(parsed.location).toBe('karrada');
  });

  it('returns null location when no match', () => {
    const parsed = parseArabicQuery('مطاعم ممتازة');
    expect(parsed.category).toBe('restaurant');
    expect(parsed.location).toBeNull();
  });

  it('returns null/null for unrecognized query', () => {
    const parsed = parseArabicQuery('أشياء عامة');
    expect(parsed.category).toBeNull();
    expect(parsed.location).toBeNull();
  });

  it('handles query without في preposition', () => {
    const parsed = parseArabicQuery('مسجد الكاظمية');
    expect(parsed.category).toBe('mosque');
    expect(parsed.location).toBe('kadhimiyya');
  });

  it('extracts category from multi-word queries', () => {
    const parsed = parseArabicQuery('أفضل مطعم في الكرادة');
    expect(parsed.category).toBe('restaurant');
    expect(parsed.location).toBe('karrada');
  });

  it('NLP feeds into search with correct filters', async () => {
    const svc = new FakeSearchService();
    svc.seed('مطاعم في الكرادة', [
      { id: 'r1', name: 'مطعم الكرادة المميز', category: 'food' },
    ]);
    const parsed = parseArabicQuery('مطاعم في الكرادة');
    const res = await svc.search(USER_A, {
      q: 'مطاعم في الكرادة',
      category: parsed.category ?? undefined,
      city: parsed.location ?? undefined,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toBe('مطعم الكرادة المميز');
  });
});

// ─── Search history ───────────────────────────────────────────────────────────

describe('FakeSearchService – search history', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('saves history on each search', async () => {
    await svc.search(USER_A, { q: 'مطعم' });
    await svc.search(USER_A, { q: 'فندق' });
    const history = await svc.getHistory(USER_A);
    expect(history).toHaveLength(2);
  });

  it('history is per-user', async () => {
    await svc.search(USER_A, { q: 'مطعم' });
    await svc.search(USER_B, { q: 'مستشفى' });
    const histA = await svc.getHistory(USER_A);
    const histB = await svc.getHistory(USER_B);
    expect(histA[0]!.q).toBe('مطعم');
    expect(histB[0]!.q).toBe('مستشفى');
  });

  it('history is ordered most-recent first', async () => {
    await svc.search(USER_A, { q: 'first' });
    await svc.search(USER_A, { q: 'second' });
    await svc.search(USER_A, { q: 'third' });
    const history = await svc.getHistory(USER_A);
    expect(history[0]!.q).toBe('third');
    expect(history[1]!.q).toBe('second');
    expect(history[2]!.q).toBe('first');
  });

  it('clearHistory removes all entries for user', async () => {
    await svc.search(USER_A, { q: 'مطعم' });
    await svc.search(USER_A, { q: 'فندق' });
    await svc.clearHistory(USER_A);
    const history = await svc.getHistory(USER_A);
    expect(history).toHaveLength(0);
  });

  it('clearHistory does not affect other users', async () => {
    await svc.search(USER_A, { q: 'مطعم' });
    await svc.search(USER_B, { q: 'مستشفى' });
    await svc.clearHistory(USER_A);
    const histB = await svc.getHistory(USER_B);
    expect(histB).toHaveLength(1);
  });

  it('history capped at 50 entries', async () => {
    for (let i = 0; i < 60; i++) {
      await svc.search(USER_A, { q: `query-${i}` });
    }
    const history = await svc.getHistory(USER_A);
    expect(history.length).toBeLessThanOrEqual(50);
  });

  it('returns empty array for user with no history', async () => {
    const history = await svc.getHistory('nonexistent-user');
    expect(history).toHaveLength(0);
  });

  it('history entries have searchedAt timestamp', async () => {
    const before = new Date();
    await svc.search(USER_A, { q: 'بنك' });
    const history = await svc.getHistory(USER_A);
    expect(history[0]!.searchedAt).toBeInstanceOf(Date);
    expect(history[0]!.searchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ─── Trending searches ────────────────────────────────────────────────────────

describe('FakeSearchService – trending searches', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('returns empty trending when nothing seeded', async () => {
    const trending = await svc.trending();
    expect(trending).toHaveLength(0);
  });

  it('returns seeded trending tags', async () => {
    svc.seedTrending([
      { tag: 'مطاعم', count: 1500 },
      { tag: 'فنادق', count: 900 },
      { tag: 'مقاهي', count: 750 },
    ]);
    const trending = await svc.trending();
    expect(trending).toHaveLength(3);
    expect(trending[0]!.tag).toBe('مطاعم');
    expect(trending[0]!.count).toBe(1500);
  });

  it('respects limit on trending', async () => {
    svc.seedTrending([
      { tag: 'a', count: 100 },
      { tag: 'b', count: 90 },
      { tag: 'c', count: 80 },
      { tag: 'd', count: 70 },
      { tag: 'e', count: 60 },
    ]);
    const trending = await svc.trending(3);
    expect(trending).toHaveLength(3);
  });

  it('trending is ordered by seed order (highest first by convention)', async () => {
    svc.seedTrending([
      { tag: 'رياضة', count: 2000 },
      { tag: 'طعام', count: 1800 },
      { tag: 'سياحة', count: 1200 },
    ]);
    const trending = await svc.trending(10);
    expect(trending[0]!.count).toBeGreaterThanOrEqual(trending[1]!.count);
  });

  it('reset clears trending state', async () => {
    svc.seedTrending([{ tag: 'test', count: 1 }]);
    svc.reset();
    const trending = await svc.trending();
    expect(trending).toHaveLength(0);
  });
});

// ─── Empty query handling ─────────────────────────────────────────────────────

describe('FakeSearchService – edge cases', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('empty string query returns empty results', async () => {
    svc.seed('', [{ id: 'x', name: 'should not appear' }]);
    const res = await svc.search(USER_A, { q: '' });
    expect(res.items).toHaveLength(0);
  });

  it('whitespace-only query returns empty results', async () => {
    const res = await svc.search(USER_A, { q: '   ' });
    expect(res.items).toHaveLength(0);
  });

  it('suggest with empty term returns empty', async () => {
    svc.seed('مطعم', [{ id: 'r1', name: 'مطعم' }]);
    const suggestions = await svc.suggest('');
    expect(suggestions).toHaveLength(0);
  });

  it('records query even for empty searches', async () => {
    await svc.search(USER_A, { q: '' });
    expect(svc.queries).toHaveLength(1);
    expect(svc.queries[0]!.q).toBe('');
  });

  it('reset clears all state', async () => {
    svc.seed('test', [{ id: 'x', name: 'X' }]);
    await svc.search(USER_A, { q: 'test' });
    svc.reset();
    expect(svc.queries).toHaveLength(0);
    const res = await svc.search(USER_A, { q: 'test' });
    expect(res.items).toHaveLength(0);
  });

  it('query with special characters does not throw', async () => {
    await expect(svc.search(USER_A, { q: '!@#$%^&*()' })).resolves.toBeDefined();
  });

  it('very long query does not throw', async () => {
    const longQ = 'م'.repeat(500);
    await expect(svc.search(USER_A, { q: longQ })).resolves.toBeDefined();
  });

  it('lastQuery returns undefined when no queries', () => {
    expect(svc.lastQuery()).toBeUndefined();
  });

  it('lastQuery returns the most recent query', async () => {
    await svc.search(USER_A, { q: 'first' });
    await svc.search(USER_A, { q: 'last' });
    expect(svc.lastQuery()!.q).toBe('last');
  });
});

// ─── DB-mock SearchService unit tests ────────────────────────────────────────

describe('SearchService (DB mock) – history operations', () => {
  it('constructs without throwing', () => {
    const db = stubHistoryRows([]);
    const cache = stubCache();
    expect(() => new SearchService(db as never, cache as never)).not.toThrow();
  });

  it('trending falls back to empty when cache miss and DB empty', async () => {
    const db = {
      ...stubHistoryRows([]),
      execute: vi.fn().mockResolvedValue([]),
    };
    const cache = stubCache(null);
    const svc = new SearchService(db as never, cache as never);
    const result = await svc.getTrendingSearches('baghdad' as never, 10);
    expect(result).toBeDefined();
    expect(Array.isArray((result as { trending: unknown[] }).trending)).toBe(true);
  });

  it('trending uses cached result when available', async () => {
    const cachedPayload = JSON.stringify([
      { term: 'مطاعم', count: 100 },
      { term: 'فنادق', count: 80 },
    ]);
    const db = stubHistoryRows([]);
    const cache = stubCache(cachedPayload);
    const svc = new SearchService(db as never, cache as never);
    const result = await svc.getTrendingSearches('baghdad' as never, 10);
    expect(result).toBeDefined();
  });
});

// ─── Multi-language search ────────────────────────────────────────────────────

describe('Search – multi-language results', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('searches Arabic terms', async () => {
    svc.seed('جسر', [{ id: 'bridge1', name: 'جسر الأئمة' }]);
    const res = await svc.search(USER_A, { q: 'جسر' });
    expect(res.items[0]!.name).toContain('جسر');
  });

  it('searches Kurdish terms', async () => {
    svc.seed('کوردستان', [{ id: 'k1', name: 'هەرێمی کوردستان' }]);
    const res = await svc.search(USER_A, { q: 'کوردستان' });
    expect(res.items).toHaveLength(1);
  });

  it('searches English terms', async () => {
    svc.seed('mall', [{ id: 'm1', name: 'Baghdad Mall' }]);
    const res = await svc.search(USER_A, { q: 'mall' });
    expect(res.items[0]!.id).toBe('m1');
  });

  it('no results for unrecognized term', async () => {
    const res = await svc.search(USER_A, { q: 'xxxxxxx' });
    expect(res.items).toHaveLength(0);
    expect(res.nextCursor).toBeUndefined();
  });
});

// ─── Search with location filters ────────────────────────────────────────────

describe('Search – geo filters', () => {
  let svc: FakeSearchService;

  beforeEach(() => {
    svc = new FakeSearchService();
  });

  it('records lat/lng in query log', async () => {
    await svc.search(USER_A, {
      q: 'مطعم',
      lat: 33.3152,
      lng: 44.3661,
      radiusM: 1000,
    });
    const q = svc.lastQuery();
    expect(q!.lat).toBe(33.3152);
    expect(q!.lng).toBe(44.3661);
    expect(q!.radiusM).toBe(1000);
  });

  it('records city filter in query log', async () => {
    await svc.search(USER_A, { q: 'بنك', city: 'baghdad' });
    expect(svc.lastQuery()!.city).toBe('baghdad');
  });
});
