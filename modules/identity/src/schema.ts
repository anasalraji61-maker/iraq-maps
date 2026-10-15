import { Locale, Role, type UserId } from '@iraq-maps/contracts';
import { bigserial, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const identity = pgSchema('identity');

export const users = identity.table('users', {
  id: uuid('id').$type<UserId>().primaryKey(),
  phoneHash: text('phone_hash').notNull().unique(),
  phoneEnc: text('phone_enc').notNull(),
  name: text('name'),
  locale: text('locale', { enum: Locale.options }).notNull(),
  roles: text('roles', { enum: Role.options }).array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const sessions = identity.table('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').$type<UserId>().notNull(),
  generation: integer('generation').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** Immutable log of every admin / moderator action. */
export const adminAuditLog = identity.table('admin_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminId: uuid('admin_id').$type<UserId>().notNull(),
  action: text('action').notNull(),
  targetId: text('target_id').notNull(),
  targetType: text('target_type').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
