/**
 * PaymentsService — core business logic for wallets, payment intents and
 * payment methods.
 *
 * Design notes:
 *  - IQD is stored as integer dinars (no decimal fraction in Iraqi Dinar).
 *  - The fraud detection is a stub: it flags any single transaction > 1 000 000 IQD
 *    and records it on the intent. A real implementation would call a risk engine.
 *  - Rate limiting uses a sliding-window counter in the DB (no Redis dependency).
 *    10 payment confirmations per user per hour.
 *  - All wallet mutations are wrapped in a DB transaction to keep balance consistent.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import type {
  AddCardBody,
  ConfirmPaymentBody,
  CreatePaymentIntentBody,
  Currency,
  PaymentIntent,
  PaymentMethod,
  RefundPaymentBody,
  TopUpWalletBody,
  Transaction,
  TransactionFilters,
  Wallet,
} from '@iraq-maps/contracts';
import {
  paymentIntentTable,
  paymentMethodTable,
  rateLimitTable,
  transactionTable,
  walletTable,
} from './schema';

// ─── IQD helpers ─────────────────────────────────────────────────────────────

/** Maximum single-transaction amount before fraud review is triggered (IQD). */
const FRAUD_THRESHOLD_IQD = 1_000_000;

/** Rate limit: max payment confirmations per user per hour. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000; // 1 hour

/** Payment intent expiry duration in milliseconds. */
const INTENT_EXPIRY_MS = 30 * 60 * 1_000; // 30 minutes

/**
 * Format an IQD amount using Arabic-Indic digits and thousands separators.
 * Output example: ١٬٥٠٠٬٠٠٠ د.ع
 *
 * IQD has no subunits in everyday use, so we never show fractions.
 */
export function formatIqd(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '٠ د.ع';

  // Convert to Arabic-Indic digits with thousands separators
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  const intStr = Math.floor(amount).toString();

  // Add thousands separators (Western comma → Arabic comma ٬)
  let result = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) {
      result += '٬';
    }
    const digit = parseInt(intStr[i]!, 10);
    result += arabicDigits[digit];
  }

  return `${result} د.ع`;
}

/**
 * Format a USD cents amount as a display string (English numerals).
 * Example: 150000 → "$1,500.00"
 */
