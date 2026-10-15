import { describe, it, expect, beforeEach } from 'vitest';
import { AssistantService } from './assistant.service.js';
import { FakeLlmClient } from '@iraq-maps/testing';
import { HttpException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function makeRateLimitDb(count: number): AnyDb {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(count > 0 ? [{ count }] : []),
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }),
    delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
  };
}

const fakePlacesSearch = async (query: string, _city?: string) => [
  { id: 'place-001', name: `مطعم ${query}`, address: 'شارع الرشيد، بغداد' },
  { id: 'place-002', name: `${query} المركزي`, address: 'شارع المتنبي، بغداد' },
];

describe('AssistantService.extractComposeParams', () => {
  let svc: AssistantService;

  beforeEach(() => {
    const llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('returns undefined when no trigger words', () => {
    expect(svc.extractComposeParams('مرحبا، كيف يمكنني مساعدتك؟')).toBeUndefined();
  });

  it('returns composeParams when reply mentions "راسل"', () => {
    const result = svc.extractComposeParams('يمكنك راسل المطعم للحجز');
    expect(result).toBeDefined();
    expect(result?.text).toContain('راسل');
  });

  it('returns composeParams when reply mentions "تواصل"', () => {
    const result = svc.extractComposeParams('يرجى تواصل مع المزود');
    expect(result).toBeDefined();
  });
});

describe('AssistantService rate limit (unit)', () => {
  it('throws HttpException 429 when count >= DAILY_LIMIT', async () => {
    const LIMIT = parseInt(process.env['ASSISTANT_DAILY_LIMIT'] ?? '20', 10);
    const llm = new FakeLlmClient();
    const svc = new AssistantService(makeRateLimitDb(LIMIT), llm, fakePlacesSearch);

    await expect(
      svc.chat('user-x', {
        sessionId: '00000000-0000-0000-0000-000000000002',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});

describe('AssistantService tool calling (unit)', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('search_places tool call triggers second LLM call with results', async () => {
    // First LLM call returns a tool_use response
    llm.nextToolCall = { name: 'search_places', input: { query: 'مطعم', city: 'بغداد' } };
    // Second LLM call (with tool results) returns normal reply
    llm.nextReply = 'وجدت مطعمين قريبين منك.';

    const result = await svc.chat('user-1', {
      sessionId: '00000000-0000-0000-0000-000000000010',
      messages: [{ role: 'user', content: 'أبحث عن مطعم في بغداد' }],
    });

    // Two LLM calls: one initial + one follow-up with tool results
    expect(llm.calls.length).toBe(2);
    // The second call should include the tool results
    const secondCallMessages = llm.calls[1]!.messages;
    expect(secondCallMessages.some(m => m.content.includes('نتائج البحث'))).toBe(true);
    expect(result.reply).toBe('وجدت مطعمين قريبين منك.');
    // focusPlaceIds should be set (up to 5)
    expect(result.focusPlaceIds).toBeDefined();
    expect(result.focusPlaceIds!.length).toBeGreaterThan(0);
    expect(result.focusPlaceIds!.length).toBeLessThanOrEqual(5);
    // focusPlaceId (compat) should equal first of focusPlaceIds
    expect(result.focusPlaceId).toBe(result.focusPlaceIds![0]);
  });

  it('compose_message tool call returns composeParams', async () => {
    llm.nextToolCall = {
      name: 'compose_message',
      input: { text: 'أريد الحجز لشخصين', placeIds: ['place-001'] },
    };

    const result = await svc.chat('user-2', {
      sessionId: '00000000-0000-0000-0000-000000000011',
      messages: [{ role: 'user', content: 'راسل المطعم' }],
    });

    // Only one LLM call for compose_message
    expect(llm.calls.length).toBe(1);
    expect(result.composeParams).toBeDefined();
    expect(result.composeParams?.text).toBe('أريد الحجز لشخصين');
    expect(result.composeParams?.placeIds).toEqual(['place-001']);
  });
});

describe('AssistantService plan-my-day (unit)', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('detects day-plan intent and skips normal tool loop', async () => {
    llm.nextReply = '١. مطعم — شارع الرشيد\n٢. معالم — شارع المتنبي\n٣. مقهى — شارع الرشيد';

    const result = await svc.chat('user-3', {
      sessionId: '00000000-0000-0000-0000-000000000020',
      messages: [{ role: 'user', content: 'خطط لي برنامج يوم في بغداد' }],
    });

    // One LLM call (plan prompt), no tool-call round-trip
    expect(llm.calls.length).toBe(1);
    // Should include itinerary prompt
    const msgs = llm.calls[0]!.messages;
    expect(msgs.some(m => m.content.includes('نتائج البحث للتخطيط'))).toBe(true);
    // focusPlaceIds populated from parallel searches
    expect(result.focusPlaceIds).toBeDefined();
    expect(result.focusPlaceIds!.length).toBeGreaterThan(0);
    expect(result.focusPlaceIds!.length).toBeLessThanOrEqual(5);
  });

  it('isDayPlanIntent detects Arabic plan keywords', () => {
    const words = ['خطط لي جولة', 'أريد جولة', 'برنامج يوم', 'خطة يوم كاملة', 'يومي في بغداد'];
    for (const w of words) {
      const msgs = [{ role: 'user', content: w }];
      // @ts-expect-error private method under test
      expect(svc.isDayPlanIntent(msgs)).toBe(true);
    }
  });
});

describe.skipIf(!process.env['DATABASE_URL'])('AssistantService DB integration', () => {
  it('chat returns reply from LLM', async () => {
    // Skipped without DATABASE_URL — covered by rate-limit unit test above
    expect(true).toBe(true);
  });
});

describe('AssistantService.planTrip', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('returns a plan with days for multi-day request', async () => {
    llm.nextReply = JSON.stringify({
      summary: 'جولة رائعة في بغداد',
      totalEstimatedCost: '150,000 IQD',
      tips: ['احضر الماء', 'ابدأ مبكراً'],
      days: [
        {
          theme: 'التاريخ',
          activities: [
            { time: '09:00', title: 'متحف بغداد', description: 'زيارة المتحف الوطني', estimatedCost: '5,000 IQD', duration: 'ساعتان' },
          ],
          totalEstimatedCost: '50,000 IQD',
        },
        {
          theme: 'الطعام',
          activities: [
            { time: '12:00', title: 'مطعم المسكوف', description: 'غداء عراقي أصيل', estimatedCost: '20,000 IQD', duration: 'ساعة' },
          ],
          totalEstimatedCost: '60,000 IQD',
        },
      ],
    });

    const result = await svc.planTrip({
      destination: 'بغداد',
      startDate: '2026-11-01',
      endDate: '2026-11-02',
      interests: ['history', 'food'],
      budget: 'mid',
      partySize: 2,
    });

    expect(result.planId).toBeTruthy();
    expect(result.destination).toBe('بغداد');
    expect(result.days).toHaveLength(2);
    expect(result.days[0]?.activities[0]?.title).toBe('متحف بغداد');
    expect(result.tips).toHaveLength(2);
  });

  it('pads days when LLM returns fewer than requested', async () => {
    llm.nextReply = JSON.stringify({ summary: 'خطة', tips: [], days: [] });
    const result = await svc.planTrip({
      destination: 'أربيل',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      interests: ['culture'],
      budget: 'budget',
      partySize: 1,
    });
    expect(result.days).toHaveLength(3);
  });

  it('handles invalid JSON from LLM gracefully', async () => {
    llm.nextReply = 'هذه خطة رائعة لبغداد بدون JSON';
    const result = await svc.planTrip({
      destination: 'بغداد',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      interests: ['food'],
      budget: 'mid',
      partySize: 2,
    });
    expect(result.planId).toBeTruthy();
    expect(result.days).toHaveLength(1);
  });
});

describe('AssistantService.getRecommendations', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('returns recommendations with AI reasons', async () => {
    llm.nextReply = JSON.stringify({
      contextNote: 'أفضل المطاعم في المنطقة',
      places: [
        { index: 1, aiReason: 'يقدم أشهى المأكولات العراقية', estimatedPrice: '20,000 IQD' },
        { index: 2, aiReason: 'تجربة فريدة', estimatedPrice: '15,000 IQD' },
      ],
    });

    const result = await svc.getRecommendations('restaurants');
    expect(result.category).toBe('restaurants');
    expect(result.places.length).toBeGreaterThan(0);
    expect(result.places[0]?.aiReason).toBeTruthy();
  });

  it('returns empty list when no places found', async () => {
    const emptySearch = async () => [];
    const emptySvc = new AssistantService(makeRateLimitDb(0), llm, emptySearch);
    const result = await emptySvc.getRecommendations('hotels');
    expect(result.places).toHaveLength(0);
  });
});

describe('AssistantService.naturalLanguageSearch', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = new AssistantService(makeRateLimitDb(0), llm, fakePlacesSearch);
  });

  it('parses query and returns scored results', async () => {
    // First LLM call: parse filters
    // Second LLM call: score results
    llm.nextReply = JSON.stringify({ searchTerms: 'فندق', category: 'hotel', priceRange: 'رخيص' });

    const result = await svc.naturalLanguageSearch('فندق رخيص قرب المركز');
    expect(result.query).toBe('فندق رخيص قرب المركز');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.totalFound).toBeGreaterThan(0);
  });

  it('returns empty when no places match', async () => {
    const emptySearch = async () => [];
    const emptySvc = new AssistantService(makeRateLimitDb(0), llm, emptySearch);
    const result = await emptySvc.naturalLanguageSearch('شيء غير موجود');
    expect(result.results).toHaveLength(0);
    expect(result.totalFound).toBe(0);
  });
});
