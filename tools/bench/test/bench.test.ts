import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SearchQuery, type PlaceImportRecord } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { markdown, passed, queries, report, run } from '../src/bench.ts';

const place = (id: string, name: string, location: [number, number]) => ({ id, kind: 'place', names: { name }, category: 'tourism', location, tags: {} }) as PlaceImportRecord;

describe('bench search', () => {
  it('mixes full names, respellings and prefixes, with and without near, all valid /v1/search input', () => {
    const list = queries([place('n1', 'قلعة الإمام', [44.38, 33.34]), place('n2', 'مكتبة', [44.4, 33.3])], 6);
    expect(list).toEqual([
      { q: 'قلعة الإمام' },
      { q: 'قلعه الامام', near: '44.38000,33.34000' },
      { q: 'قلعة ا' },
      { q: 'مكتبة', near: '44.40000,33.30000' },
      { q: 'مكتبه' },
      { q: 'مكت', near: '44.40000,33.30000' },
    ]);
    for (const q of list) expect(SearchQuery.safeParse({ ...q, city: 'baghdad' }).success).toBe(true);
  });

  it('reports nearest-rank percentiles and passes only error-free runs with p95 under the budget', () => {
    const r = report('baghdad', 101, Array.from({ length: 100 }, (_, i) => 100 - i));
    expect(r).toEqual({ city: 'baghdad', count: 101, errors: 1, p50Ms: 50, p95Ms: 95, maxMs: 100 });
    const ok = { ...r, errors: 0 };
    expect([passed(ok, 96), passed(ok, 95), passed(r, 96)]).toEqual([true, false, false]);
    expect(markdown(ok, 800)).toContain('| 101 | 0 | 50 ms | 95 ms | 100 ms | under 800 ms: pass |');
  });

  it('times /v1/search, waits out a 429, and counts failed or off-contract answers as errors', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url!);
      const q = new URL(req.url!, 'http://h').searchParams.get('q');
      if (q === 'busy' && seen.length === 2) return res.writeHead(429, { 'retry-after': '0' }).end();
      res.writeHead(q === 'down' ? 500 : 200).end(JSON.stringify(q === 'odd' ? { results: [] } : { items: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const r = await run(api, 'baghdad', [{ q: 'ok' }, { q: 'busy', near: '44.4,33.3' }, { q: 'down' }, { q: 'odd' }]);
    server.close();
    expect(r).toMatchObject({ city: 'baghdad', count: 4, errors: 2 });
    expect(r.p95Ms).toBeGreaterThan(0);
    expect(seen.slice(0, 3)).toEqual(['/v1/search?q=ok&city=baghdad', ...Array(2).fill('/v1/search?q=busy&city=baghdad&near=44.4%2C33.3')]);
  });
});
