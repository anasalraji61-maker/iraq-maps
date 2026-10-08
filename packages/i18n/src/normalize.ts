// Search normalizer for Arabic and Kurdish Sorani. Index and query must both go through it.
// Sorani letters ڕ ۆ ێ ڵ ە (U+0695 U+06C6 U+06CE U+06B5 U+06D5) are left untouched.

/** Letter variants folded to one form. */
const FOLD: Record<string, string> = {
  '\u0622': '\u0627', // آ → ا
  '\u0623': '\u0627', // أ → ا
  '\u0625': '\u0627', // إ → ا
  '\u0671': '\u0627', // ٱ → ا
  '\u0629': '\u0647', // ة → ه
  '\u06BE': '\u0647', // ھ (Kurdish heh) → ه
  '\u06C1': '\u0647', // ہ → ه
  '\u0649': '\u064A', // ى → ي
  '\u06CC': '\u064A', // ی (Persian/Kurdish yeh) → ي
  '\u06A9': '\u0643', // ک (keheh) → ك
};
const FOLDABLE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');
/** Tashkeel, Quranic annotation marks and tatweel. */
const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;
/** Bidi controls, zero-width (non-)joiners and BOM. */
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
/** Arabic-Indic ٠-٩ and Persian ۰-۹: the low nibble of each code point is its value. */
const DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** Shared Arabic/Kurdish search normalizer (server import + search, client search). */
export function normalizeArabic(text: string): string {
  return text
    .normalize('NFKC') // presentation forms and ligatures → base letters; composes decomposed hamza/madda
    .replace(INVISIBLE, '')
    .replace(MARKS, '')
    .replace(FOLDABLE, (c) => FOLD[c] ?? c)
    .replace(DIGITS, (d) => String(d.charCodeAt(0) % 16))
    .replace(/\s+/g, ' ')
    .trim();
}
