// M4 contracts: messaging inquiries, delivery targets, handoff links.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { PlaceId, UserId } from './common';

const c = initContract();

// Enums
export const MessageStatus = z.enum(['queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'handed_off']);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const MessagingChannelKind = z.enum(['in_app', 'whatsapp', 'handoff']);
export type MessagingChannelKind = z.infer<typeof MessagingChannelKind>;

// IDs
export const InquiryId = z.string().uuid().brand<'InquiryId'>();
export type InquiryId = z.infer<typeof InquiryId>;

export const MessageId = z.string().uuid().brand<'MessageId'>();
export type MessageId = z.infer<typeof MessageId>;

// Handoff link
export const HandoffLink = z.object({
  type: z.enum(['wa_me', 'ig_me', 'tel']),
  url: z.string().url(),
  copyText: z.string(), // the Arabic text to copy
});
export type HandoffLink = z.infer<typeof HandoffLink>;

// Per-target delivery plan
export const DeliveryTarget = z.object({
  placeId: PlaceId,
  channel: MessagingChannelKind,
  status: MessageStatus,
  handoffLink: HandoffLink.optional(),
});
export type DeliveryTarget = z.infer<typeof DeliveryTarget>;

// The inquiry
export const Inquiry = z.object({
  id: InquiryId,
  userId: UserId,
  text: z.string().max(500),
  targets: z.array(DeliveryTarget),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().optional(),
});
export type Inquiry = z.infer<typeof Inquiry>;

// Compose params (used by M5 assistant)
export const ComposeParams = z.object({
  text: z.string().optional(),
  placeIds: z.array(PlaceId).max(5).optional(),
});
export type ComposeParams = z.infer<typeof ComposeParams>;

/** @public frozen contract (M4) */
export const messagingContract = c.router({
  createInquiry: {
    method: 'POST',
    path: '/v1/inquiries',
    headers: z.object({ 'idempotency-key': z.string().uuid() }),
    body: z.object({
      text: z.string().min(1).max(500),
      placeIds: z.array(PlaceId).min(1).max(5),
      confirm: z.literal(true),
    }),
    responses: {
      201: Inquiry,
      400: z.object({ code: z.string() }),
      429: z.object({ code: z.literal('daily_limit_exceeded') }),
    },
  },
  listInquiries: {
    method: 'GET',
    path: '/v1/inquiries',
    query: z.object({ cursor: z.string().optional() }),
    responses: {
      200: z.object({ items: z.array(Inquiry), nextCursor: z.string().optional() }),
    },
  },
  getInquiry: {
    method: 'GET',
    path: '/v1/inquiries/:id',
    pathParams: z.object({ id: InquiryId }),
    responses: {
      200: Inquiry,
      404: z.object({ code: z.literal('not_found') }),
    },
  },
  markInquiryRead: {
    method: 'POST',
    path: '/v1/inquiries/:id/read',
    pathParams: z.object({ id: InquiryId }),
    body: z.object({}),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      404: z.object({ code: z.literal('not_found') }),
    },
    summary: 'Mark an inquiry as read by the user',
  },
  // Provider inbox
  listProviderInquiries: {
    method: 'GET',
    path: '/v1/provider/inbox',
    query: z.object({ cursor: z.string().optional() }),
    responses: {
      200: z.object({ items: z.array(Inquiry), nextCursor: z.string().optional() }),
    },
  },
  replyToInquiry: {
    method: 'POST',
    path: '/v1/provider/inbox/:id/reply',
    pathParams: z.object({ id: InquiryId }),
    body: z.object({ text: z.string().min(1).max(500) }),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      404: z.object({ code: z.string() }),
    },
  },
  optOut: {
    method: 'POST',
    path: '/v1/provider/inbox/opt-out',
    body: z.object({}),
    responses: { 200: z.object({ ok: z.literal(true) }) },
  },
  // WhatsApp webhooks
  whatsappVerify: {
    method: 'GET',
    path: '/v1/webhooks/whatsapp',
    query: z.object({
      'hub.mode': z.string(),
      'hub.verify_token': z.string(),
      'hub.challenge': z.string(),
    }),
    responses: { 200: z.string() },
  },
  whatsappInbound: {
    method: 'POST',
    path: '/v1/webhooks/whatsapp',
    body: z.unknown(), // raw WhatsApp payload
    responses: { 200: z.object({ ok: z.literal(true) }) },
  },
});

