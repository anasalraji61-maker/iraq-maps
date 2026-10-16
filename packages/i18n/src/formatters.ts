/**
 * Iraq-specific formatters for currency, dates, distances, and other locale-aware values.
 *
 * All formatters accept a locale parameter ('ar' | 'ckb' | 'en') and produce
 * the appropriate output, including Arabic-Indic digits for Arabic and Kurdish Sorani.
 *
 * Both Arabic (ar) and Kurdish Sorani (ckb) are RTL languages that share the
 * Arabic script, so digit and calendar conventions largely align.
 */

import type { Locale } from '@iraq-maps/contracts';

// ─── Arabic-Indic digit conversion ─────────────────────────────────────────

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert ASCII digits 0-9 to Arabic-Indic digits ٠-٩.
 * Non-digit characters are left unchanged.
 */
export function toArabicIndicDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)]!);
}

/**
 * Returns true for locales that conventionally use Arabic-Indic digits
 * (Arabic and Kurdish Sorani).
 */
export function usesArabicIndicDigits(locale: Locale): boolean {
  return locale === 'ar' || locale === 'ckb';
}

// ─── IQD currency formatter ─────────────────────────────────────────────────

interface IqdOptions {
  /** Whether to display fractional fils (default: false — IQD rarely uses fills). */
  showFils?: boolean;
  /** Whether to show the currency symbol (default: true). */
  showSymbol?: boolean;
}

/**
 * Format an Iraqi Dinar amount.
 *
 * - Arabic / Kurdish Sorani: uses Arabic-Indic digits and the abbreviated
 *   symbol "د.ع." placed after the number with a space.
 * - English: uses ASCII digits with "IQD" before the number.
 *
 * @example
 *   formatIqd(1500, 'ar')   // "١٬٥٠٠ د.ع."
 *   formatIqd(1500, 'ckb')  // "١٬٥٠٠ د.ع."
 *   formatIqd(1500, 'en')   // "IQD 1,500"
 */
export function formatIqd(amount: number, locale: Locale, opts: IqdOptions = {}): string {
  const { showFils = false, showSymbol = true } = opts;

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: showFils ? 3 : 0,
    maximumFractionDigits: showFils ? 3 : 0,
  });

  if (locale === 'en') {
    return showSymbol ? `IQD ${formatted}` : formatted;
  }

  // Arabic / Kurdish Sorani
  const arabicFormatted = toArabicIndicDigits(formatted);
  if (!showSymbol) return arabicFormatted;
  return `${arabicFormatted} د.ع.`;
}

// ─── Date formatter ──────────────────────────────────────────────────────────

type DateFormatStyle = 'short' | 'medium' | 'long' | 'full';

const ARABIC_MONTH_NAMES: readonly string[] = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const KURDISH_MONTH_NAMES: readonly string[] = [
  'کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
  'تەمموز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم',
];

const ARABIC_WEEKDAY_NAMES: readonly string[] = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

const KURDISH_WEEKDAY_NAMES: readonly string[] = [
  'یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە',
];

/**
 * Format a Date object for the given locale.
 *
 * @param date   - The date to format.
 * @param locale - Target locale.
 * @param style  - 'short' (DD/MM/YYYY), 'medium' (day Month year), 'long' (weekday, day Month year), 'full'.
 *
 * @example
 *   formatDate(new Date('2024-06-15'), 'ar', 'medium') // "١٥ يونيو ٢٠٢٤"
 *   formatDate(new Date('2024-06-15'), 'en', 'short')  // "15/06/2024"
 */
export function formatDate(date: Date, locale: Locale, style: DateFormatStyle = 'medium'): string {
  const d = date.getDate();
  const m = date.getMonth(); // 0-based
  const y = date.getFullYear();
  const wd = date.getDay(); // 0 = Sunday

  if (locale === 'en') {
    const dd = String(d).padStart(2, '0');
    const mm = String(m + 1).padStart(2, '0');
    switch (style) {
      case 'short': return `${dd}/${mm}/${y}`;
      case 'medium': return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]} ${y}`;
      case 'long': return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][wd]}, ${d} ${['January','February','March','April','May','June','July','August','September','October','November','December'][m]} ${y}`;
      case 'full': return date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  const monthNames = locale === 'ckb' ? KURDISH_MONTH_NAMES : ARABIC_MONTH_NAMES;
  const weekdayNames = locale === 'ckb' ? KURDISH_WEEKDAY_NAMES : ARABIC_WEEKDAY_NAMES;

  const convert = (n: number | string) => toArabicIndicDigits(String(n));

  const dayStr = convert(d);
  const yearStr = convert(y);
  const monthStr = monthNames[m];
  const weekdayStr = weekdayNames[wd];

  switch (style) {
    case 'short': {
      const mm = convert(String(m + 1).padStart(2, '0'));
      const dd = convert(String(d).padStart(2, '0'));
      return `${dd}/${mm}/${yearStr}`;
    }
    case 'medium':
      return `${dayStr} ${monthStr} ${yearStr}`;
    case 'long':
      return `${weekdayStr}، ${dayStr} ${monthStr} ${yearStr}`;
    case 'full':
      return `${weekdayStr}، ${dayStr} ${monthStr} ${yearStr}`;
  }
}

