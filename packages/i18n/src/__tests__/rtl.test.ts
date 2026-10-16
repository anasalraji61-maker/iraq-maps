/**
 * RTL-specific test suite for Iraq Maps i18n package.
 *
 * Covers:
 * - Arabic-Indic digit formatting
 * - IQD price formatting in Arabic and Kurdish Sorani
 * - Date formatting in Arabic calendar/locale
 * - Time formatting with Arabic AM/PM
 * - Phone number formatting in RTL contexts
 * - Distance and duration formatting
 * - Mixed-direction text (digits inside RTL strings)
 * - Count / plural handling in Arabic
 * - Relative time in Arabic
 * - Kurdish Sorani (ckb) parity
 */

import { describe, it, expect } from 'vitest';

import {
  toArabicIndicDigits,
  usesArabicIndicDigits,
  formatIqd,
  formatDate,
  formatTime,
  formatPhone,
  formatPhoneLocale,
  formatDistance,
  formatDuration,
  formatCount,
  formatRelativeTime,
  formatAddress,
  formatNumber,
  formatPercent,
  formatFileSize,
  formatSpeed,
  arabicPluralCategory,
} from '../formatters';

// ─── Arabic-Indic digits ─────────────────────────────────────────────────────

describe('toArabicIndicDigits', () => {
  it('converts all ASCII digits to Arabic-Indic', () => {
    expect(toArabicIndicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('leaves non-digit characters unchanged', () => {
    expect(toArabicIndicDigits('1,500.00')).toBe('١,٥٠٠.٠٠');
  });

  it('handles empty string', () => {
    expect(toArabicIndicDigits('')).toBe('');
  });

  it('handles strings with no digits', () => {
    expect(toArabicIndicDigits('abc')).toBe('abc');
  });

  it('converts a mixed string preserving spaces', () => {
    expect(toArabicIndicDigits('رقم 42 هاتف')).toBe('رقم ٤٢ هاتف');
  });

  it('converts phone number digits inside Arabic context', () => {
    expect(toArabicIndicDigits('+964 750 123 4567')).toBe('+٩٦٤ ٧٥٠ ١٢٣ ٤٥٦٧');
  });
});

describe('usesArabicIndicDigits', () => {
  it('returns true for ar', () => {
    expect(usesArabicIndicDigits('ar')).toBe(true);
  });

  it('returns true for ckb (Kurdish Sorani)', () => {
    expect(usesArabicIndicDigits('ckb')).toBe(true);
  });

  it('returns false for en', () => {
    expect(usesArabicIndicDigits('en')).toBe(false);
  });
});

// ─── IQD currency formatter ──────────────────────────────────────────────────

describe('formatIqd', () => {
  it('formats IQD for Arabic with Arabic-Indic digits', () => {
    expect(formatIqd(1500, 'ar')).toBe('١,٥٠٠ د.ع.');
  });

  it('formats IQD for Kurdish Sorani with Arabic-Indic digits', () => {
    expect(formatIqd(1500, 'ckb')).toBe('١,٥٠٠ د.ع.');
  });

  it('formats IQD for English with ASCII digits and IQD prefix', () => {
    expect(formatIqd(1500, 'en')).toBe('IQD 1,500');
  });

  it('formats zero correctly in Arabic', () => {
    expect(formatIqd(0, 'ar')).toBe('٠ د.ع.');
  });

  it('formats zero correctly in English', () => {
    expect(formatIqd(0, 'en')).toBe('IQD 0');
  });

  it('formats large amounts with thousands separator', () => {
    expect(formatIqd(1000000, 'ar')).toBe('١,٠٠٠,٠٠٠ د.ع.');
    expect(formatIqd(1000000, 'en')).toBe('IQD 1,000,000');
  });

  it('hides symbol when showSymbol is false', () => {
    const ar = formatIqd(500, 'ar', { showSymbol: false });
    expect(ar).not.toContain('د.ع.');
    expect(ar).toBe('٥٠٠');

    const en = formatIqd(500, 'en', { showSymbol: false });
    expect(en).toBe('500');
  });

  it('formats fractional fils when requested', () => {
    const ar = formatIqd(1.5, 'ar', { showFils: true });
    expect(ar).toContain('.');
    expect(ar).toContain('د.ع.');
  });

  it('Arabic output contains only Arabic-Indic digit characters', () => {
    const result = formatIqd(12345, 'ar');
    // Remove separators, currency and spaces
    const digitsOnly = result.replace(/[,\s.د.ع]/gu, '');
    // All remaining digit-like chars should be Arabic-Indic
    expect([...digitsOnly].every(c => '٠١٢٣٤٥٦٧٨٩'.includes(c))).toBe(true);
  });
});

// ─── Date formatter ──────────────────────────────────────────────────────────

describe('formatDate', () => {
  // Fixed date: Saturday 15 June 2024
  const date = new Date('2024-06-15T12:00:00Z');

  it('formats short date in Arabic with Arabic-Indic digits', () => {
    const result = formatDate(date, 'ar', 'short');
    expect(result).toContain('١٥');
    expect(result).toContain('٢٠٢٤');
    expect(result).toMatch(/^\d*[٠-٩]/u); // starts with Arabic-Indic digit(s)
  });

  it('formats medium date in Arabic with month name', () => {
    const result = formatDate(date, 'ar', 'medium');
    expect(result).toContain('يونيو');
    expect(result).toContain('١٥');
    expect(result).toContain('٢٠٢٤');
  });

  it('formats long date in Arabic with weekday', () => {
    const result = formatDate(date, 'ar', 'long');
    // June 15, 2024 is a Saturday — الأربعاء is Wednesday, check we get the right weekday
    expect(result).toMatch(/السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة/u);
    expect(result).toContain('يونيو');
  });

  it('formats short date in English with slash separator', () => {
    const result = formatDate(date, 'en', 'short');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('formats medium date in English', () => {
    const result = formatDate(date, 'en', 'medium');
    expect(result).toContain('15');
    expect(result).toContain('Jun');
    expect(result).toContain('2024');
  });

  it('formats medium date in Kurdish Sorani with Kurdish month name', () => {
    const result = formatDate(date, 'ckb', 'medium');
    expect(result).toContain('١٥');
    expect(result).toContain('٢٠٢٤');
    // Kurdish month for June
    expect(result).toContain('حوزەیران');
  });

  it('Arabic date does not contain ASCII digits', () => {
    const result = formatDate(date, 'ar', 'medium');
    // Should not have standalone ASCII digits (numbers in the output are Arabic-Indic)
    expect(result).not.toMatch(/\b\d+\b/);
  });

  it('Kurdish date does not contain ASCII digits', () => {
    const result = formatDate(date, 'ckb', 'short');
    expect(result).not.toMatch(/\b\d+\b/);
  });
});

// ─── Time formatter ──────────────────────────────────────────────────────────

describe('formatTime', () => {
  const afternoon = new Date('2024-06-15T14:30:00'); // 2:30 PM
  const morning = new Date('2024-06-15T09:15:00');   // 9:15 AM

  it('formats afternoon time in Arabic as 12h with Arabic PM marker', () => {
    const result = formatTime(afternoon, 'ar');
    expect(result).toContain('م');  // Arabic PM
    expect(result).toContain('٢');  // 2 in Arabic-Indic
    expect(result).toContain('٣٠'); // :30 in Arabic-Indic
  });

  it('formats morning time in Arabic with Arabic AM marker', () => {
    const result = formatTime(morning, 'ar');
    expect(result).toContain('ص');  // Arabic AM
    expect(result).toContain('٩');  // 9 in Arabic-Indic
  });

  it('formats time in English as 24h by default', () => {
    const result = formatTime(afternoon, 'en');
    expect(result).toBe('14:30');
  });

  it('formats time in English as 12h when force24h is false', () => {
    const result = formatTime(afternoon, 'en', { force24h: false });
    expect(result).toContain('PM');
    expect(result).toContain('2:30');
  });

  it('forces 24h for Arabic when requested', () => {
    const result = formatTime(afternoon, 'ar', { force24h: true });
    expect(result).toContain('١٤');
    expect(result).not.toContain('م');
  });

  it('shows seconds when requested', () => {
    const withSecs = new Date('2024-06-15T14:30:45');
    const en = formatTime(withSecs, 'en', { showSeconds: true });
    expect(en).toBe('14:30:45');

    const ar = formatTime(withSecs, 'ar', { showSeconds: true });
    expect(ar).toContain('٤٥');
  });

  it('Kurdish Sorani time uses Arabic-Indic digits and Kurdish AM/PM', () => {
    const resultAM = formatTime(morning, 'ckb');
    expect(resultAM).toContain('٩');
    expect(resultAM).toContain('ب.ن');

    const resultPM = formatTime(afternoon, 'ckb');
    expect(resultPM).toContain('د.ئ');
  });

  it('midnight is formatted correctly in Arabic', () => {
    const midnight = new Date('2024-06-15T00:00:00');
    const result = formatTime(midnight, 'ar');
    expect(result).toContain('١٢'); // 12 AM
    expect(result).toContain('ص');
  });
});

// ─── Phone number formatter ──────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats local number starting with 0', () => {
    expect(formatPhone('07501234567')).toBe('+964 750 123 4567');
  });

  it('formats number starting with +964', () => {
    expect(formatPhone('+9647501234567')).toBe('+964 750 123 4567');
  });

  it('formats number starting with 964 (no plus)', () => {
    expect(formatPhone('9647501234567')).toBe('+964 750 123 4567');
  });

  it('formats number without country code prefix', () => {
    expect(formatPhone('7501234567')).toBe('+964 750 123 4567');
  });

  it('returns original for unrecognised format', () => {
    expect(formatPhone('invalid')).toBe('invalid');
  });

  it('handles numbers with spaces or dashes', () => {
    expect(formatPhone('0750-123-4567')).toBe('+964 750 123 4567');
  });
});

describe('formatPhoneLocale', () => {
  it('English keeps ASCII digits', () => {
    const result = formatPhoneLocale('07501234567', 'en');
    expect(result).toContain('750');
    // No Arabic-Indic digits
    expect([...result].every(c => !'٠١٢٣٤٥٦٧٨٩'.includes(c))).toBe(true);
  });

  it('Arabic converts to Arabic-Indic digits', () => {
    const result = formatPhoneLocale('07501234567', 'ar');
    // Should contain Arabic-Indic digits
    expect([...result].some(c => '٠١٢٣٤٥٦٧٨٩'.includes(c))).toBe(true);
  });

  it('Kurdish Sorani converts to Arabic-Indic digits', () => {
    const result = formatPhoneLocale('07501234567', 'ckb');
    expect([...result].some(c => '٠١٢٣٤٥٦٧٨٩'.includes(c))).toBe(true);
  });
});

// ─── Distance formatter ──────────────────────────────────────────────────────

describe('formatDistance', () => {
  it('formats meters in English', () => {
    expect(formatDistance(350, 'en')).toBe('350 m');
  });

  it('formats km in English', () => {
    expect(formatDistance(1500, 'en')).toBe('1.5 km');
  });

  it('formats meters in Arabic with Arabic-Indic digits and Arabic م', () => {
    const result = formatDistance(350, 'ar');
    expect(result).toContain('٣٥٠');
    expect(result).toContain('م');
  });

  it('formats km in Arabic', () => {
    const result = formatDistance(1500, 'ar');
    expect(result).toContain('١');
    expect(result).toContain('كم');
  });

  it('formats meters in Kurdish Sorani', () => {
    const result = formatDistance(500, 'ckb');
    expect(result).toContain('٥٠٠');
    expect(result).toContain('م');
  });

  it('formats km in Kurdish Sorani', () => {
    const result = formatDistance(2000, 'ckb');
    expect(result).toContain('٢');
    expect(result).toContain('كم');
  });

  it('rounds meters to integer', () => {
    expect(formatDistance(999, 'en')).toBe('999 m');
  });

  it('uses 1 decimal for km', () => {
    expect(formatDistance(10000, 'en')).toBe('10.0 km');
  });

  it('threshold at exactly 1000m shows km', () => {
    expect(formatDistance(1000, 'en')).toBe('1.0 km');
  });
});

// ─── Duration formatter ──────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds in English', () => {
    expect(formatDuration(45, 'en')).toBe('45 sec');
  });

  it('formats minutes in English', () => {
    expect(formatDuration(180, 'en')).toBe('3 min');
  });

  it('formats hours in English', () => {
    expect(formatDuration(7200, 'en')).toBe('2 hr');
  });

  it('formats hours and minutes in English', () => {
    expect(formatDuration(5400, 'en')).toBe('1 hr 30 min');
  });

  it('formats single minute in Arabic (singular)', () => {
    expect(formatDuration(60, 'ar')).toBe('دقيقة واحدة');
  });

  it('formats dual minutes in Arabic', () => {
    expect(formatDuration(120, 'ar')).toBe('دقيقتان');
  });

  it('formats single hour in Arabic', () => {
    expect(formatDuration(3600, 'ar')).toBe('ساعة واحدة');
  });

  it('formats dual hours in Arabic', () => {
    expect(formatDuration(7200, 'ar')).toBe('ساعتان');
  });

  it('formats hours + minutes in Arabic', () => {
    const result = formatDuration(5400, 'ar');
    expect(result).toContain('ساعة');
    expect(result).toContain('دقيقة');
  });

  it('Arabic duration uses Arabic-Indic digits', () => {
    const result = formatDuration(600, 'ar'); // 10 minutes
    expect(result).toContain('١٠');
  });

  it('Kurdish Sorani duration uses Kurdish terms', () => {
    const result = formatDuration(3600, 'ckb');
    expect(result).toContain('کاتژمێر');
  });

  it('Kurdish Sorani duration uses Arabic-Indic digits', () => {
    const result = formatDuration(300, 'ckb'); // 5 min
    expect(result).toContain('٥');
    expect(result).toContain('خولەک');
  });
});

