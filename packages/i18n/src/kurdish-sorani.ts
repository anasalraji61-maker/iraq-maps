/**
 * Kurdish Sorani (ckb) linguistic helpers.
 *
 * Kurdish Sorani uses the Arabic script and is written right-to-left.
 * It shares the Arabic-Indic numeral system (٠١٢٣٤٥٦٧٨٩) with Iraqi Arabic.
 *
 * CLDR tag: ckb-IQ-u-nu-arab
 */

/** The Kurdish Sorani months in the Persian/Kurdish solar calendar (Rojhelat). */
export const KURDISH_SOLAR_MONTHS = [
  'خاکەلێوە',   // 1  — Xakelêwe   (roughly April)
  'گوڵان',      // 2  — Gulan      (roughly May)
  'جۆزەردان',   // 3  — Cozerdan   (roughly June)
  'پووشپەڕ',    // 4  — Pûşper     (roughly July)
  'گەلاوێژ',    // 5  — Gelawiêj   (roughly August)
  'خەرمانان',   // 6  — Xermanan   (roughly September)
  'ڕەزبەر',     // 7  — Rezber     (roughly October)
  'گەڵاڕێزان',  // 8  — Gelarêzan  (roughly November)
  'سەرماوەز',   // 9  — Sermawez   (roughly December)
  'بەفرانبار',  // 10 — Befranbar  (roughly January)
  'ڕێبەندان',   // 11 — Rêbendan  (roughly February)
  'ڕەشەمە',     // 12 — Reşeme    (roughly March)
] as const;

/** The Gregorian month names in Kurdish Sorani as used in everyday Iraqi speech. */
export const KURDISH_GREGORIAN_MONTHS = [
  'کانوونی دووەم',  // January
  'شوبات',          // February
  'ئازار',          // March
  'نیسان',          // April
  'ئایار',          // May
  'حوزەیران',       // June
  'تەمووز',         // July
  'ئاب',            // August
  'ئەیلوول',        // September
  'تشرینی یەکەم',   // October
  'تشرینی دووەم',   // November
  'کانوونی یەکەم',  // December
] as const;

/** Days of the week in Kurdish Sorani (starting Sunday per Iraqi convention). */
export const KURDISH_WEEKDAYS = [
  'یەکشەممە',   // Sunday
  'دووشەممە',   // Monday
  'سێشەممە',    // Tuesday
  'چوارشەممە',  // Wednesday
  'پێنجشەممە',  // Thursday
  'هەینی',      // Friday
  'شەممە',      // Saturday
] as const;

/** Short day abbreviations (3 chars max). */
export const KURDISH_WEEKDAYS_SHORT = [
  'یەک', // Sun
  'دوو', // Mon
  'سێ',  // Tue
  'چوار', // Wed
  'پێنج', // Thu
  'هەی', // Fri
  'شەم', // Sat
] as const;

/**
 * Returns the Kurdish Sorani numeral string for a number.
 * Uses Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) which are standard in Iraq.
 */
export function toKurdishNumerals(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

/**
 * Returns the Latin numeral string for a Kurdish-numeral string.
 * Useful when passing values to Number() after display.
 */
export function fromKurdishNumerals(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * Formats a number for Kurdish Sorani display using the CLDR tag.
 * Wraps `Intl.NumberFormat` with the Iraqi Kurdish locale.
 */
export function formatKurdishNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat('ckb-IQ-u-nu-arab', options).format(value);
}

/**
 * Formats a currency amount in Iraqi Dinar for Kurdish Sorani display.
 */
export function formatKurdishIqd(amount: number): string {
  return `${formatKurdishNumber(amount)} د.ع.`;
}

/**
 * Kurdish Sorani plural categories.
 * Kurdish has two grammatical numbers: singular and plural.
 * The plural suffix is typically `ـەکان` (ekan) for definite plural
 * or `ـان` (an) for indefinite.
 *
 * Returns 'one' for 1, 'other' for all other values.
 */
export function kurdishPluralCategory(n: number): 'one' | 'other' {
  return n === 1 ? 'one' : 'other';
}

/**
 * Common Kurdish Sorani UI greetings and phrases.
 * These are read-only constants — do not add user-facing strings here;
 * all UI strings must go through the i18n namespace system (`t()`).
 * This map is for programmatic use (e.g. time-of-day greetings).
 */
export const KURDISH_GREETINGS = {
  /** Generic greeting, any time. */
  hello: 'سڵاو',
  /** Good morning (before noon). */
  goodMorning: 'بەیانی باش',
  /** Good afternoon (noon–sunset). */
  goodAfternoon: 'ئێوارە باش',
  /** Good evening (after sunset). */
  goodEvening: 'شەو باش',
  /** Goodbye. */
  goodbye: 'خوا حافیز',
  /** Welcome (formal). */
  welcome: 'بەخێربێیت',
  /** Thank you. */
  thanks: 'سوپاس',
  /** You're welcome. */
  youreWelcome: 'خۆشم ئاید',
  /** Please. */
  please: 'تکایە',
  /** Sorry / Excuse me. */
  sorry: 'ببوورە',
  /** Yes. */
  yes: 'بەڵێ',
  /** No. */
  no: 'نەخێر',
  /** OK. */
  ok: 'باشە',
} as const;

/**
 * Returns a time-of-day greeting in Kurdish Sorani based on the current hour.
 * @param hour  0–23 (local time)
 */
export function getKurdishGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return KURDISH_GREETINGS.goodMorning;
  if (hour >= 12 && hour < 18) return KURDISH_GREETINGS.goodAfternoon;
  if (hour >= 18 && hour < 22) return KURDISH_GREETINGS.goodEvening;
  return KURDISH_GREETINGS.hello;
}

