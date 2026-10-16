/**
 * FakeGroupMessagingService — in-memory group messaging service fake for testing.
 *
 * Covers:
 *  - createGroup, getGroup, listGroups
 *  - addMember, removeMember, leaveGroup
 *  - sendMessage, listMessages
 *  - pinMessage, unpinMessage, getPinnedMessages
 *  - muteGroup, unmuteGroup
 *  - Admin / non-admin permission guards
 *  - Member deduplication
 */
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemberRole = 'admin' | 'member';

export interface Group {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: Date;
  memberCount: number;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface PinnedMessage {
  id: string;
  groupId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: Date;
  message: GroupMessage;
}

export interface MuteEntry {
  groupId: string;
  userId: string;
  mutedUntil: Date | null; // null = indefinite
  createdAt: Date;
}

export class FakeGroupMessagingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'ALREADY_MEMBER'
      | 'NOT_MEMBER'
      | 'CANNOT_REMOVE_SELF',
  ) {
    super(message);
    this.name = 'FakeGroupMessagingError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FakeGroupMessagingService {
  private readonly groups = new Map<string, Group>();
  private readonly members = new Map<string, GroupMember[]>(); // groupId → members
  private readonly messages = new Map<string, GroupMessage[]>(); // groupId → messages
  private readonly pins = new Map<string, PinnedMessage[]>(); // groupId → pins
  private readonly mutes = new Map<string, MuteEntry>(); // `${groupId}:${userId}` → mute

  /** All method calls for test assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  private track(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  // ── createGroup ────────────────────────────────────────────────────────────

  async createGroup(
    creatorId: string,
    memberIds: string[],
    name: string,
    avatarUrl?: string,
  ): Promise<Group> {
    this.track('createGroup', creatorId, memberIds, name);
    const id = randomUUID();
    const now = new Date();
    const group: Group = {
      id,
      name,
      avatarUrl: avatarUrl ?? null,
      createdBy: creatorId,
      createdAt: now,
      memberCount: 0,
    };

    const dedupedMembers = Array.from(new Set([creatorId, ...memberIds]));
    const memberList: GroupMember[] = dedupedMembers.map((uid) => ({
      groupId: id,
      userId: uid,
      role: uid === creatorId ? 'admin' : 'member',
      joinedAt: now,
    }));

    group.memberCount = memberList.length;
    this.groups.set(id, group);
    this.members.set(id, memberList);
    this.messages.set(id, []);
    this.pins.set(id, []);

    return group;
  }

  // ── getGroup ───────────────────────────────────────────────────────────────

  async getGroup(groupId: string): Promise<Group> {
    this.track('getGroup', groupId);
    const group = this.groups.get(groupId);
    if (!group) {
      throw new FakeGroupMessagingError(`Group ${groupId} not found`, 'NOT_FOUND');
    }
    const memberList = this.members.get(groupId) ?? [];
    return { ...group, memberCount: memberList.length };
  }

  // ── listGroups ─────────────────────────────────────────────────────────────

  async listGroups(userId: string): Promise<Group[]> {
    this.track('listGroups', userId);
    const result: Group[] = [];
    for (const [groupId, memberList] of this.members) {
      if (memberList.some((m) => m.userId === userId)) {
        const group = this.groups.get(groupId);
        if (group) result.push({ ...group, memberCount: memberList.length });
      }
    }
    return result;
  }

  // ── addMember ──────────────────────────────────────────────────────────────

  async addMember(
    adminId: string,
    groupId: string,
    userId: string,
    role: MemberRole = 'member',
  ): Promise<GroupMember> {
    this.track('addMember', adminId, groupId, userId);
    await this.requireAdmin(adminId, groupId);

    const memberList = this.getMemberList(groupId);
    if (memberList.some((m) => m.userId === userId)) {
      throw new FakeGroupMessagingError(`${userId} is already a member`, 'ALREADY_MEMBER');
    }

    const member: GroupMember = { groupId, userId, role, joinedAt: new Date() };
    memberList.push(member);
    this.updateGroupMemberCount(groupId);
    return member;
  }

  // ── removeMember ──────────────────────────────────────────────────────────

  async removeMember(
    adminId: string,
    groupId: string,
    userId: string,
  ): Promise<{ removed: true }> {
    this.track('removeMember', adminId, groupId, userId);
    await this.requireAdmin(adminId, groupId);

    if (adminId === userId) {
      throw new FakeGroupMessagingError(
        'Cannot remove yourself; use leaveGroup instead',
        'CANNOT_REMOVE_SELF',
      );
    }

    const memberList = this.getMemberList(groupId);
    const idx = memberList.findIndex((m) => m.userId === userId);
    if (idx === -1) {
      throw new FakeGroupMessagingError(`${userId} is not a member`, 'NOT_MEMBER');
    }

    memberList.splice(idx, 1);
    this.updateGroupMemberCount(groupId);
    return { removed: true };
  }

  // ── leaveGroup ─────────────────────────────────────────────────────────────

  async leaveGroup(
    userId: string,
    groupId: string,
  ): Promise<{ left: true; groupDeleted: boolean }> {
    this.track('leaveGroup', userId, groupId);
    const memberList = this.getMemberList(groupId);
    const member = memberList.find((m) => m.userId === userId);
    if (!member) {
      throw new FakeGroupMessagingError(`${userId} is not a member of ${groupId}`, 'NOT_MEMBER');
    }

    const updated = memberList.filter((m) => m.userId !== userId);
    this.members.set(groupId, updated);

    if (updated.length === 0) {
      this.groups.delete(groupId);
      this.messages.delete(groupId);
      this.pins.delete(groupId);
      return { left: true, groupDeleted: true };
    }

    // Promote another member to admin if the leaving member was the last admin
    if (member.role === 'admin') {
      const hasAdmin = updated.some((m) => m.role === 'admin');
      if (!hasAdmin && updated[0]) {
        updated[0].role = 'admin';
      }
    }

    this.updateGroupMemberCount(groupId);
    return { left: true, groupDeleted: false };
  }

  // ── sendMessage ────────────────────────────────────────────────────────────

  async sendMessage(
    senderId: string,
    groupId: string,
    text: string,
  ): Promise<GroupMessage> {
    this.track('sendMessage', senderId, groupId, text.substring(0, 50));
    await this.requireMember(senderId, groupId);

    const msg: GroupMessage = {
      id: randomUUID(),
      groupId,
      senderId,
      text,
      createdAt: new Date(),
      editedAt: null,
    };
    const msgList = this.messages.get(groupId) ?? [];
    msgList.push(msg);
    this.messages.set(groupId, msgList);
    return msg;
  }

  // ── listMessages ───────────────────────────────────────────────────────────

  async listMessages(
    userId: string,
    groupId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: GroupMessage[]; nextCursor?: string }> {
    this.track('listMessages', userId, groupId);
    await this.requireMember(userId, groupId);

    const { limit = 50 } = opts;
    const all = [...(this.messages.get(groupId) ?? [])].reverse();
    const items = all.slice(0, limit);
    return {
      items,
      nextCursor: all.length > limit ? items[items.length - 1]?.id : undefined,
    };
  }

  // ── pinMessage ─────────────────────────────────────────────────────────────

  async pinMessage(
    adminId: string,
    groupId: string,
    messageId: string,
  ): Promise<PinnedMessage> {
    this.track('pinMessage', adminId, groupId, messageId);
    await this.requireAdmin(adminId, groupId);

    const msgList = this.messages.get(groupId) ?? [];
    const msg = msgList.find((m) => m.id === messageId);
    if (!msg) {
      throw new FakeGroupMessagingError(`Message ${messageId} not found in group ${groupId}`, 'NOT_FOUND');
    }

    const pinList = this.pins.get(groupId) ?? [];
    const existing = pinList.find((p) => p.messageId === messageId);
    if (existing) return existing;

    const pin: PinnedMessage = {
      id: randomUUID(),
      groupId,
      messageId,
      pinnedBy: adminId,
      pinnedAt: new Date(),
      message: msg,
    };
    pinList.push(pin);
    this.pins.set(groupId, pinList);
    return pin;
  }

  // ── unpinMessage ───────────────────────────────────────────────────────────

  async unpinMessage(
    adminId: string,
    groupId: string,
    messageId: string,
  ): Promise<{ unpinned: true }> {
    this.track('unpinMessage', adminId, groupId, messageId);
    await this.requireAdmin(adminId, groupId);

    const pinList = this.pins.get(groupId) ?? [];
    const filtered = pinList.filter((p) => p.messageId !== messageId);
    this.pins.set(groupId, filtered);
    return { unpinned: true };
  }

  // ── getPinnedMessages ──────────────────────────────────────────────────────

  async getPinnedMessages(
    groupId: string,
  ): Promise<{ items: PinnedMessage[] }> {
    this.track('getPinnedMessages', groupId);
    const pinList = this.pins.get(groupId) ?? [];
    return { items: [...pinList].sort((a, b) => b.pinnedAt.getTime() - a.pinnedAt.getTime()) };
  }

  // ── muteGroup ──────────────────────────────────────────────────────────────

  async muteGroup(
    userId: string,
    groupId: string,
    mutedUntil: Date | null = null,
  ): Promise<MuteEntry> {
    this.track('muteGroup', userId, groupId);
    await this.requireMember(userId, groupId);

    const entry: MuteEntry = {
      groupId,
      userId,
      mutedUntil,
      createdAt: new Date(),
    };
    this.mutes.set(`${groupId}:${userId}`, entry);
    return entry;
  }

  // ── unmuteGroup ────────────────────────────────────────────────────────────

  async unmuteGroup(userId: string, groupId: string): Promise<{ unmuted: true }> {
    this.track('unmuteGroup', userId, groupId);
    this.mutes.delete(`${groupId}:${userId}`);
    return { unmuted: true };
  }

  // ── isMuted ────────────────────────────────────────────────────────────────

  isMuted(userId: string, groupId: string): boolean {
    const entry = this.mutes.get(`${groupId}:${userId}`);
    if (!entry) return false;
    if (entry.mutedUntil === null) return true;
    return entry.mutedUntil > new Date();
  }

  // ── getMembership ──────────────────────────────────────────────────────────

  getMembership(userId: string, groupId: string): GroupMember | undefined {
    return (this.members.get(groupId) ?? []).find((m) => m.userId === userId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getMemberList(groupId: string): GroupMember[] {
    if (!this.groups.has(groupId)) {
      throw new FakeGroupMessagingError(`Group ${groupId} not found`, 'NOT_FOUND');
    }
    return this.members.get(groupId) ?? [];
  }

  private async requireAdmin(userId: string, groupId: string): Promise<void> {
    const member = this.getMemberList(groupId).find((m) => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new FakeGroupMessagingError(
        `${userId} is not an admin of group ${groupId}`,
        'FORBIDDEN',
      );
    }
  }

  private async requireMember(userId: string, groupId: string): Promise<void> {
    const member = this.getMemberList(groupId).find((m) => m.userId === userId);
    if (!member) {
      throw new FakeGroupMessagingError(
        `${userId} is not a member of group ${groupId}`,
        'FORBIDDEN',
      );
    }
  }

  private updateGroupMemberCount(groupId: string): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.memberCount = (this.members.get(groupId) ?? []).length;
    }
  }

  // ── reset ──────────────────────────────────────────────────────────────────

  reset(): void {
    this.groups.clear();
    this.members.clear();
    this.messages.clear();
    this.pins.clear();
    this.mutes.clear();
    this.calls.length = 0;
  }

  // ── Inspection helpers ─────────────────────────────────────────────────────

  groupCount(): number {
    return this.groups.size;
  }

  memberCount(groupId: string): number {
    return (this.members.get(groupId) ?? []).length;
  }

  messageCount(groupId: string): number {
    return (this.messages.get(groupId) ?? []).length;
  }

  pinCount(groupId: string): number {
    return (this.pins.get(groupId) ?? []).length;
  }

  allGroups(): Group[] {
    return [...this.groups.values()].map((g) => ({
      ...g,
      memberCount: (this.members.get(g.id) ?? []).length,
    }));
  }

  callsFor(method: string): typeof this.calls {
    return this.calls.filter((c) => c.method === method);
  }
}
