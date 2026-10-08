// Spelling variants folded for search. Sorani letters (ڕ ۆ ێ ڵ ە) and hamza carriers (ئ ؤ) are kept as they are.
const FOLD: Record<string, string> = {
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
  'ٱ': 'ا',
  'ة': 'ه',
  'ى': 'ي',
  'ی': 'ي', // Persian/Kurdish yeh U+06CC
  'ک': 'ك', // Persian/Kurdish kaf U+06A9
};

// Tatweel, harakat/tashkeel, superscript alef and Quranic annotation marks.
const MARKS = /\u0640|[\u064B-\u065F]|\u0670|[\u06D6-\u06ED]/g;
const FOLDED = /[أإآٱةىیک]/g;
const DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** Shared Arabic/Kurdish search normalizer (server import + search, client search). Idempotent. */
export function normalizeArabic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(MARKS, '')
    .replace(FOLDED, (char) => FOLD[char] ?? char)
    .replace(DIGITS, (digit) => String(digit.charCodeAt(0) - (digit >= '\u06F0' ? 0x06f0 : 0x0660)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
