import type { Db } from '@iraq-maps/db-kit';
import type { UserId, GroupIdType, GroupMessageIdType } from '@iraq-maps/contracts';
import { Inject, Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { groupMemberTable, groupMessageTable, groupTable } from './schema';

@Injectable()
export class MessagingGroupsService {
  constructor(@Inject('MESSAGING_DB') private readonly db: Db) {}

  async createGroup(createdBy: UserId, name: string, avatarUrl?: string, memberIds?: UserId[]) {
    const [group] = await this.db
      .insert(groupTable)
      .values({ name, createdBy, avatarUrl })
      .returning();

    if (!group) throw new Error('Failed to create group');

    // Add creator as admin
    const members: { groupId: string; userId: string; role: 'admin' | 'member' }[] = [
      { groupId: group.id, userId: createdBy, role: 'admin' },
    ];
    for (const uid of memberIds ?? []) {
      if (uid !== createdBy) {
        members.push({ groupId: group.id, userId: uid, role: 'member' });
      }
    }
    await this.db.insert(groupMemberTable).values(members).onConflictDoNothing();

    return this.toGroupShape(group, members.length);
  }

  async listGroups(userId: UserId, cursor?: string) {
    const limit = 20;
    const memberRows = await this.db
      .select({ groupId: groupMemberTable.groupId })
      .from(groupMemberTable)
      .where(eq(groupMemberTable.userId, userId));
    const groupIds = memberRows.map((m) => m.groupId);

    if (groupIds.length === 0) return { items: [], nextCursor: undefined };

    const query = this.db
      .select()
      .from(groupTable)
      .where(
        cursor
          ? and(inArray(groupTable.id, groupIds), lt(groupTable.createdAt, new Date(cursor)))
          : inArray(groupTable.id, groupIds),
      )
      .orderBy(desc(groupTable.createdAt))
      .limit(limit + 1);

    const rows = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    // Count members per group
    const counts = await this.db
      .select({ groupId: groupMemberTable.groupId })
      .from(groupMemberTable)
      .where(inArray(groupMemberTable.groupId, items.map((g) => g.id)));
    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.groupId, (countMap.get(row.groupId) ?? 0) + 1);
    }

    return {
      items: items.map((g) => this.toGroupShape(g, countMap.get(g.id) ?? 0)),
      nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : undefined,
    };
  }

  async sendGroupMessage(userId: UserId, groupId: GroupIdType, text: string) {
    const member = await this.getMember(userId, groupId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    const [msg] = await this.db
      .insert(groupMessageTable)
      .values({ groupId, senderId: userId, text })
      .returning();

    return this.toMessageShape(msg!);
  }

  async listGroupMessages(userId: UserId, groupId: GroupIdType, cursor?: string, limit = 20) {
    const member = await this.getMember(userId, groupId);
    if (!member) throw new ForbiddenException('Not a member of this group');

    const rows = await this.db
      .select()
      .from(groupMessageTable)
      .where(
        cursor
          ? and(eq(groupMessageTable.groupId, groupId), lt(groupMessageTable.createdAt, new Date(cursor)))
          : eq(groupMessageTable.groupId, groupId),
      )
      .orderBy(desc(groupMessageTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items: items.map((m) => this.toMessageShape(m)),
      nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : undefined,
    };
  }

  async addGroupMember(callerId: UserId, groupId: GroupIdType, newUserId: UserId, role: 'admin' | 'member' = 'member') {
    // Only admins can add members
    const caller = await this.getMember(callerId, groupId);
    if (!caller || caller.role !== 'admin') throw new ForbiddenException('Admin role required');

    const existing = await this.getMember(newUserId, groupId);
    if (existing) throw new ConflictException('Already a member');

    const [row] = await this.db
      .insert(groupMemberTable)
      .values({ groupId, userId: newUserId, role })
      .returning();

    return {
      groupId: row!.groupId as GroupIdType,
      userId: row!.userId as UserId,
      role: row!.role as 'admin' | 'member',
      joinedAt: row!.joinedAt.toISOString(),
    };
  }

  private async getMember(userId: UserId, groupId: GroupIdType) {
    const [row] = await this.db
      .select()
      .from(groupMemberTable)
      .where(and(eq(groupMemberTable.groupId, groupId), eq(groupMemberTable.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  private toGroupShape(group: typeof groupTable.$inferSelect, memberCount: number) {
    return {
      id: group.id as GroupIdType,
      name: group.name,
      createdBy: group.createdBy as UserId,
      avatarUrl: group.avatarUrl ?? undefined,
      memberCount,
      createdAt: group.createdAt.toISOString(),
    };
  }

  private toMessageShape(msg: typeof groupMessageTable.$inferSelect) {
    return {
      id: msg.id as GroupMessageIdType,
      groupId: msg.groupId as GroupIdType,
      senderId: msg.senderId as UserId,
      text: msg.text,
      createdAt: msg.createdAt.toISOString(),
    };
  }
}
