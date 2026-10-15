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

// ─── Trip Planner ───────────────────────────────────────────────────────────

export const BudgetLevel = z.enum(['budget', 'mid', 'luxury']);
export const TripInterest = z.enum(['food', 'culture', 'shopping', 'nature', 'history', 'religious']);

export const TripPlanRequest = z.object({
  destination: z.string().min(1).max(200),
  startDate: z.string().date(),
  endDate: z.string().date(),
  interests: z.array(TripInterest).min(1).max(6),
  budget: BudgetLevel,
  partySize: z.number().int().min(1).max(20).default(2),
});

export const TripActivity = z.object({
  time: z.string(),
  title: z.string(),
  description: z.string(),
  placeId: PlaceId.optional(),
  estimatedCost: z.string().optional(),
  duration: z.string().optional(),
});

export const TripDay = z.object({
  day: z.number().int().min(1),
  date: z.string().date(),
  theme: z.string(),
  activities: z.array(TripActivity),
  totalEstimatedCost: z.string().optional(),
});

export const TripPlanResponse = z.object({
  planId: z.string().uuid(),
  destination: z.string(),
  summary: z.string(),
  days: z.array(TripDay),
  totalEstimatedCost: z.string().optional(),
  tips: z.array(z.string()),
});

// ─── Recommendations ────────────────────────────────────────────────────────

export const RecommendationCategory = z.enum(['restaurants', 'cafes', 'hotels', 'shopping', 'attractions']);

export const PlaceRecommendation = z.object({
  placeId: PlaceId.optional(),
  name: z.string(),
  address: z.string().optional(),
  category: z.string(),
  aiReason: z.string(),
  estimatedPrice: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  distanceMeters: z.number().optional(),
});

export const RecommendationsResponse = z.object({
  category: RecommendationCategory,
  places: z.array(PlaceRecommendation),
  contextNote: z.string().optional(),
});

// ─── Smart NLP Search ────────────────────────────────────────────────────────

export const NLPSearchRequest = z.object({
  query: z.string().min(1).max(500),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const NLPSearchResult = z.object({
  placeId: PlaceId.optional(),
  name: z.string(),
  address: z.string().optional(),
  category: z.string().optional(),
  matchReason: z.string(),
  distanceMeters: z.number().optional(),
  score: z.number().min(0).max(1),
});

export const NLPSearchResponse = z.object({
  query: z.string(),
  parsedFilters: z.record(z.string(), z.unknown()),
  results: z.array(NLPSearchResult),
  totalFound: z.number().int(),
});

// ─── Contract ────────────────────────────────────────────────────────────────

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
  planTrip: {
    method: 'POST',
    path: '/assistant/plan-trip',
    body: TripPlanRequest,
    responses: {
      200: TripPlanResponse,
      429: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(429), code: z.string() }),
    },
    summary: 'Generate an AI trip itinerary',
  },
  getRecommendations: {
    method: 'GET',
    path: '/assistant/recommendations',
    query: z.object({
      category: RecommendationCategory,
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
    }),
    responses: {
      200: RecommendationsResponse,
    },
    summary: 'Get AI-powered place recommendations',
  },
  naturalLanguageSearch: {
    method: 'POST',
    path: '/assistant/search',
    body: NLPSearchRequest,
    responses: {
      200: NLPSearchResponse,
    },
    summary: 'Natural language place search',
  },
});

export type AssistantTurnType = z.infer<typeof AssistantTurn>;
export type AssistantResponseType = z.infer<typeof AssistantResponse>;
export type TripPlanRequestType = z.infer<typeof TripPlanRequest>;
export type TripPlanResponseType = z.infer<typeof TripPlanResponse>;
export type RecommendationsResponseType = z.infer<typeof RecommendationsResponse>;
export type NLPSearchResponseType = z.infer<typeof NLPSearchResponse>;