export function formatUsd(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return '$0.00';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

/**
 * Format a money amount for display, choosing the right formatter by currency.
 */
export function formatMoney(amount: number, currency: Currency): string {
  if (currency === 'IQD') return formatIqd(amount);
  return formatUsd(amount);
}

// ─── Fraud detection stub ─────────────────────────────────────────────────────

interface FraudCheckResult {
  flagged: boolean;
  reason?: string;
}

/**
 * Stub fraud detection.
 * Flags the intent for manual review when the amount exceeds the threshold.
 * A real implementation would send the event to a risk-scoring service.
 */
function checkFraud(amountIqd: number): FraudCheckResult {
  if (amountIqd > FRAUD_THRESHOLD_IQD) {
    return {
      flagged: true,
      reason: `Amount ${amountIqd} IQD exceeds review threshold of ${FRAUD_THRESHOLD_IQD} IQD`,
    };
  }
  return { flagged: false };
}

// ─── Problem helpers ──────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 422,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@Inject('PAYMENTS_DB') private readonly db: Db) {}

  // ─── Rate limiting ──────────────────────────────────────────────────────────

  /**
   * Check and increment a sliding-window rate-limit counter.
   * Returns true if the action is allowed; throws PaymentError if rate limited.
   */
  private async checkRateLimit(userId: string, bucket: string): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);

    // Clean up expired windows first
    await this.db
      .delete(rateLimitTable)
      .where(lt(rateLimitTable.windowEnd, now));

    const existing = await this.db
      .select()
      .from(rateLimitTable)
      .where(and(eq(rateLimitTable.userId, userId), eq(rateLimitTable.bucket, bucket)))
      .limit(1);

    if (existing.length === 0) {
      // First request in this window
      await this.db
        .insert(rateLimitTable)
        .values({ userId, bucket, count: 1, windowEnd });
      return;
    }

    const row = existing[0]!;
    if (row.count >= RATE_LIMIT_MAX) {
      throw new PaymentError(
        'rate_limited',
        `Rate limit exceeded: ${RATE_LIMIT_MAX} payments per hour. Try again later.`,
        429,
      );
    }

    await this.db
      .update(rateLimitTable)
      .set({ count: sql`${rateLimitTable.count} + 1` })
      .where(and(eq(rateLimitTable.userId, userId), eq(rateLimitTable.bucket, bucket)));
  }

  // ─── Wallet ─────────────────────────────────────────────────────────────────

  /**
   * Get or create a wallet for the given user.
   * A wallet is created lazily on first access.
   */
  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const existing = await this.db
      .select()
      .from(walletTable)
      .where(eq(walletTable.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return this.mapWallet(existing[0]!);
    }

    const created = await this.db
      .insert(walletTable)
      .values({ userId })
      .returning();

    this.logger.log(`Created wallet for user ${userId}`);
    return this.mapWallet(created[0]!);
  }

  /** Get wallet balance for the given user. Creates the wallet if it doesn't exist. */
  async getWalletBalance(userId: string): Promise<Wallet> {
    return this.getOrCreateWallet(userId);
  }

  /**
   * Add funds to a wallet.
   * Used for top-ups via bank transfer or admin credit.
   * Runs in a DB transaction to ensure consistency.
   */
  async addToWallet(userId: string, body: TopUpWalletBody): Promise<Wallet> {
    const { amountIqd, source, reference } = body;

    if (amountIqd <= 0) {
      throw new PaymentError('invalid_amount', 'Top-up amount must be positive', 400);
    }

    return this.db.transaction(async (tx) => {
      // Ensure wallet exists
      const wallets = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.userId, userId))
        .for('update')
        .limit(1);

      let wallet = wallets[0] ?? null;

      if (!wallet) {
        const inserted = await tx
          .insert(walletTable)
          .values({ userId })
          .returning();
        wallet = inserted[0]!;
      }

      const newBalance = wallet.balanceIqd + amountIqd;

      await tx
        .update(walletTable)
        .set({ balanceIqd: newBalance, updatedAt: new Date() })
        .where(eq(walletTable.id, wallet.id));

      await tx.insert(transactionTable).values({
        walletId: wallet.id,
        userId,
        type: 'credit',
        status: 'completed',
        amountIqd,
        balanceAfterIqd: newBalance,
        description: `شحن المحفظة — ${source}${reference ? ` (${reference})` : ''}`,
        metadata: { source, reference: reference ?? null },
      });

      this.logger.log(`Wallet top-up: user=${userId} amount=${amountIqd} IQD source=${source}`);

      const updated = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.id, wallet.id))
        .limit(1);

      return this.mapWallet(updated[0]!);
    });
  }

  /**
   * Deduct funds from a wallet (e.g. when confirming a payment).
   * Throws PaymentError if the balance is insufficient.
   */
  async deductFromWallet(
    userId: string,
    amountIqd: number,
    description: string,
    paymentIntentId?: string,
  ): Promise<Wallet> {
    return this.db.transaction(async (tx) => {
      const wallets = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.userId, userId))
        .for('update')
        .limit(1);

      const wallet = wallets[0];
      if (!wallet) {
        throw new PaymentError('wallet_not_found', 'Wallet not found', 404);
      }

      const available = wallet.balanceIqd - wallet.heldIqd;
      if (available < amountIqd) {
        throw new PaymentError(
          'insufficient_balance',
          `Insufficient balance: available ${formatIqd(available)}, required ${formatIqd(amountIqd)}`,
          422,
        );
      }

      const newBalance = wallet.balanceIqd - amountIqd;

      await tx
        .update(walletTable)
        .set({ balanceIqd: newBalance, updatedAt: new Date() })
        .where(eq(walletTable.id, wallet.id));

      await tx.insert(transactionTable).values({
        walletId: wallet.id,
        userId,
        type: 'debit',
        status: 'completed',
        amountIqd,
        balanceAfterIqd: newBalance,
        description,
        paymentIntentId: paymentIntentId ?? null,
        metadata: {},
      });

      const updated = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.id, wallet.id))
        .limit(1);

      return this.mapWallet(updated[0]!);
    });
  }

  /**
   * Credit a refund back to the wallet.
   */
  async creditRefundToWallet(
    userId: string,
    amountIqd: number,
    paymentIntentId: string,
    reason: string,
  ): Promise<Wallet> {
    return this.db.transaction(async (tx) => {
      const wallets = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.userId, userId))
        .for('update')
        .limit(1);

      let wallet = wallets[0] ?? null;

      if (!wallet) {
        // Create wallet if it doesn't exist (edge case for refunds)
        const inserted = await tx
          .insert(walletTable)
          .values({ userId })
          .returning();
        wallet = inserted[0]!;
      }

      const newBalance = wallet.balanceIqd + amountIqd;

      await tx
        .update(walletTable)
        .set({ balanceIqd: newBalance, updatedAt: new Date() })
        .where(eq(walletTable.id, wallet.id));

      await tx.insert(transactionTable).values({
        walletId: wallet.id,
        userId,
        type: 'refund',
        status: 'completed',
        amountIqd,
        balanceAfterIqd: newBalance,
        description: `استرداد — ${reason}`,
        paymentIntentId,
        metadata: { reason },
      });

      const updated = await tx
        .select()
        .from(walletTable)
        .where(eq(walletTable.id, wallet.id))
        .limit(1);

      return this.mapWallet(updated[0]!);
    });
  }

  // ─── Transactions ───────────────────────────────────────────────────────────

  /**
   * Return paginated transaction history for the user.
   */
  async getTransactionHistory(
    userId: string,
    filters: TransactionFilters,
  ): Promise<{ items: Transaction[]; nextCursor: string | null }> {
    const { type, status, from, to, cursor, limit } = filters;

    let query = this.db
      .select()
      .from(transactionTable)
      .where(eq(transactionTable.userId, userId))
      .orderBy(desc(transactionTable.createdAt))
      .limit((limit ?? 20) + 1);

    if (type) {
      query = query.where(and(eq(transactionTable.userId, userId), eq(transactionTable.type, type))) as typeof query;
    }
    if (status) {
      query = query.where(and(eq(transactionTable.userId, userId), eq(transactionTable.status, status))) as typeof query;
    }
    if (from) {
      query = query.where(and(eq(transactionTable.userId, userId), gt(transactionTable.createdAt, new Date(from)))) as typeof query;
    }
    if (to) {
      query = query.where(and(eq(transactionTable.userId, userId), lt(transactionTable.createdAt, new Date(to)))) as typeof query;
    }
    if (cursor) {
      try {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
        query = query.where(
          and(eq(transactionTable.userId, userId), lt(transactionTable.createdAt, cursorDate)),
        ) as typeof query;
      } catch {
        // Invalid cursor — ignore
      }
    }

    const rows = await query;
    const pageLimit = limit ?? 20;
    const hasMore = rows.length > pageLimit;
    const items = hasMore ? rows.slice(0, pageLimit) : rows;

    const nextCursor = hasMore && items.length > 0
      ? Buffer.from(items[items.length - 1]!.createdAt.toISOString()).toString('base64')
      : null;

    return {
      items: items.map((r) => this.mapTransaction(r)),
      nextCursor,
    };
  }

  // ─── Payment methods ────────────────────────────────────────────────────────

  /** List all payment methods for a user. */
  async listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    const rows = await this.db
      .select()
      .from(paymentMethodTable)
      .where(eq(paymentMethodTable.userId, userId))
      .orderBy(desc(paymentMethodTable.createdAt));

    return rows.map((r) => this.mapPaymentMethod(r));
  }

  /**
   * Add a card payment method (stub).
   * In a real implementation this would tokenise the card via a payment processor.
   */
  async addCard(userId: string, body: AddCardBody): Promise<PaymentMethod> {
    const { last4, brand, expiryMonth, expiryYear, holderName, setDefault } = body;

    return this.db.transaction(async (tx) => {
      if (setDefault) {
        // Clear any existing default for this user
        await tx
          .update(paymentMethodTable)
          .set({ isDefault: false })
          .where(and(eq(paymentMethodTable.userId, userId), eq(paymentMethodTable.isDefault, true)));
      }

      const inserted = await tx
        .insert(paymentMethodTable)
        .values({
          userId,
          type: 'card',
          cardLast4: last4,
          cardBrand: brand,
          cardExpiryMonth: expiryMonth,
          cardExpiryYear: expiryYear,
          cardHolderName: holderName ?? null,
          isDefault: setDefault,
        })
        .returning();

      this.logger.log(`Added card method for user ${userId} (last4: ${last4})`);
      return this.mapPaymentMethod(inserted[0]!);
    });
  }

  /** Remove a payment method. */
  async removePaymentMethod(userId: string, methodId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(paymentMethodTable)
      .where(and(eq(paymentMethodTable.id, methodId), eq(paymentMethodTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      throw new PaymentError('method_not_found', 'Payment method not found', 404);
    }

    await this.db
      .delete(paymentMethodTable)
      .where(and(eq(paymentMethodTable.id, methodId), eq(paymentMethodTable.userId, userId)));
  }

  /** Set a payment method as the default for the user. */
  async setDefaultPaymentMethod(userId: string, methodId: string): Promise<PaymentMethod> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(paymentMethodTable)
        .where(and(eq(paymentMethodTable.id, methodId), eq(paymentMethodTable.userId, userId)))
        .limit(1);

      if (rows.length === 0) {
        throw new PaymentError('method_not_found', 'Payment method not found', 404);
      }

      // Clear existing default
      await tx
        .update(paymentMethodTable)
        .set({ isDefault: false })
        .where(and(eq(paymentMethodTable.userId, userId), eq(paymentMethodTable.isDefault, true)));

      // Set new default
      const updated = await tx
        .update(paymentMethodTable)
        .set({ isDefault: true })
        .where(and(eq(paymentMethodTable.id, methodId), eq(paymentMethodTable.userId, userId)))
        .returning();

      return this.mapPaymentMethod(updated[0]!);
    });
  }

  // ─── Payment intents ────────────────────────────────────────────────────────

  /**
   * Create a payment intent.
   * Runs fraud check and sets flaggedForReview on large amounts.
   */
  async createPaymentIntent(userId: string, body: CreatePaymentIntentBody): Promise<PaymentIntent> {
    const { amount, currency, description, metadata } = body;

    if (amount <= 0) {
      throw new PaymentError('invalid_amount', 'Payment amount must be positive', 400);
    }

    // Fraud detection stub
    const amountForFraudCheck = currency === 'IQD' ? amount : amount * 1500; // rough IQD equivalent
    const fraud = checkFraud(amountForFraudCheck);

    if (fraud.flagged) {
      this.logger.warn(
        `Fraud flag: user=${userId} amount=${amount} ${currency} reason="${fraud.reason}"`,
      );
    }

    const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MS);

    const inserted = await this.db
      .insert(paymentIntentTable)
      .values({
        userId,
        amount,
        currency,
        status: 'pending',
        description: description ?? '',
        metadata: (metadata ?? {}) as Record<string, unknown>,
        flaggedForReview: fraud.flagged,
        expiresAt,
      })
      .returning();

    const intent = inserted[0]!;
    this.logger.log(`Created payment intent ${intent.id} for user ${userId}: ${amount} ${currency}`);
    return this.mapPaymentIntent(intent);
  }

  /** Get a payment intent by ID (must belong to the user). */
  async getPaymentIntent(userId: string, intentId: string): Promise<PaymentIntent> {
    const rows = await this.db
      .select()
      .from(paymentIntentTable)
      .where(and(eq(paymentIntentTable.id, intentId), eq(paymentIntentTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      throw new PaymentError('intent_not_found', 'Payment intent not found', 404);
    }

    return this.mapPaymentIntent(rows[0]!);
  }

  /**
   * Confirm a payment intent with a payment method.
   *
   * Logic:
   * - If method is 'wallet', deduct from the wallet immediately.
   * - If method is 'card', mark as processing (stub — no real card charge).
   * - If method is 'cash_on_delivery', mark as requires_confirmation.
   *
   * Rate limit: 10 confirmations per user per hour.
   */
  async confirmPayment(
    userId: string,
    intentId: string,
    body: ConfirmPaymentBody,
  ): Promise<PaymentIntent> {
    await this.checkRateLimit(userId, 'payments:hourly');

    return this.db.transaction(async (tx) => {
      // Lock the intent row
      const intentRows = await tx
        .select()
        .from(paymentIntentTable)
        .where(and(eq(paymentIntentTable.id, intentId), eq(paymentIntentTable.userId, userId)))
        .for('update')
        .limit(1);

      if (intentRows.length === 0) {
        throw new PaymentError('intent_not_found', 'Payment intent not found', 404);
      }

      const intent = intentRows[0]!;

      if (intent.status !== 'pending' && intent.status !== 'requires_confirmation') {
        throw new PaymentError(
          'intent_not_confirmable',
          `Intent is in status '${intent.status}' and cannot be confirmed`,
          422,
        );
      }

      if (new Date() > intent.expiresAt) {
        throw new PaymentError('intent_expired', 'Payment intent has expired', 422);
      }

      // Validate payment method belongs to user
      const methodRows = await tx
        .select()
        .from(paymentMethodTable)
        .where(
          and(
            eq(paymentMethodTable.id, body.paymentMethodId),
            eq(paymentMethodTable.userId, userId),
          ),
        )
        .limit(1);

      if (methodRows.length === 0) {
        throw new PaymentError('method_not_found', 'Payment method not found or does not belong to user', 404);
      }

      const method = methodRows[0]!;
      let newStatus: typeof intent.status;

      switch (method.type) {
        case 'wallet': {
          // Deduct from wallet inside the same transaction
          const walletRows = await tx
            .select()
            .from(walletTable)
            .where(eq(walletTable.userId, userId))
            .for('update')
            .limit(1);

          const wallet = walletRows[0];
          if (!wallet) {
            throw new PaymentError('wallet_not_found', 'Wallet not found', 404);
          }

          // Convert currency if needed (stub — assume 1 USD = 1500 IQD)
          const requiredIqd =
            intent.currency === 'IQD' ? intent.amount : Math.ceil(intent.amount * 1500);

          const available = wallet.balanceIqd - wallet.heldIqd;
          if (available < requiredIqd) {
            throw new PaymentError(
              'insufficient_balance',
              `Insufficient wallet balance: need ${formatIqd(requiredIqd)}, have ${formatIqd(available)}`,
              422,
            );
          }

          const newBalance = wallet.balanceIqd - requiredIqd;

          await tx
            .update(walletTable)
            .set({ balanceIqd: newBalance, updatedAt: new Date() })
            .where(eq(walletTable.id, wallet.id));

          await tx.insert(transactionTable).values({
            walletId: wallet.id,
            userId,
            type: 'debit',
            status: 'completed',
            amountIqd: requiredIqd,
            balanceAfterIqd: newBalance,
            description: intent.description || 'دفع من المحفظة',
            paymentIntentId: intent.id,
            metadata: { intentId: intent.id },
          });

          newStatus = 'succeeded';
          break;
        }

        case 'card':
          // Stub: in production this would charge through a payment processor
          this.logger.log(
            `[STUB] Card charge: intentId=${intent.id} amount=${intent.amount} ${intent.currency}`,
          );
          newStatus = 'processing';
          break;

        case 'cash_on_delivery':
          newStatus = 'requires_confirmation';
          break;

        default:
          throw new PaymentError('unsupported_method', 'Unsupported payment method type', 422);
      }

      const updated = await tx
        .update(paymentIntentTable)
        .set({
          status: newStatus,
          paymentMethodId: body.paymentMethodId,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntentTable.id, intent.id))
        .returning();

      this.logger.log(`Confirmed intent ${intent.id}: status=${newStatus} method=${method.type}`);
      return this.mapPaymentIntent(updated[0]!);
    });
  }

  /** Cancel a pending payment intent. */
  async cancelPaymentIntent(userId: string, intentId: string): Promise<PaymentIntent> {
    const rows = await this.db
      .select()
      .from(paymentIntentTable)
      .where(and(eq(paymentIntentTable.id, intentId), eq(paymentIntentTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      throw new PaymentError('intent_not_found', 'Payment intent not found', 404);
    }

    const intent = rows[0]!;
    const cancellableStatuses = ['pending', 'requires_confirmation'];

    if (!cancellableStatuses.includes(intent.status)) {
      throw new PaymentError(
        'intent_not_cancellable',
        `Intent in status '${intent.status}' cannot be cancelled`,
        422,
      );
    }

    const updated = await this.db
      .update(paymentIntentTable)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(paymentIntentTable.id, intentId))
      .returning();

    return this.mapPaymentIntent(updated[0]!);
  }

  /**
   * Refund a payment (full or partial).
   * For wallet payments, credits the amount back to the wallet.
   * For card/cash payments, marks as refunded (stub — no actual reversal).
   */
  async refundPayment(
    userId: string,
    intentId: string,
    body: RefundPaymentBody,
  ): Promise<PaymentIntent> {
    return this.db.transaction(async (tx) => {
      const intentRows = await tx
        .select()
        .from(paymentIntentTable)
        .where(and(eq(paymentIntentTable.id, intentId), eq(paymentIntentTable.userId, userId)))
        .for('update')
        .limit(1);

      if (intentRows.length === 0) {
        throw new PaymentError('intent_not_found', 'Payment intent not found', 404);
      }

      const intent = intentRows[0]!;

      if (intent.status !== 'succeeded' && intent.status !== 'partially_refunded') {
        throw new PaymentError(
          'intent_not_refundable',
          `Intent in status '${intent.status}' cannot be refunded`,
          422,
        );
      }

      const refundAmount = body.amount ?? intent.amount;
      const alreadyRefunded = intent.refundedAmount;
      const maxRefundable = intent.amount - alreadyRefunded;

      if (refundAmount <= 0) {
        throw new PaymentError('invalid_amount', 'Refund amount must be positive', 400);
      }

      if (refundAmount > maxRefundable) {
        throw new PaymentError(
          'refund_exceeds_original',
          `Refund amount exceeds remaining refundable amount: ${refundAmount} > ${maxRefundable}`,
          422,
        );
      }

      const newRefunded = alreadyRefunded + refundAmount;
      const newStatus = newRefunded >= intent.amount ? 'refunded' : 'partially_refunded';

      // If original payment was via wallet, credit back
      if (intent.paymentMethodId) {
        const methodRows = await tx
          .select()
          .from(paymentMethodTable)
          .where(eq(paymentMethodTable.id, intent.paymentMethodId))
          .limit(1);

        if (methodRows[0]?.type === 'wallet') {
          const refundIqd =
            intent.currency === 'IQD' ? refundAmount : Math.floor(refundAmount * 1500);

          const walletRows = await tx
            .select()
            .from(walletTable)
            .where(eq(walletTable.userId, userId))
            .for('update')
            .limit(1);

          if (walletRows[0]) {
            const wallet = walletRows[0];
            const newBalance = wallet.balanceIqd + refundIqd;

            await tx
              .update(walletTable)
              .set({ balanceIqd: newBalance, updatedAt: new Date() })
              .where(eq(walletTable.id, wallet.id));

            await tx.insert(transactionTable).values({
              walletId: wallet.id,
              userId,
              type: 'refund',
              status: 'completed',
              amountIqd: refundIqd,
              balanceAfterIqd: newBalance,
              description: `استرداد — ${body.reason}`,
              paymentIntentId: intent.id,
              metadata: { reason: body.reason, originalAmount: intent.amount },
            });
          }
        }
      }

      const updated = await tx
        .update(paymentIntentTable)
        .set({
          status: newStatus,
          refundedAmount: newRefunded,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntentTable.id, intent.id))
        .returning();

      this.logger.log(
        `Refund: intent=${intent.id} amount=${refundAmount} ${intent.currency} status=${newStatus}`,
      );
      return this.mapPaymentIntent(updated[0]!);
    });
  }

  /**
   * List payment intents for a user with optional status filter.
   */
  async listPaymentIntents(
    userId: string,
    query: { status?: string; cursor?: string; limit?: number },
  ): Promise<{ items: PaymentIntent[]; nextCursor: string | null }> {
    const limit = (query.limit ?? 20) + 1;

    let dbQuery = this.db
      .select()
      .from(paymentIntentTable)
      .where(eq(paymentIntentTable.userId, userId))
      .orderBy(desc(paymentIntentTable.createdAt))
      .limit(limit);

    if (query.status) {
      dbQuery = dbQuery.where(
        and(
          eq(paymentIntentTable.userId, userId),
          eq(paymentIntentTable.status, query.status),
        ),
      ) as typeof dbQuery;
    }

    if (query.cursor) {
      try {
        const cursorDate = new Date(Buffer.from(query.cursor, 'base64').toString('utf-8'));
        dbQuery = dbQuery.where(
          and(
            eq(paymentIntentTable.userId, userId),
            lt(paymentIntentTable.createdAt, cursorDate),
          ),
        ) as typeof dbQuery;
      } catch {
        // Invalid cursor — ignore
      }
    }

    const rows = await dbQuery;
    const pageLimit = query.limit ?? 20;
    const hasMore = rows.length > pageLimit;
    const items = hasMore ? rows.slice(0, pageLimit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? Buffer.from(items[items.length - 1]!.createdAt.toISOString()).toString('base64')
        : null;

    return {
      items: items.map((r) => this.mapPaymentIntent(r)),
      nextCursor,
    };
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapWallet(row: typeof walletTable.$inferSelect): Wallet {
    const available = row.balanceIqd - row.heldIqd;
    return {
      id: row.id as Wallet['id'],
      userId: row.userId as Wallet['userId'],
      balanceIqd: row.balanceIqd,
      heldIqd: row.heldIqd,
      availableIqd: Math.max(0, available),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapTransaction(row: typeof transactionTable.$inferSelect): Transaction {
    return {
      id: row.id as Transaction['id'],
      walletId: row.walletId as Transaction['walletId'],
      userId: row.userId as Transaction['userId'],
      type: row.type as Transaction['type'],
      status: row.status as Transaction['status'],
      amountIqd: row.amountIqd,
      balanceAfterIqd: row.balanceAfterIqd,
      description: row.description,
      paymentIntentId: (row.paymentIntentId ?? undefined) as Transaction['paymentIntentId'],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapPaymentMethod(row: typeof paymentMethodTable.$inferSelect): PaymentMethod {
    const base = {
      id: row.id as PaymentMethod['id'],
      userId: row.userId as PaymentMethod['userId'],
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
    };

    if (row.type === 'card') {
      return {
        ...base,
        type: 'card',
        card: {
          last4: row.cardLast4!,
          brand: (row.cardBrand ?? 'other') as 'visa' | 'mastercard' | 'other',
          expiryMonth: row.cardExpiryMonth!,
          expiryYear: row.cardExpiryYear!,
          holderName: row.cardHolderName ?? undefined,
        },
      };
    }

    if (row.type === 'wallet') {
      return { ...base, type: 'wallet' };
    }

    return { ...base, type: 'cash_on_delivery' };
  }

  private mapPaymentIntent(row: typeof paymentIntentTable.$inferSelect): PaymentIntent {
    return {
      id: row.id as PaymentIntent['id'],
      userId: row.userId as PaymentIntent['userId'],
      amount: row.amount,
      currency: row.currency as Currency,
      status: row.status as PaymentIntent['status'],
      paymentMethodId: (row.paymentMethodId ?? null) as PaymentIntent['paymentMethodId'],
      description: row.description,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      flaggedForReview: row.flaggedForReview,
      refundedAmount: row.refundedAmount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