/**
 * Normalises a Kurdish Sorani string for search/matching:
 * - Strips Arabic kashida (U+0640).
 * - Normalises hamza variants to bare alef (U+0627).
 * - Strips tatweel.
 * - Removes diacritics (harakat) U+064B–U+065F, U+0670.
 */
export function normalizeKurdish(text: string): string {
  return text
    .replace(/ـ/g, '')          // kashida / tatweel
    .replace(/[ً-ٰٟ]/g, '') // diacritics
    .replace(/[آأإٱ]/g, 'ا') // alef variants → bare alef
    .replace(/ؤ/g, 'و')    // waw with hamza → waw
    .replace(/ئ/g, 'ي')    // ya with hamza → ya
    .trim();
}

/**
 * Returns the Kurdish Sorani ordinal string for a number.
 * Kurdish ordinals are formed by appending `ـەم` (em) to the numeral.
 * Example: ١ → یەکەم, 2 → دوویەم
 */
export function toKurdishOrdinal(n: number): string {
  const ORDINALS: Record<number, string> = {
    1: 'یەکەم',
    2: 'دووەم',
    3: 'سێیەم',
    4: 'چوارەم',
    5: 'پێنجەم',
    6: 'شەشەم',
    7: 'حەوتەم',
    8: 'هەشتەم',
    9: 'نۆیەم',
    10: 'دەیەم',
  };
  return ORDINALS[n] ?? `${toKurdishNumerals(n)}ەم`;
}

/**
 * Formats a date in Kurdish Sorani.
 * @param date  JavaScript Date object.
 * @param format  'short' (١/١/٢٠٢٥), 'long' (١ی کانوونی دووەم ٢٠٢٥), 'relative' not handled here.
 */
export function formatKurdishDate(
  date: Date,
  format: 'short' | 'long' = 'long',
): string {
  const day = date.getDate();
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();

  if (format === 'short') {
    return `${toKurdishNumerals(day)}/${toKurdishNumerals(month + 1)}/${toKurdishNumerals(year)}`;
  }
  const monthName = KURDISH_GREGORIAN_MONTHS[month];
  return `${toKurdishNumerals(day)}ی ${monthName} ${toKurdishNumerals(year)}`;
}

/**
 * Formats a time in Kurdish Sorani (HH:MM, 24-hour clock by default).
 */
export function formatKurdishTime(
  date: Date,
  use12Hour = false,
): string {
  if (use12Hour) {
    return new Intl.DateTimeFormat('ckb-IQ-u-nu-arab', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }
  const h = toKurdishNumerals(String(date.getHours()).padStart(2, '0'));
  const m = toKurdishNumerals(String(date.getMinutes()).padStart(2, '0'));
  return `${h}:${m}`;
}

/**
 * Returns a relative time string in Kurdish Sorani.
 * For fine-grained relative time, use the i18n `t()` function with
 * the appropriate key from the `common` namespace.
 */
export function formatKurdishRelativeTime(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  const past = deltaMs < 0;
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  let value: string;
  if (abs < MINUTE) {
    value = 'ئێستا';
    return value;
  } else if (abs < HOUR) {
    const mins = Math.round(abs / MINUTE);
    value = `${toKurdishNumerals(mins)} خولەک`;
  } else if (abs < DAY) {
    const hours = Math.round(abs / HOUR);
    value = `${toKurdishNumerals(hours)} کاتژمێر`;
  } else {
    const days = Math.round(abs / DAY);
    value = `${toKurdishNumerals(days)} ڕۆژ`;
  }
  return past ? `${value} پێشتر` : `لە ماوەی ${value}`;
}