// ─── Group Messaging ──────────────────────────────────────────────────────────

export const GroupId = z.string().uuid().brand<'GroupId'>();
export type GroupId = z.infer<typeof GroupId>;

export const GroupMessageId = z.string().uuid().brand<'GroupMessageId'>();
export type GroupMessageId = z.infer<typeof GroupMessageId>;

export const GroupMemberRole = z.enum(['admin', 'member']);
export type GroupMemberRole = z.infer<typeof GroupMemberRole>;

export const Group = z.object({
  id: GroupId,
  name: z.string().max(100),
  createdBy: UserId,
  avatarUrl: z.string().url().optional(),
  memberCount: z.number().int().default(0),
  createdAt: z.string().datetime(),
});
export type GroupType = z.infer<typeof Group>;

export const GroupMember = z.object({
  groupId: GroupId,
  userId: UserId,
  role: GroupMemberRole,
  joinedAt: z.string().datetime(),
});
export type GroupMemberType = z.infer<typeof GroupMember>;

export const GroupMessage = z.object({
  id: GroupMessageId,
  groupId: GroupId,
  senderId: UserId,
  text: z.string().max(2000),
  createdAt: z.string().datetime(),
});
export type GroupMessageType = z.infer<typeof GroupMessage>;

export const messagingGroupsContract = c.router({
  createGroup: {
    method: 'POST',
    path: '/messaging/groups',
    body: z.object({
      name: z.string().min(1).max(100),
      avatarUrl: z.string().url().optional(),
      memberIds: z.array(UserId).max(50).optional(),
    }),
    responses: {
      201: Group,
      400: z.object({ code: z.string() }),
      401: z.object({ code: z.string() }),
    },
  },
  listGroups: {
    method: 'GET',
    path: '/messaging/groups',
    query: z.object({ cursor: z.string().optional() }),
    responses: {
      200: z.object({ items: z.array(Group), nextCursor: z.string().optional() }),
      401: z.object({ code: z.string() }),
    },
  },
  sendGroupMessage: {
    method: 'POST',
    path: '/messaging/groups/:groupId/messages',
    pathParams: z.object({ groupId: GroupId }),
    body: z.object({ text: z.string().min(1).max(2000) }),
    responses: {
      201: GroupMessage,
      400: z.object({ code: z.string() }),
      403: z.object({ code: z.string() }),
      404: z.object({ code: z.string() }),
    },
  },
  listGroupMessages: {
    method: 'GET',
    path: '/messaging/groups/:groupId/messages',
    pathParams: z.object({ groupId: GroupId }),
    query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(50).default(20) }),
    responses: {
      200: z.object({ items: z.array(GroupMessage), nextCursor: z.string().optional() }),
      403: z.object({ code: z.string() }),
      404: z.object({ code: z.string() }),
    },
  },
  addGroupMember: {
    method: 'POST',
    path: '/messaging/groups/:groupId/members',
    pathParams: z.object({ groupId: GroupId }),
    body: z.object({ userId: UserId, role: GroupMemberRole.optional() }),
    responses: {
      201: GroupMember,
      403: z.object({ code: z.string() }),
      404: z.object({ code: z.string() }),
      409: z.object({ code: z.string() }),
    },
  },
});

export type GroupIdType = z.infer<typeof GroupId>;
export type GroupMessageIdType = z.infer<typeof GroupMessageId>;
