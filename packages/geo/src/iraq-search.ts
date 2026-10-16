/**
 * Iraq-specific search helpers: alternate spellings, abbreviations, neighborhood aliases,
 * dialect variants, normalization and typo corrections.
 *
 * All string values are the canonical Arabic/Kurdish/English forms after normalization.
 */

// ─── Alternate spellings map ──────────────────────────────────────────────────

/**
 * Maps every known alternate spelling / transliteration of an Iraqi place name
 * to its canonical Arabic form (as used in our database).
 *
 * Keys are normalised lowercase (no diacritics, no tatweel) for case-insensitive lookup.
 * Values are the canonical nameAr stored in the database.
 */
export const ALTERNATE_SPELLINGS: Readonly<Record<string, string>> = {
  // Baghdad
  'baghdad': 'بغداد',
  'bagdad': 'بغداد',
  'baghdad city': 'بغداد',
  'بغداد': 'بغداد',
  'بقداد': 'بغداد', // older/dialectal spelling

  // Basra
  'basra': 'البصرة',
  'basrah': 'البصرة',
  'bussorah': 'البصرة',
  'البصرة': 'البصرة',
  'بصره': 'البصرة',
  'بصرة': 'البصرة',

  // Mosul
  'mosul': 'الموصل',
  'mawsil': 'الموصل',
  'al mawsil': 'الموصل',
  'الموصل': 'الموصل',
  'موصل': 'الموصل',
  'نينوى المدينة': 'الموصل',

  // Erbil
  'erbil': 'أربيل',
  'arbil': 'أربيل',
  'irbil': 'أربيل',
  'hawler': 'أربيل',
  'hewlêr': 'أربيل',
  'هەولێر': 'أربيل',
  'أربيل': 'أربيل',
  'اربيل': 'أربيل',
  'ارويل': 'أربيل',

  // Sulaymaniyah
  'sulaymaniyah': 'السليمانية',
  'sulaimaniyah': 'السليمانية',
  'suleimaniyah': 'السليمانية',
  'suleymaniyah': 'السليمانية',
  'slemani': 'السليمانية',
  'سلێمانی': 'السليمانية',
  'السليمانيه': 'السليمانية',
  'سليمانية': 'السليمانية',

  // Karbala
  'karbala': 'كربلاء',
  'kerbala': 'كربلاء',
  'karbela': 'كربلاء',
  'carbala': 'كربلاء',
  'كربلاء': 'كربلاء',
  'كربلا': 'كربلاء',
  'كربله': 'كربلاء',

  // Najaf
  'najaf': 'النجف',
  'al najaf': 'النجف',
  'an najaf': 'النجف',
  'النجف': 'النجف',
  'نجف': 'النجف',
  'نجف الأشرف': 'النجف',

  // Hillah / Babylon
  'hillah': 'الحلة',
  'hilla': 'الحلة',
  'al hillah': 'الحلة',
  'الحلة': 'الحلة',
  'حلة': 'الحلة',
  'babylon': 'بابل (المحافظة)',
  'babil': 'بابل (المحافظة)',
  'babul': 'بابل (المحافظة)',
  'بابل': 'بابل (المحافظة)',

  // Kirkuk
  'kirkuk': 'كركوك',
  'kerkuk': 'كركوك',
  'كركوك': 'كركوك',
  'كرکووک': 'كركوك',
  'كركوكا': 'كركوك',

  // Tikrit
  'tikrit': 'تكريت',
  'takrit': 'تكريت',
  'تكريت': 'تكريت',
  'تکریت': 'تكريت',

  // Samarra
  'samarra': 'سامراء',
  'samara': 'سامراء',
  'samara city': 'سامراء',
  'سامراء': 'سامراء',
  'سامرا': 'سامراء',
  'سامره': 'سامراء',

  // Fallujah
  'fallujah': 'الفلوجة',
  'fallouja': 'الفلوجة',
  'falluja': 'الفلوجة',
  'الفلوجة': 'الفلوجة',
  'فلوجة': 'الفلوجة',

  // Ramadi
  'ramadi': 'الرمادي',
  'ar ramadi': 'الرمادي',
  'الرمادي': 'الرمادي',
  'رمادي': 'الرمادي',

  // Nasiriyah
  'nasiriyah': 'الناصرية',
  'nasiriya': 'الناصرية',
  'nasiriah': 'الناصرية',
  'الناصرية': 'الناصرية',
  'ناصرية': 'الناصرية',

  // Diwaniyah
  'diwaniyah': 'الديوانية',
  'diwaniya': 'الديوانية',
  'ad diwaniyah': 'الديوانية',
  'الديوانية': 'الديوانية',
  'ديوانية': 'الديوانية',

  // Kut
  'kut': 'الكوت',
  'al kut': 'الكوت',
  'wasit city': 'الكوت',
  'الكوت': 'الكوت',
  'كوت': 'الكوت',

  // Amarah
  'amarah': 'العمارة',
  'amara': 'العمارة',
  'al amarah': 'العمارة',
  'العمارة': 'العمارة',
  'عمارة': 'العمارة',

  // Samawah
  'samawah': 'السماوة',
  'as samawah': 'السماوة',
  'السماوة': 'السماوة',
  'سماوة': 'السماوة',

  // Baqubah
  'baqubah': 'بعقوبة',
  'baquba': 'بعقوبة',
  'baqouba': 'بعقوبة',
  'بعقوبة': 'بعقوبة',
  'بعقوبه': 'بعقوبة',

  // Dohuk
  'dohuk': 'دهوك',
  'duhok': 'دهوك',
  'dahuk': 'دهوك',
  'دهوك': 'دهوك',
  'دهۆک': 'دهوك',
  'دهوكي': 'دهوك',

  // Zakho
  'zakho': 'زاخو',
  'zaxo': 'زاخو',
  'زاخو': 'زاخو',
  'زاخۆ': 'زاخو',

  // Sinjar / Shingal
  'sinjar': 'سنجار',
  'shingal': 'سنجار',
  'شنگال': 'سنجار',
  'سنجار': 'سنجار',

  // Khanaqin
  'khanaqin': 'خانقين',
  'khanaqeen': 'خانقين',
  'خانقین': 'خانقين',
  'خانقين': 'خانقين',

  // Halabja
  'halabja': 'حلبجة',
  'helebce': 'حلبجة',
  'هەڵەبجە': 'حلبجة',
  'حلبجة': 'حلبجة',
  'حلبجه': 'حلبجة',

  // Kufa
  'kufa': 'الكوفة',
  'al kufa': 'الكوفة',
  'الكوفة': 'الكوفة',
  'كوفة': 'الكوفة',

  // Kadhimiyah (Baghdad district)
  'kadhimiyah': 'الكاظمية',
  'kadhmiyah': 'الكاظمية',
  'kazimiyya': 'الكاظمية',
  'الكاظمية': 'الكاظمية',
  'كاظمية': 'الكاظمية',

  // Adhamiyah (Baghdad district)
  'adhamiyah': 'الأعظمية',
  'adhamiya': 'الأعظمية',
  'الأعظمية': 'الأعظمية',
  'اعظمية': 'الأعظمية',

  // Sadr City
  'sadr city': 'مدينة الصدر',
  'sadr': 'مدينة الصدر',
  'medinat al sadr': 'مدينة الصدر',
  'مدينة الصدر': 'مدينة الصدر',
  'الصدر': 'مدينة الصدر',
} as const;