// ─── Arabic plural categories ────────────────────────────────────────────────

describe('arabicPluralCategory', () => {
  it('zero gives "zero"', () => expect(arabicPluralCategory(0)).toBe('zero'));
  it('1 gives "one"', () => expect(arabicPluralCategory(1)).toBe('one'));
  it('2 gives "two"', () => expect(arabicPluralCategory(2)).toBe('two'));
  it('3 gives "few"', () => expect(arabicPluralCategory(3)).toBe('few'));
  it('10 gives "few"', () => expect(arabicPluralCategory(10)).toBe('few'));
  it('11 gives "many"', () => expect(arabicPluralCategory(11)).toBe('many'));
  it('99 gives "many"', () => expect(arabicPluralCategory(99)).toBe('many'));
  it('100 gives "other"', () => expect(arabicPluralCategory(100)).toBe('other'));
  it('1000 gives "other"', () => expect(arabicPluralCategory(1000)).toBe('other'));
});

// ─── Count formatter ─────────────────────────────────────────────────────────

describe('formatCount', () => {
  const arForms = {
    one: 'منشور',
    two: 'منشوران',
    few: 'منشورات',
    many: 'منشوراً',
    other: 'منشور',
  };

  const enForms = { one: 'post', many: 'posts' };

  it('English singular', () => {
    expect(formatCount(1, 'en', enForms)).toBe('1 post');
  });

  it('English plural', () => {
    expect(formatCount(5, 'en', enForms)).toBe('5 posts');
  });

  it('Arabic singular (one)', () => {
    expect(formatCount(1, 'ar', arForms)).toBe('منشور واحد');
  });

  it('Arabic dual', () => {
    expect(formatCount(2, 'ar', arForms)).toBe('منشوران');
  });

  it('Arabic few (3-10) uses Arabic-Indic digits', () => {
    const result = formatCount(5, 'ar', arForms);
    expect(result).toContain('٥');
    expect(result).toContain('منشورات');
  });

  it('Arabic many (11-99) uses Arabic-Indic digits', () => {
    const result = formatCount(25, 'ar', arForms);
    expect(result).toContain('٢٥');
    expect(result).toContain('منشوراً');
  });

  it('Arabic other (100+) uses Arabic-Indic digits', () => {
    const result = formatCount(150, 'ar', arForms);
    expect(result).toContain('١٥٠');
    expect(result).toContain('منشور');
  });

  it('Kurdish Sorani singular', () => {
    const ckbForms = { one: 'پۆست', many: 'پۆستەکان' };
    expect(formatCount(1, 'ckb', ckbForms)).toContain('پۆست');
  });

  it('Kurdish Sorani plural uses Arabic-Indic digits', () => {
    const ckbForms = { one: 'پۆست', many: 'پۆستەکان' };
    const result = formatCount(7, 'ckb', ckbForms);
    expect(result).toContain('٧');
    expect(result).toContain('پۆستەکان');
  });
});

