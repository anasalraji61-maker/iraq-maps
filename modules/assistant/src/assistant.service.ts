import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type { LlmClient } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
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

export type PlacesSearchFn = (query: string, city?: string) => Promise<Array<{ id: string; name: string; address: string }>>;

export const PLACES_SEARCH_TOKEN = 'ASSISTANT_PLACES_SEARCH';

@Injectable()
export class AssistantService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject('ASSISTANT_DB') private readonly db: PostgresJsDatabase<any>,
    @Inject(PortTokens.LlmClient) private readonly llm: LlmClient,
    @Inject(PLACES_SEARCH_TOKEN) private readonly placesSearch: PlacesSearchFn,
  ) {}

  async chat(userId: string, turn: AssistantTurnType) {
    // Rate limit check
    await this.checkRateLimit(userId);

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

    // Get history
    const history = await this.db
      .select({ role: messageTable.role, content: messageTable.content })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(messageTable.createdAt)
      .limit(20);

    // Merge history with new messages
    const allMessages = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...turn.messages,
    ];

    // Call LLM with tools
    const response = await this.llm.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: allMessages,
      tools: ASSISTANT_TOOLS,
      maxTokens: 1024,
    });

    let finalContent = response.content;
    let composeParams: { text?: string; placeIds?: string[] } | undefined;

    // Handle tool calls (max 1 round-trip)
    if (response.stopReason === 'tool_use' && response.toolCalls && response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0]!;

      if (toolCall.name === 'search_places') {
        const query = toolCall.input['query'] as string;
        const city = toolCall.input['city'] as string | undefined;
        const results = await this.placesSearch(query, city);

        const toolResultText = results.length > 0
          ? results.map(r => `- ${r.name}: ${r.address}`).join('\n')
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

    return { sessionId, reply: finalContent, composeParams };
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

  private async checkRateLimit(userId: string) {
    const row = await this.db
      .select({ count: rateLimitTable.count })
      .from(rateLimitTable)
      .where(and(eq(rateLimitTable.userId, userId), eq(rateLimitTable.date, sql`CURRENT_DATE`)))
      .limit(1);
    if ((row[0]?.count ?? 0) >= DAILY_LIMIT) {
      throw new HttpException(
        { code: 'daily_limit_exceeded', title: 'Daily limit exceeded' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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
