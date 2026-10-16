/**
 * FakeSearchService — in-memory search service fake for testing.
 * Records all queries so tests can assert on what was searched.
 */

export interface SearchQuery {
  q: string;
  city?: string;
  category?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  limit?: number;
  cursor?: string;
}

export interface SearchResult {
  id: string;
  name: string;
  category?: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
}

export interface SearchResponse {
  items: SearchResult[];
  nextCursor?: string;
}

export interface SearchHistoryEntry {
  q: string;
  searchedAt: Date;
}

export class FakeSearchService {
  /** All queries received so tests can inspect them. */
  readonly queries: SearchQuery[] = [];

  /** Pre-seeded results to return for specific queries (case-insensitive q match). */
  private readonly seededResults = new Map<string, SearchResult[]>();

  /** Trending tags to return. */
  private trendingTags: Array<{ tag: string; count: number }> = [];

  /** Per-user search history. */
  private readonly history = new Map<string, SearchHistoryEntry[]>();

  /** Seed results for a query term (case-insensitive). */
  seed(q: string, results: SearchResult[]): void {
    this.seededResults.set(q.toLowerCase(), results);
  }

  /** Seed trending tags. */
  seedTrending(tags: Array<{ tag: string; count: number }>): void {
    this.trendingTags = [...tags];
  }

  async search(userId: string, query: SearchQuery): Promise<SearchResponse> {
    this.queries.push({ ...query });

    // Record history for this user
    const userHistory = this.history.get(userId) ?? [];
    userHistory.unshift({ q: query.q, searchedAt: new Date() });
    this.history.set(userId, userHistory.slice(0, 50)); // keep last 50

    if (!query.q.trim()) return { items: [], nextCursor: undefined };

    const key = query.q.toLowerCase();
    const all = this.seededResults.get(key) ?? [];

    // Apply limit
    const limit = query.limit ?? 20;
    const items = all.slice(0, limit);

    return {
      items,
      nextCursor: all.length > limit ? new Date().toISOString() : undefined,
    };
  }

  async suggest(q: string, _city?: string, limit = 5): Promise<Array<{ id: string; name: string }>> {
    if (!q.trim()) return [];
    const key = q.toLowerCase();
    const all = [...this.seededResults.values()].flat();
    return all
      .filter((r) => r.name.toLowerCase().includes(key))
      .slice(0, limit)
      .map((r) => ({ id: r.id, name: r.name }));
  }

  async trending(limit = 10): Promise<Array<{ tag: string; count: number }>> {
    return this.trendingTags.slice(0, limit);
  }

  async getHistory(userId: string): Promise<SearchHistoryEntry[]> {
    return this.history.get(userId) ?? [];
  }

  async clearHistory(userId: string): Promise<void> {
    this.history.delete(userId);
  }

  /** Reset all recorded state. */
  reset(): void {
    this.queries.length = 0;
    this.seededResults.clear();
    this.trendingTags = [];
    this.history.clear();
  }

  /** Convenience: returns the last query made. */
  lastQuery(): SearchQuery | undefined {
    return this.queries[this.queries.length - 1];
  }
}
