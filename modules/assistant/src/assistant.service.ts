import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type { LlmClient } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { eq, and, sql, desc } from 'drizzle-orm';
import { sessionTable, messageTable, rateLimitTable, usageDailyTable } from './schema.js';
import type {
  AssistantTurnType,
  TripPlanRequestType,
  TripPlanResponseType,
  RecommendationsResponseType,
  NLPSearchResponseType,
} from '@iraq-maps/contracts';
import { z } from 'zod';
import { PlaceRecommendation, NLPSearchResult } from '@iraq-maps/contracts';

const DAILY_LIMIT = parseInt(process.env['ASSISTANT_DAILY_LIMIT'] ?? process.env['ASSISTANT_DAILY_LIMIT_PER_USER'] ?? '20', 10);

const SYSTEM_PROMPT = `أنت مساعد سفر ذكي لتطبيق Iraq Smart Maps. تساعد المستخدمين في العراق في:
- اكتشاف الأماكن والمطاعم والخدمات
- الحصول على الاتجاهات والتوصيات
- التواصل مع مزودي الخدمات
- معلومات عن المدن العراقية

أجب دائماً باللغة العربية ما لم يتحدث المستخدم بلغة أخرى.
لا تخترع معلومات عن أماكن محددة — استخدم فقط ما تعرفه بشكل موثوق.`;

const ASSISTANT_TOOLS = [
  {
    name: 'search_places',
    description: 'ابحث عن أماكن أو محلات أو خدمات في العراق. استخدمها عندما يسأل المستخدم عن مكان محدد.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'نص البحث بالعربية' },
        city: { type: 'string', description: 'المدينة (اختياري)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compose_message',
    description: 'افتح شاشة إرسال رسالة إلى مزود خدمة. استخدمها عندما يريد المستخدم التواصل مع مكان.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'نص الرسالة المقترح' },
        placeIds: { type: 'array', items: { type: 'string' }, description: 'معرفات الأماكن' },
      },
    },
  },
];

export type PlacesSearchFn = (query: string, city?: string) => Promise<Array<{ id: string; name: string; address: string; category?: string; distanceMeters?: number }>>;

/** Estimate token count assuming ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Trim history to fit within maxTokens, keeping system prompt budget in mind */
function trimToTokenBudget(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  let total = 0;
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  // Walk backwards and keep messages that fit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const tokens = estimateTokens(msg.content);
    if (total + tokens > maxTokens) break;
    kept.unshift(msg);
    total += tokens;
  }
  return kept;
}

const CONTEXT_TOKEN_BUDGET = 8000;
// Reserve ~500 tokens for system prompt overhead
const HISTORY_TOKEN_BUDGET = CONTEXT_TOKEN_BUDGET - 500;


export const PLACES_SEARCH_TOKEN = 'ASSISTANT_PLACES_SEARCH';

@Injectable()
export class AssistantService {
  constructor(
    @Inject('ASSISTANT_DB') private readonly db: Db,
    @Inject(PortTokens.LlmClient) private readonly llm: LlmClient,
    @Inject(PLACES_SEARCH_TOKEN) private readonly placesSearch: PlacesSearchFn,
  ) {}

  /** Detect day-planning intent in the last user message */
  private isDayPlanIntent(messages: Array<{ role: string; content: string }>): boolean {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return false;
    const text = lastUser.content;
    return /خطط|جولة|برنامج يوم|يومي|خطة يوم/.test(text);
  }

  async chat(userId: string, turn: AssistantTurnType) {
    // Rate limit check — returns remaining messages after this call
    const rateLimitRemaining = await this.checkRateLimit(userId);

    // Upsert session
    const sessionId = turn.sessionId;
    const existing = await this.db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(sessionTable).values({ id: sessionId, userId });
    }

    // Get history — load up to 40 rows then trim by token budget
    const history = await this.db
      .select({ role: messageTable.role, content: messageTable.content })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(messageTable.createdAt)
      .limit(40);

