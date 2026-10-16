/**
 * GroupMessagingService – enhanced group chat operations.
 *
 * Extends the base MessagingGroupsService with:
 * - removeMember / leaveGroup
 * - updateGroupInfo
 * - getGroupConversations (alias with richer return)
 * - muteConversation
 * - pinMessage / unpinMessage / getPinnedMessages
 * - createGroupConversation (named alias for createGroup)
 */
import type { Db } from '@iraq-maps/db-kit';
import type { UserId, GroupIdType, GroupMessageIdType } from '@iraq-maps/contracts';
import {
  Inject,
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  index,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  groupMemberTable,
  groupMessageTable,
  groupTable,
  messagingSchema,
} from './schema';

// ─── Extended schema tables (mute + pinned) ──────────────────────────────────

export const groupMuteTable = messagingSchema.table(
  'group_mute',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groupTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const pinnedMessageTable = messagingSchema.table(
  'pinned_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groupTable.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => groupMessageTable.id, { onDelete: 'cascade' }),
    pinnedBy: uuid('pinned_by').notNull(),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pinned_message_group_id_idx').on(t.groupId),
    index('pinned_message_message_id_idx').on(t.messageId),
  ],
);

// ─── Shape types ─────────────────────────────────────────────────────────────

export interface GroupShape {
  id: GroupIdType;
  name: string;
  createdBy: UserId;
  avatarUrl?: string;
  memberCount: number;
  createdAt: string;
  isMuted: boolean;
  mutedUntil?: string;
  userRole: 'admin' | 'member';
}