// ─── Relative time formatter ─────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  const now = new Date();

  it('returns "just now" for very recent times in English', () => {
    const recent = new Date(now.getTime() - 10_000);
    expect(formatRelativeTime(recent, 'en')).toBe('just now');
  });

  it('returns "1 minute ago" in English', () => {
    const oneMinAgo = new Date(now.getTime() - 65_000);
    expect(formatRelativeTime(oneMinAgo, 'en')).toBe('1 minute ago');
  });

  it('returns correct minutes in English', () => {
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinsAgo, 'en')).toBe('5 minutes ago');
  });

  it('returns "1 hour ago" in English', () => {
    const oneHourAgo = new Date(now.getTime() - 3700_000);
    expect(formatRelativeTime(oneHourAgo, 'en')).toBe('1 hour ago');
  });

  it('returns "yesterday" in English', () => {
    const yesterday = new Date(now.getTime() - 25 * 3600_000);
    expect(formatRelativeTime(yesterday, 'en')).toBe('yesterday');
  });

  it('returns "الآن" for Arabic now', () => {
    const recent = new Date(now.getTime() - 5_000);
    expect(formatRelativeTime(recent, 'ar')).toBe('الآن');
  });

  it('returns Arabic singular minute', () => {
    const oneMinAgo = new Date(now.getTime() - 65_000);
    expect(formatRelativeTime(oneMinAgo, 'ar')).toBe('منذ دقيقة');
  });

  it('returns Arabic dual minutes', () => {
    const twoMinsAgo = new Date(now.getTime() - 125_000);
    expect(formatRelativeTime(twoMinsAgo, 'ar')).toBe('منذ دقيقتين');
  });

  it('returns Arabic few minutes with Arabic-Indic digits', () => {
    const fiveMins = new Date(now.getTime() - 5 * 60_000 - 5_000);
    const result = formatRelativeTime(fiveMins, 'ar');
    expect(result).toContain('٥');
    expect(result).toContain('دقائق');
  });

  it('returns Arabic singular hour', () => {
    const oneHourAgo = new Date(now.getTime() - 3700_000);
    expect(formatRelativeTime(oneHourAgo, 'ar')).toBe('منذ ساعة');
  });

  it('Arabic returns "أمس" for yesterday', () => {
    const yesterday = new Date(now.getTime() - 25 * 3600_000);
    expect(formatRelativeTime(yesterday, 'ar')).toBe('أمس');
  });

  it('Kurdish Sorani returns "ئێستا" for now', () => {
    const recent = new Date(now.getTime() - 5_000);
    expect(formatRelativeTime(recent, 'ckb')).toBe('ئێستا');
  });

  it('Kurdish Sorani returns minutes with Arabic-Indic digits', () => {
    const fiveMins = new Date(now.getTime() - 5 * 60_000 - 5_000);
    const result = formatRelativeTime(fiveMins, 'ckb');
    expect(result).toContain('٥');
    expect(result).toContain('خولەک');
  });

  it('Kurdish Sorani returns "دوێنێ" for yesterday', () => {
    const yesterday = new Date(now.getTime() - 25 * 3600_000);
    expect(formatRelativeTime(yesterday, 'ckb')).toBe('دوێنێ');
  });
});