// ─── Time formatter ──────────────────────────────────────────────────────────

interface TimeOptions {
  /** Force 24h format; default is locale-based (Arabic/CKB use 12h, en uses 24h). */
  force24h?: boolean;
  /** Show seconds (default: false). */
  showSeconds?: boolean;
}

/**
 * Format a Date as a time string.
 *
 * Arabic and Kurdish Sorani default to 12-hour format with AM/PM in Arabic script.
 * English defaults to 24-hour format.
 *
 * @example
 *   formatTime(new Date('2024-06-15T14:30:00'), 'ar') // "٢:٣٠ م"
 *   formatTime(new Date('2024-06-15T14:30:00'), 'en') // "14:30"
 */
export function formatTime(date: Date, locale: Locale, opts: TimeOptions = {}): string {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const use24h = opts.force24h ?? (locale === 'en');

  const pad = (n: number) => String(n).padStart(2, '0');

  if (locale === 'en') {
    const h = use24h ? pad(hours24) : String(hours24 > 12 ? hours24 - 12 : hours24 || 12);
    const m = pad(minutes);
    const s = opts.showSeconds ? `:${pad(seconds)}` : '';
    const ampm = use24h ? '' : ` ${hours24 >= 12 ? 'PM' : 'AM'}`;
    return `${h}:${m}${s}${ampm}`;
  }

  // Arabic / Kurdish Sorani — 12h with Arabic AM/PM by default
  const convert = (n: number | string) => toArabicIndicDigits(String(n));

  if (use24h) {
    const h = convert(pad(hours24));
    const m = convert(pad(minutes));
    const s = opts.showSeconds ? `:${convert(pad(seconds))}` : '';
    return `${h}:${m}${s}`;
  }

  const hour12 = hours24 > 12 ? hours24 - 12 : hours24 === 0 ? 12 : hours24;
  const ampm = hours24 >= 12
    ? (locale === 'ckb' ? 'د.ئ' : 'م')
    : (locale === 'ckb' ? 'ب.ن' : 'ص');
  const h = convert(hour12);
  const m = convert(pad(minutes));
  const s = opts.showSeconds ? `:${convert(pad(seconds))}` : '';
  return `${h}:${m}${s} ${ampm}`;
}

// ─── Phone number formatter ──────────────────────────────────────────────────

/**
 * Format an Iraqi phone number to the standard +964 format.
 *
 * Accepts numbers starting with 0 (local) or +964 (international).
 * Returns a consistently formatted string: +964 7XX XXX XXXX
 *
 * @example
 *   formatPhone('07501234567')  // "+964 750 123 4567"
 *   formatPhone('+9647501234567') // "+964 750 123 4567"
 *   formatPhone('7501234567')   // "+964 750 123 4567"
 */
