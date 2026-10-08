import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, runModuleMigrations, type TestDatabase } from './index';

const dirs: string[] = [];
const migrationsDir = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'db-kit-migrations-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  dirs.push(dir);
  return dir;
};
const rows = async (tdb: TestDatabase, query: string) => (await tdb.db.execute(sql.raw(query))).rows;

let tdb: TestDatabase;
beforeAll(async () => {
  tdb = await createTestDatabase();
});
afterAll(async () => {
  await tdb.drop();
  for (const dir of dirs) rmSync(dir, { recursive: true });
});

describe('runModuleMigrations', () => {
  it('creates the schema and applies the ordered .sql files once, tracked per schema', async () => {
    const dir = migrationsDir({
      '0002_label.sql': 'ALTER TABLE alpha.things ADD COLUMN label text;',
      '0001_things.sql': 'CREATE TABLE things (id int PRIMARY KEY); -- lands in schema alpha',
      'README.md': 'not a migration',
    });
    await runModuleMigrations({ url: tdb.url, schema: 'alpha', migrationsDir: dir });
    await runModuleMigrations({ url: tdb.url, schema: 'alpha', migrationsDir: dir }); // re-running CREATE TABLE would throw
    expect(await rows(tdb, 'SELECT name FROM alpha._migrations ORDER BY name')).toEqual([{ name: '0001_things.sql' }, { name: '0002_label.sql' }]);
    expect(await rows(tdb, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'alpha' AND table_name = 'things' ORDER BY 1")).toEqual([
      { column_name: 'id' },
      { column_name: 'label' },
    ]);
  });

  it.each([
    ['CREATE TABLE other.t (id int);', /other/],
    ['CREATE TABLE t (id int REFERENCES "alpha"."things" (id));', /alpha/],
    ['CREATE TABLE public.t (id int);', /public/],
    ['SET search_path TO other; CREATE TABLE t (id int);', /search_path/],
  ])('rejects a migration that touches another schema and applies nothing: %s', async (bad, named) => {
    const dir = migrationsDir({ '0001_ok.sql': 'CREATE TABLE ok (id int);', '0002_bad.sql': bad });
    const run = runModuleMigrations({ url: tdb.url, schema: 'beta', migrationsDir: dir });
    await expect(run).rejects.toThrow(/0002_bad\.sql of schema beta references another schema/);
    await expect(run).rejects.toThrow(named);
    expect(await rows(tdb, "SELECT 1 FROM pg_namespace WHERE nspname = 'beta'")).toEqual([]);
  });

  it('ignores schema-like text inside comments and string literals', async () => {
    const dir = migrationsDir({
      '0001_notes.sql': "/* other.table */ CREATE TABLE notes (body text DEFAULT 'see other.table', n numeric DEFAULT 1.5); -- public.x",
    });
    await runModuleMigrations({ url: tdb.url, schema: 'gamma', migrationsDir: dir });
    expect(await rows(tdb, "SELECT to_regclass('gamma.notes')::text AS t")).toEqual([{ t: 'gamma.notes' }]);
  });

  it('rejects an invalid schema name', async () => {
    await expect(runModuleMigrations({ url: tdb.url, schema: 'Bad;Name', migrationsDir: migrationsDir({}) })).rejects.toThrow('invalid schema name');
  });
});

describe('createTestDatabase', () => {
  it('clones isolated databases with postgis, pg_trgm, the platform outbox and the given module migrations', async () => {
    const dir = migrationsDir({ '0001_items.sql': 'CREATE TABLE items (id int PRIMARY KEY, geom geometry(Point, 4326));' });
    const [a, b] = await Promise.all([createTestDatabase({ modules: [{ schema: 'delta', migrationsDir: dir }] }), createTestDatabase()]);
    expect(a.url).not.toBe(b.url);
    expect(await rows(a, "SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pg_trgm') ORDER BY 1")).toEqual([
      { extname: 'pg_trgm' },
      { extname: 'postgis' },
    ]);
    expect(await rows(a, "SELECT ST_AsText(ST_MakePoint(44, 36)) AS p, similarity('اربيل', 'أربيل') > 0 AS similar")).toEqual([{ p: 'POINT(44 36)', similar: true }]);
    const tables = "SELECT to_regclass('platform.outbox')::text AS outbox, to_regclass('delta.items')::text AS items";
    expect(await rows(a, tables)).toEqual([{ outbox: 'platform.outbox', items: 'delta.items' }]);
    expect(await rows(b, tables)).toEqual([{ outbox: 'platform.outbox', items: null }]);

    const name = new URL(a.url).pathname.slice(1);
    await a.drop();
    expect(await rows(b, `SELECT 1 FROM pg_database WHERE datname = '${name}'`)).toEqual([]);
    await b.drop();
  });
});