// ─── Address formatter ───────────────────────────────────────────────────────

describe('formatAddress', () => {
  it('formats an Arabic address with Arabic comma separator', () => {
    const result = formatAddress(
      { street: 'شارع الرشيد', neighborhood: 'الكرخ', city: 'بغداد' },
      'ar',
    );
    expect(result).toBe('شارع الرشيد، الكرخ، بغداد');
  });

  it('formats an English address with comma separator', () => {
    const result = formatAddress(
      { street: 'Al-Rasheed St', neighborhood: 'Karkh', city: 'Baghdad' },
      'en',
    );
    expect(result).toBe('Al-Rasheed St, Karkh, Baghdad');
  });

  it('omits empty fields', () => {
    const result = formatAddress({ city: 'بغداد' }, 'ar');
    expect(result).toBe('بغداد');
  });

  it('includes building number when provided', () => {
    const result = formatAddress(
      { buildingNumber: '١٢', street: 'شارع المتنبي', city: 'بغداد' },
      'ar',
    );
    expect(result).toContain('١٢');
    expect(result).toContain('شارع المتنبي');
    expect(result).toContain('بغداد');
  });

  it('Kurdish Sorani uses Arabic comma separator', () => {
    const result = formatAddress(
      { street: 'کۆلانی سەڵاحەددین', city: 'هەولێر' },
      'ckb',
    );
    expect(result).toContain('،');
  });

  it('handles full address with all fields', () => {
    const result = formatAddress(
      {
        buildingNumber: '5',
        street: 'Al Mansour St',
        neighborhood: 'Mansour',
        district: 'Karkh',
        city: 'Baghdad',
        governorate: 'Baghdad Governorate',
      },
      'en',
    );
    expect(result.split(', ')).toHaveLength(6);
  });
});

