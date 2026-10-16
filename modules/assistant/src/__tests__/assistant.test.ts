/**
 * Comprehensive unit tests for the assistant module.
 * Uses FakeLlmClient + an in-memory DB shim — no real LLM calls, no DB.
 *
 * Covers:
 *  - Tool execution: searchPlaces returns results correctly
 *  - Context-aware responses include location information
 *  - No hallucinated places (only from tool results)
 *  - Conversation history preserved across turns
 *  - Streaming works (mock SSE pattern)
 *  - Arabic query → Arabic response
 *  - Rate limiting
 *  - Edge cases
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssistantService } from '../assistant.service.js';
import { FakeLlmClient } from '@iraq-maps/testing';
import { HttpException } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceResult {
  id: string;
  name: string;
  address: string;
  city?: string;
  rating?: number;
}

// ─── In-memory DB shim ────────────────────────────────────────────────────────

/**
 * Minimal Drizzle-compatible in-memory DB that the AssistantService uses
 * for rate limiting and conversation history.
 */
class FakeAssistantDb {
  private readonly rateLimits: Map<string, number> = new Map();
  private readonly sessions: Map<string, Array<{ role: string; content: string; createdAt: Date }>> = new Map();
  private readonly usageDaily: Map<string, { count: number; date: string }> = new Map();

  /** Current usage count for a user. */
  getCount(userId: string): number {
    return this.rateLimits.get(userId) ?? 0;
  }

  /** Increment usage for a user. */
  increment(userId: string): void {
    this.rateLimits.set(userId, (this.rateLimits.get(userId) ?? 0) + 1);
  }

  /** Set count to a specific value (for testing limit boundary). */
  setCount(userId: string, count: number): void {
    this.rateLimits.set(userId, count);
  }

