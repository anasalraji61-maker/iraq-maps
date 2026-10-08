import { defineConfig } from 'vitest/config';

// Shared Vitest preset. DB/Redis tests run against local PostgreSQL 16 + PostGIS and redis-server (no Testcontainers).
/** @public imported as `@iraq-maps/tooling/vitest` */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/fixtures/**'],
    passWithNoTests: true,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
