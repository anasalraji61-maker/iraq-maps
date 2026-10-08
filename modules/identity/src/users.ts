import { randomUUID } from 'node:crypto';
import {
  IraqiPhone,
  UserId,
  type Clock,
  type DomainEvent,
  type EventName,
  type EventPayload,
  type Locale,
  type Me,
  type OutboxPublisher,
  type Role,
  type UserDataEraser,
} from '@iraq-maps/contracts';
import type { Db, DbTx } from '@iraq-maps/db-kit';
import type { Logger } from '@iraq-maps/observability';
import { eq, sql } from 'drizzle-orm';
import { encrypt, mac } from './crypto';
import { users } from './schema';

const profile = { id: users.id, name: users.name, locale: users.locale, roles: users.roles, createdAt: users.createdAt };
export type Profile = { id: UserId; name: string | null; locale: Locale; roles: Role[]; createdAt: Date };

export const toMe = (user: Profile): Me => ({ ...user, createdAt: user.createdAt.toISOString() });

const deleteUser = async (db: Db | DbTx, id: UserId) =>
  (await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })).length > 0;

/** identity's own UserDataEraser (sessions cascade). DELETE /v1/me already runs it, so it is not bound with the others. */
export const identityEraser = (db: Db): UserDataEraser => ({ module: 'identity', erase: async (id) => void (await deleteUser(db, id)) });

export class Users {
  constructor(
    private readonly db: Db,
    private readonly keys: { PHONE_ENCRYPTION_KEY: Buffer; PHONE_HASH_KEY: string },
    private readonly clock: Clock,
    private readonly outbox: OutboxPublisher<DbTx>,
    private readonly erasers: UserDataEraser[],
    private readonly log: Logger,
  ) {}

  /** Finds the user by phone, or registers them and writes identity.user.registered.v1 in the same transaction. */
  login(phone: IraqiPhone, locale: Locale): Promise<{ user: Profile; isNewUser: boolean }> {
    const phoneHash = mac(this.keys.PHONE_HASH_KEY, phone);
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ id: randomUUID() as UserId, phoneHash, phoneEnc: encrypt(this.keys.PHONE_ENCRYPTION_KEY, phone), locale, roles: ['user'], createdAt: this.clock.now() })
        .onConflictDoNothing({ target: users.phoneHash })
        .returning(profile);
      if (!created) return { user: (await tx.select(profile).from(users).where(eq(users.phoneHash, phoneHash)))[0]!, isNewUser: false };
      await this.outbox.publish(this.event('identity.user.registered.v1', { userId: created.id, locale }), tx);
      this.log.info({ userId: created.id }, 'user registered');
      return { user: created, isNewUser: true };
    });
  }

  async get(id: UserId): Promise<Profile | null> {
    const [user] = await this.db.select(profile).from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async update(id: UserId, patch: { name?: string; locale?: Locale }): Promise<Profile | null> {
    if (!Object.keys(patch).length) return this.get(id);
    const [user] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning(profile);
    return user ?? null;
  }

  /** Every bound eraser first (a failure keeps the account so the client can retry), then identity's rows and the event, atomically. */
  async remove(id: UserId): Promise<void> {
    for (const eraser of this.erasers) await eraser.erase(id);
    await this.db.transaction(async (tx) => {
      if (await deleteUser(tx, id)) await this.outbox.publish(this.event('identity.user.deleted.v1', { userId: id }), tx);
    });
    this.log.info({ userId: id }, 'user deleted');
  }

  private event<N extends EventName>(name: N, payload: EventPayload<N>): DomainEvent<N> {
    return { id: randomUUID(), name, occurredAt: this.clock.now().toISOString(), payload } as DomainEvent<N>;
  }
}

/** Adds `role` to the user found by id or by E.164 phone (idempotent). Returns false when there is no such user. */
export async function grantRole(db: Db, phoneHashKey: string, who: string, role: Role): Promise<boolean> {
  const target = IraqiPhone.safeParse(who).success ? eq(users.phoneHash, mac(phoneHashKey, who)) : eq(users.id, UserId.parse(who));
  const updated = await db
    .update(users)
    .set({ roles: sql`array_append(array_remove(${users.roles}, ${role}), ${role})` })
    .where(target)
    .returning({ id: users.id });
  return updated.length > 0;
}