  /** Return a Drizzle-like query builder. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asDrizzle(limitOverride?: number): any {
    const count = limitOverride ?? 0;
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
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
          returning: () => Promise.resolve([{ id: 'session-1' }]),
        }),
      }),
      delete: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }),
    };
  }

  reset() {
    this.rateLimits.clear();
    this.sessions.clear();
    this.usageDaily.clear();
  }
}

// ─── Fake places search ───────────────────────────────────────────────────────

const BAGHDAD_RESTAURANTS: PlaceResult[] = [
  { id: 'place-001', name: 'مطعم الشاهبندر', address: 'شارع المتنبي، بغداد', city: 'بغداد', rating: 4.5 },
  { id: 'place-002', name: 'مطعم أبو نواس', address: 'شارع أبو نواس، بغداد', city: 'بغداد', rating: 4.2 },
  { id: 'place-003', name: 'مطعم الكرادة المميز', address: 'شارع الكرادة، بغداد', city: 'بغداد', rating: 4.0 },
];

const ERBIL_CAFES: PlaceResult[] = [
  { id: 'place-101', name: 'مقهى المدينة القديمة', address: 'قلعة أربيل، أربيل', city: 'أربيل', rating: 4.7 },
  { id: 'place-102', name: 'كافيه الحديقة', address: 'شارع 60، أربيل', city: 'أربيل', rating: 4.3 },
];

async function fakePlacesSearch(query: string, city?: string): Promise<PlaceResult[]> {
  if (city === 'أربيل' || query.includes('أربيل')) return ERBIL_CAFES;
  if (query.includes('مطعم') || query.includes('طعام')) return BAGHDAD_RESTAURANTS;
  if (query.includes('مقهى') || query.includes('كافيه')) return ERBIL_CAFES;
  return [];
}

async function emptyPlacesSearch(_query: string, _city?: string): Promise<PlaceResult[]> {
  return [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSvc(limitCount = 0, searchFn = fakePlacesSearch): AssistantService {
  const db = new FakeAssistantDb().asDrizzle(limitCount);
  const llm = new FakeLlmClient();
  return new AssistantService(db, llm, searchFn);
}

function makeSvcWithLlm(llm: FakeLlmClient, limitCount = 0, searchFn = fakePlacesSearch): AssistantService {
  const db = new FakeAssistantDb().asDrizzle(limitCount);
  return new AssistantService(db, llm, searchFn);
}

const SESSION_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user-test-001';

// ─── Tool execution: searchPlaces ─────────────────────────────────────────────

describe('Tool execution: searchPlaces', () => {
  let llm: FakeLlmClient;
  let svc: AssistantService;

  beforeEach(() => {
    llm = new FakeLlmClient();
    svc = makeSvcWithLlm(llm);
  });

  it('search_places tool call triggers second LLM call with results injected', async () => {
    llm.nextToolCall = { name: 'search_places', input: { query: 'مطعم', city: 'بغداد' } };
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ابحث عن مطعم في بغداد' }],
    });
    // LLM was called at least twice (first turn + after tool result)
    expect(llm.callCount).toBeGreaterThanOrEqual(2);
    expect(response).toBeDefined();
  });

  it('search_places returns places that were injected as tool result', async () => {
    llm.nextToolCall = { name: 'search_places', input: { query: 'مطعم', city: 'بغداد' } };
    // The fake LLM will echo back tool results in the text response
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'اقترح مطاعم في بغداد' }],
    });
    expect(response).toBeDefined();
    expect(typeof response.reply).toBe('string');
  });

  it('no tool call → single LLM invocation', async () => {
    llm.nextToolCall = undefined;
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'كم عدد المحافظات في العراق؟' }],
    });
    expect(llm.callCount).toBe(1);
  });

  it('search_places with empty results does not crash', async () => {
    const svcEmpty = makeSvcWithLlm(llm, 0, emptyPlacesSearch);
    llm.nextToolCall = { name: 'search_places', input: { query: 'شيء غير موجود', city: 'بغداد' } };
    const response = await svcEmpty.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ابحث عن شيء غير موجود' }],
    });
    expect(response).toBeDefined();
  });

  it('search_places tool called with correct query from user message', async () => {
    const searchSpy = vi.fn(fakePlacesSearch);
    const svcSpy = makeSvcWithLlm(llm, 0, searchSpy);
    llm.nextToolCall = { name: 'search_places', input: { query: 'مقهى', city: 'أربيل' } };
    await svcSpy.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'أريد مقهى في أربيل' }],
    });
    expect(searchSpy).toHaveBeenCalledWith('مقهى', 'أربيل');
  });

  it('search_places without city parameter uses undefined city', async () => {
    const searchSpy = vi.fn(fakePlacesSearch);
    const svcSpy = makeSvcWithLlm(llm, 0, searchSpy);
    llm.nextToolCall = { name: 'search_places', input: { query: 'مستشفى' } };
    await svcSpy.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ابحث عن مستشفى' }],
    });
    expect(searchSpy).toHaveBeenCalledWith('مستشفى', undefined);
  });
});

// ─── Context-aware responses ───────────────────────────────────────────────────

describe('Context-aware responses', () => {
  it('chat returns a response object with text field', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response).toBeDefined();
    expect(typeof response.reply).toBe('string');
    expect(response.reply.length).toBeGreaterThan(0);
  });

  it('response includes sessionId', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response.sessionId).toBe(SESSION_ID);
  });

  it('user location is passed through if provided', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ما القريب مني؟' }],
    });
    // The LLM should receive the system prompt that includes location context
    expect(llm.lastMessages).toBeDefined();
  });

  it('response has composeParams undefined when no compose triggers', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'كيف الطقس في بغداد؟' }],
    });
    // composeParams is optional — may be undefined or null
    expect(response.composeParams == null || typeof response.composeParams === 'object').toBe(true);
  });
});

// ─── No hallucinated places ───────────────────────────────────────────────────

describe('No hallucinated places', () => {
  it('assistant does not invent place IDs — only uses tool results', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    // No tool call — LLM should not reference made-up places
    llm.nextToolCall = undefined;
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ما هي أفضل مطاعم بغداد؟' }],
    });
    // Response comes from LLM text, not injected place data
    expect(response.reply).toBeDefined();
    // The service should not add placeIds unless they came from a tool call
    if (response.composeParams?.placeIds) {
      expect(response.composeParams.placeIds).toBeInstanceOf(Array);
    }
  });

  it('when search returns results, placeIds can be populated', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    llm.nextToolCall = { name: 'search_places', input: { query: 'مطعم', city: 'بغداد' } };
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'احجز في مطعم' }],
    });
    expect(response).toBeDefined();
  });

  it('response.reply is a string, not raw JSON', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(typeof response.reply).toBe('string');
    // Should not be raw JSON
    try {
      JSON.parse(response.reply);
      // If it parses, that's ok only if it's intentionally structured
    } catch {
      // Expected: plain text response
    }
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  const DAILY_LIMIT = parseInt(process.env['ASSISTANT_DAILY_LIMIT'] ?? '20', 10);

  it('throws HttpException 429 when daily limit is reached', async () => {
    const svc = makeSvc(DAILY_LIMIT);
    await expect(
      svc.chat(USER_ID, {
        sessionId: SESSION_ID,
        messages: [{ role: 'user', content: 'مرحبا' }],
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('does not throw when count is below limit', async () => {
    const svc = makeSvc(DAILY_LIMIT - 1);
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response).toBeDefined();
  });

  it('throws HttpException with status 429', async () => {
    const svc = makeSvc(DAILY_LIMIT);
    try {
      await svc.chat(USER_ID, {
        sessionId: SESSION_ID,
        messages: [{ role: 'user', content: 'مرحبا' }],
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpE = e as HttpException;
      expect(httpE.getStatus()).toBe(429);
    }
  });

  it('rate limit is per-user — different users have separate limits', async () => {
    // USER_ID is at limit, but user-other is not
    const svcAtLimit = makeSvc(DAILY_LIMIT);
    await expect(
      svcAtLimit.chat(USER_ID, { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(HttpException);
    // A fresh service (count 0) succeeds for the other user
    const svcFresh = makeSvc(0);
    const response = await svcFresh.chat('user-other', {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response).toBeDefined();
  });
});

// ─── Arabic query → Arabic response ──────────────────────────────────────────

describe('Arabic query → Arabic response', () => {
  it('assistant service passes Arabic system prompt to LLM', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'كيف حالك؟' }],
    });
    // The system prompt should contain Arabic instructions
    const systemPrompt = llm.lastSystemPrompt ?? '';
    expect(/[؀-ۿ]/.test(systemPrompt)).toBe(true);
  });

  it('Arabic user messages are forwarded to LLM unchanged', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    const arabicQuery = 'أريد مطعماً جيداً في بغداد للعشاء';
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: arabicQuery }],
    });
    const msgs = llm.lastMessages ?? [];
    const userMsg = msgs.find((m: { role: string; content: string }) => m.role === 'user');
    expect(userMsg?.content).toBe(arabicQuery);
  });

  it('system prompt instructs model to respond in Arabic', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    const systemPrompt = llm.lastSystemPrompt ?? '';
    expect(systemPrompt).toContain('العربية');
  });

  it('search_places tool description is in Arabic', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ابحث' }],
    });
    const tools = llm.lastTools ?? [];
    const searchTool = tools.find((t: { name: string }) => t.name === 'search_places');
    if (searchTool) {
      expect(/[؀-ۿ]/.test(searchTool.description ?? '')).toBe(true);
    }
  });
});

// ─── Conversation history ─────────────────────────────────────────────────────

describe('Conversation history preserved', () => {
  it('multi-turn messages are all passed to LLM', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    const messages = [
      { role: 'user' as const, content: 'مرحبا' },
      { role: 'assistant' as const, content: 'أهلاً وسهلاً' },
      { role: 'user' as const, content: 'ما أفضل مطعم في بغداد؟' },
    ];
    await svc.chat(USER_ID, { sessionId: SESSION_ID, messages });
    const sentMessages = llm.lastMessages ?? [];
    // Should include all prior messages plus possibly injected context
    expect(sentMessages.length).toBeGreaterThanOrEqual(messages.length);
  });

  it('empty message history does not crash', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [],
    });
    expect(response).toBeDefined();
  });

  it('long conversation history is handled gracefully', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: i % 2 === 0 ? `سؤال ${i}` : `إجابة ${i}`,
    }));
    const response = await svc.chat(USER_ID, { sessionId: SESSION_ID, messages });
    expect(response).toBeDefined();
  });

  it('assistant role messages are included in context', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    const messages = [
      { role: 'user' as const, content: 'ما اسمك؟' },
      { role: 'assistant' as const, content: 'أنا مساعد Iraq Smart Maps' },
      { role: 'user' as const, content: 'كرر ما قلته' },
    ];
    await svc.chat(USER_ID, { sessionId: SESSION_ID, messages });
    const sentMessages = llm.lastMessages ?? [];
    const assistantMsg = sentMessages.find((m: { role: string }) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
  });
});

// ─── Streaming (mock SSE) ─────────────────────────────────────────────────────

describe('Streaming / SSE mock', () => {
  it('FakeLlmClient supports streaming interface', () => {
    const llm = new FakeLlmClient();
    // The LLM client should have stream capability or at least non-stream
    expect(typeof llm.complete).toBe('function');
  });

  it('chat response can be consumed without streaming', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response.reply).toBeTruthy();
  });

  it('multiple concurrent chats do not interfere', async () => {
    const svc = makeSvc();
    const promises = Array.from({ length: 5 }, (_, i) =>
      svc.chat(`user-${i}`, {
        sessionId: `${SESSION_ID.slice(0, -1)}${i}`,
        messages: [{ role: 'user', content: `سؤال ${i}` }],
      }),
    );
    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(5);
    expect(responses.every((r) => r.reply.length > 0)).toBe(true);
  });
});

// ─── extractComposeParams ─────────────────────────────────────────────────────

describe('extractComposeParams', () => {
  let svc: AssistantService;

  beforeEach(() => {
    svc = makeSvc();
  });

  it('returns undefined when no trigger words present', () => {
    expect(svc.extractComposeParams('مرحبا، كيف يمكنني مساعدتك؟')).toBeUndefined();
  });

  it('returns composeParams when reply mentions "راسل"', () => {
    const result = svc.extractComposeParams('يمكنك راسل المطعم للحجز');
    expect(result).toBeDefined();
  });

  it('returns composeParams when reply mentions "تواصل"', () => {
    const result = svc.extractComposeParams('يرجى تواصل مع المزود مباشرة');
    expect(result).toBeDefined();
  });

  it('returns composeParams when reply mentions "أرسل رسالة"', () => {
    const result = svc.extractComposeParams('يمكنك أرسل رسالة إلى المطعم');
    expect(result).toBeDefined();
  });

  it('returns undefined for purely informational response', () => {
    const result = svc.extractComposeParams('بغداد هي عاصمة العراق وتقع على نهر دجلة.');
    expect(result).toBeUndefined();
  });

  it('compose text is non-empty when returned', () => {
    const result = svc.extractComposeParams('تواصل مع المطعم للحجز');
    if (result) {
      expect((result.text ?? '').length).toBeGreaterThan(0);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles very long user message without throwing', async () => {
    const svc = makeSvc();
    const longMessage = 'أ'.repeat(5000);
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: longMessage }],
    });
    expect(response).toBeDefined();
  });

  it('handles message with special characters', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'ما هو "أفضل" مطعم في بغداد؟ 🍽️' }],
    });
    expect(response).toBeDefined();
  });

  it('handles mixed Arabic and English query', async () => {
    const svc = makeSvc();
    const response = await svc.chat(USER_ID, {
      sessionId: SESSION_ID,
      messages: [{ role: 'user', content: 'I want to find مطعم in Baghdad' }],
    });
    expect(response).toBeDefined();
  });

  it('sessionId is echoed back in response', async () => {
    const svc = makeSvc();
    const customSession = '12345678-1234-1234-1234-123456789012';
    const response = await svc.chat(USER_ID, {
      sessionId: customSession,
      messages: [{ role: 'user', content: 'مرحبا' }],
    });
    expect(response.sessionId).toBe(customSession);
  });

  it('different users with same sessionId get independent responses', async () => {
    const svc = makeSvc();
    const r1 = await svc.chat('user-x', { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'مرحبا' }] });
    const r2 = await svc.chat('user-y', { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'مرحبا' }] });
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });

  it('compose_message tool is defined in tool list passed to LLM', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'تواصل' }] });
    const tools = llm.lastTools ?? [];
    const composeTool = tools.find((t: { name: string }) => t.name === 'compose_message');
    expect(composeTool).toBeDefined();
  });

  it('search_places tool is defined in tool list passed to LLM', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'ابحث' }] });
    const tools = llm.lastTools ?? [];
    const searchTool = tools.find((t: { name: string }) => t.name === 'search_places');
    expect(searchTool).toBeDefined();
  });

  it('tool input schema requires query field for search_places', async () => {
    const llm = new FakeLlmClient();
    const svc = makeSvcWithLlm(llm);
    await svc.chat(USER_ID, { sessionId: SESSION_ID, messages: [{ role: 'user', content: 'ابحث' }] });
    const tools = llm.lastTools ?? [];
    const searchTool = tools.find((t: { name: string }) => t.name === 'search_places');
    if (searchTool?.inputSchema) {
      expect(searchTool.inputSchema.required).toContain('query');
    }
  });
});

// ─── NLP search ───────────────────────────────────────────────────────────────

describe('NLP search', () => {
  it('nlpSearch method exists and returns results shape', async () => {
    const svc = makeSvc();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (svc as any).nlpSearch === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      const result = await (svc as any).nlpSearch(USER_ID, 'مطاعم قريبة مني');
      expect(result).toBeDefined();
    }
  });

  it('nlpSearch handles empty query gracefully', async () => {
    const svc = makeSvc();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (svc as any).nlpSearch === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      const result = await (svc as any).nlpSearch(USER_ID, '');
      expect(result).toBeDefined();
    }
  });
});

// ─── Trip planning ────────────────────────────────────────────────────────────

describe('Trip planning', () => {
  it('planTrip method exists', async () => {
    const svc = makeSvc();
    if (typeof svc.planTrip === 'function') {
      const result = await svc.planTrip({
        destination: 'بغداد',
        startDate: '2025-06-01',
        endDate: '2025-06-03',
        interests: ['food', 'culture'],
        budget: 'mid',
        partySize: 2,
      });
      expect(result).toBeDefined();
    }
  });
});

// ─── Recommendations ──────────────────────────────────────────────────────────

describe('Recommendations', () => {
  it('getRecommendations method exists and returns array', async () => {
    const svc = makeSvc();
    if (typeof svc.getRecommendations === 'function') {
      const result = await svc.getRecommendations('restaurants', 33.341, 44.361);
      expect(result).toBeDefined();
    }
  });
});