export function formatPhone(phone: string): string {
  // Strip all non-digit characters except leading +
  const stripped = phone.replace(/[^\d+]/g, '');

  let digits = stripped;
  if (digits.startsWith('+964')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('964')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // digits should now be 10 digits: 7XX XXX XXXX
  if (digits.length !== 10) {
    // Return as-is if format is unrecognised
    return phone;
  }

  const [, a, b, c, d] = digits.match(/^(\d)(\d{2})(\d{3})(\d{4})$/) ?? [];
  if (!a) return phone;

  // Iraqi numbers: 07XX where first digit after 0 is always 7
  return `+964 ${a}${b} ${c} ${d}`;
}

/**
 * Format an Iraqi phone number with Arabic-Indic digits for display in Arabic/CKB contexts.
 *
 * Phone digits are kept as-is for non-Arabic locales (mixed LTR/RTL handling).
 * For Arabic/CKB, the digits are converted but the + and spaces stay ASCII
 * so the phone number renders correctly in RTL contexts.
 */
export function formatPhoneLocale(phone: string, locale: Locale): string {
  const formatted = formatPhone(phone);
  // Keep + sign and spaces as-is; only convert digit clusters
  if (!usesArabicIndicDigits(locale)) return formatted;
  // Phone numbers in RTL contexts: wrap in LTR override to prevent digit reversal
  // but convert to Arabic-Indic as expected in locale
  return toArabicIndicDigits(formatted);
}

// ─── Distance formatter ──────────────────────────────────────────────────────

/**
 * Format a distance in meters for the given locale.
 *
 * - Under 1000m: show in meters (e.g. "٣٥٠ م" / "350 m").
 * - 1000m and above: show in km with one decimal (e.g. "١.٢ كم" / "1.2 km").
 *
 * @example
 *   formatDistance(350, 'ar')    // "٣٥٠ م"
 *   formatDistance(1500, 'ar')   // "١.٥ كم"
 *   formatDistance(1500, 'en')   // "1.5 km"
 */
export function formatDistance(meters: number, locale: Locale): string {
  const isRtl = usesArabicIndicDigits(locale);
  const convert = isRtl
    ? (s: string) => toArabicIndicDigits(s)
    : (s: string) => s;

  if (meters < 1000) {
    const rounded = Math.round(meters);
    if (locale === 'en') return `${rounded} m`;
    return `${convert(String(rounded))} م`;
  }

  const km = (meters / 1000).toFixed(1);
  if (locale === 'en') return `${km} km`;
  return `${convert(km)} كم`;
}

// ─── Duration formatter ──────────────────────────────────────────────────────

/**
 * Format a duration in seconds to a human-readable string.
 *
 * @example
 *   formatDuration(3600, 'ar')  // "ساعة واحدة"
 *   formatDuration(5400, 'ar')  // "ساعة و ٣٠ دقيقة"
 *   formatDuration(90, 'en')    // "1 min 30 sec"
 */
export function formatDuration(seconds: number, locale: Locale): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const secs = seconds % 60;

  const convert = usesArabicIndicDigits(locale)
    ? (n: number) => toArabicIndicDigits(String(n))
    : (n: number) => String(n);

  if (locale === 'en') {
    if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
    if (hrs > 0) return `${hrs} hr`;
    if (mins > 0 && secs > 0) return `${mins} min ${secs} sec`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  }

  // Arabic
  if (locale === 'ar') {
    if (hrs > 0 && mins > 0) return `${convert(hrs)} ساعة و${convert(mins)} دقيقة`;
    if (hrs === 1) return 'ساعة واحدة';
    if (hrs === 2) return 'ساعتان';
    if (hrs > 0) return `${convert(hrs)} ساعات`;
    if (mins === 1) return 'دقيقة واحدة';
    if (mins === 2) return 'دقيقتان';
    if (mins > 0) return `${convert(mins)} دقيقة`;
    return `${convert(secs)} ثانية`;
  }

  // Kurdish Sorani (ckb)
  if (hrs > 0 && mins > 0) return `${convert(hrs)} کاتژمێر و ${convert(mins)} خولەک`;
  if (hrs > 0) return `${convert(hrs)} کاتژمێر`;
  if (mins > 0) return `${convert(mins)} خولەک`;
  return `${convert(secs)} چرکە`;
}

// ─── Count (singular / dual / plural) formatter ──────────────────────────────

type ArabicGrammaticalNumber = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Determine the Arabic grammatical number category for a count.
 *
 * Arabic has six categories:
 * - zero: 0
 * - one: 1
 * - two: 2
 * - few: 3-10
 * - many: 11-99
 * - other: 100+
 */
export function arabicPluralCategory(n: number): ArabicGrammaticalNumber {
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n >= 3 && n <= 10) return 'few';
  if (n >= 11 && n <= 99) return 'many';
  return 'other';
}

interface CountForms {
  /** Singular form (1). */
  one: string;
  /** Dual form (2). */
  two?: string;
  /** Few form (3-10). */
  few?: string;
  /** Many form (11-99) or fallback for en. */
  many?: string;
  /** Other form (100+, also fallback). */
  other?: string;
  /** Zero form. */
  zero?: string;
}