    // Merge history with new messages, then trim to token budget
    const merged = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...turn.messages,
    ];
    const allMessages = trimToTokenBudget(merged, HISTORY_TOKEN_BUDGET);

    let finalContent: string;
    let composeParams: { text?: string; placeIds?: string[] } | undefined;
    let focusPlaceIds: string[] = [];
    const placeNameCache = new Map<string, string>(); // id → display name

    // --- Plan my day: heuristic shortcut before LLM tool loop ---
    if (this.isDayPlanIntent(allMessages)) {
      const lastUser = [...allMessages].reverse().find(m => m.role === 'user');
      // Extract city hint from message if present, otherwise undefined
      const cityMatch = lastUser?.content.match(/في\s+(\S+)/);
      const city = cityMatch?.[1];

      const [restaurants, attractions, cafes] = await Promise.all([
        this.placesSearch('مطاعم', city),
        this.placesSearch('معالم سياحية', city),
        this.placesSearch('مقاهي', city),
      ]);

      // Pick top result from each category, deduplicate, cap at 5
      const ordered = [
        restaurants[0],
        attractions[0],
        cafes[0],
        restaurants[1],
        attractions[1],
      ]
        .filter((r): r is NonNullable<typeof r> => r !== undefined)
        .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
        .slice(0, 5);

      focusPlaceIds = ordered.map(r => r.id);
      ordered.forEach(r => placeNameCache.set(r.id, r.name));

      // Assign slots: breakfast, attraction, lunch, cafe, dinner
      const slotDefs = [
        { label: 'الإفطار', time: '08:00', duration: '1 ساعة', emoji: '🌅' },
        { label: 'معلم سياحي', time: '09:30', duration: 'ساعتان', emoji: '🗺️' },
        { label: 'الغداء', time: '13:00', duration: '1 ساعة', emoji: '☀️' },
        { label: 'مقهى', time: '15:00', duration: '1 ساعة', emoji: '☕' },
        { label: 'العشاء', time: '19:00', duration: 'ساعتان', emoji: '🌙' },
      ];

      const itineraryLines = ordered.map((r, i) => {
        const slot = slotDefs[i] ?? slotDefs[slotDefs.length - 1]!;
        return `${i + 1}. [${slot.time}] ${slot.label} — ${r.name} (${r.address}) — مدة الزيارة: ${slot.duration}`;
      });

      const itineraryText = itineraryLines.join('\n');

      const DAY_PLAN_SYSTEM = `${SYSTEM_PROMPT}

عند إنشاء برنامج يوم، استخدم هذا التنسيق بالضبط:
- قسّم اليوم إلى: صباح (8-12)، ظهر (12-17)، مساء (17-22)
- لكل مكان: رقم الترتيب، الوقت، اسم المكان، المدة المقترحة
- اختم بملاحظات مفيدة للزيارة`;

      const planMessages = [
        ...allMessages,
        {
          role: 'user' as const,
          content: `نتائج البحث للتخطيط:\n${itineraryText}\n\nبناءً على هذه الأماكن، أنشئ برنامجاً يومياً مرتّباً بالأوقات مع تقسيم صباح/ظهر/مساء. اذكر المدة المقترحة لكل مكان.`,
        },
      ];

      const planReply = await this.llm.chat({
        systemPrompt: DAY_PLAN_SYSTEM,
        messages: planMessages,
        maxTokens: 1024,
      });

      finalContent = planReply.content;
      this.trackUsage(estimateTokens(planMessages.map(m => m.content).join('')), estimateTokens(finalContent));
    } else {
      // --- Normal LLM tool loop ---
      const response = await this.llm.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: allMessages,
        tools: ASSISTANT_TOOLS,
        maxTokens: 1024,
      });

      finalContent = response.content;
      this.trackUsage(estimateTokens(allMessages.map(m => m.content).join('')), estimateTokens(finalContent));

      // Handle tool calls (max 1 round-trip)
      if (response.stopReason === 'tool_use' && response.toolCalls && response.toolCalls.length > 0) {
        const toolCall = response.toolCalls[0]!;

        if (toolCall.name === 'search_places') {
          const query = toolCall.input['query'] as string;
          const city = toolCall.input['city'] as string | undefined;
          const results = await this.placesSearch(query, city);

          // Surface up to 5 results on the map
          focusPlaceIds = results.slice(0, 5).map(r => r.id);
          results.slice(0, 5).forEach(r => placeNameCache.set(r.id, r.name));

          const toolResultText = results.length > 0
            ? results.map(r => {
                const cat = r.category ? ` (${r.category})` : '';
                const dist = r.distanceMeters != null ? ` - ${r.distanceMeters < 1000 ? `${r.distanceMeters}م` : `${(r.distanceMeters / 1000).toFixed(1)}كم`}` : '';
                return `- ${r.name}${cat} - ${r.address}${dist}`;
              }).join('\n')
            : 'لم يتم العثور على نتائج.';

          const messagesWithToolResult = [
            ...allMessages,
            {
              role: 'assistant' as const,
              content: `[استخدام أداة البحث عن: ${query}]`,
            },
            {
              role: 'user' as const,
              content: `نتائج البحث:\n${toolResultText}`,
            },
          ];

          const followUp = await this.llm.chat({
            systemPrompt: SYSTEM_PROMPT,
            messages: messagesWithToolResult,
            maxTokens: 1024,
          });

          finalContent = followUp.content;
          this.trackUsage(estimateTokens(messagesWithToolResult.map(m => m.content).join('')), estimateTokens(finalContent));
        } else if (toolCall.name === 'compose_message') {
          const text = toolCall.input['text'] as string | undefined;
          const placeIds = toolCall.input['placeIds'] as string[] | undefined;
          composeParams = { text, placeIds };
          finalContent = text ?? '';
        }
      }
    }

    // Store new messages
    for (const msg of turn.messages) {
      await this.db.insert(messageTable).values({ sessionId, role: msg.role, content: msg.content });
    }
    await this.db.insert(messageTable).values({ sessionId, role: 'assistant', content: finalContent });

    // Increment rate limit
    await this.incrementRateLimit(userId);

    // Fall back to heuristic compose detection if no tool call provided composeParams
    if (!composeParams) {
      composeParams = this.extractComposeParams(finalContent);
    }

    // Keep focusPlaceId for compat (first of the array)
    const focusPlaceId = focusPlaceIds[0];

    // Compute reset time: midnight UTC tonight
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);

    // Build name map from the cache collected during searches this turn
    const focusPlaceNames = placeNameCache.size > 0
      ? Object.fromEntries(placeNameCache)
      : undefined;

    return {
      sessionId,
      reply: finalContent,
      composeParams,
      focusPlaceId,
      focusPlaceIds: focusPlaceIds.length > 0 ? focusPlaceIds : undefined,
      focusPlaceNames,
      rateLimitRemaining,
      rateLimitReset: tomorrow.toISOString(),
    };
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.db
      .select()
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1);
    if (!session[0]) return null;

    const messages = await this.db
      .select({ role: messageTable.role, content: messageTable.content })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(messageTable.createdAt);

    return { sessionId, messages, createdAt: session[0].createdAt.toISOString() };
  }

  async deleteSession(userId: string, sessionId: string) {
    const result = await this.db
      .delete(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning({ id: sessionTable.id });
    return result.length > 0;
  }

  /** Returns the number of messages remaining after this call (i.e. limit - current - 1). */
  private async checkRateLimit(userId: string): Promise<number> {
    const row = await this.db
      .select({ count: rateLimitTable.count })
      .from(rateLimitTable)
      .where(and(eq(rateLimitTable.userId, userId), eq(rateLimitTable.date, sql`CURRENT_DATE`)))
      .limit(1);
    const current = row[0]?.count ?? 0;
    if (current >= DAILY_LIMIT) {
      throw new HttpException(
        { code: 'daily_limit_exceeded', title: 'Daily limit exceeded' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // remaining = how many messages left after consuming this one
    return Math.max(0, DAILY_LIMIT - current - 1);
  }

  private async incrementRateLimit(userId: string) {
    await this.db
      .insert(rateLimitTable)
      .values({ userId, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitTable.userId, rateLimitTable.date],
        set: { count: sql`${rateLimitTable.count} + 1` },
      });
  }

  /** Fire-and-forget: upsert today's aggregated usage row. */
  private trackUsage(inputTokens: number, outputTokens: number): void {
    void this.db
      .insert(usageDailyTable)
      .values({ date: sql`CURRENT_DATE`, inputTokens, outputTokens, requestCount: 1 })
      .onConflictDoUpdate({
        target: [usageDailyTable.date],
        set: {
          inputTokens: sql`${usageDailyTable.inputTokens} + excluded.input_tokens`,
          outputTokens: sql`${usageDailyTable.outputTokens} + excluded.output_tokens`,
          requestCount: sql`${usageDailyTable.requestCount} + 1`,
        },
      })
      .catch(() => { /* non-critical */ });
  }

  async getUsageLast30Days(): Promise<Array<{ date: string; inputTokens: number; outputTokens: number; requestCount: number }>> {
    const rows = await this.db
      .select()
      .from(usageDailyTable)
      .where(sql`${usageDailyTable.date} >= CURRENT_DATE - INTERVAL '29 days'`)
      .orderBy(desc(usageDailyTable.date))
      .limit(30);
    return rows.map(r => ({
      date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      requestCount: r.requestCount,
    }));
  }

  extractComposeParams(reply: string): { text?: string; placeIds?: string[] } | undefined {
    // Simple heuristic: if reply contains "راسل" (message) suggest compose
    if (reply.includes('راسل') || reply.includes('تواصل')) {
      return { text: reply.slice(0, 200) };
    }
    return undefined;
  }

  // ─── Trip Planner ──────────────────────────────────────────────────────────

  async planTrip(request: TripPlanRequestType): Promise<TripPlanResponseType> {
    const { destination, startDate, endDate, interests, budget, partySize } = request;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const numDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

    const budgetLabels: Record<string, string> = { budget: 'اقتصادي', mid: 'متوسط', luxury: 'فاخر' };
    const interestLabels: Record<string, string> = {
      food: 'الطعام والمطاعم', culture: 'الثقافة والفنون', shopping: 'التسوق',
      nature: 'الطبيعة والحدائق', history: 'التاريخ والمواقع الأثرية', religious: 'المواقع الدينية',
    };

    const systemPrompt = `أنت مخطط رحلات خبير للعراق. أنشئ خططاً سياحية تفصيلية.
أجب دائماً بتنسيق JSON صالح فقط، بدون أي نص آخر.`;

    const userPrompt = `أنشئ خطة سياحية تفصيلية بتنسيق JSON:
الوجهة: ${destination}
من: ${startDate} إلى: ${endDate} (${numDays} أيام)
الاهتمامات: ${interests.map(i => interestLabels[i] ?? i).join('، ')}
الميزانية: ${budgetLabels[budget] ?? budget}
عدد الأشخاص: ${partySize}

الرد يجب أن يكون JSON فقط بهذا الشكل بالضبط:
{
  "summary": "ملخص الخطة",
  "totalEstimatedCost": "تقدير التكلفة الإجمالية",
  "tips": ["نصيحة 1", "نصيحة 2"],
  "days": [
    {
      "theme": "موضوع اليوم",
      "activities": [
        {
          "time": "09:00",
          "title": "اسم النشاط",
          "description": "وصف قصير",
          "estimatedCost": "تكلفة تقريبية",
          "duration": "مدة الزيارة"
        }
      ],
      "totalEstimatedCost": "تكلفة اليوم"
    }
  ]
}`;

    const llmReply = await this.llm.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
    });

    let parsed: {
      summary?: string;
      totalEstimatedCost?: string;
      tips?: string[];
      days?: Array<{
        theme?: string;
        activities?: Array<{ time?: string; title?: string; description?: string; estimatedCost?: string; duration?: string }>;
        totalEstimatedCost?: string;
      }>;
    };

    try {
      const jsonMatch = llmReply.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? llmReply.content) as typeof parsed;
    } catch {
      // Fallback if LLM didn't return valid JSON
      parsed = {
        summary: llmReply.content.slice(0, 300),
        tips: [],
        days: [],
      };
    }

    const planId = crypto.randomUUID();
    const days = (parsed.days ?? []).slice(0, numDays).map((d, idx) => {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + idx);
      return {
        day: idx + 1,
        date: dayDate.toISOString().slice(0, 10),
        theme: d.theme ?? `اليوم ${idx + 1}`,
        activities: (d.activities ?? []).map(a => ({
          time: a.time ?? '09:00',
          title: a.title ?? '',
          description: a.description ?? '',
          estimatedCost: a.estimatedCost,
          duration: a.duration,
        })),
        totalEstimatedCost: d.totalEstimatedCost,
      };
    });

    // If LLM returned fewer days than requested, pad
    while (days.length < numDays) {
      const idx = days.length;
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + idx);
      days.push({
        day: idx + 1,
        date: dayDate.toISOString().slice(0, 10),
        theme: `استكشاف ${destination}`,
        activities: [],
        totalEstimatedCost: undefined,
      });
    }

    return {
      planId,
      destination,
      summary: parsed.summary ?? `خطة رحلة إلى ${destination}`,
      days,
      totalEstimatedCost: parsed.totalEstimatedCost,
      tips: parsed.tips ?? [],
    };
  }

  // ─── Recommendations ───────────────────────────────────────────────────────

  async getRecommendations(
    category: RecommendationsResponseType['category'],
    _lat?: number,
    _lng?: number,
  ): Promise<RecommendationsResponseType> {
    const categoryQueries: Record<string, string> = {
      restaurants: 'مطاعم',
      cafes: 'مقاهي',
      hotels: 'فنادق',
      shopping: 'مراكز تسوق',
      attractions: 'معالم سياحية',
    };

    const query = categoryQueries[category] ?? category;
    const places = await this.placesSearch(query);

    if (places.length === 0) {
      return { category, places: [], contextNote: 'لا توجد أماكن متاحة حالياً' };
    }

    // Ask LLM to add AI reasons for each place
    const systemPrompt = `أنت مرشد سياحي خبير في العراق. اكتب سبباً موجزاً ومشجعاً لزيارة كل مكان.
أجب بـ JSON فقط.`;

    const placesText = places.slice(0, 8).map((p, i) =>
      `${i + 1}. ${p.name} - ${p.address ?? ''}${p.category ? ` (${p.category})` : ''}`
    ).join('\n');

    const locationHint = _lat != null && _lng != null ? `الموقع الحالي: ${_lat.toFixed(4)}, ${_lng.toFixed(4)}` : '';

    const userPrompt = `${locationHint}
الأماكن في تصنيف "${query}":
${placesText}

أضف سبباً مشجعاً للزيارة لكل مكان وتقدير سعر. أجب بـ JSON فقط:
{
  "contextNote": "ملاحظة عامة",
  "places": [
    {"index": 1, "aiReason": "السبب", "estimatedPrice": "السعر"}
  ]
}`;

    let aiEnrichment: Array<{ index?: number; aiReason?: string; estimatedPrice?: string }> = [];
    try {
      const llmReply = await this.llm.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 1024,
      });
      const jsonMatch = llmReply.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as { places?: typeof aiEnrichment; contextNote?: string };
      aiEnrichment = parsed.places ?? [];
    } catch {
      // non-critical, fall back to empty reasons
    }

    const enrichedPlaces = places.slice(0, 8).map((p, i) => {
      const enriched = aiEnrichment.find(e => e.index === i + 1);
      return {
        placeId: p.id as z.infer<typeof PlaceRecommendation>['placeId'],
        name: p.name,
        address: p.address,
        category: p.category ?? query,
        aiReason: enriched?.aiReason ?? `مكان مميز في ${query}`,
        estimatedPrice: enriched?.estimatedPrice,
        distanceMeters: p.distanceMeters,
      };
    });

    return { category, places: enrichedPlaces };
  }

  // ─── NLP Search ────────────────────────────────────────────────────────────

  async naturalLanguageSearch(
    query: string,
    _lat?: number,
    _lng?: number,
  ): Promise<NLPSearchResponseType> {
    // Step 1: use LLM to parse the natural language query into structured filters
    const parsePrompt = `استخرج مرشحات البحث من هذا الاستعلام وأجب بـ JSON فقط:
الاستعلام: "${query}"

{
  "searchTerms": "كلمات البحث الرئيسية",
  "category": "تصنيف المكان إن وجد",
  "priceRange": "رخيص/متوسط/غالي إن ذُكر",
  "features": ["ميزة1", "ميزة2"],
  "area": "المنطقة أو الحي إن ذُكر"
}`;

    let parsedFilters: Record<string, unknown> = { raw: query };
    let searchQuery = query;

    try {
      const parseReply = await this.llm.chat({
        systemPrompt: 'أنت محلل استعلامات بحث. أجب بـ JSON فقط.',
        messages: [{ role: 'user', content: parsePrompt }],
        maxTokens: 256,
      });
      const jsonMatch = parseReply.content.match(/\{[\s\S]*\}/);
      parsedFilters = JSON.parse(jsonMatch?.[0] ?? '{}') as Record<string, unknown>;
      searchQuery = (parsedFilters['searchTerms'] as string | undefined) ?? query;
    } catch {
      // fall back to raw query
    }

    // Step 2: search places with extracted terms
    const results = await this.placesSearch(searchQuery, parsedFilters['area'] as string | undefined);

    if (results.length === 0) {
      return { query, parsedFilters, results: [], totalFound: 0 };
    }

    // Step 3: ask LLM to score and explain why each result matches
    const resultsText = results.slice(0, 10).map((r, i) =>
      `${i + 1}. ${r.name} - ${r.address ?? ''}${r.category ? ` (${r.category})` : ''}`
    ).join('\n');

    const scorePrompt = `الاستعلام: "${query}"
النتائج:
${resultsText}

لكل نتيجة، أضف سبب التطابق ودرجة (0-1). أجب بـ JSON فقط:
{
  "results": [
    {"index": 1, "matchReason": "السبب", "score": 0.9}
  ]
}`;

    let scoredResults: Array<{ index?: number; matchReason?: string; score?: number }> = [];
    try {
      const scoreReply = await this.llm.chat({
        systemPrompt: 'أنت محرك بحث ذكي. أجب بـ JSON فقط.',
        messages: [{ role: 'user', content: scorePrompt }],
        maxTokens: 512,
      });
      const jsonMatch = scoreReply.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as { results?: typeof scoredResults };
      scoredResults = parsed.results ?? [];
    } catch {
      // fall back
    }

    const finalResults = results.slice(0, 10).map((r, i) => {
      const scored = scoredResults.find(s => s.index === i + 1);
      return {
        placeId: r.id as z.infer<typeof NLPSearchResult>['placeId'],
        name: r.name,
        address: r.address,
        category: r.category,
        matchReason: scored?.matchReason ?? 'يطابق معايير البحث',
        distanceMeters: r.distanceMeters,
        score: scored?.score ?? 0.5,
      };
    }).sort((a, b) => b.score - a.score);

    return {
      query,
      parsedFilters,
      results: finalResults,
      totalFound: finalResults.length,
    };
  }

  // ─── Context-aware chat ────────────────────────────────────────────────────

  /**
   * Chat with optional location/place/route context injected into the system prompt.
   */
  async chatWithContext(
    userId: string,
    message: string,
    context: {
      lat?: number;
      lng?: number;
      currentPlaceId?: string;
      currentPlaceNames?: string;
      currentRouteId?: string;
    },
  ) {
    const contextParts: string[] = [];
    if (context.lat != null && context.lng != null) {
      contextParts.push(`موقع المستخدم الحالي: ${context.lat.toFixed(4)}, ${context.lng.toFixed(4)}`);
    }
    if (context.currentPlaceId && context.currentPlaceNames) {
      contextParts.push(`المكان المعروض: ${context.currentPlaceNames}`);
    }
    if (context.currentRouteId) {
      contextParts.push(`معرّف المسار الحالي: ${context.currentRouteId}`);
    }

    const prefixedMessage =
      contextParts.length > 0
        ? `[${contextParts.join(' | ')}]\n${message}`
        : message;

    const sessionId = `ctx-${userId}-default` as `${string}-${string}-${string}-${string}-${string}`;

    return this.chat(userId, {
      sessionId,
      messages: [{ role: 'user', content: prefixedMessage }],
    });
  }

  // ─── Place summary (cached) ───────────────────────────────────────────────

  private readonly placeSummaryCache = new Map<string, { summary: string; cachedAt: number }>();
  private readonly PLACE_SUMMARY_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async generatePlaceSummary(placeId: string): Promise<string> {
    const cached = this.placeSummaryCache.get(placeId);
    if (cached && Date.now() - cached.cachedAt < this.PLACE_SUMMARY_TTL_MS) {
      return cached.summary;
    }

    const places = await this.placesSearch(placeId);
    const place = places[0];
    if (!place) return '';

    const prompt = `اكتب ملخصاً موجزاً (3-4 جمل) عن "${place.name}" في العراق يساعد الزوار على فهم طبيعة المكان وأهميته.`;
    const reply = await this.llm.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
    });

    const summary = reply.content.trim();
    this.placeSummaryCache.set(placeId, { summary, cachedAt: Date.now() });
    return summary;
  }

  // ─── Nearby food suggestions ──────────────────────────────────────────────

  async suggestNearbyFoodOptions(
    lat: number,
    lng: number,
    preferences: {
      cuisineType?: string;
      priceRange?: 'budget' | 'mid' | 'luxury';
      dietaryNeeds?: string[];
    } = {},
  ) {
    const priceLabels: Record<string, string> = { budget: 'رخيص', mid: 'متوسط', luxury: 'فاخر' };
    const prefText = [
      preferences.cuisineType ? `نوع المطبخ: ${preferences.cuisineType}` : null,
      preferences.priceRange ? `النطاق السعري: ${priceLabels[preferences.priceRange]}` : null,
      preferences.dietaryNeeds?.length ? `متطلبات غذائية: ${preferences.dietaryNeeds.join('، ')}` : null,
    ].filter(Boolean).join('، ');

    const query = `مطاعم${prefText ? ` (${prefText})` : ''}`;
    const results = await this.placesSearch(query);

    const systemPrompt = `أنت مرشد مطاعم خبير. أنشئ اقتراحات طعام موجزة ومشجعة.
أجب بـ JSON فقط.`;

    const locationHint = `الموقع: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const resultsText = results.slice(0, 6).map((r, i) =>
      `${i + 1}. ${r.name} - ${r.address}${r.distanceMeters != null ? ` (${r.distanceMeters < 1000 ? `${r.distanceMeters}م` : `${(r.distanceMeters / 1000).toFixed(1)}كم`})` : ''}`
    ).join('\n');

    let enriched: Array<{ index: number; suggestion: string; emoji: string }> = [];
    try {
      const reply = await this.llm.chat({
        systemPrompt,
        messages: [{
          role: 'user',
          content: `${locationHint}\n${prefText ? `التفضيلات: ${prefText}\n` : ''}الأماكن:\n${resultsText}\n\nأضف اقتراحاً مشجعاً وإيموجي لكل مكان. JSON فقط:\n{"items":[{"index":1,"suggestion":"...","emoji":"🍽️"}]}`,
        }],
        maxTokens: 600,
      });
      const match = reply.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? '{}') as { items?: typeof enriched };
      enriched = parsed.items ?? [];
    } catch {
      // non-critical
    }

    return results.slice(0, 6).map((r, i) => {
      const e = enriched.find(x => x.index === i + 1);
      return {
        placeId: r.id,
        name: r.name,
        address: r.address,
        distanceMeters: r.distanceMeters,
        suggestion: e?.suggestion ?? `مطعم مميز بموقع ممتاز`,
        emoji: e?.emoji ?? '🍽️',
      };
    });
  }

  // ─── Day trip planner ────────────────────────────────────────────────────

  async planDayTrip(
    startLat: number,
    startLng: number,
    interests: string[],
    durationHours: number,
  ) {
    const interestMap: Record<string, string> = {
      food: 'مطاعم', culture: 'مواقع ثقافية', shopping: 'تسوق',
      history: 'مواقع تاريخية', religious: 'مواقع دينية', nature: 'حدائق وطبيعة',
    };

    const queries = interests.map(i => interestMap[i] ?? i);
    const searchResults = await Promise.all(queries.slice(0, 3).map(q => this.placesSearch(q)));
    const allPlaces = searchResults.flat().filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i).slice(0, 6);

    const systemPrompt = `أنت مخطط رحلات ذكي. أنشئ برنامج يوم متكامل بتنسيق JSON.`;
    const placesText = allPlaces.map((p, i) => `${i + 1}. ${p.name} - ${p.address}`).join('\n');
    const userPrompt = `الموقع: ${startLat.toFixed(4)}, ${startLng.toFixed(4)}
المدة: ${durationHours} ساعات
الاهتمامات: ${interests.join('، ')}
الأماكن المتاحة:
${placesText}

أنشئ برنامجاً يومياً منطقياً. JSON فقط:
{"stops":[{"time":"09:00","placeIndex":1,"activity":"...","duration":"ساعة","notes":"..."}],"summary":"..."}`;

    let plan: { stops: Array<{ time: string; placeIndex: number; activity: string; duration: string; notes?: string }>; summary: string } = { stops: [], summary: '' };
    try {
      const reply = await this.llm.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 1024,
      });
      const match = reply.content.match(/\{[\s\S]*\}/);
      plan = JSON.parse(match?.[0] ?? '{}') as typeof plan;
    } catch {
      plan = { stops: [], summary: `جولة يوم من الموقع ${startLat.toFixed(2)}, ${startLng.toFixed(2)}` };
    }

    return {
      summary: plan.summary,
      durationHours,
      stops: (plan.stops ?? []).map(s => {
        const place = allPlaces[s.placeIndex - 1];
        return {
          time: s.time,
          placeId: place?.id,
          placeName: place?.name ?? `مكان ${s.placeIndex}`,
          placeAddress: place?.address,
          activity: s.activity,
          duration: s.duration,
          notes: s.notes,
        };
      }),
    };
  }

  // ─── City knowledge ───────────────────────────────────────────────────────

  async answersAboutCity(city: string, question: string): Promise<string> {
    const systemPrompt = `أنت خبير في المدن العراقية. أجب على أسئلة المسافرين والسكان المحليين باللغة العربية.
تخصص في: ${city}. لا تخترع أرقاماً أو أسماء محلات محددة.`;

    const reply = await this.llm.chat({
      systemPrompt,
      messages: [{ role: 'user', content: question }],
      maxTokens: 512,
    });

    return reply.content;
  }

  // ─── Translation ──────────────────────────────────────────────────────────

  private readonly translationCache = new Map<string, { result: string; cachedAt: number }>();
  private readonly TRANSLATION_TTL_MS = 5 * 60 * 1000;

  async translateText(text: string, from: string, to: string): Promise<string> {
    const cacheKey = `${from}:${to}:${text.slice(0, 80)}`;
    const cached = this.translationCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.TRANSLATION_TTL_MS) {
      return cached.result;
    }

    const langNames: Record<string, string> = {
      ar: 'العربية', en: 'الإنجليزية', ckb: 'الكردية السورانية', ku: 'الكردية',
      fa: 'الفارسية', tr: 'التركية',
    };

    const systemPrompt = `أنت مترجم محترف. ترجم النص المعطى من ${langNames[from] ?? from} إلى ${langNames[to] ?? to}. أجب بالترجمة فقط بدون شرح.`;

    const reply = await this.llm.chat({
      systemPrompt,
      messages: [{ role: 'user', content: text }],
      maxTokens: Math.min(text.length * 3, 1024),
    });

    const result = reply.content.trim();
    this.translationCache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }
}