// ─── Neighborhood aliases (same place, different names) ───────────────────────

/**
 * Maps neighborhood aliases to their canonical name stored in the database.
 * In Baghdad, many neighborhoods have both a formal and informal name.
 */
export const NEIGHBORHOOD_ALIASES: Readonly<Record<string, string>> = {
  // Karrada variants
  'الكرادة': 'الكرادة',
  'كرادة': 'الكرادة',
  'كرادة داخل': 'الكرادة الداخلية',
  'الكرادة الداخل': 'الكرادة الداخلية',
  'كرادة خارج': 'الكرادة الخارجية',
  'الكرادة خارج': 'الكرادة الخارجية',

  // Mansour variants
  'منصور': 'المنصور',
  'حي المنصور': 'المنصور',

  // Zayouna
  'زيونة': 'الزيونة',
  'حي الزيونة': 'الزيونة',

  // Jadiriyah
  'جادرية': 'الجادرية',
  'الجادرية بغداد': 'الجادرية',

  // Yarmouk
  'يرموك': 'اليرموك',
  'حي اليرموك': 'اليرموك',

  // Arrasat (often shortened)
  'عرصات': 'عرصات الهندية',
  'عرصات الهندية': 'عرصات الهندية',
  'الهندية': 'عرصات الهندية',

  // Doura
  'دورة': 'الدورة',
  'حي الدورة': 'الدورة',
  'الدورة الصناعية': 'الدورة',

  // Sadr City colloquials
  'مدينة ثورة': 'مدينة الصدر',  // historical name
  'ثورة': 'مدينة الصدر',
  'مدينة صدام': 'مدينة الصدر',  // brief historical name
  'صدر سيتي': 'مدينة الصدر',

  // Adhamiyah variants
  'اعظمية': 'الأعظمية',
  'الاعظمية': 'الأعظمية',

  // Kadhimiyah variants
  'كاظميه': 'الكاظمية',
  'الكاظمية الشريفة': 'الكاظمية',

  // New Baghdad
  'بغداد الجديدة': 'بغداد الجديدة',
  'نيو بغداد': 'بغداد الجديدة',

  // Ghazaliyah
  'غزالية': 'الغزالية',
  'حي الغزالية': 'الغزالية',

  // Ameriyah
  'عامرية': 'العامرية',
  'حي العامرية': 'العامرية',

  // Bayaa
  'بياع': 'البياع',

  // Shula
  'شعلة': 'الشعلة',

  // Huriyah
  'حرية': 'الحرية',
  'حي الحرية': 'الحرية',

  // Shaab
  'شعب': 'الشعب',

  // Waziriyah
  'وزيرية': 'الوزيرية',

  // Palestine street area (not a strict neighborhood but commonly searched)
  'شارع فلسطين': 'فلسطين',
  'منطقة فلسطين': 'فلسطين',
} as const;

