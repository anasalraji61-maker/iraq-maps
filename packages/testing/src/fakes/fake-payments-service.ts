/**
 * FakePaymentsService — in-memory payments fake for testing.
 * Records payment intents, captures, refunds.
 * The real adapter sits behind an interface; this fake implements it for tests.
 */

export type Currency = 'IQD' | 'USD' | 'EUR';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export interface PaymentIntent {
  id: string;
  userId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIntentOpts {
  userId: string;
  amount: number;
  currency?: Currency;
  metadata?: Record<string, string>;
}

export interface CaptureResult {
  intentId: string;
  status: PaymentStatus;
  capturedAt: Date;
}

export interface RefundResult {
  intentId: string;
  refundId: string;
  status: 'refunded';
  refundedAt: Date;
}

let _seq = 0;
function nextId(prefix: string): string {
  return `${prefix}_${(++_seq).toString().padStart(6, '0')}`;
}

export class FakePaymentsService {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly refunds: RefundResult[] = [];

  /** Track calls for assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  // ─── Create ────────────────────────────────────────────────────────────────

  async createIntent(opts: CreateIntentOpts): Promise<PaymentIntent> {
    this.calls.push({ method: 'createIntent', args: [opts] });
    const id = nextId('pi');
    const now = new Date();
    const intent: PaymentIntent = {
      id,
      userId: opts.userId,
      amount: opts.amount,
      currency: opts.currency ?? 'IQD',
      status: 'pending',
      metadata: opts.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.intents.set(id, intent);
    return { ...intent };
  }

  // ─── Capture ───────────────────────────────────────────────────────────────

  async capture(intentId: string): Promise<CaptureResult> {
    this.calls.push({ method: 'capture', args: [intentId] });
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent not found: ${intentId}`);
    if (intent.status !== 'pending') throw new Error(`Cannot capture: status is ${intent.status}`);

    intent.status = 'succeeded';
    intent.updatedAt = new Date();
    return { intentId, status: 'succeeded', capturedAt: new Date() };
  }

  // ─── Refund ────────────────────────────────────────────────────────────────

  async refund(intentId: string): Promise<RefundResult> {
    this.calls.push({ method: 'refund', args: [intentId] });
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent not found: ${intentId}`);
    if (intent.status !== 'succeeded') throw new Error(`Cannot refund: status is ${intent.status}`);

    intent.status = 'refunded';
    intent.updatedAt = new Date();

    const result: RefundResult = {
      intentId,
      refundId: nextId('re'),
      status: 'refunded',
      refundedAt: new Date(),
    };
    this.refunds.push(result);
    return result;
  }

  // ─── Cancel ────────────────────────────────────────────────────────────────

  async cancel(intentId: string): Promise<void> {
    this.calls.push({ method: 'cancel', args: [intentId] });
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent not found: ${intentId}`);
    if (intent.status !== 'pending') throw new Error(`Cannot cancel: status is ${intent.status}`);

    intent.status = 'cancelled';
    intent.updatedAt = new Date();
  }

  // ─── Get ───────────────────────────────────────────────────────────────────

  async getIntent(intentId: string): Promise<PaymentIntent | null> {
    const intent = this.intents.get(intentId);
    return intent ? { ...intent } : null;
  }

  async listIntentsByUser(userId: string): Promise<PaymentIntent[]> {
    return [...this.intents.values()]
      .filter((i) => i.userId === userId)
      .map((i) => ({ ...i }));
  }

  // ─── Simulate failure ──────────────────────────────────────────────────────

  /** Pre-mark an intent as failed (for testing failure paths). */
  simulateFailure(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (intent) {
      intent.status = 'failed';
      intent.updatedAt = new Date();
    }
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.intents.clear();
    this.refunds.length = 0;
    this.calls.length = 0;
  }
}