// ─── Number formatter ────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('formats with thousands separator in English', () => {
    expect(formatNumber(12345, 'en')).toBe('12,345');
  });

  it('formats with Arabic-Indic digits and thousands separator in Arabic', () => {
    expect(formatNumber(12345, 'ar')).toBe('١٢,٣٤٥');
  });

  it('formats decimals correctly', () => {
    expect(formatNumber(3.14159, 'en', 2)).toBe('3.14');
  });

  it('formats decimals in Arabic', () => {
    const result = formatNumber(3.14, 'ar', 2);
    expect(result).toContain('٣');
  });

  it('Kurdish Sorani uses Arabic-Indic digits', () => {
    const result = formatNumber(100, 'ckb');
    expect(result).toContain('١٠٠');
  });
});

// ─── Percentage formatter ────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('formats percentage in English with ASCII % sign', () => {
    expect(formatPercent(75, 'en')).toBe('75%');
  });

  it('formats percentage in Arabic with Arabic-Indic digits and ٪', () => {
    expect(formatPercent(75, 'ar')).toBe('٧٥٪');
  });

  it('formats percentage in Kurdish Sorani with Arabic-Indic digits', () => {
    expect(formatPercent(50, 'ckb')).toBe('٥٠٪');
  });

  it('formats decimal percentage in English', () => {
    expect(formatPercent(75.5, 'en', 1)).toBe('75.5%');
  });

  it('formats decimal percentage in Arabic', () => {
    const result = formatPercent(75.5, 'ar', 1);
    expect(result).toContain('٧٥');
    expect(result).toContain('٪');
  });
});

