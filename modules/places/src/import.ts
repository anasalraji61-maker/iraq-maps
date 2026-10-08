import { readFile } from 'node:fs/promises';
import { CityImportRecord, PlaceImportRecord, type PlaceKind } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { normalizeArabic } from '@iraq-maps/i18n';
import { sql } from 'drizzle-orm';

/** The Arabic article, dropped in an extra indexed variant so that كرخ finds الكرخ (trigram similarity alone is 0.5). */
const ARTICLE = /(^|\s)ال(?=\S\S)/g;

/** What the GIN trigram index covers: every name through the shared normalizer, plus article-less variants. */
const searchText = (names: PlaceImportRecord['names']): string =>
  [...new Set(Object.values(names).map(normalizeArabic).flatMap((n) => [n, n.replace(ARTICLE, '$1')]))].join(' ');

const BATCH = 5000;
const parseJson = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/**
 * Replaces one city's rows (CliContracts.placesImport) in a single transaction: upserts the city, deletes its old
 * features and any feature with an incoming id (so an element moves between overlapping cities, never duplicates),
 * inserts the records, then sets each place's and street's area to the nearest area within 3 km, and refreshes the
 * planner statistics. Re-running is a no-op.
 */
export async function importCity(db: Db, city: CityImportRecord, records: Iterable<PlaceImportRecord>): Promise<Record<PlaceKind, number>> {
  const byId = new Map([...records].map((r) => [r.id, r]));
  const rows = [...byId.values()].map((r) => ({
    id: r.id,
    kind: r.kind,
    category: r.category,
    names: r.names,
    search_text: searchText(r.names),
    lng: r.location[0],
    lat: r.location[1],
    ...r.tags,
  }));
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO places.cities (id, names, bbox, center)
      VALUES (${city.id}, ${JSON.stringify(city.names)}, ${JSON.stringify(city.bbox)}, ${JSON.stringify(city.center)})
      ON CONFLICT (id) DO UPDATE SET names = excluded.names, bbox = excluded.bbox, center = excluded.center`);
    await tx.execute(sql`DELETE FROM places.osm_features WHERE city_id = ${city.id} OR id = ANY(${sql.param([...byId.keys()])}::text[])`);
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.execute(sql`
        INSERT INTO places.osm_features (id, city_id, kind, category, names, search_text, location, opening_hours, phone, website)
        SELECT id, ${city.id}, kind, category, names, search_text, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, opening_hours, phone, website
        FROM jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + BATCH))}::jsonb) AS r(
          id text, kind text, category text, names jsonb, search_text text, lng float8, lat float8, opening_hours text, phone text, website text)`);
    }
    // Nearest area by KNN on the GiST index. It needs fresh statistics, and no distance filter inside the subquery:
    // either mistake turns it into a bbox scan plus sort per row (seconds per thousand rows).
    await tx.execute(sql`ANALYZE places.osm_features`);
    await tx.execute(sql`
      UPDATE places.osm_features AS f SET area_names = (
        SELECT CASE WHEN ST_DWithin(a.location, f.location, 3000) THEN a.names END FROM places.osm_features AS a
        WHERE a.city_id = f.city_id AND a.kind = 'area'
        ORDER BY a.location <-> f.location LIMIT 1)
      WHERE f.city_id = ${city.id} AND f.kind <> 'area'`);
  });
  // Flushes the GIN pending list and the dead rows of the replace, so the planner picks the trigram index right away.
  await db.execute(sql`VACUUM ANALYZE places.osm_features`);
  const counts = { place: 0, street: 0, area: 0 };
  for (const r of rows) counts[r.kind]++;
  return counts;
}

/**
 * Reads city.json and places.ndjson, validating every line with the frozen zod schemas, then runs importCity.
 * A bad line fails the whole import, naming its line number only.
 */
export async function importFiles(db: Db, files: { city: string; input: string }): Promise<Record<PlaceKind, number>> {
  const city = CityImportRecord.parse(JSON.parse(await readFile(files.city, 'utf8')));
  const lines = (await readFile(files.input, 'utf8')).split('\n');
  const records = lines.flatMap((line, i) => {
    if (!line.trim()) return [];
    const parsed = PlaceImportRecord.safeParse(parseJson(line));
    if (!parsed.success) throw new Error(`places import: line ${i + 1} is not a PlaceImportRecord`);
    return [parsed.data];
  });
  return importCity(db, city, records);
}
