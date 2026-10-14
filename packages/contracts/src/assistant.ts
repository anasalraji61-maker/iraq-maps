import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId } from './common';

const c = initContract();

// Tool result types the assistant can call
export const AssistantToolName = z.enum([
  'search_places',
  'get_place_details',
  'get_directions',
  'get_crowding',
  'compose_message',
]);

export const AssistantMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const AssistantTurn = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(AssistantMessage),
});

export const AssistantResponse = z.object({
  sessionId: z.string().uuid(),
  reply: z.string(),
  // If assistant wants to trigger compose screen
  composeParams: z
    .object({
      text: z.string().optional(),
      placeIds: z.array(PlaceId).max(5).optional(),
    })
    .optional(),
  // If assistant wants to show a place on map (single, kept for compat)
  focusPlaceId: PlaceId.optional(),
  // If assistant wants to show multiple places on map (up to 5)
  focusPlaceIds: z.array(PlaceId).max(5).optional(),
  // Names keyed by place ID for focusPlaceIds
  focusPlaceNames: z.record(z.string(), z.string()).optional(),
});

export const AssistantSessionId = z.string().uuid().brand('AssistantSessionId');

export const assistantContract = c.router({
  chat: {
    method: 'POST',
    path: '/assistant/chat',
    body: AssistantTurn,
    responses: {
      200: AssistantResponse,
      429: z.object({
        type: z.literal('about:blank'),
        title: z.string(),
        status: z.literal(429),
        code: z.string(),
      }),
    },
    summary: 'Send a message to the AI travel assistant',
  },
  getSession: {
    method: 'GET',
    path: '/assistant/sessions/:sessionId',
    pathParams: z.object({ sessionId: AssistantSessionId }),
    responses: {
      200: z.object({
        sessionId: AssistantSessionId,
        messages: z.array(AssistantMessage),
        createdAt: z.string().datetime(),
      }),
      404: z.object({
        type: z.literal('about:blank'),
        title: z.string(),
        status: z.literal(404),
        code: z.string(),
      }),
    },
    summary: 'Get assistant session history',
  },
  deleteSession: {
    method: 'DELETE',
    path: '/assistant/sessions/:sessionId',
    pathParams: z.object({ sessionId: AssistantSessionId }),
    responses: {
      204: z.undefined(),
      404: z.object({
        type: z.literal('about:blank'),
        title: z.string(),
        status: z.literal(404),
        code: z.string(),
      }),
    },
    summary: 'Delete assistant session',
  },
});

export type AssistantTurnType = z.infer<typeof AssistantTurn>;
export type AssistantResponseType = z.infer<typeof AssistantResponse>;