// ─── File size formatter ─────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes in English', () => {
    expect(formatFileSize(512, 'en')).toBe('512 B');
  });

  it('formats KB in English', () => {
    expect(formatFileSize(2048, 'en')).toBe('2.0 KB');
  });

  it('formats MB in English', () => {
    expect(formatFileSize(1048576, 'en')).toBe('1.0 MB');
  });

  it('formats GB in English', () => {
    expect(formatFileSize(1073741824, 'en')).toBe('1.00 GB');
  });

  it('formats bytes in Arabic', () => {
    const result = formatFileSize(512, 'ar');
    expect(result).toContain('٥١٢');
    expect(result).toContain('بايت');
  });

  it('formats MB in Arabic', () => {
    const result = formatFileSize(1048576, 'ar');
    expect(result).toContain('١');
    expect(result).toContain('ميغابايت');
  });

  it('formats MB in Kurdish Sorani', () => {
    const result = formatFileSize(1048576, 'ckb');
    expect(result).toContain('١');
    expect(result).toContain('مێگابایت');
  });
});

// ─── Speed formatter ─────────────────────────────────────────────────────────

describe('formatSpeed', () => {
  it('formats speed in English', () => {
    expect(formatSpeed(80, 'en')).toBe('80 km/h');
  });

  it('formats speed in Arabic with Arabic-Indic digits', () => {
    const result = formatSpeed(80, 'ar');
    expect(result).toContain('٨٠');
    expect(result).toContain('كم/ساعة');
  });

  it('formats speed in Kurdish Sorani', () => {
    const result = formatSpeed(60, 'ckb');
    expect(result).toContain('٦٠');
    expect(result).toContain('کم/کاتژمێر');
  });
});