// ─── Iraqi dialect search variants ───────────────────────────────────────────

/**
 * Maps Iraqi Arabic dialect words / colloquialisms used in searches
 * to their equivalent standard Arabic or canonical place name.
 */
export const DIALECT_VARIANTS: Readonly<Record<string, string>> = {
  // الشارع → طريق in searches
  'الشارع العام': 'الطريق العام',
  'سوبر هايوي': 'طريق سريع',
  'هايواي': 'طريق سريع',
  'موتر وي': 'طريق سريع',

  // Fuel station variants
  'بنزينة': 'محطة وقود',
  'محطة بنزين': 'محطة وقود',
  'استيشن': 'محطة وقود',

  // Hospital variants
  'مستشفه': 'مستشفى',
  'مستوصف': 'مركز صحي',
  'ديكتور': 'طبيب',

  // Food variants
  'مطعم تكه': 'مشاوي',
  'مسكوف': 'مطعم سمك',  // famous Iraqi grilled fish
  'دولمة': 'مطعم عراقي',
  'قيمر': 'حلويات',
  'شاي نومي بصرة': 'مقهى',

  // Market terms
  'سوكة': 'سوق',
  'بازار': 'سوق',
  'مركز': 'مول',
  'كومبلكس': 'مجمع تجاري',

  // Bank / finance
  'صراف': 'محل صرافة',
  'دراهم': 'صرافة',
  'فلوس': 'بنك',

  // Transport
  'كراج': 'محطة حافلات',
  'سرفيس': 'سيارة مشتركة',
  'تكسي جماعي': 'سرافيس',
  'باص': 'حافلة',

  // Religious
  'جامع': 'مسجد',
  'زيارة': 'مرقد',
  'عتبة': 'مرقد',
  'معتكف': 'حسينية',

  // Accommodation
  'فندق': 'فندق',
  'لوكاندة': 'فندق',
  'نزل': 'فندق',
  'شقة': 'شقق مفروشة',

  // General
  'حفلة': 'قاعة أفراح',
  'زواج': 'قاعة أفراح',
  'تعميد': 'كنيسة',
  'كلية': 'جامعة',
  'معهد': 'معهد تقني',
  'حكومة': 'دائرة حكومية',
  'دائرة': 'دائرة حكومية',
  'ناحية': 'مديرية',
  'قضاء': 'مركز المدينة',
} as const;

// ─── Common search typo / correction map ─────────────────────────────────────

/**
 * Common misspellings in Iraqi user searches mapped to their correct form.
 * Focus on Arabic keyboard-entry mistakes.
 */
export const SEARCH_TYPO_CORRECTIONS: Readonly<Record<string, string>> = {
  // Missing hamza / alef variants
  'اربيل': 'أربيل',
  'ارويل': 'أربيل',
  'السليمانيه': 'السليمانية',
  'كربلا': 'كربلاء',
  'كربله': 'كربلاء',
  'النجف الاشرف': 'النجف الأشرف',
  'نجف اشرف': 'النجف الأشرف',
  'الاعظمية': 'الأعظمية',
  'الانبار': 'الأنبار',
  'بعقوبه': 'بعقوبة',
  'ناصريه': 'الناصرية',
  'ناصرية': 'الناصرية',
  'ديوانيه': 'الديوانية',
  'عماره': 'العمارة',
  'سماوه': 'السماوة',
  'فلوجه': 'الفلوجة',
  'موصل': 'الموصل',
  'بصره': 'البصرة',
  'حله': 'الحلة',
  'كوت': 'الكوت',

  // Ta marbuta confusion
  'الحلا': 'الحلة',
  'سامرا': 'سامراء',
  'ناصريا': 'الناصرية',

  // Hamza on alef
  'إربيل': 'أربيل',

  // Common English typos
  'bagdad': 'Baghdad',
  'basraa': 'Basra',
  'mosull': 'Mosul',
  'najeff': 'Najaf',
  'karbalaa': 'Karbala',
  'eerbil': 'Erbil',
} as const;

