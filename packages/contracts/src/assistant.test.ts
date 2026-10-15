/**
 * Unit tests for assistant contract schemas.
 */
import { describe, expect, it } from 'vitest';
import {
  AssistantToolName,
  AssistantMessage,
  AssistantTurn,
  AssistantResponse,
  AssistantSessionId,
  TripPlanRequest,
  TripPlanResponse,
  RecommendationsResponse,
  NLPSearchRequest,
  NLPSearchResponse,
} from './assistant';

const SESSION_ID = '00000000-0000-0000-0000-000000000001';
const PLACE_ID = 'n12345';

describe('AssistantToolName', () => {
  it('accepts search_places', () => expect(AssistantToolName.parse('search_places')).toBe('search_places'));
  it('accepts get_place_details', () => expect(AssistantToolName.parse('get_place_details')).toBe('get_place_details'));
  it('accepts get_directions', () => expect(AssistantToolName.parse('get_directions')).toBe('get_directions'));
  it('accepts get_crowding', () => expect(AssistantToolName.parse('get_crowding')).toBe('get_crowding'));
  it('accepts compose_message', () => expect(AssistantToolName.parse('compose_message')).toBe('compose_message'));
  it('rejects unknown tool', () => expect(() => AssistantToolName.parse('send_email')).toThrow());
});

describe('AssistantMessage', () => {
  it('parses a user message', () => {
    const m = AssistantMessage.parse({ role: 'user', content: 'أين أقرب مطعم؟' });
    expect(m.role).toBe('user');
  });

  it('parses an assistant message', () => {
    const m = AssistantMessage.parse({ role: 'assistant', content: 'أنصح بمطعم بغداد' });
    expect(m.role).toBe('assistant');
  });

  it('rejects invalid role', () => {
    expect(() => AssistantMessage.parse({ role: 'system', content: 'hi' })).toThrow();
  });

  it('requires content field', () => {
    expect(() => AssistantMessage.parse({ role: 'user' })).toThrow();
  });
});

describe('AssistantTurn', () => {
  const VALID_TURN = {
    sessionId: SESSION_ID,
    messages: [{ role: 'user', content: 'مرحبا' }],
  };

  it('parses a valid turn', () => {
    const t = AssistantTurn.parse(VALID_TURN);
    expect(t.messages).toHaveLength(1);
  });

  it('accepts empty messages array', () => {
    const t = AssistantTurn.parse({ ...VALID_TURN, messages: [] });
    expect(t.messages).toHaveLength(0);
  });

  it('rejects non-UUID sessionId', () => {
    expect(() => AssistantTurn.parse({ ...VALID_TURN, sessionId: 'not-uuid' })).toThrow();
  });

  it('rejects missing sessionId', () => {
    expect(() => AssistantTurn.parse({ messages: [] })).toThrow();
  });

  it('accepts multiple messages', () => {
    const t = AssistantTurn.parse({
      ...VALID_TURN,
      messages: [
        { role: 'user', content: 'سؤال' },
        { role: 'assistant', content: 'جواب' },
      ],
    });
    expect(t.messages).toHaveLength(2);
  });
});