/**
 * Format a count with the correct grammatical form for the locale.
 *
 * @example
 *   formatCount(1, 'ar', { one: 'منشور', two: 'منشوران', few: 'منشورات', many: 'منشوراً', other: 'منشور' })
 *   // "منشور واحد"
 *
 *   formatCount(5, 'ar', { one: 'منشور', few: 'منشورات', many: 'منشوراً' })
 *   // "٥ منشورات"
 *
 *   formatCount(3, 'en', { one: 'post', many: 'posts' })
 *   // "3 posts"
 */
export function formatCount(n: number, locale: Locale, forms: CountForms): string {
  const convert = usesArabicIndicDigits(locale)
    ? (num: number) => toArabicIndicDigits(String(num))
    : (num: number) => String(num);

  if (locale === 'en') {
    const form = n === 1 ? forms.one : (forms.many ?? forms.other ?? forms.one);
    return `${n} ${form}`;
  }

  if (locale === 'ar') {
    const cat = arabicPluralCategory(n);
    switch (cat) {
      case 'zero':
        return forms.zero ? `${convert(n)} ${forms.zero}` : `٠ ${forms.other ?? forms.one}`;
      case 'one':
        return `${forms.one} واحد`;
      case 'two':
        return forms.two ? forms.two : `${convert(n)} ${forms.one}`;
      case 'few':
        return `${convert(n)} ${forms.few ?? forms.many ?? forms.other ?? forms.one}`;
      case 'many':
        return `${convert(n)} ${forms.many ?? forms.other ?? forms.one}`;
      case 'other':
        return `${convert(n)} ${forms.other ?? forms.many ?? forms.one}`;
    }
  }

  // Kurdish Sorani (ckb) — simpler: one vs other
  if (n === 1) return `${convert(n)} ${forms.one}`;
  return `${convert(n)} ${forms.many ?? forms.other ?? forms.one}`;
}

// ─── Relative time formatter ─────────────────────────────────────────────────

/**
 * Format a date as a relative time string (e.g. "3 minutes ago").
 *
 * @example
 *   formatRelativeTime(new Date(Date.now() - 60000), 'ar')  // "منذ دقيقة"
 *   formatRelativeTime(new Date(Date.now() - 3600000), 'en') // "1 hour ago"
 */
