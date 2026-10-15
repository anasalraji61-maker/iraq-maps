import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagingGroupsService } from './messaging-groups.service';
import { ForbiddenException, ConflictException } from '@nestjs/common';

const GROUP_ID = '10000000-0000-0000-0000-000000000001' as const;
const USER_A = '20000000-0000-0000-0000-000000000001' as const;
const USER_B = '20000000-0000-0000-0000-000000000002' as const;

function makeGroupRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: GROUP_ID,
    name: 'Test Group',
    createdBy: USER_A,
    avatarUrl: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDb(opts?: {
  groupRows?: ReturnType<typeof makeGroupRow>[];
  memberRows?: { groupId: string; userId: string; role: 'admin' | 'member'; joinedAt: Date }[];
  msgRows?: { id: string; groupId: string; senderId: string; text: string; createdAt: Date }[];
}) {
  const groupRows = opts?.groupRows ?? [makeGroupRow()];
  const memberRows = opts?.memberRows ?? [
    { groupId: GROUP_ID, userId: USER_A, role: 'admin' as const, joinedAt: new Date() },
  ];
  const msgRows = opts?.msgRows ?? [];

  const returning = vi.fn().mockResolvedValue(groupRows.slice(0, 1));
  const onConflictDoNothing = vi.fn().mockResolvedValue([]);
  const insertValues = vi.fn().mockReturnValue({ returning, onConflictDoNothing });
  const insertFn = vi.fn().mockReturnValue({ values: insertValues });

  const where = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(memberRows.filter((m) => m.userId === USER_A).slice(0, 1)),
    orderBy: vi.fn().mockResolvedValue(msgRows),
  });
  const orderBy = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(groupRows),
  });
  const selectFrom = vi.fn().mockReturnValue({ where, orderBy });
  const selectFn = vi.fn().mockReturnValue({ from: selectFrom });

  return { insert: insertFn, select: selectFn, _memberRows: memberRows };
}

function makeSvc(db: ReturnType<typeof makeDb>) {
  return new MessagingGroupsService(db as never);
}

describe('MessagingGroupsService', () => {
  it('createGroup returns a shaped group', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const group = await svc.createGroup(USER_A as never, 'My Group');
    expect(group.name).toBe('Test Group');
    expect(group.id).toBe(GROUP_ID);
  });

  it('sendGroupMessage throws ForbiddenException when not a member', async () => {
    const db = makeDb();
    // Override getMember to return null for USER_B
    const selectFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
    });
    db.select.mockReturnValueOnce({ from: selectFrom });
    const svc = makeSvc(db);
    await expect(svc.sendGroupMessage(USER_B as never, GROUP_ID as never, 'hello')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
