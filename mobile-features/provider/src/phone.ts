import { toAsciiDigits } from '@iraq-maps/i18n';

/** 07xxxxxxxxx, +9647xxxxxxxxx or 009647xxxxxxxxx to +9647xxxxxxxxx, else null. */
export function normalizeIraqiPhone(input: string): string | null {
  const m = /^(?:\+964|00964|0)(7\d{9})$/.exec(toAsciiDigits(input).replace(/[\s()\-‎‏‪-‮⁦-⁩]/g, ''));
  return m ? `+964${m[1]}` : null;
}

/** Keeps a phone number left-to-right inside RTL text. */
export const isolateLtr = (s: string): string => `⁦${s}⁩`;