describe('AssistantResponse', () => {
  const VALID_RESPONSE = {
    sessionId: SESSION_ID,
    reply: 'هنا المطاعم القريبة منك',
  };

  it('parses a minimal response', () => {
    const r = AssistantResponse.parse(VALID_RESPONSE);
    expect(r.reply).toBe('هنا المطاعم القريبة منك');
    expect(r.composeParams).toBeUndefined();
  });

  it('accepts optional focusPlaceId', () => {
    const r = AssistantResponse.parse({ ...VALID_RESPONSE, focusPlaceId: PLACE_ID });
    expect(r.focusPlaceId).toBe(PLACE_ID);
  });

  it('accepts optional focusPlaceIds array up to 5', () => {
    const r = AssistantResponse.parse({ ...VALID_RESPONSE, focusPlaceIds: [PLACE_ID, 'n99'] });
    expect(r.focusPlaceIds).toHaveLength(2);
  });

  it('rejects focusPlaceIds over 5', () => {
    expect(() =>
      AssistantResponse.parse({ ...VALID_RESPONSE, focusPlaceIds: ['a', 'b', 'c', 'd', 'e', 'f'] })
    ).toThrow();
  });

  it('accepts optional composeParams', () => {
    const r = AssistantResponse.parse({
      ...VALID_RESPONSE,
      composeParams: { text: 'هل أنتم مفتوحون؟', placeIds: [PLACE_ID] },
    });
    expect(r.composeParams?.placeIds).toHaveLength(1);
  });

  it('rejects composeParams with more than 5 placeIds', () => {
    expect(() =>
      AssistantResponse.parse({
        ...VALID_RESPONSE,
        composeParams: { placeIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
      })
    ).toThrow();
  });

  it('accepts optional focusPlaceNames map', () => {
    const r = AssistantResponse.parse({ ...VALID_RESPONSE, focusPlaceNames: { [PLACE_ID]: 'مطعم بغداد' } });
    expect(r.focusPlaceNames?.[PLACE_ID]).toBe('مطعم بغداد');
  });
});

describe('AssistantSessionId', () => {
  it('parses a valid UUID', () => {
    const id = AssistantSessionId.parse(SESSION_ID);
    expect(typeof id).toBe('string');
  });

  it('rejects non-UUID', () => {
    expect(() => AssistantSessionId.parse('session-abc')).toThrow();
  });
});

describe('TripPlanRequest', () => {
  const VALID = {
    destination: 'بغداد',
    startDate: '2026-11-01',
    endDate: '2026-11-03',
    interests: ['food', 'culture'],
    budget: 'mid',
    partySize: 2,
  };

  it('parses a valid request', () => {
    const r = TripPlanRequest.parse(VALID);
    expect(r.destination).toBe('بغداد');
    expect(r.budget).toBe('mid');
  });

  it('defaults partySize to 2', () => {
    const r = TripPlanRequest.parse({ ...VALID, partySize: undefined });
    expect(r.partySize).toBe(2);
  });

  it('rejects empty interests', () => {
    expect(() => TripPlanRequest.parse({ ...VALID, interests: [] })).toThrow();
  });

  it('rejects invalid budget', () => {
    expect(() => TripPlanRequest.parse({ ...VALID, budget: 'expensive' })).toThrow();
  });
});

describe('TripPlanResponse', () => {
  it('parses a valid response', () => {
    const r = TripPlanResponse.parse({
      planId: SESSION_ID,
      destination: 'بغداد',
      summary: 'جولة رائعة',
      days: [{
        day: 1,
        date: '2026-11-01',
        theme: 'التاريخ والثقافة',
        activities: [{ time: '09:00', title: 'متحف بغداد', description: 'زيارة المتحف' }],
      }],
      tips: ['احضر معك الماء'],
    });
    expect(r.days).toHaveLength(1);
  });
});

describe('RecommendationsResponse', () => {
  it('parses a valid response', () => {
    const r = RecommendationsResponse.parse({
      category: 'restaurants',
      places: [{
        name: 'مطعم بغداد',
        category: 'مطعم عراقي',
        aiReason: 'يقدم أفضل المسكوف في المنطقة',
      }],
    });
    expect(r.places).toHaveLength(1);
    expect(r.places[0]?.aiReason).toBeTruthy();
  });
});

describe('NLPSearchRequest', () => {
  it('parses a text query', () => {
    const r = NLPSearchRequest.parse({ query: 'فندق رخيص قرب المركز بموقف سيارات' });
    expect(r.query).toBeTruthy();
  });

  it('accepts optional lat/lng', () => {
    const r = NLPSearchRequest.parse({ query: 'مطعم', lat: 33.3, lng: 44.4 });
    expect(r.lat).toBe(33.3);
  });
});

describe('NLPSearchResponse', () => {
  it('parses a valid response', () => {
    const r = NLPSearchResponse.parse({
      query: 'فندق رخيص',
      parsedFilters: { category: 'hotel', maxPrice: 'budget' },
      results: [{ name: 'فندق الرشيد', matchReason: 'سعر مناسب', score: 0.9 }],
      totalFound: 1,
    });
    expect(r.results).toHaveLength(1);
  });
});
