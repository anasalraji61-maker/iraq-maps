import { Locale, Role, type UserId } from '@iraq-maps/contracts';
import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
