/** Arabic-Indic (U+0660-0669) and Extended Arabic-Indic (U+06F0-06F9) digits to ASCII: both blocks put 0-9 at code % 16. */
export const toAsciiDigits = (s: string): string => s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) % 16));

/** 07xxxxxxxxx, +9647xxxxxxxxx or 009647xxxxxxxxx (any digits, with spaces, dashes or pasted bidi marks) to +9647xxxxxxxxx, else null. */
export function normalizeIraqiPhone(input: string): string | null {
  const m = /^(?:\+964|00964|0)(7\d{9})$/.exec(toAsciiDigits(input).replace(/[\s()\-‎‏‪-‮⁦-⁩]/g, ''));
  return m ? `+964${m[1]}` : null;
}

/** Keeps a phone number left-to-right inside RTL text (Unicode LRI ... PDI). */
export const isolateLtr = (s: string): string => `⁦${s}⁩`;
