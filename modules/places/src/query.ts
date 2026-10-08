import {
  OSM_ATTRIBUTION,
  PlaceDetails,
  type CityImportRecord,
  type LngLat,
  type NearbyQuery,
  type PlaceId,
  type PlacesQueryPort,
  type PlaceSummary,
  type SearchQuery,
} from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { normalizeArabic } from '@iraq-maps/i18n';
import { sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';

type Row = Omit<PlaceSummary, 'location' | 'distanceM'> & { lng: number; lat: number; distance_m: number | null };
type DetailsRow = Row & { opening_hours: string | null; phone: string | null; website: string | null };

const point = ([lng, lat]: LngLat) => sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;
const select = (distance: SQL) =>
  sql`SELECT id, kind, names, category, area_names AS area, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat, ${distance} AS distance_m`;
const summary = ({ id, kind, names, category, area, lng, lat, distance_m }: Row): PlaceSummary => ({
  id,
  kind,
  names,
  category,
  area,
  location: [lng, lat],
  distanceM: distance_m,
});
const contacts = PlaceDetails.shape.osmContacts.shape;
/** OSM tags are free text: one that does not fit the response contract (e.g. a website without http) is left out. */
const valid = (schema: z.ZodTypeAny, value: string | null) => (value !== null && schema.safeParse(value).success ? value : undefined);

/**
 * Ranking: trigram word similarity of the normalized query (0..1), plus up to 0.3 for proximity to `near`
 * (0.3 at 0 m, 0.11 at 3 km, ~0 beyond 10 km), plus a small kind weight (place, then street, then area).
 */
const RANK = sql`sim + CASE kind WHEN 'place' THEN 0.04 WHEN 'street' THEN 0.02 ELSE 0 END + COALESCE(0.3 * exp(-distance_m / 3000), 0)`;

/** PlacesQueryPort over the places.osm_features table (pg_trgm + PostGIS); every value reaches SQL as a bind parameter. */
export class PgPlaces implements PlacesQueryPort {
  constructor(private readonly db: Db) {}

  async search({ q, city, near, limit }: SearchQuery): Promise<PlaceSummary[]> {
    const needle = normalizeArabic(q);
    if (!needle) return [];
    const { rows } = await this.db.execute<Row>(sql`
      SELECT * FROM (
        ${select(near ? sql`ST_Distance(location, ${point(near)})` : sql`NULL::float8`)}, word_similarity(${needle}, search_text) AS sim
        FROM places.osm_features WHERE city_id = ${city} AND ${needle} <% search_text
      ) AS hits
      ORDER BY ${RANK} DESC, id LIMIT ${limit}`);
    return rows.map(summary);
  }

  async nearby({ city, near, radiusM, category, limit }: NearbyQuery): Promise<PlaceSummary[]> {
    const { rows } = await this.db.execute<Row>(sql`
      ${select(sql`ST_Distance(location, ${point(near)})`)} FROM places.osm_features
      WHERE city_id = ${city} AND kind = 'place' AND ST_DWithin(location, ${point(near)}, ${radiusM})
        ${category ? sql`AND category = ${category}` : sql``}
      ORDER BY distance_m, id LIMIT ${limit}`);
    return rows.map(summary);
  }

  async getById(id: PlaceId): Promise<PlaceDetails | null> {
    const { rows } = await this.db.execute<DetailsRow>(sql`${select(sql`NULL::float8`)}, opening_hours, phone, website FROM places.osm_features WHERE id = ${id}`);
    const row = rows[0];
    if (!row) return null;
    const { distanceM: _, ...place } = summary(row);
    return {
      ...place,
      hoursRaw: row.opening_hours,
      osmContacts: { phone: valid(contacts.phone, row.phone), website: valid(contacts.website, row.website) },
      source: 'osm',
      attribution: OSM_ATTRIBUTION,
    };
  }

  async hasCity(id: string): Promise<boolean> {
    return (await this.db.execute(sql`SELECT 1 FROM places.cities WHERE id = ${id}`)).rows.length > 0;
  }

  async listCities(): Promise<CityImportRecord[]> {
    const { rows } = await this.db.execute<CityImportRecord>(sql`SELECT id, names, bbox, center FROM places.cities ORDER BY id`);
    return rows;
  }
}
