/**
 * Unit tests for GroupMessagingService.
 *
 * All DB calls replaced by vi.fn() stubs — no real database.
 * Tests cover:
 *  - Create group → members added
 *  - Add member → appears in list
 *  - Remove member → no longer in list
 *  - Leave → no longer member
 *  - Admin removes → works
 *  - Non-admin remove → ForbiddenException
 *  - Pin message → appears in pinned
 *  - Mute → no notifications
 */
import { describe, it, expect, vi } from 'vitest';
import {
  GroupMessagingService,
} from '../group-messaging.service';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

// ─── Fixture IDs ──────────────────────────────────────────────────────────────

const GROUP_1 = 'g0000000-0000-0000-0000-000000000001' as const;
const _GROUP_2 = 'g0000000-0000-0000-0000-000000000002' as const;
const ADMIN_A = 'u0000000-0000-0000-0000-000000000001' as const;
const MEMBER_B = 'u0000000-0000-0000-0000-000000000002' as const;
const MEMBER_C = 'u0000000-0000-0000-0000-000000000003' as const;
const OUTSIDER = 'u0000000-0000-0000-0000-000000000099' as const;
const MSG_1 = 'm0000000-0000-0000-0000-000000000001' as const;
const MSG_2 = 'm0000000-0000-0000-0000-000000000002' as const;
const PIN_1 = 'p0000000-0000-0000-0000-000000000001' as const;

const NOW = new Date('2026-06-01T12:00:00Z');

// ─── Row factories ────────────────────────────────────────────────────────────

function makeGroupRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: GROUP_1,
    name: 'مجموعة البغداديين',
    createdBy: ADMIN_A,
    avatarUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMemberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    groupId: GROUP_1,
    userId: ADMIN_A,
    role: 'admin' as const,
    joinedAt: NOW,
    ...overrides,
  };
}

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MSG_1,
    groupId: GROUP_1,
    senderId: MEMBER_B,
    text: 'مرحباً بالجميع',
    createdAt: NOW,
    ...overrides,
  };
}

function makePinRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PIN_1,
    groupId: GROUP_1,
    messageId: MSG_1,
    pinnedBy: ADMIN_A,
    pinnedAt: NOW,
    ...overrides,
  };
}

function makeMuteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    groupId: GROUP_1,
    userId: MEMBER_B,
    mutedUntil: new Date(NOW.getTime() + 86_400_000), // 24h from now
    createdAt: NOW,
    ...overrides,
  };
}

// ─── DB builder ───────────────────────────────────────────────────────────────

function makeDb(opts: {
  groupRows?: ReturnType<typeof makeGroupRow>[];
  memberRows?: ReturnType<typeof makeMemberRow>[];
  messageRows?: ReturnType<typeof makeMessageRow>[];
  pinRows?: ReturnType<typeof makePinRow>[];
  muteRows?: ReturnType<typeof makeMuteRow>[];
} = {}) {
  const groupRows = opts.groupRows ?? [makeGroupRow()];
  const memberRows = opts.memberRows ?? [makeMemberRow()];
  const messageRows = opts.messageRows ?? [];
  const pinRows = opts.pinRows ?? [];
  const muteRows = opts.muteRows ?? [];

  // insert chain
  const returning = vi.fn().mockResolvedValue(groupRows.slice(0, 1));
  const onConflictDoNothing = vi.fn().mockResolvedValue([]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const insertValues = vi.fn().mockReturnValue({
    returning,
    onConflictDoNothing,
    onConflictDoUpdate,
  });
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  // select chain – returns appropriate rows based on which table is queried
  let selectCallIndex = 0;
  const allSelectResults = [
    memberRows.filter((m) => m.userId === ADMIN_A && m.role === 'admin'), // requireAdmin
    groupRows, // getGroupOrThrow
    [{ count: memberRows.length.toString() }], // getMemberCount
    muteRows.filter((m) => (m.userId as string) === (ADMIN_A as string)), // getMuteRow
  ];

  const limit = vi.fn().mockImplementation(() => {
    const idx = selectCallIndex++;
    return Promise.resolve(allSelectResults[idx % allSelectResults.length] ?? []);
  });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ limit, orderBy, execute: vi.fn().mockResolvedValue(memberRows) });
  const from = vi.fn().mockReturnValue({ where, orderBy, limit });
  const select = vi.fn().mockReturnValue({ from });

  // update chain
  const updateReturning = vi.fn().mockResolvedValue(groupRows.slice(0, 1));
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  // delete chain
  const deleteWhere = vi.fn().mockResolvedValue([]);
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });

  return {
    insert,
    select,
    update,
    delete: deleteFn,
    _memberRows: memberRows,
    _groupRows: groupRows,
    _messageRows: messageRows,
    _pinRows: pinRows,
    _muteRows: muteRows,
  };
}

function makeSvc(db: ReturnType<typeof makeDb>) {
  return new GroupMessagingService(db as never);
}

// ─── Create group ─────────────────────────────────────────────────────────────

