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

  describe('schema boundary', () => {
    beforeAll(async () => {
      await runModuleMigrations({ url: tdb.url, schema: 'places', migrationsDir: migrationsDir({ '0001.sql': 'CREATE TABLE p (id int);' }) });
      await runModuleMigrations({ url: tdb.url, schema: 'victim', migrationsDir: migrationsDir({ '0001.sql': 'CREATE TABLE t (id int);' }) });
    });

    it.each([
      // security audit M0 round 1: each of these was applied before the fix
      ['DROP SCHEMA places CASCADE;', 'SCHEMA'],
      ['CREATE TABLE t (id int); ALTER TABLE t SET SCHEMA places;', 'SCHEMA'],
      ['GRANT ALL ON ALL TABLES IN SCHEMA places TO PUBLIC;', 'SCHEMA'],
      ["SELECT set_config('search_path', 'places', true); CREATE TABLE pwn (id int);", 'set_config'],
      ["DO $$ BEGIN EXECUTE 'CREATE TABLE ' || 'places' || '.pwn (id int)'; END $$;", '$'],
      ["SELECT E'\\''; CREATE TABLE places.pwn (id int);", "E'"],
      ["SELECT $q$ ' $q$; CREATE TABLE places.pwn (id int);", '$'],
      // security audit M0 round 1, second auditor (M8)
      ['CREATE SCHEMA places;', 'SCHEMA'],
      ["DO $$ EXECUTE 'CREATE TABLE victim.planted' $$;", '$'],
      ['CREATE TABLE x (id int); ALTER TABLE x SET SCHEMA victim;', 'SCHEMA'],
      ['DROP SCHEMA victim CASCADE;', 'SCHEMA'],
      // further variants
      ['CREATE TABLE other.t (id int);', 'other.'],
      ['CREATE TABLE t (id int REFERENCES "places"."p" (id));', '"places".'],
      ['CREATE TABLE public.t (id int);', 'public.'],
      ['SET search_path TO places; CREATE TABLE pwn (id int);', 'search_path'],
      ['RESET ALL; CREATE TABLE pwn (id int);', 'RESET'],
      ["DO 'BEGIN DROP TABLE p; END';", 'DO'],
      ["CREATE FUNCTION f() RETURNS void LANGUAGE sql AS 'DROP TABLE places.p'; SELECT f();", 'places.'],
      ["CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS 'BEGIN EXECUTE ''DROP TABLE pla'' || ''ces.p''; END'; SELECT f();", 'EXECUTE'],
      ['DROP OWNED BY CURRENT_USER;', 'DROP OWNED'],
      ['CREATE TABLE places/* x */./* y */pwn (id int);', 'places.'],
      ['CREATE TABLE "x\'" (id int); SELECT \'--\'; DROP TABLE places.p;', 'places.'],
      ['SELECT 1; -- line comment ended by CR\rDROP TABLE places.p;', 'places.'],
      ['CREATE TABLE U&"\\0070laces".pwn (id int);', 'U&'],
      // security audit M0 round 2 (R2-1)
      ["UPDATE pg_settings SET setting = 'places' WHERE name LIKE 'search%'; CREATE TABLE pwn (id int);", 'pg_settings'],
      ["UPDATE pg_settings SET setting = 'places' WHERE name LIKE 'search%'; DROP TABLE p;", 'pg_settings'],
      [
        "CREATE FUNCTION f() RETURNS void LANGUAGE sql AS 'UPDATE pg_settings SET setting = ''places'' WHERE name LIKE ''search%'''; SELECT f(); CREATE TABLE pwn (id int);",
        'pg_settings',
      ],
      ['UPDATE U&"pg\\005fsettings" SET setting = \'places\' WHERE name LIKE \'search%\'; CREATE TABLE pwn (id int);', 'U&'],
      ['ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC;', 'DEFAULT PRIVILEGES'],
      ['ALTER DEFAULT/* x */PRIVILEGES GRANT ALL ON TABLES TO PUBLIC;', 'PRIVILEGES'],
      ['CREATE EXTENSION IF NOT EXISTS hstore;', 'CREATE EXTENSION'],
      ['DROP EXTENSION pg_trgm CASCADE;', 'DROP EXTENSION'],
    ])('rejects %j and applies nothing', async (bad, violation) => {
      const dir = migrationsDir({ '0001_ok.sql': 'CREATE TABLE ok (id int);', '0002_bad.sql': bad });
      const run = runModuleMigrations({ url: tdb.url, schema: 'beta', migrationsDir: dir });
      await expect(run).rejects.toThrow('0002_bad.sql of schema beta breaks the schema boundary');
      await expect(run).rejects.toThrow(violation);
      const effects = `SELECT to_regclass('places.p')::text AS p, to_regclass('victim.t')::text AS t, to_regnamespace('beta') AS beta,
        (SELECT count(*)::int FROM pg_class WHERE relname IN ('pwn', 'planted')) AS planted`;
      expect(await rows(tdb, effects)).toEqual([{ p: 'places.p', t: 'victim.t', beta: null, planted: 0 }]);
    });

    it('accepts ordinary DDL and DML, extension types from public, and ignores rejected words inside comments', async () => {
      const dir = migrationsDir({
        '0001_notes.sql': `-- Comments may say e.g. other.table, DROP SCHEMA x, DO or EXECUTE.
          /* block comment: public.x */
          CREATE TABLE notes (id int PRIMARY KEY, body text DEFAULT 'it''s fine', ratio numeric DEFAULT 1.5, share numeric DEFAULT .5, extension text, geom geometry(Point, 4326));
          ALTER TABLE gamma.notes ALTER COLUMN body SET NOT NULL;
          CREATE INDEX notes_body_trgm ON gamma.notes USING gin (body gin_trgm_ops);
          INSERT INTO notes (id) VALUES (1) ON CONFLICT DO NOTHING;
          UPDATE notes SET ratio = 2.0 WHERE id = 1;`,
      });
      await runModuleMigrations({ url: tdb.url, schema: 'gamma', migrationsDir: dir });
      expect(await rows(tdb, 'SELECT id, body, ratio, share FROM gamma.notes')).toEqual([{ id: 1, body: "it's fine", ratio: '2.0', share: '0.5' }]);
    });
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
