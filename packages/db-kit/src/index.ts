export { createDb, type Db, type DbTx } from './db';
export { writeAdminAuditLog } from './audit';
export { ensureExtensions, platformMigrationsDir, runModuleMigrations } from './migrations';
export { createInProcessEventBus, createOutboxPublisher, startOutboxRelay, type OutboxRelay } from './outbox';
export { createTestDatabase, type TestDatabase } from './test-database';
export { QueryBuilder, type PaginationResult, type NearbyResult, type BulkInsertResult, type UpsertResult, type SoftDeleteResult, type SearchResult, type Locale } from './query-builder';
export { ConnectionPool, type ConnectionPoolOptions, type PoolHealthResult } from './connection-pool';
export { SchemaVersionManager, type MigrationRecord, type SchemaStatus } from './schema-version-manager';
export { DatabaseMetrics, type QueryMetric, type QueryStats } from './database-metrics';