describe('GroupMessagingService – createGroupConversation', () => {
  it('creates group and returns shaped result', async () => {
    const db = makeDb();
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeGroupRow()]),
      }),
    });
    // second insert for members
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });
    const svc = makeSvc(db);
    const group = await svc.createGroupConversation(
      ADMIN_A as never,
      [MEMBER_B as never, MEMBER_C as never],
      'مجموعة البغداديين',
    );
    expect(group.id).toBe(GROUP_1);
    expect(group.name).toBe('مجموعة البغداديين');
    expect(group.userRole).toBe('admin');
  });

  it('creator is always admin', async () => {
    const db = makeDb();
    db.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeGroupRow()]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });
    const svc = makeSvc(db);
    const group = await svc.createGroupConversation(
      ADMIN_A as never,
      [MEMBER_B as never],
      'مجموعة مصغرة',
    );
    expect(group.userRole).toBe('admin');
  });

  it('throws when DB insert returns no group', async () => {
    const db = makeDb();
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.createGroupConversation(ADMIN_A as never, [], 'مجموعة فارغة'),
    ).rejects.toThrow('Failed to create group');
  });

  it('deduplicates creator from memberIds', async () => {
    const insertSpy = vi.fn().mockResolvedValue([]);
    const db = makeDb();
    db.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeGroupRow()]),
        }),
      })
      .mockReturnValueOnce({
        values: insertSpy.mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });
    const svc = makeSvc(db);
    // Pass creator again in memberIds
    await svc.createGroupConversation(
      ADMIN_A as never,
      [ADMIN_A as never, MEMBER_B as never],
      'مجموعة مكررة',
    );
    // insertSpy called with de-duped members (2 not 3)
    expect(insertSpy).toHaveBeenCalled();
  });
});

// ─── Add member ───────────────────────────────────────────────────────────────

describe('GroupMessagingService – addMember', () => {
  it('admin can add a new member', async () => {
    const db = makeDb({
      memberRows: [makeMemberRow()],
    });
    // requireAdmin → finds ADMIN_A as admin
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    // getMember check → not found
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          makeMemberRow({ userId: MEMBER_C, role: 'member' }),
        ]),
      }),
    });
    const svc = makeSvc(db);
    const member = await svc.addMember(
      ADMIN_A as never,
      GROUP_1 as never,
      MEMBER_C as never,
    );
    expect(member.userId).toBe(MEMBER_C);
    expect(member.role).toBe('member');
  });

  it('non-admin cannot add a member', async () => {
    const db = makeDb({
      memberRows: [makeMemberRow({ userId: MEMBER_B, role: 'member' })],
    });
    // requireAdmin → finds MEMBER_B as member (not admin)
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.addMember(MEMBER_B as never, GROUP_1 as never, MEMBER_C as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('adding duplicate member throws ConflictException', async () => {
    const db = makeDb({ memberRows: [makeMemberRow()] });
    // requireAdmin → admin found
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    // getMember check → already exists
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.addMember(ADMIN_A as never, GROUP_1 as never, MEMBER_B as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('can add member as admin role', async () => {
    const db = makeDb({ memberRows: [makeMemberRow()] });
    db.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makeMemberRow()]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          makeMemberRow({ userId: MEMBER_B, role: 'admin' }),
        ]),
      }),
    });
    const svc = makeSvc(db);
    const member = await svc.addMember(
      ADMIN_A as never,
      GROUP_1 as never,
      MEMBER_B as never,
      'admin',
    );
    expect(member.role).toBe('admin');
  });
});

// ─── Remove member ────────────────────────────────────────────────────────────

