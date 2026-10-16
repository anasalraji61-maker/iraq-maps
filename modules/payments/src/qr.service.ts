/**
 * QrService — generates and decodes payment QR codes for Iraq Smart Maps.
 *
 * STUB PHASE: no real payment gateway integration.
 * QR payloads are simple JSON encoded as base64url strings.
 * A real implementation would sign the payload with HMAC-SHA256 and validate
 * the signature on decode to prevent tampering.
 *
 * QR payload format (v1):
 * {
 *   v: 1,                     // payload version
 *   type: "payment_request",
 *   merchantId: string,       // provider UUID
 *   merchantName: string,     // display name (max 80 chars)
 *   amount: number | null,    // IQD integer, null = customer enters amount
 *   currency: "IQD" | "USD",
 *   note: string,             // memo / description (max 120 chars)
 *   ref: string,              // unique reference ID for this QR (UUID v4)
 *   createdAt: string,        // ISO-8601 UTC
 *   expiresAt: string | null, // ISO-8601 UTC, null = no expiry
 * }
 */

import { Injectable, Logger } from '@nestjs/common';

// ─── Constants ────────────────────────────────────────────────────────────────

const QR_PAYLOAD_VERSION = 1;
const QR_MAX_MERCHANT_NAME_LEN = 80;
const QR_MAX_NOTE_LEN = 120;

/** Default expiry for a QR code with a fixed amount: 15 minutes. */
const QR_FIXED_AMOUNT_EXPIRY_MS = 15 * 60 * 1_000;

/** Open-amount QR codes (amount = null) do not expire by default. */
const QR_OPEN_EXPIRY_MS: number | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────

export type QrCurrency = 'IQD' | 'USD';

/** Decoded payment request extracted from a QR code string. */
export interface PaymentRequest {
  /** Payload schema version. */
  version: number;
  /** Merchant (provider) UUID. */
  merchantId: string;
  /** Human-readable merchant display name. */
  merchantName: string;
  /**
   * Requested amount in the smallest integer unit for the currency.
   * IQD: dinars (no fractions). USD: cents.
   * null means the payer sets the amount.
   */
  amount: number | null;
  currency: QrCurrency;
  /** Short memo shown to the payer. */
  note: string;
  /** Unique reference for this QR instance — use for idempotency. */
  ref: string;
  createdAt: Date;
  /** null = never expires. */
  expiresAt: Date | null;
  /** True if the QR's expiry time is in the past. */
  isExpired: boolean;
}

/** Raw QR payload (serialised to/from JSON). */
interface QrPayloadV1 {
  v: 1;
  type: 'payment_request';
  merchantId: string;
  merchantName: string;
  amount: number | null;
  currency: QrCurrency;
  note: string;
  ref: string;
  createdAt: string;
  expiresAt: string | null;
}

/** Options accepted by generateQRCode. */
export interface GenerateQrOptions {
  merchantId: string;
  merchantName: string;
  /**
   * Fixed amount the payer will be charged.
   * Pass null to create an open-amount QR (payer enters their own amount).
   * IQD: integer dinars. USD: integer cents.
   */
  amount: number | null;
  currency: QrCurrency;
  /** Short memo / description shown to the payer. Max 120 chars. */
  note?: string;
  /**
   * Custom expiry duration in milliseconds.
   * Overrides the defaults (15 min for fixed-amount, no expiry for open).
   * Pass null to force no expiry even for a fixed amount.
   */
  expiryMs?: number | null;
}