export function formatRelativeTime(date: Date, locale: Locale): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  const convert = usesArabicIndicDigits(locale)
    ? (n: number) => toArabicIndicDigits(String(n))
    : (n: number) => String(n);

  if (locale === 'en') {
    if (diffSecs < 60) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks === 1) return '1 week ago';
    if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
    if (diffMonths === 1) return '1 month ago';
    if (diffMonths < 12) return `${diffMonths} months ago`;
    if (diffYears === 1) return '1 year ago';
    return `${diffYears} years ago`;
  }

  if (locale === 'ar') {
    if (diffSecs < 60) return 'الآن';
    if (diffMins === 1) return 'منذ دقيقة';
    if (diffMins === 2) return 'منذ دقيقتين';
    if (diffMins < 11) return `منذ ${convert(diffMins)} دقائق`;
    if (diffMins < 60) return `منذ ${convert(diffMins)} دقيقة`;
    if (diffHours === 1) return 'منذ ساعة';
    if (diffHours === 2) return 'منذ ساعتين';
    if (diffHours < 11) return `منذ ${convert(diffHours)} ساعات`;
    if (diffHours < 24) return `منذ ${convert(diffHours)} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays < 11) return `منذ ${convert(diffDays)} أيام`;
    if (diffDays < 30) return `منذ ${convert(diffDays)} يوماً`;
    if (diffMonths === 1) return 'منذ شهر';
    if (diffMonths === 2) return 'منذ شهرين';
    if (diffMonths < 11) return `منذ ${convert(diffMonths)} أشهر`;
    if (diffMonths < 12) return `منذ ${convert(diffMonths)} شهراً`;
    if (diffYears === 1) return 'منذ سنة';
    if (diffYears === 2) return 'منذ سنتين';
    return `منذ ${convert(diffYears)} سنوات`;
  }

  // Kurdish Sorani
  if (diffSecs < 60) return 'ئێستا';
  if (diffMins === 1) return 'یەک خولەک لەپێش';
  if (diffMins < 60) return `${convert(diffMins)} خولەک لەپێش`;
  if (diffHours === 1) return 'یەک کاتژمێر لەپێش';
  if (diffHours < 24) return `${convert(diffHours)} کاتژمێر لەپێش`;
  if (diffDays === 1) return 'دوێنێ';
  if (diffDays < 7) return `${convert(diffDays)} ڕۆژ لەپێش`;
  if (diffWeeks < 5) return `${convert(diffWeeks)} هەفتە لەپێش`;
  if (diffMonths < 12) return `${convert(diffMonths)} مانگ لەپێش`;
  return `${convert(diffYears)} ساڵ لەپێش`;
}

// ─── Address formatter ───────────────────────────────────────────────────────

interface AddressFields {
  buildingNumber?: string;
  street?: string;
  neighborhood?: string;
  district?: string;
  city?: string;
  governorate?: string;
}

/**
 * Format an Iraqi address for the given locale.
 *
 * Iraqi addresses typically go from specific to general:
 * building → street → neighborhood → district → city → governorate.
 *
 * @example
 *   formatAddress({ street: 'شارع الرشيد', neighborhood: 'الكرخ', city: 'بغداد' }, 'ar')
 *   // "شارع الرشيد، الكرخ، بغداد"
 */
export function formatAddress(fields: AddressFields, locale: Locale): string {
  const parts: string[] = [];

  if (fields.buildingNumber) parts.push(fields.buildingNumber);
  if (fields.street) parts.push(fields.street);
  if (fields.neighborhood) parts.push(fields.neighborhood);
  if (fields.district) parts.push(fields.district);
  if (fields.city) parts.push(fields.city);
  if (fields.governorate) parts.push(fields.governorate);

  const separator = locale === 'en' ? ', ' : '، ';
  return parts.join(separator);
}

// ─── Number formatter (generic) ─────────────────────────────────────────────

/**
 * Format a generic number with locale-appropriate digit form and thousands separators.
 *
 * @example
 *   formatNumber(12345, 'ar')  // "١٢٬٣٤٥"
 *   formatNumber(12345, 'en')  // "12,345"
 */
export function formatNumber(n: number, locale: Locale, decimals = 0): string {
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return usesArabicIndicDigits(locale) ? toArabicIndicDigits(formatted) : formatted;
}

// ─── Percentage formatter ────────────────────────────────────────────────────

/**
 * Format a percentage value.
 *
 * @example
 *   formatPercent(75.5, 'ar')  // "٧٥٫٥٪"
 *   formatPercent(75.5, 'en')  // "75.5%"
 */
export function formatPercent(value: number, locale: Locale, decimals = 0): string {
  const fixed = value.toFixed(decimals);
  if (locale === 'en') return `${fixed}%`;
  // Arabic decimal separator is ٫ (U+066B) but for percentage displays a dot is common
  const converted = toArabicIndicDigits(fixed);
  return `${converted}٪`;
}

// ─── File size formatter ─────────────────────────────────────────────────────

/**
 * Format a file size in bytes for the given locale.
 *
 * @example
 *   formatFileSize(1048576, 'ar')  // "١ ميغابايت"
 *   formatFileSize(1048576, 'en')  // "1 MB"
 */
export function formatFileSize(bytes: number, locale: Locale): string {
  const convert = usesArabicIndicDigits(locale)
    ? (s: string) => toArabicIndicDigits(s)
    : (s: string) => s;

  if (bytes < 1024) {
    return locale === 'en' ? `${bytes} B` : `${convert(String(bytes))} بايت`;
  }
  if (bytes < 1048576) {
    const kb = (bytes / 1024).toFixed(1);
    return locale === 'en' ? `${kb} KB` : `${convert(kb)} كيلوبايت`;
  }
  if (bytes < 1073741824) {
    const mb = (bytes / 1048576).toFixed(1);
    if (locale === 'ckb') return `${convert(mb)} مێگابایت`;
    return locale === 'en' ? `${mb} MB` : `${convert(mb)} ميغابايت`;
  }
  const gb = (bytes / 1073741824).toFixed(2);
  if (locale === 'ckb') return `${convert(gb)} گیگابایت`;
  return locale === 'en' ? `${gb} GB` : `${convert(gb)} غيغابايت`;
}

// ─── Speed formatter ─────────────────────────────────────────────────────────

/**
 * Format a speed in km/h.
 *
 * @example
 *   formatSpeed(80, 'ar')  // "٨٠ كم/ساعة"
 *   formatSpeed(80, 'en')  // "80 km/h"
 */
export function formatSpeed(kmh: number, locale: Locale): string {
  const convert = usesArabicIndicDigits(locale)
    ? (n: number) => toArabicIndicDigits(String(n))
    : (n: number) => String(n);

  if (locale === 'en') return `${kmh} km/h`;
  if (locale === 'ckb') return `${convert(kmh)} کم/کاتژمێر`;
  return `${convert(kmh)} كم/ساعة`;
}
