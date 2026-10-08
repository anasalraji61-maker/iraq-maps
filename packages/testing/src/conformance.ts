import { randomUUID } from 'node:crypto';
import type { DomainEvent, EventBus, IraqiPhone, OtpSender, UserDataEraser, UserId } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';

/** Conformance suites: the fake and every real implementation of a port must pass the same suite. */

export function otpSenderConformance(name: string, make: () => OtpSender | Promise<OtpSender>): void {
  describe(`OtpSender conformance: ${name}`, () => {
    it('sends to an Iraqi E.164 number without throwing', async () => {
      const sender = await make();
      await expect(sender.send({ phone: '+9647701234567' as IraqiPhone, code: '123456', locale: 'ar' })).resolves.toBeUndefined();
    });
    it('declares its kind', async () => {
      expect(['fake', 'fixed', 'console', 'sms']).toContain((await make()).kind);
    });
  });
}

export const testUserDeleted = (userId = randomUUID()): DomainEvent<'identity.user.deleted.v1'> => ({
  id: randomUUID(),
  name: 'identity.user.deleted.v1',
  occurredAt: new Date().toISOString(),
  payload: { userId: userId as UserId },
});

export function eventBusConformance(name: string, make: () => EventBus | Promise<EventBus>): void {
  describe(`EventBus conformance: ${name}`, () => {
    it('delivers to subscribers of that event name only, and stops after unsubscribe', async () => {
      const bus = await make();
      const got: DomainEvent[] = [];
      const other: DomainEvent[] = [];
      const off = bus.subscribe('identity.user.deleted.v1', (e) => void got.push(e));
      bus.subscribe('identity.user.registered.v1', (e) => void other.push(e));
      const e1 = testUserDeleted();
      await bus.publish(e1);
      await expect.poll(() => got.length).toBe(1);
      expect(got[0]).toEqual(e1);
      off();
      await bus.publish(testUserDeleted());
      await new Promise((r) => setTimeout(r, 50));
      expect(got).toHaveLength(1);
      expect(other).toHaveLength(0);
    });
  });
}

export interface EraserHarness {
  eraser: UserDataEraser;
  /** Store some data owned by this user in the module under test. */
  seed(userId: UserId): Promise<void>;
  /** Whether any data owned by this user is still stored. */
  hasData(userId: UserId): Promise<boolean>;
}

export function userDataEraserConformance(name: string, make: () => EraserHarness | Promise<EraserHarness>): void {
  describe(`UserDataEraser conformance: ${name}`, () => {
    it('erases only the given user, and is idempotent', async () => {
      const h = await make();
      const [a, b] = [randomUUID() as UserId, randomUUID() as UserId];
      await h.seed(a);
      await h.seed(b);
      await h.eraser.erase(a);
      expect(await h.hasData(a)).toBe(false);
      expect(await h.hasData(b)).toBe(true);
      await expect(h.eraser.erase(a)).resolves.toBeUndefined();
    });
    it('names its module', async () => {
      expect((await make()).eraser.module).toMatch(/^[a-z][a-z0-9-]*$/);
    });
  });
}
