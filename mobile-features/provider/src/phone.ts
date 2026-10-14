import { toAsciiDigits } from '@iraq-maps/i18n';

// Unicode bidi/directional marks stripped from phone input
// Using String.fromCodePoint to avoid literal invisible chars in source
const BIDI_STRIP_RE = new RegExp(
  '[\\s()\\-' +
    String.fromCodePoint(0x200e) + // LRM
    String.fromCodePoint(0x200f) + // RLM
    String.fromCodePoint(0x202a) + // LRE
    String.fromCodePoint(0x202b) + // RLE
    String.fromCodePoint(0x202c) + // PDF
    String.fromCodePoint(0x202d) + // LRO
    String.fromCodePoint(0x202e) + // RLO
    String.fromCodePoint(0x2066) + // LRI
    String.fromCodePoint(0x2067) + // RLI
    String.fromCodePoint(0x2068) + // FSI
    String.fromCodePoint(0x2069) + // PDI
    ']',
  'g',
);

// LRI (U+2066) and PDI (U+2069) to isolate a phone number LTR in RTL text
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

/** 07xxxxxxxxx, +9647xxxxxxxxx or 009647xxxxxxxxx to +9647xxxxxxxxx, else null. */
export function normalizeIraqiPhone(input: string): string | null {
  const stripped = toAsciiDigits(input).replace(BIDI_STRIP_RE, '');
  const m = /^(?:\+964|00964|0)(7\d{9})$/.exec(stripped);
  return m ? `+964${m[1]}` : null;
}

/** Keeps a phone number left-to-right inside RTL text using Unicode LRI/PDI isolates. */
export const isolateLtr = (s: string): string => LRI + s + PDI;
