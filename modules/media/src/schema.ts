import { pgEnum, pgSchema, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const mediaSchema = pgSchema('media');

export const assetStatusEnum = mediaSchema.enum('asset_status', ['pending', 'processing', 'ready', 'failed']);
export const assetPurposeEnum = mediaSchema.enum('asset_purpose', ['provider_photo']);
export const assetMimeEnum = mediaSchema.enum('asset_mime', ['image/jpeg', 'image/png', 'image/webp']);

export const assetTable = mediaSchema.table('asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  purpose: assetPurposeEnum('purpose').notNull(),
  mime: assetMimeEnum('mime').notNull(),
  storageKey: varchar('storage_key', { length: 128 }).unique(),
  sizeBytes: integer('size_bytes').notNull(),
  status: assetStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export type AssetRow = typeof assetTable.$inferSelect;
export type NewAssetRow = typeof assetTable.$inferInsert;
