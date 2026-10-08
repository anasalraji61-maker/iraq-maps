import { toAsciiDigits } from '@iraq-maps/i18n';

/** 07xxxxxxxxx, +9647xxxxxxxxx or 009647xxxxxxxxx (any digits, with spaces, dashes or pasted bidi marks) to +9647xxxxxxxxx, else null. */
export function normalizeIraqiPhone(input: string): string | null {
  const m = /^(?:\+964|00964|0)(7\d{9})$/.exec(toAsciiDigits(input).replace(/[\s()\-\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ''));
  return m ? `+964${m[1]}` : null;
}

/** Keeps a phone number left-to-right inside RTL text (Unicode LRI ... PDI). */
export const isolateLtr = (s: string): string => `\u2066${s}\u2069`;