// ─── Search normalizer for Iraqi Arabic ──────────────────────────────────────

/**
 * Characters to strip during Arabic search normalization.
 * Covers: tatweel, common diacritics.
 */
const ARABIC_STRIP_RE = /[ـً-ٰٟ]/g;

/**
 * Alef forms to normalise to plain alef ا.
 */
const ALEF_RE = /[آأإٱ]/g;

/**
 * Normalise an Arabic search query for Iraqi context:
 * 1. Trim whitespace.
 * 2. Remove tatweel and diacritics.
 * 3. Normalise alef variants (آأإٱ → ا).
 * 4. Normalise ya: ى → ي.
 * 5. Normalise ta marbuta: ة → ه (common in Iraqi dialect input).
 * 6. Collapse multiple spaces.
 * 7. Lowercase Latin characters (for transliteration searches).
 */
export function normalizeIraqiArabic(query: string): string {
  return query
    .trim()
    .replace(ARABIC_STRIP_RE, '')
    .replace(ALEF_RE, 'ا') // → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Resolve a search query to its canonical place name.
 * Applies normalization, then checks typo corrections, alternate spellings
 * and neighborhood aliases in order.
 * Returns the canonical name, or the normalised query if no match found.
 */
export function resolveSearchQuery(raw: string): string {
  const normalised = normalizeIraqiArabic(raw);

  // 1. Typo correction first
  const corrected = SEARCH_TYPO_CORRECTIONS[normalised] ?? SEARCH_TYPO_CORRECTIONS[raw];
  const working = corrected ? normalizeIraqiArabic(corrected) : normalised;

  // 2. Alternate spelling lookup
  const fromSpelling = ALTERNATE_SPELLINGS[working] ?? ALTERNATE_SPELLINGS[raw];
  if (fromSpelling) return fromSpelling;

  // 3. Neighborhood alias lookup
  const fromAlias = NEIGHBORHOOD_ALIASES[working] ?? NEIGHBORHOOD_ALIASES[raw];
  if (fromAlias) return fromAlias;

  // 4. Dialect variant lookup
  const fromDialect = DIALECT_VARIANTS[working] ?? DIALECT_VARIANTS[raw];
  if (fromDialect) return fromDialect;

  // No match — return normalised input
  return working;
}

/**
 * Build a list of search terms for a given canonical Arabic name,
 * pulling all known alternate spellings and aliases.
 * Useful for building a pre-computed search index.
 */
export function getSearchTerms(canonicalAr: string): string[] {
  const terms = new Set<string>([canonicalAr, normalizeIraqiArabic(canonicalAr)]);

  for (const [variant, canonical] of Object.entries(ALTERNATE_SPELLINGS)) {
    if (canonical === canonicalAr) terms.add(variant);
  }
  for (const [alias, canonical] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (canonical === canonicalAr) terms.add(alias);
  }
  for (const [typo, correction] of Object.entries(SEARCH_TYPO_CORRECTIONS)) {
    if (normalizeIraqiArabic(correction) === normalizeIraqiArabic(canonicalAr)) {
      terms.add(typo);
    }
  }

  return Array.from(terms);
}

/**
 * Test whether a user query plausibly matches a canonical place name,
 * using full normalization + fuzzy alternate-spelling lookup.
 */
export function queryMatchesPlace(query: string, canonicalAr: string, canonicalEn: string): boolean {
  const q = normalizeIraqiArabic(query);
  const cAr = normalizeIraqiArabic(canonicalAr);
  const cEn = canonicalEn.toLowerCase();

  if (q === cAr || q === cEn) return true;

  const resolved = resolveSearchQuery(query);
  if (normalizeIraqiArabic(resolved) === cAr) return true;

  // Partial match for compound names
  if (cAr.includes(q) || q.includes(cAr)) return true;
  if (cEn.includes(q) || q.includes(cEn)) return true;

  return false;
}
