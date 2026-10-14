import { type UserId } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { Queue } from 'bullmq';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMessagingChannel } from './fake-channel';
import { deliveryTable, inquiryTable, providerOptOutTable } from './schema';
import { MessagingService } from './messaging.service';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

describe.skipIf(!TEST_DB_URL)('MessagingService', () => {
  let testDb: TestDatabase;
  let svc: MessagingService;
  let fakeQueue: Queue;

  beforeAll(async () => {
    testDb = await createTestDatabase({
      modules: [{ schema: 'messaging', migrationsDir: MIGRATIONS_DIR }],
    });
  });

  afterAll(async () => {
    await testDb.drop();
  });

  beforeEach(async () => {
    await testDb.db.delete(providerOptOutTable);
    await testDb.db.delete(deliveryTable);
    await testDb.db.delete(inquiryTable);

    fakeQueue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
    const channel = new FakeMessagingChannel();
    const fakeEventBus = { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };

    svc = new MessagingService(testDb.db as never, channel, fakeQueue, fakeEventBus as never);
  });

  const uid = (n = 1) => `00000000-0000-0000-0000-00000000000${n}` as UserId;
  const pid = (n = 1) => `place-${n}`;

  it('enforces daily limit', async () => {
    const origEnv = process.env['MESSAGING_DAILY_LIMIT_PER_USER'];
    process.env['MESSAGING_DAILY_LIMIT_PER_USER'] = '2';

    try {
      const userId = uid(1);
      await svc.createInquiry(userId, 'test 1', [pid(1) as never], `00000000-0000-0000-0000-000000000010`);
      await svc.createInquiry(userId, 'test 2', [pid(2) as never], `00000000-0000-0000-0000-000000000011`);

      await expect(
        svc.createInquiry(userId, 'test 3', [pid(3) as never], `00000000-0000-0000-0000-000000000012`),
      ).rejects.toMatchObject({ status: 429 });
    } finally {
      process.env['MESSAGING_DAILY_LIMIT_PER_USER'] = origEnv;
    }
  });

  it('returns same result for duplicate idempotency key', async () => {
    const userId = uid(2);
    const key = `00000000-0000-0000-0000-000000000020`;
    const first = await svc.createInquiry(userId, 'hello', [pid(1) as never], key);
    const second = await svc.createInquiry(userId, 'different text', [pid(2) as never], key);
    expect(first.id).toBe(second.id);
  });

  it('rejects more than 5 places', async () => {
    const userId = uid(3);
    const places = [pid(1), pid(2), pid(3), pid(4), pid(5), pid(6)] as never[];
    await expect(
      svc.createInquiry(userId, 'test', places, `00000000-0000-0000-0000-000000000030`),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('skips opted-out providers', async () => {
    const userId = uid(4);
    const placeId = pid(4);
    await svc.providerOptOut(placeId);

    const inquiry = await svc.createInquiry(userId, 'test', [placeId as never], `00000000-0000-0000-0000-000000000040`);
    expect(inquiry.targets[0]?.status).toBe('failed');
    expect(fakeQueue.add).not.toHaveBeenCalled();
  });

  it('eraseUserData clears all user data', async () => {
    const userId = uid(5);
    await svc.createInquiry(userId, 'eraseme', [pid(1) as never], `00000000-0000-0000-0000-000000000050`);

    await svc.erase(userId);

    const remaining = await testDb.db.select().from(inquiryTable);
    const userInquiries = remaining.filter((r) => r.userId === userId);
    expect(userInquiries).toHaveLength(0);
  });
});