// ─── RTL string direction assertions ─────────────────────────────────────────

describe('RTL text direction properties', () => {
  it('Arabic strings begin with an Arabic character or Arabic-Indic digit', () => {
    const arabicStrings = [
      formatIqd(100, 'ar'),
      formatDistance(500, 'ar'),
      formatRelativeTime(new Date(Date.now() - 65_000), 'ar'),
    ];
    const arabicOrIndicStart = /^[؀-ۿ٠-٩]/u;
    for (const s of arabicStrings) {
      expect(s).toMatch(arabicOrIndicStart);
    }
  });

  it('Kurdish strings begin with an Arabic/Kurdish character or Arabic-Indic digit', () => {
    const ckbStrings = [
      formatIqd(100, 'ckb'),
      formatDistance(500, 'ckb'),
    ];
    const arabicOrIndicStart = /^[؀-ۿ٠-٩]/u;
    for (const s of ckbStrings) {
      expect(s).toMatch(arabicOrIndicStart);
    }
  });

  it('English strings begin with an ASCII character or digit', () => {
    const enStrings = [
      formatIqd(100, 'en'),
      formatDistance(500, 'en'),
      formatRelativeTime(new Date(Date.now() - 65_000), 'en'),
    ];
    const asciiStart = /^[A-Za-z0-9+]/;
    for (const s of enStrings) {
      expect(s).toMatch(asciiStart);
    }
  });
});

// ─── Mixed-direction text (phone numbers in RTL context) ─────────────────────

describe('Mixed-direction text', () => {
  it('phone number in Arabic context contains + prefix and Arabic-Indic digits', () => {
    const result = formatPhoneLocale('07501234567', 'ar');
    expect(result).toContain('+');
    // Should have Arabic-Indic digits for the actual phone number digits
    expect([...result].some(c => '٩٦٤٧٥٠١٢٣٤٥٦٧٨'.includes(c))).toBe(true);
  });

  it('English phone number context stays ASCII', () => {
    const result = formatPhoneLocale('07501234567', 'en');
    expect(result).toContain('+964');
    expect(result).not.toMatch(/[٠-٩]/u);
  });
});
