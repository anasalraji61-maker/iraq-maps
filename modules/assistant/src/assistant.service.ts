import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type { LlmClient } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { eq, and, sql } from 'drizzle-orm';
import { sessionTable, messageTable, rateLimitTable } from './schema.js';
import type { AssistantTurnType } from '@iraq-maps/contracts';

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
    } else {
      // --- Normal LLM tool loop ---
      const response = await this.llm.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: allMessages,
        tools: ASSISTANT_TOOLS,
        maxTokens: 1024,
      });

      finalContent = response.content;

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

  extractComposeParams(reply: string): { text?: string; placeIds?: string[] } | undefined {
    // Simple heuristic: if reply contains "راسل" (message) suggest compose
    if (reply.includes('راسل') || reply.includes('تواصل')) {
      return { text: reply.slice(0, 200) };
    }
    return undefined;
  }
}