/** Output of generateQRCode. */
export interface GeneratedQr {
  /** base64url-encoded JSON payload — embed in a QR image. */
  qrData: string;
  /** Unique reference ID that identifies this QR issuance. */
  ref: string;
  /** When this QR expires, or null if it never expires. */
  expiresAt: Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encode a string to base64url (URL-safe base64, no padding).
 * Works in both Node (Buffer) and, if ever needed, browser (atob/btoa).
 */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a base64url string back to a UTF-8 string.
 * Returns null if the string is not valid base64.
 */
function fromBase64Url(input: string): string | null {
  try {
    // Re-pad to a valid base64 length
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const rem = padded.length % 4;
    const padded2 = rem === 0 ? padded : padded + '='.repeat(4 - rem);
    return Buffer.from(padded2, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Cryptographically random UUID v4 (Node 14.17+). */
function randomUuid(): string {
  return crypto.randomUUID();
}

/** Truncate a string to at most `max` characters. */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  /**
   * Generate a payment QR code payload string.
   *
   * The returned `qrData` string is safe to embed in a QR code image library
   * (e.g., react-native-qrcode-svg). On scan, pass it to `decodeQRCode`.
   *
   * STUB: in production, sign the payload with HMAC-SHA256 and a server secret
   * before encoding so that tampered QRs are rejected on decode.
   *
   * @example
   * const { qrData } = await qrService.generateQRCode({
   *   merchantId: '550e8400-e29b-41d4-a716-446655440000',
   *   merchantName: 'مطعم الرافدين',
   *   amount: 25000,       // 25 000 IQD
   *   currency: 'IQD',
   *   note: 'طلب طعام',
   * });
   * // → "eyJ2IjoxLCJ0eXBlIjoicGF5bWVudF9yZXF1ZXN0Ii..."
   */
  generateQRCode(opts: GenerateQrOptions): GeneratedQr {
    const {
      merchantId,
      merchantName,
      amount,
      currency,
      note = '',
      expiryMs,
    } = opts;

    // Validate amount
    if (amount !== null) {
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('amount must be a positive integer or null');
      }
    }

    const now = new Date();
    const ref = randomUuid();

    // Determine expiry
    let expiresAt: Date | null;
    if (expiryMs === null) {
      expiresAt = null; // explicit no-expiry
    } else if (typeof expiryMs === 'number') {
      expiresAt = new Date(now.getTime() + expiryMs);
    } else if (amount !== null) {
      expiresAt = new Date(now.getTime() + QR_FIXED_AMOUNT_EXPIRY_MS);
    } else {
      expiresAt = QR_OPEN_EXPIRY_MS !== null
        ? new Date(now.getTime() + QR_OPEN_EXPIRY_MS)
        : null;
    }

    const payload: QrPayloadV1 = {
      v: QR_PAYLOAD_VERSION as 1,
      type: 'payment_request',
      merchantId,
      merchantName: truncate(merchantName, QR_MAX_MERCHANT_NAME_LEN),
      amount,
      currency,
      note: truncate(note, QR_MAX_NOTE_LEN),
      ref,
      createdAt: now.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
    };

    const qrData = toBase64Url(JSON.stringify(payload));

    this.logger.debug(
      `Generated QR ref=${ref} merchantId=${merchantId} amount=${amount ?? 'open'} ${currency}`,
    );

    return { qrData, ref, expiresAt };
  }

  /**
   * Decode and validate a QR code payload string produced by `generateQRCode`.
   *
   * Returns a structured `PaymentRequest` on success, or throws a descriptive
   * error if the payload is malformed, the version is unsupported, or the
   * required fields are missing.
   *
   * `isExpired` is set to true when `expiresAt` is in the past; the caller
   * decides whether to reject expired QRs.
   *
   * STUB: in production, verify the HMAC signature before trusting any field.
   *
   * @example
   * const req = await qrService.decodeQRCode(scannedString);
   * if (req.isExpired) throw new Error('QR code has expired');
   * // proceed with req.merchantId, req.amount, etc.
   */
  decodeQRCode(qrData: string): PaymentRequest {
    if (!qrData || typeof qrData !== 'string') {
      throw new Error('qrData must be a non-empty string');
    }

    const json = fromBase64Url(qrData.trim());
    if (json === null) {
      throw new Error('QR data is not valid base64url');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error('QR data does not contain valid JSON');
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('QR payload must be a JSON object');
    }

    const obj = raw as Record<string, unknown>;

    // Version check
    if (obj['v'] !== QR_PAYLOAD_VERSION) {
      throw new Error(
        `Unsupported QR payload version: ${String(obj['v'])}. Expected ${QR_PAYLOAD_VERSION}.`,
      );
    }

    if (obj['type'] !== 'payment_request') {
      throw new Error(`Unknown QR payload type: ${String(obj['type'])}`);
    }

    // Validate required string fields
    const merchantId = obj['merchantId'];
    const merchantName = obj['merchantName'];
    const currency = obj['currency'];
    const ref = obj['ref'];
    const createdAtStr = obj['createdAt'];

    if (typeof merchantId !== 'string' || merchantId.length === 0) {
      throw new Error('QR payload missing merchantId');
    }
    if (typeof merchantName !== 'string') {
      throw new Error('QR payload missing merchantName');
    }
    if (currency !== 'IQD' && currency !== 'USD') {
      throw new Error(`QR payload has invalid currency: ${String(currency)}`);
    }
    if (typeof ref !== 'string' || ref.length === 0) {
      throw new Error('QR payload missing ref');
    }
    if (typeof createdAtStr !== 'string') {
      throw new Error('QR payload missing createdAt');
    }

    // Validate amount
    const rawAmount = obj['amount'];
    let amount: number | null = null;
    if (rawAmount !== null && rawAmount !== undefined) {
      if (typeof rawAmount !== 'number' || !Number.isInteger(rawAmount) || rawAmount <= 0) {
        throw new Error(`QR payload has invalid amount: ${String(rawAmount)}`);
      }
      amount = rawAmount;
    }

    // Parse dates
    const createdAt = new Date(createdAtStr);
    if (isNaN(createdAt.getTime())) {
      throw new Error(`QR payload has invalid createdAt: ${createdAtStr}`);
    }

    const rawExpiresAt = obj['expiresAt'];
    let expiresAt: Date | null = null;
    if (rawExpiresAt !== null && rawExpiresAt !== undefined) {
      if (typeof rawExpiresAt !== 'string') {
        throw new Error('QR payload has invalid expiresAt type');
      }
      expiresAt = new Date(rawExpiresAt);
      if (isNaN(expiresAt.getTime())) {
        throw new Error(`QR payload has invalid expiresAt: ${rawExpiresAt}`);
      }
    }

    const now = new Date();
    const isExpired = expiresAt !== null && expiresAt < now;

    const note = typeof obj['note'] === 'string' ? obj['note'] : '';

    this.logger.debug(
      `Decoded QR ref=${ref} merchantId=${merchantId} expired=${isExpired}`,
    );

    return {
      version: QR_PAYLOAD_VERSION,
      merchantId,
      merchantName,
      amount,
      currency,
      note,
      ref,
      createdAt,
      expiresAt,
      isExpired,
    };
  }

  /**
   * Generate a human-readable summary of a payment request for display.
   * Returns Arabic-first text suitable for UI toasts or confirmations.
   *
   * Example output:
   *   "طلب دفع من مطعم الرافدين — ٢٥٬٠٠٠ د.ع"
   *   "طلب دفع مفتوح من مطعم الرافدين"
   */
  summarisePaymentRequest(req: PaymentRequest): string {
    const merchantPart = req.merchantName || req.merchantId;

    if (req.amount === null) {
      return `طلب دفع مفتوح من ${merchantPart}`;
    }

    const formattedAmount = this.formatAmount(req.amount, req.currency);
    return `طلب دفع من ${merchantPart} — ${formattedAmount}`;
  }

  /**
   * Format an integer amount for display.
   * IQD: Arabic-Indic digits with thousands separator, suffixed "د.ع".
   * USD: English digits with dollar sign prefix.
   */
  formatAmount(amount: number, currency: QrCurrency): string {
    if (currency === 'USD') {
      const dollars = amount / 100;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(dollars);
    }

    // IQD — Arabic-Indic digits
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const intStr = Math.floor(amount).toString();
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
   * Check whether a QR payload string is syntactically valid without fully
   * decoding it. Useful for a quick scan-and-reject before showing error UI.
   * Returns { valid: true } or { valid: false, reason: string }.
   */
  validateQRData(qrData: string): { valid: true } | { valid: false; reason: string } {
    try {
      this.decodeQRCode(qrData);
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'Unknown decode error',
      };
    }
  }

  /**
   * Generate a batch of QR codes for a merchant (e.g., table QRs for a restaurant).
   * Each code in the batch gets a unique ref but shares the same merchantId and
   * optional fixed amount.
   *
   * @param count    Number of QRs to generate (1–50).
   * @param baseOpts Shared options; note is suffixed with the table/batch index.
   */
  generateBatch(
    count: number,
    baseOpts: Omit<GenerateQrOptions, 'note'> & { notePrefix?: string },
  ): GeneratedQr[] {
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new Error('count must be an integer between 1 and 50');
    }

    return Array.from({ length: count }, (_, i) => {
      const note = baseOpts.notePrefix
        ? `${truncate(baseOpts.notePrefix, 100)} ${i + 1}`
        : `${i + 1}`;

      return this.generateQRCode({ ...baseOpts, note });
    });
  }
}
