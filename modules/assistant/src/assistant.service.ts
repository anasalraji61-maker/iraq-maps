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

@Injectable()
export class AssistantService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject('ASSISTANT_DB') private readonly db: PostgresJsDatabase<any>,
    @Inject(PortTokens.LlmClient) private readonly llm: LlmClient,
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

    // Call LLM
    const response = await this.llm.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: allMessages,
      maxTokens: 1024,
    });

    // Store new messages
    for (const msg of turn.messages) {
      await this.db.insert(messageTable).values({ sessionId, role: msg.role, content: msg.content });
    }
    await this.db.insert(messageTable).values({ sessionId, role: 'assistant', content: response.content });

    // Increment rate limit
    await this.incrementRateLimit(userId);

    // Parse composeParams if assistant mentions messaging
    const composeParams = this.extractComposeParams(response.content);

    return { sessionId, reply: response.content, composeParams };
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