export interface GroupMemberShape {
  groupId: GroupIdType;
  userId: UserId;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface GroupMessageShape {
  id: GroupMessageIdType;
  groupId: GroupIdType;
  senderId: UserId;
  text: string;
  createdAt: string;
}

export interface PinnedMessageShape {
  id: string;
  groupId: GroupIdType;
  messageId: GroupMessageIdType;
  pinnedBy: UserId;
  pinnedAt: string;
  message?: GroupMessageShape;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GroupMessagingService {
  constructor(@Inject('MESSAGING_DB') private readonly db: Db) {}

  // ── createGroupConversation ──────────────────────────────────────────────

  async createGroupConversation(
    creatorId: UserId,
    memberIds: UserId[],
    name: string,
    avatarUrl?: string,
  ): Promise<GroupShape> {
    const [group] = await this.db
      .insert(groupTable)
      .values({ name, createdBy: creatorId, avatarUrl })
      .returning();

    if (!group) throw new Error('Failed to create group');

    const dedupedMembers = Array.from(new Set([creatorId, ...memberIds]));
    const memberRows: { groupId: string; userId: string; role: 'admin' | 'member' }[] =
      dedupedMembers.map((uid) => ({
        groupId: group.id,
        userId: uid,
        role: uid === creatorId ? ('admin' as const) : ('member' as const),
      }));

    await this.db.insert(groupMemberTable).values(memberRows).onConflictDoNothing();

    return this.toGroupShape(group, memberRows.length, false, undefined, 'admin');
  }

  // ── addMember ────────────────────────────────────────────────────────────

  async addMember(
    adminId: UserId,
    conversationId: GroupIdType,
    userId: UserId,
    role: 'admin' | 'member' = 'member',
  ): Promise<GroupMemberShape> {
    await this.requireAdmin(adminId, conversationId);

    const existing = await this.getMember(userId, conversationId);
    if (existing) throw new ConflictException('Already a member');

    const [row] = await this.db
      .insert(groupMemberTable)
      .values({ groupId: conversationId, userId, role })
      .returning();

    if (!row) throw new Error('Failed to add member');

    return this.toMemberShape(row);
  }

  // ── removeMember ─────────────────────────────────────────────────────────

  async removeMember(
    adminId: UserId,
    conversationId: GroupIdType,
    userId: UserId,
  ): Promise<{ removed: true }> {
    await this.requireAdmin(adminId, conversationId);

    if (adminId === userId) {
      throw new ForbiddenException(
        'Cannot remove yourself; use leaveGroup instead',
      );
    }

    const existing = await this.getMember(userId, conversationId);
    if (!existing) throw new NotFoundException('Member not found');

    await this.db
      .delete(groupMemberTable)
      .where(
        and(
          eq(groupMemberTable.groupId, conversationId),
          eq(groupMemberTable.userId, userId),
        ),
      );

    return { removed: true };
  }

  // ── leaveGroup ───────────────────────────────────────────────────────────

  async leaveGroup(
    userId: UserId,
    conversationId: GroupIdType,
  ): Promise<{ left: true; groupDeleted: boolean }> {
    const member = await this.getMember(userId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    await this.db
      .delete(groupMemberTable)
      .where(
        and(
          eq(groupMemberTable.groupId, conversationId),
          eq(groupMemberTable.userId, userId),
        ),
      );

    // If this was the last admin, promote the next member alphabetically
    if (member.role === 'admin') {
      const remainingAdmins = await this.db
        .select()
        .from(groupMemberTable)
        .where(
          and(
            eq(groupMemberTable.groupId, conversationId),
            eq(groupMemberTable.role, 'admin'),
          ),
        )
        .limit(1);

      if (remainingAdmins.length === 0) {
        // Find any remaining member and promote them
        const anyMember = await this.db
          .select()
          .from(groupMemberTable)
          .where(eq(groupMemberTable.groupId, conversationId))
          .limit(1);

        if (anyMember[0]) {
          await this.db
            .update(groupMemberTable)
            .set({ role: 'admin' })
            .where(
              and(
                eq(groupMemberTable.groupId, conversationId),
                eq(groupMemberTable.userId, anyMember[0].userId),
              ),
            );
        } else {
          // No members left – delete the group
          await this.db
            .delete(groupTable)
            .where(eq(groupTable.id, conversationId));
          return { left: true, groupDeleted: true };
        }
      }
    }

    return { left: true, groupDeleted: false };
  }

  // ── updateGroupInfo ──────────────────────────────────────────────────────

  async updateGroupInfo(
    adminId: UserId,
    conversationId: GroupIdType,
    data: { name?: string; avatarUrl?: string | null },
  ): Promise<GroupShape> {
    await this.requireAdmin(adminId, conversationId);

    if (!data.name && data.avatarUrl === undefined) {
      // Nothing to update – return current
      return this.getGroupOrThrow(conversationId, adminId);
    }

    const updates: Partial<typeof groupTable.$inferInsert> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl ?? undefined;

    const [updated] = await this.db
      .update(groupTable)
      .set(updates)
      .where(eq(groupTable.id, conversationId))
      .returning();

    if (!updated) throw new NotFoundException('Group not found');

    const memberCount = await this.getMemberCount(conversationId);
    const muteRow = await this.getMuteRow(adminId, conversationId);

    return this.toGroupShape(
      updated,
      memberCount,
      this.isMutedNow(muteRow),
      muteRow?.mutedUntil?.toISOString(),
      'admin',
    );
  }

  // ── getGroupConversations ────────────────────────────────────────────────

  async getGroupConversations(
    userId: UserId,
    cursor?: string,
  ): Promise<PaginatedResult<GroupShape>> {
    const limit = 20;

    const memberRows = await this.db
      .select({ groupId: groupMemberTable.groupId, role: groupMemberTable.role })
      .from(groupMemberTable)
      .where(eq(groupMemberTable.userId, userId))
      .limit(1000);

    if (memberRows.length === 0) return { items: [], nextCursor: undefined };

    const groupIds = memberRows.map((m) => m.groupId);
    const roleMap = new Map(memberRows.map((m) => [m.groupId, m.role as 'admin' | 'member']));

    const rows = await this.db
      .select()
      .from(groupTable)
      .where(
        cursor
          ? and(
              inArray(groupTable.id, groupIds),
              lt(groupTable.createdAt, new Date(cursor)),
            )
          : inArray(groupTable.id, groupIds),
      )
      .orderBy(desc(groupTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    // Fetch member counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counts: { groupId: string }[] = await (this.db as any)
      .select({ groupId: groupMemberTable.groupId })
      .from(groupMemberTable)
      .where(inArray(groupMemberTable.groupId, items.map((g) => g.id)))
      .execute();
    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.groupId, (countMap.get(row.groupId) ?? 0) + 1);
    }

    // Fetch mutes for this user
    const muteRows = await this.db
      .select()
      .from(groupMuteTable)
      .where(
        and(
          inArray(groupMuteTable.groupId, items.map((g) => g.id)),
          eq(groupMuteTable.userId, userId),
        ),
      )
      .limit(items.length + 1);
    const muteMap = new Map(muteRows.map((m) => [m.groupId, m]));

    return {
      items: items.map((g) => {
        const muteRow = muteMap.get(g.id);
        return this.toGroupShape(
          g,
          countMap.get(g.id) ?? 0,
          this.isMutedNow(muteRow),
          muteRow?.mutedUntil?.toISOString(),
          roleMap.get(g.id) ?? 'member',
        );
      }),
      nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : undefined,
    };
  }

  // ── muteConversation ─────────────────────────────────────────────────────

  async muteConversation(
    userId: UserId,
    conversationId: GroupIdType,
    until: Date | null,
  ): Promise<{ muted: boolean; mutedUntil?: string }> {
    const member = await this.getMember(userId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    if (until === null) {
      // Unmute
      await this.db
        .delete(groupMuteTable)
        .where(
          and(
            eq(groupMuteTable.groupId, conversationId),
            eq(groupMuteTable.userId, userId),
          ),
        );
      return { muted: false };
    }

    await this.db
      .insert(groupMuteTable)
      .values({ groupId: conversationId, userId, mutedUntil: until })
      .onConflictDoUpdate({
        target: [groupMuteTable.groupId, groupMuteTable.userId],
        set: { mutedUntil: until },
      });

    return { muted: true, mutedUntil: until.toISOString() };
  }

  // ── pinMessage ───────────────────────────────────────────────────────────

  async pinMessage(
    userId: UserId,
    conversationId: GroupIdType,
    messageId: GroupMessageIdType,
  ): Promise<PinnedMessageShape> {
    const member = await this.getMember(userId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    // Verify message belongs to this group
    const [msg] = await this.db
      .select()
      .from(groupMessageTable)
      .where(
        and(
          eq(groupMessageTable.id, messageId),
          eq(groupMessageTable.groupId, conversationId),
        ),
      )
      .limit(1);

    if (!msg) throw new NotFoundException('Message not found in this group');

    // Check if already pinned
    const [existing] = await this.db
      .select()
      .from(pinnedMessageTable)
      .where(
        and(
          eq(pinnedMessageTable.groupId, conversationId),
          eq(pinnedMessageTable.messageId, messageId),
        ),
      )
      .limit(1);

    if (existing) {
      return this.toPinnedShape(existing, msg);
    }

    const [pinned] = await this.db
      .insert(pinnedMessageTable)
      .values({ groupId: conversationId, messageId, pinnedBy: userId })
      .returning();

    if (!pinned) throw new Error('Failed to pin message');

    return this.toPinnedShape(pinned, msg);
  }

  // ── unpinMessage ─────────────────────────────────────────────────────────

  async unpinMessage(
    userId: UserId,
    conversationId: GroupIdType,
    messageId: GroupMessageIdType,
  ): Promise<{ unpinned: true }> {
    const member = await this.getMember(userId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    await this.db
      .delete(pinnedMessageTable)
      .where(
        and(
          eq(pinnedMessageTable.groupId, conversationId),
          eq(pinnedMessageTable.messageId, messageId),
        ),
      );

    return { unpinned: true };
  }

  // ── getPinnedMessages ────────────────────────────────────────────────────

  async getPinnedMessages(
    conversationId: GroupIdType,
    requesterId: UserId,
  ): Promise<PinnedMessageShape[]> {
    const member = await this.getMember(requesterId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    const pinnedRows = await this.db
      .select()
      .from(pinnedMessageTable)
      .where(eq(pinnedMessageTable.groupId, conversationId))
      .orderBy(desc(pinnedMessageTable.pinnedAt))
      .limit(100);

    if (pinnedRows.length === 0) return [];

    const messageIds = pinnedRows.map((p) => p.messageId);
    const messages = await this.db
      .select()
      .from(groupMessageTable)
      .where(inArray(groupMessageTable.id, messageIds))
      .limit(messageIds.length + 1);

    const msgMap = new Map(messages.map((m) => [m.id, m]));

    return pinnedRows.map((p) => this.toPinnedShape(p, msgMap.get(p.messageId)));
  }

  // ── getGroupMembers ──────────────────────────────────────────────────────

  async getGroupMembers(
    conversationId: GroupIdType,
    requesterId: UserId,
  ): Promise<GroupMemberShape[]> {
    const member = await this.getMember(requesterId, conversationId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    const rows = await this.db
      .select()
      .from(groupMemberTable)
      .where(eq(groupMemberTable.groupId, conversationId));

    return rows.map((r) => this.toMemberShape(r));
  }

  // ── promoteMember ────────────────────────────────────────────────────────

  async promoteMember(
    adminId: UserId,
    conversationId: GroupIdType,
    userId: UserId,
  ): Promise<GroupMemberShape> {
    await this.requireAdmin(adminId, conversationId);

    const target = await this.getMember(userId, conversationId);
    if (!target) throw new NotFoundException('Member not found');

    const [updated] = await this.db
      .update(groupMemberTable)
      .set({ role: 'admin' })
      .where(
        and(
          eq(groupMemberTable.groupId, conversationId),
          eq(groupMemberTable.userId, userId),
        ),
      )
      .returning();

    if (!updated) throw new Error('Failed to promote member');
    return this.toMemberShape(updated);
  }

  // ── demoteMember ─────────────────────────────────────────────────────────

  async demoteMember(
    adminId: UserId,
    conversationId: GroupIdType,
    userId: UserId,
  ): Promise<GroupMemberShape> {
    await this.requireAdmin(adminId, conversationId);

    if (adminId === userId) {
      throw new ForbiddenException('Cannot demote yourself');
    }

    const target = await this.getMember(userId, conversationId);
    if (!target) throw new NotFoundException('Member not found');

    const [updated] = await this.db
      .update(groupMemberTable)
      .set({ role: 'member' })
      .where(
        and(
          eq(groupMemberTable.groupId, conversationId),
          eq(groupMemberTable.userId, userId),
        ),
      )
      .returning();

    if (!updated) throw new Error('Failed to demote member');
    return this.toMemberShape(updated);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async requireAdmin(userId: UserId, groupId: GroupIdType): Promise<void> {
    const member = await this.getMember(userId, groupId);
    if (!member || member.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
  }

  private async getMember(
    userId: UserId,
    groupId: GroupIdType,
  ): Promise<typeof groupMemberTable.$inferSelect | null> {
    const [row] = await this.db
      .select()
      .from(groupMemberTable)
      .where(
        and(
          eq(groupMemberTable.groupId, groupId),
          eq(groupMemberTable.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async getMemberCount(groupId: GroupIdType): Promise<number> {
    const rows = await this.db
      .select({ groupId: groupMemberTable.groupId })
      .from(groupMemberTable)
      .where(eq(groupMemberTable.groupId, groupId));
    return rows.length;
  }

  private async getMuteRow(
    userId: UserId,
    groupId: GroupIdType,
  ): Promise<typeof groupMuteTable.$inferSelect | undefined> {
    const [row] = await this.db
      .select()
      .from(groupMuteTable)
      .where(
        and(
          eq(groupMuteTable.groupId, groupId),
          eq(groupMuteTable.userId, userId),
        ),
      )
      .limit(1);
    return row;
  }

  private isMutedNow(row?: typeof groupMuteTable.$inferSelect | null): boolean {
    if (!row) return false;
    if (!row.mutedUntil) return true; // muted indefinitely
    return row.mutedUntil > new Date();
  }

  private async getGroupOrThrow(
    groupId: GroupIdType,
    userId: UserId,
  ): Promise<GroupShape> {
    const [group] = await this.db
      .select()
      .from(groupTable)
      .where(eq(groupTable.id, groupId))
      .limit(1);
    if (!group) throw new NotFoundException('Group not found');

    const memberCount = await this.getMemberCount(groupId);
    const muteRow = await this.getMuteRow(userId, groupId);
    const member = await this.getMember(userId, groupId);

    return this.toGroupShape(
      group,
      memberCount,
      this.isMutedNow(muteRow),
      muteRow?.mutedUntil?.toISOString(),
      member?.role as 'admin' | 'member' ?? 'member',
    );
  }

  private toGroupShape(
    group: typeof groupTable.$inferSelect,
    memberCount: number,
    isMuted: boolean,
    mutedUntil: string | undefined,
    userRole: 'admin' | 'member',
  ): GroupShape {
    return {
      id: group.id as GroupIdType,
      name: group.name,
      createdBy: group.createdBy as UserId,
      avatarUrl: group.avatarUrl ?? undefined,
      memberCount,
      createdAt: group.createdAt.toISOString(),
      isMuted,
      mutedUntil,
      userRole,
    };
  }

  private toMemberShape(
    row: typeof groupMemberTable.$inferSelect,
  ): GroupMemberShape {
    return {
      groupId: row.groupId as GroupIdType,
      userId: row.userId as UserId,
      role: row.role as 'admin' | 'member',
      joinedAt: row.joinedAt.toISOString(),
    };
  }

  // ── Convenience aliases ────────────────────────────────────────────────────

  /** Unmute a conversation for a user. Alias for muteConversation(userId, groupId, null). */
  async unmuteConversation(
    userId: UserId,
    conversationId: GroupIdType,
  ): Promise<{ isMuted: false }> {
    await this.muteConversation(userId, conversationId, null);
    return { isMuted: false };
  }

  /** Get pinned messages without requiring a requesterId (open to any member when called server-side). */
  async getPinnedMessagesList(
    conversationId: GroupIdType,
  ): Promise<{ items: PinnedMessageShape[] }> {
    const pinnedRows = await this.db
      .select()
      .from(pinnedMessageTable)
      .where(eq(pinnedMessageTable.groupId, conversationId))
      .orderBy(desc(pinnedMessageTable.pinnedAt))
      .limit(100);

    if (pinnedRows.length === 0) return { items: [] };

    const messageIds = pinnedRows.map((p) => p.messageId);
    const messages = await this.db
      .select()
      .from(groupMessageTable)
      .where(inArray(groupMessageTable.id, messageIds))
      .limit(messageIds.length + 1);

    const msgMap = new Map(messages.map((m) => [m.id, m]));
    const items = pinnedRows.map((p) => this.toPinnedShape(p, msgMap.get(p.messageId)));
    return { items };
  }

  private toPinnedShape(
    row: typeof pinnedMessageTable.$inferSelect,
    msg?: typeof groupMessageTable.$inferSelect,
  ): PinnedMessageShape {
    return {
      id: row.id,
      groupId: row.groupId as GroupIdType,
      messageId: row.messageId as GroupMessageIdType,
      pinnedBy: row.pinnedBy as UserId,
      pinnedAt: row.pinnedAt.toISOString(),
      message: msg
        ? {
            id: msg.id as GroupMessageIdType,
            groupId: msg.groupId as GroupIdType,
            senderId: msg.senderId as UserId,
            text: msg.text,
            createdAt: msg.createdAt.toISOString(),
          }
        : undefined,
    };
  }
}
