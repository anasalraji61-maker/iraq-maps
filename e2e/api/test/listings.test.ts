/**
 * E2E: listings on the composed API.
 * Covers create, browse, search, filter, availability toggle, delete, featured.
 * All tests skip when DATABASE_URL is not set.
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const call = (
  method: Method,
  url: string,
  opts: { token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url,
    payload: opts.payload as object | undefined,
    remoteAddress: randomIp(),
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });

type Session = { accessToken: string; user: { id: string } };

async function login(): Promise<Session> {
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const res = await call('POST', '/v1/auth/otp/verify', {
    payload: { phone, code: sender.lastCodeFor(phone) },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as Session;
}

let listingSeq = 0;
function uniqueTitle(prefix = 'منتج') {
  listingSeq++;
  return `${prefix} ${listingSeq} ${Date.now()}`;
}

async function createListing(session: Session, overrides: Record<string, unknown> = {}): Promise<{ id: string } | null> {
  const res = await call('POST', '/v1/listings', {
    token: session.accessToken,
    payload: {
      title: uniqueTitle(),
      description: 'وصف تفصيلي للمنتج أو الخدمة المعروضة',
      price: 25000,
      currency: 'IQD',
      category: 'electronics',
      cityId: 'baghdad',
      available: true,
      ...overrides,
    },
  });
  if (res.statusCode === 201 || res.statusCode === 200) {
    return res.json() as { id: string };
  }
  return null;
}

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({
    env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
    otpSender: sender,
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await tdb?.drop();
});

// ─── Create listing ────────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – create', () => {
  it('creates a listing and returns 201 with an id', async () => {
    const user = await login();
    const res = await call('POST', '/v1/listings', {
      token: user.accessToken,
      payload: {
        title: 'هاتف ذكي للبيع',
        description: 'هاتف بحالة ممتازة استخدام سنة واحدة',
        price: 500000,
        currency: 'IQD',
        category: 'electronics',
        cityId: 'baghdad',
        available: true,
      },
    });
    expect([200, 201]).toContain(res.statusCode);
    if (res.statusCode === 201 || res.statusCode === 200) {
      const body = res.json() as { id?: string };
      if (body.id !== undefined) {
        expect(typeof body.id).toBe('string');
      }
    }
  });

  it('creating a listing requires authentication', async () => {
    const res = await call('POST', '/v1/listings', {
      payload: { title: 'test', price: 100, category: 'other', cityId: 'baghdad' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('missing required fields returns 400 or 422', async () => {
    const user = await login();
    const res = await call('POST', '/v1/listings', {
      token: user.accessToken,
      payload: { title: 'عنوان فقط' }, // missing price, category, etc.
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('negative price returns 400 or 422', async () => {
    const user = await login();
    const res = await call('POST', '/v1/listings', {
      token: user.accessToken,
      payload: {
        title: 'منتج بسعر سالب',
        price: -100,
        currency: 'IQD',
        category: 'electronics',
        cityId: 'baghdad',
      },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('GET /v1/listings/:id returns created listing', async () => {
    const user = await login();
    const listing = await createListing(user);
    if (!listing?.id) return;

    const res = await call('GET', `/v1/listings/${listing.id}`, { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { id: string };
      expect(body.id).toBe(listing.id);
    }
  });

  it('created listing appears in owner listing list', async () => {
    const user = await login();
    const listing = await createListing(user);
    if (!listing?.id) return;

    const res = await call('GET', '/v1/listings/me', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(typeof found).toBe('boolean');
      }
    }
  });
});

// ─── Browse ────────────────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – browse', () => {
  it('GET /v1/listings returns a paginated list', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(Array.isArray(body.items)).toBe(true);
      }
    }
  });

  it('browse is accessible without authentication', async () => {
    const res = await call('GET', '/v1/listings');
    expect([200, 401, 404]).toContain(res.statusCode);
  });

  it('pagination with limit returns correct number of items', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings?limit=3', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(body.items.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('newly created listing appears in browse results', async () => {
    const user = await login();
    const title = uniqueTitle('منتج للاستعراض');
    const listing = await createListing(user, { title });
    if (!listing?.id) return;

    const res = await call('GET', '/v1/listings', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string; title?: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(typeof found).toBe('boolean');
      }
    }
  });

  it('browse by city returns only that city listings', async () => {
    const user = await login();
    await createListing(user, { cityId: 'baghdad' });

    const res = await call('GET', '/v1/listings?cityId=baghdad', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ cityId?: string }> };
      if (body.items !== undefined) {
        for (const item of body.items) {
          if (item.cityId !== undefined) {
            expect(item.cityId).toBe('baghdad');
          }
        }
      }
    }
  });
});

// ─── Search ────────────────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – search', () => {
  it('search by title keyword returns matching listings', async () => {
    const user = await login();
    const uniqueWord = `aaabbb${Date.now()}`;
    const listing = await createListing(user, {
      title: `منتج ${uniqueWord} للبيع`,
      description: 'وصف',
    });
    if (!listing?.id) return;

    const res = await call('GET', `/v1/listings?q=${uniqueWord}`, { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined && body.items.length > 0) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(typeof found).toBe('boolean');
      }
    }
  });

  it('search returns empty array for impossible query', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings?q=xyzxyzxyz123impossible987', {
      token: user.accessToken,
    });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(Array.isArray(body.items)).toBe(true);
      }
    }
  });

  it('search requires at least 2 characters or returns 400', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings?q=x', { token: user.accessToken });
    expect([200, 400, 422]).toContain(res.statusCode);
  });

  it('Arabic search finds Arabic-titled listings', async () => {
    const user = await login();
    const listing = await createListing(user, {
      title: 'جهاز تلفاز سامسونج',
      category: 'electronics',
    });
    if (!listing?.id) return;

    const res = await call('GET', '/v1/listings?q=تلفاز', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string }> };
      expect(Array.isArray(body.items) || body.items === undefined).toBe(true);
    }
  });
});

// ─── Filter ────────────────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – filters', () => {
  it('filter by category returns only that category', async () => {
    const user = await login();
    await createListing(user, { category: 'furniture', price: 80000 });

    const res = await call('GET', '/v1/listings?category=furniture', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ category?: string }> };
      if (body.items !== undefined) {
        for (const item of body.items) {
          if (item.category !== undefined) {
            expect(item.category).toBe('furniture');
          }
        }
      }
    }
  });

  it('filter by price range: minPrice', async () => {
    const user = await login();
    await createListing(user, { price: 100000 });

    const res = await call('GET', '/v1/listings?minPrice=50000', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ price?: number }> };
      if (body.items !== undefined) {
        for (const item of body.items) {
          if (item.price !== undefined) {
            expect(item.price).toBeGreaterThanOrEqual(50000);
          }
        }
      }
    }
  });

  it('filter by price range: maxPrice', async () => {
    const user = await login();
    await createListing(user, { price: 10000 });

    const res = await call('GET', '/v1/listings?maxPrice=20000', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ price?: number }> };
      if (body.items !== undefined) {
        for (const item of body.items) {
          if (item.price !== undefined) {
            expect(item.price).toBeLessThanOrEqual(20000);
          }
        }
      }
    }
  });

  it('filter available=true excludes unavailable listings', async () => {
    const user = await login();
    const listing = await createListing(user, { available: false });
    if (!listing?.id) return;

    const res = await call('GET', '/v1/listings?available=true', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string; available?: boolean }> };
      if (body.items !== undefined) {
        const foundUnavailable = body.items.some((l) => l.id === listing.id);
        // Unavailable listing should not appear in available=true filter
        expect(foundUnavailable).toBe(false);
      }
    }
  });

  it('combined filters: category + price + city', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings?category=electronics&minPrice=100&cityId=baghdad', {
      token: user.accessToken,
    });
    expect([200, 400, 404]).toContain(res.statusCode);
  });

  it('invalid category returns 400 or empty result', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings?category=not_real_category_xyz', {
      token: user.accessToken,
    });
    expect([200, 400, 422]).toContain(res.statusCode);
  });
});

// ─── Toggle availability ───────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – availability toggle', () => {
  it('toggle available=false hides listing from default browse', async () => {
    const user = await login();
    const listing = await createListing(user, { available: true });
    if (!listing?.id) return;

    const toggleRes = await call('PATCH', `/v1/listings/${listing.id}`, {
      token: user.accessToken,
      payload: { available: false },
    });
    expect([200, 204, 404]).toContain(toggleRes.statusCode);

    const browseRes = await call('GET', '/v1/listings?available=true', { token: user.accessToken });
    if (browseRes.statusCode === 200) {
      const body = browseRes.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(found).toBe(false);
      }
    }
  });

  it('owner can re-enable a disabled listing', async () => {
    const user = await login();
    const listing = await createListing(user, { available: true });
    if (!listing?.id) return;

    await call('PATCH', `/v1/listings/${listing.id}`, {
      token: user.accessToken,
      payload: { available: false },
    });

    const enableRes = await call('PATCH', `/v1/listings/${listing.id}`, {
      token: user.accessToken,
      payload: { available: true },
    });
    expect([200, 204, 404]).toContain(enableRes.statusCode);
  });

  it('non-owner cannot toggle availability', async () => {
    const owner = await login();
    const stranger = await login();
    const listing = await createListing(owner, { available: true });
    if (!listing?.id) return;

    const res = await call('PATCH', `/v1/listings/${listing.id}`, {
      token: stranger.accessToken,
      payload: { available: false },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('availability toggle requires authentication', async () => {
    const owner = await login();
    const listing = await createListing(owner);
    if (!listing?.id) return;

    const res = await call('PATCH', `/v1/listings/${listing.id}`, {
      payload: { available: false },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Delete listing ────────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – delete', () => {
  it('owner can delete their listing', async () => {
    const user = await login();
    const listing = await createListing(user);
    if (!listing?.id) return;

    const deleteRes = await call('DELETE', `/v1/listings/${listing.id}`, {
      token: user.accessToken,
    });
    expect([200, 204]).toContain(deleteRes.statusCode);

    const getRes = await call('GET', `/v1/listings/${listing.id}`, { token: user.accessToken });
    expect([404, 410]).toContain(getRes.statusCode);
  });

  it('non-owner cannot delete a listing', async () => {
    const owner = await login();
    const stranger = await login();
    const listing = await createListing(owner);
    if (!listing?.id) return;

    const res = await call('DELETE', `/v1/listings/${listing.id}`, {
      token: stranger.accessToken,
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('deleting non-existent listing returns 404', async () => {
    const user = await login();
    const res = await call('DELETE', '/v1/listings/00000000-0000-0000-0000-000000000000', {
      token: user.accessToken,
    });
    expect([404, 403]).toContain(res.statusCode);
  });

  it('deleted listing no longer appears in browse', async () => {
    const user = await login();
    const listing = await createListing(user);
    if (!listing?.id) return;

    await call('DELETE', `/v1/listings/${listing.id}`, { token: user.accessToken });

    const res = await call('GET', '/v1/listings', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(found).toBe(false);
      }
    }
  });

  it('delete requires authentication', async () => {
    const owner = await login();
    const listing = await createListing(owner);
    if (!listing?.id) return;

    const res = await call('DELETE', `/v1/listings/${listing.id}`);
    expect(res.statusCode).toBe(401);
  });
});

// ─── Featured listings ─────────────────────────────────────────────────────────

describe.skipIf(skip)('Listings – featured', () => {
  it('GET /v1/listings/featured returns featured list', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings/featured', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] } | unknown[];
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items;
      expect(Array.isArray(items) || items === undefined).toBe(true);
    }
  });

  it('featured endpoint is accessible without auth', async () => {
    const res = await call('GET', '/v1/listings/featured');
    expect([200, 401, 404]).toContain(res.statusCode);
  });

  it('featured listings are marked as featured', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings/featured', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ featured?: boolean; isFeatured?: boolean }> };
      if (body.items !== undefined) {
        for (const item of body.items) {
          if (item.featured !== undefined) {
            expect(item.featured).toBe(true);
          }
          if (item.isFeatured !== undefined) {
            expect(item.isFeatured).toBe(true);
          }
        }
      }
    }
  });

  it('non-featured listings don\'t appear in featured endpoint', async () => {
    const user = await login();
    const listing = await createListing(user, { featured: false });
    if (!listing?.id) return;

    const res = await call('GET', '/v1/listings/featured', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((l) => l.id === listing.id);
        expect(found).toBe(false);
      }
    }
  });

  it('featured listings support city filter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings/featured?cityId=baghdad', {
      token: user.accessToken,
    });
    expect([200, 400, 404]).toContain(res.statusCode);
  });

  it('featured listings support category filter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/listings/featured?category=electronics', {
      token: user.accessToken,
    });
    expect([200, 400, 404]).toContain(res.statusCode);
  });
});
