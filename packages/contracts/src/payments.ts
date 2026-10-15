// Payment contracts for Iraq Smart Maps — IQD-first wallet + payment intents.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { paginated, Problem, UserId } from './common';

const c = initContract();

// ─── Enums & primitives ───────────────────────────────────────────────────────

export const Currency = z.enum(['IQD', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const PaymentMethodType = z.enum(['card', 'wallet', 'cash_on_delivery']);
export type PaymentMethodType = z.infer<typeof PaymentMethodType>;

export const PaymentIntentStatus = z.enum([
  'pending',
  'requires_confirmation',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
  'cancelled',
]);
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatus>;

export const TransactionType = z.enum([
  'credit',    // money added to wallet
  'debit',     // money deducted from wallet
  'hold',      // temporary hold for pending payment
  'release',   // hold released back to wallet
  'refund',    // refund received
]);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionStatus = z.enum(['pending', 'completed', 'failed', 'reversed']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

// ─── Core types ───────────────────────────────────────────────────────────────

/** IQD amounts are stored as integer dinars (no fractions in Iraqi Dinar). */
export const IqdAmount = z.number().int().nonnegative().describe('Amount in IQD dinars (integer, no fractions)');
export type IqdAmount = z.infer<typeof IqdAmount>;

/** USD amounts are stored as cents to avoid floating-point issues. */
export const UsdCents = z.number().int().nonnegative().describe('Amount in USD cents');
export type UsdCents = z.infer<typeof UsdCents>;

/** Unified amount: integer units for the given currency. */
export const MoneyAmount = z.object({
  amount: z.number().int().nonnegative(),
  currency: Currency,
});
export type MoneyAmount = z.infer<typeof MoneyAmount>;

export const PaymentMethodId = z.string().uuid().brand<'PaymentMethodId'>();
export type PaymentMethodId = z.infer<typeof PaymentMethodId>;

export const PaymentIntentId = z.string().uuid().brand<'PaymentIntentId'>();
export type PaymentIntentId = z.infer<typeof PaymentIntentId>;

export const WalletId = z.string().uuid().brand<'WalletId'>();
export type WalletId = z.infer<typeof WalletId>;

export const TransactionId = z.string().uuid().brand<'TransactionId'>();
export type TransactionId = z.infer<typeof TransactionId>;

// ─── Payment method ───────────────────────────────────────────────────────────

/** Stored card details — never store full PAN, only masked display info.
 * In our stub phase the card fields are display-only. */
export const CardDetails = z.object({
  /** Last 4 digits only. Never the full number. */
  last4: z.string().length(4).regex(/^\d{4}$/),
  brand: z.enum(['visa', 'mastercard', 'other']),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2024).max(2040),
  holderName: z.string().max(100).optional(),
});
export type CardDetails = z.infer<typeof CardDetails>;

export const PaymentMethod = z.discriminatedUnion('type', [
  z.object({
    id: PaymentMethodId,
    userId: UserId,
    type: z.literal('card'),
    card: CardDetails,
    isDefault: z.boolean().default(false),
    createdAt: z.string().datetime(),
  }),
  z.object({
    id: PaymentMethodId,
    userId: UserId,
    type: z.literal('wallet'),
    isDefault: z.boolean().default(false),
    createdAt: z.string().datetime(),
  }),
  z.object({
    id: PaymentMethodId,
    userId: UserId,
    type: z.literal('cash_on_delivery'),
    isDefault: z.boolean().default(false),
    createdAt: z.string().datetime(),
  }),
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const Wallet = z.object({
  id: WalletId,
  userId: UserId,
  /** Balance in IQD dinars (integer). */
  balanceIqd: IqdAmount,
  /** Frozen/held amount not available for spending. */
  heldIqd: IqdAmount,
  /** Available = balance - held. */
  availableIqd: IqdAmount,
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Wallet = z.infer<typeof Wallet>;

// ─── Transaction ──────────────────────────────────────────────────────────────

export const Transaction = z.object({
  id: TransactionId,
  walletId: WalletId,
  userId: UserId,
  type: TransactionType,
  status: TransactionStatus,
  /** Integer amount in IQD. */
  amountIqd: IqdAmount,
  /** Wallet balance after this transaction. */
  balanceAfterIqd: IqdAmount,
  description: z.string().max(255),
  /** Optional reference to a payment intent. */
  paymentIntentId: PaymentIntentId.optional(),
  /** Free-form metadata (source, order reference, etc.). */
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof Transaction>;

// ─── Payment intent ───────────────────────────────────────────────────────────

export const PaymentIntent = z.object({
  id: PaymentIntentId,
  userId: UserId,
  amount: z.number().int().positive(),
  currency: Currency,
  status: PaymentIntentStatus,
  /** Payment method used for confirmation. Null until confirmed. */
  paymentMethodId: PaymentMethodId.nullable(),
  /** Description shown to the user. */
  description: z.string().max(255).default(''),
  /** Arbitrary metadata (order id, service type, etc.). */
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** Flag set by the fraud detection stub. */
  flaggedForReview: z.boolean().default(false),
  /** Refunded amount (partial refunds possible). */
  refundedAmount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Time at which the intent expires if not confirmed. */
  expiresAt: z.string().datetime(),
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

// ─── Request / response bodies ────────────────────────────────────────────────

export const CreatePaymentIntentBody = z.object({
  amount: z.number().int().positive(),
  currency: Currency,
  description: z.string().max(255).default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreatePaymentIntentBody = z.infer<typeof CreatePaymentIntentBody>;

export const ConfirmPaymentBody = z.object({
  paymentMethodId: PaymentMethodId,
});
export type ConfirmPaymentBody = z.infer<typeof ConfirmPaymentBody>;

export const RefundPaymentBody = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(255),
});
export type RefundPaymentBody = z.infer<typeof RefundPaymentBody>;

export const AddCardBody = z.object({
  last4: z.string().length(4).regex(/^\d{4}$/),
  brand: z.enum(['visa', 'mastercard', 'other']),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2024).max(2040),
  holderName: z.string().max(100).optional(),
  setDefault: z.boolean().default(false),
});
export type AddCardBody = z.infer<typeof AddCardBody>;

export const TopUpWalletBody = z.object({
  amountIqd: IqdAmount,
  /** Source channel — used for audit. */
  source: z.enum(['bank_transfer', 'cash_deposit', 'admin_credit', 'promotion']),
  reference: z.string().max(100).optional(),
});
export type TopUpWalletBody = z.infer<typeof TopUpWalletBody>;

export const TransactionFilters = z.object({
  type: TransactionType.optional(),
  status: TransactionStatus.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type TransactionFilters = z.infer<typeof TransactionFilters>;

// ─── REST contract ────────────────────────────────────────────────────────────

export const paymentsContract = c.router(
  {
    // ── Wallet ──────────────────────────────────────────────────────────────
    getWallet: {
      method: 'GET',
      path: '/v1/payments/wallet',
      responses: { 200: Wallet, 401: Problem, 404: Problem },
      summary: "Get the current user's wallet",
    },

    getTransactions: {
      method: 'GET',
      path: '/v1/payments/wallet/transactions',
      query: TransactionFilters,
      responses: { 200: paginated(Transaction), 401: Problem },
      summary: 'List wallet transactions (paginated)',
    },

    topUpWallet: {
      method: 'POST',
      path: '/v1/payments/wallet/top-up',
      body: TopUpWalletBody,
      responses: { 200: Wallet, 400: Problem, 401: Problem },
      summary: 'Add funds to wallet (admin/transfer only in stub phase)',
    },

    // ── Payment methods ──────────────────────────────────────────────────────
    listPaymentMethods: {
      method: 'GET',
      path: '/v1/payments/methods',
      responses: { 200: z.array(PaymentMethod), 401: Problem },
      summary: 'List saved payment methods',
    },

    addCard: {
      method: 'POST',
      path: '/v1/payments/methods/card',
      body: AddCardBody,
      responses: { 201: PaymentMethod, 400: Problem, 401: Problem },
      summary: 'Add a card (stub — no real tokenisation yet)',
    },

    removePaymentMethod: {
      method: 'DELETE',
      path: '/v1/payments/methods/:methodId',
      pathParams: z.object({ methodId: PaymentMethodId }),
      responses: { 204: z.undefined(), 401: Problem, 404: Problem },
      summary: 'Remove a saved payment method',
    },

    setDefaultMethod: {
      method: 'PATCH',
      path: '/v1/payments/methods/:methodId/default',
      pathParams: z.object({ methodId: PaymentMethodId }),
      body: z.object({}),
      responses: { 200: PaymentMethod, 401: Problem, 404: Problem },
      summary: 'Set a payment method as default',
    },

    // ── Payment intents ──────────────────────────────────────────────────────
    createPaymentIntent: {
      method: 'POST',
      path: '/v1/payments/intents',
      body: CreatePaymentIntentBody,
      responses: { 201: PaymentIntent, 400: Problem, 401: Problem, 422: Problem },
      summary: 'Create a payment intent',
    },

    getPaymentIntent: {
      method: 'GET',
      path: '/v1/payments/intents/:intentId',
      pathParams: z.object({ intentId: PaymentIntentId }),
      responses: { 200: PaymentIntent, 401: Problem, 404: Problem },
      summary: 'Get a payment intent by ID',
    },

    confirmPayment: {
      method: 'POST',
      path: '/v1/payments/intents/:intentId/confirm',
      pathParams: z.object({ intentId: PaymentIntentId }),
      body: ConfirmPaymentBody,
      responses: { 200: PaymentIntent, 400: Problem, 401: Problem, 404: Problem, 422: Problem },
      summary: 'Confirm a payment intent with a payment method',
    },

    cancelPaymentIntent: {
      method: 'POST',
      path: '/v1/payments/intents/:intentId/cancel',
      pathParams: z.object({ intentId: PaymentIntentId }),
      body: z.object({}),
      responses: { 200: PaymentIntent, 400: Problem, 401: Problem, 404: Problem },
      summary: 'Cancel a pending payment intent',
    },

    refundPayment: {
      method: 'POST',
      path: '/v1/payments/intents/:intentId/refund',
      pathParams: z.object({ intentId: PaymentIntentId }),
      body: RefundPaymentBody,
      responses: { 200: PaymentIntent, 400: Problem, 401: Problem, 404: Problem, 422: Problem },
      summary: 'Refund a payment (full or partial)',
    },

    listPaymentIntents: {
      method: 'GET',
      path: '/v1/payments/intents',
      query: z.object({
        status: PaymentIntentStatus.optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      responses: { 200: paginated(PaymentIntent), 401: Problem },
      summary: "List the current user's payment intents",
    },
  },
  { pathPrefix: '' },
);
