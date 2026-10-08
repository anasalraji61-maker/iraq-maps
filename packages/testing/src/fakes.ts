import {
  OSM_ATTRIBUTION,
  type CityId,
  type CityImportRecord,
  type Clock,
  type DomainEvent,
  type EventBus,
  type EventHandler,
  type EventName,
  type IraqiPhone,
  type NearbyQuery,
  type OtpSender,
  type PlaceDetails,
  type PlaceId,
  type PlaceImportRecord,
  type PlacesQueryPort,
  type PlaceSummary,
  type SearchQuery,
  type UserDataEraser,
  type UserId,
} from '@iraq-maps/contracts';
import { haversineM } from '@iraq-maps/geo';
import { normalizeArabic } from '@iraq-maps/i18n';

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-01-01T00:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Captures every OTP so tests can read the code instead of receiving an SMS. */
export class FakeOtpSender implements OtpSender {
  readonly kind = 'fake' as const;
  readonly sent: { phone: IraqiPhone; code: string; locale: string }[] = [];
  async send(message: { phone: IraqiPhone; code: string; locale: string }): Promise<void> {
    this.sent.push({ ...message });
  }
  lastCodeFor(phone: string): string | undefined {
    return this.sent.findLast((m) => m.phone === phone)?.code;
  }
}

export class InMemoryEventBus implements EventBus {
  readonly published: DomainEvent[] = [];
  private handlers = new Map<string, Set<EventHandler>>();
  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    for (const h of this.handlers.get(event.name) ?? []) await h(event);
  }
  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): () => void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler as EventHandler);
    this.handlers.set(name, set);
    return () => set.delete(handler as EventHandler);
  }
}

/** Holds per-user rows in memory and records erase calls, for testing callers of UserDataEraser. */
export class InMemoryUserDataEraser implements UserDataEraser {
  readonly erased: UserId[] = [];
  readonly rows = new Map<UserId, unknown[]>();
  constructor(readonly module = 'fake') {}
  async erase(userId: UserId): Promise<void> {
    this.erased.push(userId);
    this.rows.delete(userId);
  }
}


const KIND_ORDER = { place: 0, street: 1, area: 2 } as const;
type Row = PlaceImportRecord & { city: CityId };

/** In-memory PlacesQueryPort: substring match on normalized names, ranked by exact > prefix > contains, then distance, then kind. */
export class FakePlacesQueryPort implements PlacesQueryPort {
  private readonly rows = new Map<string, Row>();

  /** Upserts by id, like the real import. */
  seed(city: CityImportRecord, records: readonly PlaceImportRecord[]): void {
    for (const r of records) this.rows.set(r.id, { ...r, city: city.id });
  }

  async search(q: SearchQuery): Promise<PlaceSummary[]> {
    const needle = normalizeArabic(q.q).toLowerCase();
    const score = (r: Row) => Math.max(...Object.values(r.names).map((n) => normalizeArabic(n).toLowerCase()).map((n) => (n === needle ? 3 : n.startsWith(needle) ? 2 : n.includes(needle) ? 1 : 0)));
    const hits = this.inCity(q.city).map((r) => ({ r, s: score(r), d: q.near ? haversineM(q.near, r.location) : 0 }));
    return hits
      .filter((h) => h.s > 0)
      .sort((a, b) => b.s - a.s || a.d - b.d || KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind])
      .slice(0, q.limit)
      .map((h) => this.summary(h.r, q.near ? h.d : null));
  }

  async getById(id: PlaceId): Promise<PlaceDetails | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    const { distanceM: _, ...summary } = this.summary(r, null);
    const { opening_hours, phone, website } = r.tags;
    return {
      ...summary,
      hoursRaw: opening_hours ?? null,
      osmContacts: { phone, website: website && /^https?:\/\//.test(website) ? website : undefined },
      source: 'osm',
      attribution: OSM_ATTRIBUTION,
    };
  }

  async nearby(q: NearbyQuery): Promise<PlaceSummary[]> {
    return this.inCity(q.city)
      .filter((r) => r.kind === 'place' && (!q.category || r.category === q.category))
      .map((r) => ({ r, d: haversineM(q.near, r.location) }))
      .filter((h) => h.d <= q.radiusM)
      .sort((a, b) => a.d - b.d)
      .slice(0, q.limit)
      .map((h) => this.summary(h.r, h.d));
  }

  private inCity(city: CityId): Row[] {
    return [...this.rows.values()].filter((r) => r.city === city);
  }

  /** `area` is the nearest area record within 3 km. */
  private summary(r: Row, d: number | null): PlaceSummary {
    const area = r.kind === 'area' ? undefined : this.inCity(r.city).filter((a) => a.kind === 'area' && haversineM(a.location, r.location) <= 3000).sort((a, b) => haversineM(a.location, r.location) - haversineM(b.location, r.location))[0];
    return { id: r.id as PlaceId, kind: r.kind, names: r.names, category: r.category, area: area?.names ?? null, location: r.location, distanceM: d };
  }
}