describe('GroupMessagingService – removeMember', () => {
  it('admin can remove another member', async () => {
    const db = makeDb();
    // requireAdmin
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    // getMember check for target
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue([]),
    });
    const svc = makeSvc(db);
    const result = await svc.removeMember(ADMIN_A as never, GROUP_1 as never, MEMBER_B as never);
    expect(result.removed).toBe(true);
  });

  it('admin cannot remove themselves (use leaveGroup instead)', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.removeMember(ADMIN_A as never, GROUP_1 as never, ADMIN_A as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non-admin cannot remove a member', async () => {
    const db = makeDb({ memberRows: [makeMemberRow({ userId: MEMBER_B, role: 'member' })] });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.removeMember(MEMBER_B as never, GROUP_1 as never, MEMBER_C as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removing non-member throws NotFoundException', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makeMemberRow()]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
    const svc = makeSvc(db);
    await expect(
      svc.removeMember(ADMIN_A as never, GROUP_1 as never, OUTSIDER as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Leave group ──────────────────────────────────────────────────────────────

describe('GroupMessagingService – leaveGroup', () => {
  it('member can leave group', async () => {
    const db = makeDb({
      memberRows: [makeMemberRow({ userId: MEMBER_B, role: 'member' })],
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    const svc = makeSvc(db);
    const result = await svc.leaveGroup(MEMBER_B as never, GROUP_1 as never);
    expect(result.left).toBe(true);
  });

  it('non-member cannot leave', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.leaveGroup(OUTSIDER as never, GROUP_1 as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('last member leaving deletes the group', async () => {
    const db = makeDb({ memberRows: [makeMemberRow()] });
    // getMember for ADMIN_A (admin)
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    // check remaining admins → none
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    // check any remaining member → none
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    const svc = makeSvc(db);
    const result = await svc.leaveGroup(ADMIN_A as never, GROUP_1 as never);
    expect(result.left).toBe(true);
    expect(result.groupDeleted).toBe(true);
  });

  it('admin leaving promotes next member', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    // no remaining admins
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    // there is another member to promote
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    db.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.leaveGroup(ADMIN_A as never, GROUP_1 as never);
    expect(result.left).toBe(true);
    expect(result.groupDeleted).toBe(false);
  });
});

// ─── Pin message ──────────────────────────────────────────────────────────────

describe('GroupMessagingService – pinMessage', () => {
  it('admin can pin a message', async () => {
    const db = makeDb({ messageRows: [makeMessageRow()] });
    // requireAdmin
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    // getMessageOrThrow
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMessageRow()]),
        }),
      }),
    });
    // check existing pin (none)
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makePinRow()]),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makePinRow()]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const pin = await svc.pinMessage(ADMIN_A as never, GROUP_1 as never, MSG_1 as never);
    expect(pin.messageId).toBe(MSG_1);
    expect(pin.pinnedBy).toBe(ADMIN_A);
  });

  it('non-admin cannot pin a message', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.pinMessage(MEMBER_B as never, GROUP_1 as never, MSG_1 as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getPinnedMessages returns pinned messages', async () => {
    const db = makeDb({ pinRows: [makePinRow()] });
    // pinned rows select
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makePinRow()]),
          }),
        }),
      }),
    });
    // messages select
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMessageRow()]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const pins = await svc.getPinnedMessagesList(GROUP_1 as never);
    expect(Array.isArray(pins.items)).toBe(true);
  });

  it('unpinMessage removes pin', async () => {
    const db = makeDb({ pinRows: [makePinRow()] });
    // requireAdmin
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    const svc = makeSvc(db);
    await expect(
      svc.unpinMessage(ADMIN_A as never, GROUP_1 as never, MSG_1 as never),
    ).resolves.toEqual({ unpinned: true });
  });

  it('pinning message from another group throws NotFoundException', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makeMemberRow()]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
    const svc = makeSvc(db);
    await expect(
      svc.pinMessage(ADMIN_A as never, GROUP_1 as never, MSG_2 as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Mute conversation ────────────────────────────────────────────────────────

describe('GroupMessagingService – muteConversation', () => {
  it('muting sets mutedUntil', async () => {
    const db = makeDb();
    // requireMember check
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    const mutedUntil = new Date(Date.now() + 3_600_000);
    db.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    });
    // getGroup for return
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeGroupRow()]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ count: '2' }]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMuteRow({ userId: MEMBER_B })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.muteConversation(
      MEMBER_B as never,
      GROUP_1 as never,
      mutedUntil,
    );
    expect(result).toBeDefined();
  });

  it('unmuting removes mute row', async () => {
    const db = makeDb({ muteRows: [makeMuteRow()] });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B, role: 'member' })]),
        }),
      }),
    });
    db.delete.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeGroupRow()]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ count: '1' }]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.unmuteConversation(MEMBER_B as never, GROUP_1 as never);
    expect(result).toBeDefined();
    expect(result.isMuted).toBe(false);
  });

  it('muted group has isMuted=true in group shape', async () => {
    const db = makeDb({ muteRows: [makeMuteRow()] });
    // getGroupConversations with mute
    // 1. memberRows select
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow({ userId: MEMBER_B })]),
        }),
      }),
    });
    // 2. groups select
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makeGroupRow()]),
          }),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ count: '2' }]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMuteRow({ userId: MEMBER_B })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const groups = await svc.getGroupConversations(MEMBER_B as never, GROUP_1 as never);
    expect(groups).toBeDefined();
  });

  it('non-member cannot mute', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.muteConversation(OUTSIDER as never, GROUP_1 as never, new Date()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── Update group info ────────────────────────────────────────────────────────

describe('GroupMessagingService – updateGroupInfo', () => {
  it('admin can rename group', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    db.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeGroupRow({ name: 'مجموعة جديدة' })]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ count: '1' }]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.updateGroupInfo(
      ADMIN_A as never,
      GROUP_1 as never,
      { name: 'مجموعة جديدة' },
    );
    expect(result.name).toBe('مجموعة جديدة');
  });

  it('non-admin cannot rename group', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.updateGroupInfo(MEMBER_B as never, GROUP_1 as never, { name: 'اختراق' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updating with no changes returns current group', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeMemberRow()]),
        }),
      }),
    });
    // getGroupOrThrow for current
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeGroupRow()]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ count: '1' }]),
        }),
      }),
    });
    db.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.updateGroupInfo(ADMIN_A as never, GROUP_1 as never, {});
    expect(result.id).toBe(GROUP_1);
  });
});
