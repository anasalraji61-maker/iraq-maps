/**
 * OSM opening_hours parser for Iraq.
 *
 * Parses the OSM opening_hours specification into a structured weekly schedule
 * with Iraq-specific handling:
 *   - Friday (الجمعة) as the Islamic day of rest / reduced hours
 *   - Prayer time blocks (optional overlay)
 *   - Ramadan hours annotation
 *   - Arabic day/period names in output
 *
 * Supports the most common OSM opening_hours patterns:
 *   Mo-Fr 09:00-18:00
 *   Sa,Su 10:00-22:00
 *   Mo-Fr 08:00-12:00,14:00-20:00   (lunch break)
 *   24/7
 *   Mo-Sa 09:00-21:00; Fr 13:00-16:00 off
 *   Ramadan: Mo-Fr 09:00-15:00
 *   PH off
 *
 * ODbL: parses tag values only; no OSM data is transformed for redistribution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ISO weekday number: 1 = Monday ... 7 = Sunday */
export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Minutes since midnight (0–1439). */
export type MinuteOfDay = number;

/** A single opening interval within a day. */
export interface TimeInterval {
  open: MinuteOfDay;
  close: MinuteOfDay;
  /** Whether this interval wraps past midnight (open > close). */
  overnight: boolean;
}

/** All opening intervals for one day of the week. */
export interface DaySchedule {
  weekday: WeekdayNumber;
  /** Arabic name, e.g. "الجمعة" */
  nameAr: string;
  /** English name, e.g. "Friday" */
  nameEn: string;
  /** true = open all day (24h); false = closed all day. */
  allDay?: boolean;
  closed?: boolean;
  intervals: TimeInterval[];
  /** Present if Ramadan hours differ from regular hours. */
  ramadanIntervals?: TimeInterval[];
  /** Whether this day is a Friday (Islamic holy day). */
  isFriday: boolean;
  /** Whether Friday prayer-time block applies (typically 11:45–13:30). */
  hasPrayerBlock: boolean;
}

/** Structured weekly schedule produced by parse(). */
export interface WeeklySchedule {
  /** The raw OSM string that was parsed. */
  raw: string;
  /** true if open 24/7. */
  alwaysOpen: boolean;
  /** true if explicitly marked as closed. */
  permanentlyClosed: boolean;
  /** Indexed by weekday (1–7). */
  days: Record<WeekdayNumber, DaySchedule>;
  /** Whether the schedule has Ramadan-specific hours. */
  hasRamadanHours: boolean;
  /** Human-readable summary (Arabic). */
  summaryAr: string;
  /** Human-readable summary (English). */
  summaryEn: string;
}

/** Result of checking if a place is open at a given moment. */
export interface OpenStatus {
  isOpen: boolean;
  /** Next state change time (minutes from midnight, same day or next). */
  nextChange?: { dayOffset: number; minute: MinuteOfDay };
  /** "open" | "closed" | "unknown" */
  status: 'open' | 'closed' | 'unknown';
  /** Arabic status string. */
  labelAr: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_AR: Record<WeekdayNumber, string> = {
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

const DAYS_EN: Record<WeekdayNumber, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** OSM two-letter day codes (ISO order). */
const OSM_DAY_CODE: Record<string, WeekdayNumber> = {
  Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7,
};

/** Friday prayer block: 11:45–13:30 (noon Friday in Baghdad). */
const FRIDAY_PRAYER_OPEN: MinuteOfDay = 11 * 60 + 45;
const FRIDAY_PRAYER_CLOSE: MinuteOfDay = 13 * 60 + 30;

/** Default Iraqi business hours when no explicit hours given. */
const DEFAULT_OPEN: MinuteOfDay = 9 * 60;
const DEFAULT_CLOSE: MinuteOfDay = 21 * 60;

// ---------------------------------------------------------------------------
// Time string helpers
// ---------------------------------------------------------------------------

/** Parse "HH:MM" to minutes since midnight. */
function parseTime(s: string): MinuteOfDay | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 29 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes since midnight to "HH:MM". */
export function formatTime(minutes: MinuteOfDay): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format minutes since midnight to Arabic 12-hour time. */
export function formatTimeAr(minutes: MinuteOfDay): string {
  const totalMinutes = minutes % (24 * 60);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h24 < 12 ? 'ص' : 'م';
  const h12 = h24 % 12 || 12;
  const minStr = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}${minStr} ${ampm}`;
}

/** Parse a time interval string "HH:MM-HH:MM" to TimeInterval. */
function parseInterval(s: string): TimeInterval | null {
  const parts = s.split('-');
  if (parts.length !== 2) return null;
  const open = parseTime(parts[0]);
  const close = parseTime(parts[1]);
  if (open === null || close === null) return null;
  return { open, close, overnight: close < open };
}

// ---------------------------------------------------------------------------
// Day range helpers
// ---------------------------------------------------------------------------

/** Expand a day range token like "Mo-Fr" or "Sa,Su" to an array of weekday numbers. */
function expandDayToken(token: string): WeekdayNumber[] {
  // Range: "Mo-Fr"
  const rangeMatch = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(token.trim());
  if (rangeMatch) {
    const start = OSM_DAY_CODE[rangeMatch[1]];
    const end = OSM_DAY_CODE[rangeMatch[2]];
    if (!start || !end) return [];
    const result: WeekdayNumber[] = [];
    let cur = start;
    // Handle wrap-around (e.g. Sa-Tu = 6,7,1,2)
    while (true) {
      result.push(cur as WeekdayNumber);
      if (cur === end) break;
      cur = ((cur % 7) + 1) as WeekdayNumber;
      // Safety: max 7 iterations
      if (result.length > 7) break;
    }
    return result;
  }

  // List: "Mo,We,Fr" or single "Fr"
  return token
    .split(',')
    .map((d) => OSM_DAY_CODE[d.trim()])
    .filter((d): d is WeekdayNumber => d !== undefined);
}

// ---------------------------------------------------------------------------
// Rule parser
// ---------------------------------------------------------------------------

interface ParsedRule {
  days: WeekdayNumber[];
  intervals: TimeInterval[];
  closed: boolean;
  isRamadan: boolean;
  isPublicHoliday: boolean;
}

function parseRule(rule: string): ParsedRule | null {
  const trimmed = rule.trim();

  // Ramadan prefix
  const isRamadan = /^ramadan\s*:/i.test(trimmed);
  const withoutRamadan = isRamadan ? trimmed.replace(/^ramadan\s*:/i, '').trim() : trimmed;

  // Public holiday
  const isPublicHoliday = /\bPH\b/.test(withoutRamadan);
  const withoutPH = withoutRamadan.replace(/\bPH\b/g, '').trim();

  if (!withoutPH) return null;

  // Split into day-spec and time-spec
  // e.g. "Mo-Fr 09:00-18:00" or "Mo-Fr 08:00-12:00,14:00-20:00" or "Fr off" or "24/7"
  if (withoutPH === '24/7') {
    return {
      days: [1, 2, 3, 4, 5, 6, 7],
      intervals: [{ open: 0, close: 24 * 60, overnight: false }],
      closed: false,
      isRamadan,
      isPublicHoliday,
    };
  }

  // Match: [day-part] [time-part|off]
  const rulePattern =
    /^([A-Z][a-z](?:[-,][A-Z][a-z])*(?:\s*,\s*[A-Z][a-z](?:[-,][A-Z][a-z])*)*)\s+([\d:,\-+ ]+|off|closed|24\/7)$/i;
  const m = rulePattern.exec(withoutPH);

  if (!m) {
    // Time-only rule (applies to all days)
    const timeParts = withoutPH.split(',').map(parseInterval).filter((i): i is TimeInterval => i !== null);
    if (timeParts.length > 0) {
      return {
        days: [1, 2, 3, 4, 5, 6, 7],
        intervals: timeParts,
        closed: false,
        isRamadan,
        isPublicHoliday,
      };
    }
    return null;
  }

  const daySpec = m[1];
  const timeSpec = m[2].trim();

  // Expand day tokens
  const dayTokens = daySpec.split(/\s*,\s*/);
  const days: WeekdayNumber[] = [];
  for (const token of dayTokens) {
    days.push(...expandDayToken(token.trim()));
  }

  if (days.length === 0) return null;

  const closed = /^(off|closed)$/i.test(timeSpec);
  if (closed) {
    return { days, intervals: [], closed: true, isRamadan, isPublicHoliday };
  }

  if (timeSpec === '24/7' || timeSpec === '24:00-24:00') {
    return {
      days,
      intervals: [{ open: 0, close: 24 * 60, overnight: false }],
      closed: false,
      isRamadan,
      isPublicHoliday,
    };
  }

  // Parse time intervals
  const intervals = timeSpec
    .split(',')
    .map((s) => parseInterval(s.trim()))
    .filter((i): i is TimeInterval => i !== null);

  return { days, intervals, closed: false, isRamadan, isPublicHoliday };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function makeEmptyDay(weekday: WeekdayNumber): DaySchedule {
  return {
    weekday,
    nameAr: DAYS_AR[weekday],
    nameEn: DAYS_EN[weekday],
    intervals: [],
    closed: true,
    isFriday: weekday === 5,
    hasPrayerBlock: false,
  };
}

/**
 * Parse an OSM opening_hours string into a WeeklySchedule.
 *
 * @param raw           The raw OSM opening_hours value.
 * @param applyPrayer   Whether to overlay Friday prayer time blocks. Default: true.
 */
export function parseOpeningHours(
  raw: string,
  applyPrayer = true,
): WeeklySchedule {
  const trimmed = raw.trim();

  // Initialize all days as closed
  const days = {} as Record<WeekdayNumber, DaySchedule>;
  for (let d = 1; d <= 7; d++) {
    days[d as WeekdayNumber] = makeEmptyDay(d as WeekdayNumber);
  }

  // Special: 24/7
  if (trimmed === '24/7') {
    for (let d = 1; d <= 7; d++) {
      const day = days[d as WeekdayNumber];
      day.allDay = true;
      day.closed = false;
      day.intervals = [{ open: 0, close: 24 * 60, overnight: false }];
    }
    const result: WeeklySchedule = {
      raw,
      alwaysOpen: true,
      permanentlyClosed: false,
      days,
      hasRamadanHours: false,
      summaryAr: 'مفتوح 24 ساعة / 7 أيام',
      summaryEn: 'Open 24/7',
    };
    return result;
  }

  // Special: closed / off
  if (/^(closed|off|مغلق)$/i.test(trimmed)) {
    return {
      raw,
      alwaysOpen: false,
      permanentlyClosed: true,
      days,
      hasRamadanHours: false,
      summaryAr: 'مغلق',
      summaryEn: 'Closed',
    };
  }

  // Split into semicolon-separated rules
  const ruleStrings = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  let hasRamadanHours = false;

  for (const ruleStr of ruleStrings) {
    const parsed = parseRule(ruleStr);
    if (!parsed) continue;
    if (parsed.isPublicHoliday) continue; // skip PH rules for simplicity

    if (parsed.isRamadan) {
      hasRamadanHours = true;
      for (const d of parsed.days) {
        days[d].ramadanIntervals = parsed.closed ? [] : parsed.intervals;
      }
      continue;
    }

    for (const d of parsed.days) {
      const day = days[d];
      if (parsed.closed) {
        day.closed = true;
        day.intervals = [];
        day.allDay = false;
      } else {
        day.closed = false;
        // Merge intervals (later rules override)
        day.intervals = parsed.intervals;
        day.allDay =
          parsed.intervals.length === 1 &&
          parsed.intervals[0].open === 0 &&
          parsed.intervals[0].close >= 24 * 60;
      }
    }
  }

  // Apply Friday prayer block overlay
  if (applyPrayer) {
    const friday = days[5];
    if (!friday.closed && !friday.allDay && friday.intervals.length > 0) {
      friday.hasPrayerBlock = true;
      friday.intervals = subtractInterval(
        friday.intervals,
        FRIDAY_PRAYER_OPEN,
        FRIDAY_PRAYER_CLOSE,
      );
    }
  }

  // Build summaries
  const summaryEn = buildSummaryEn(days);
  const summaryAr = buildSummaryAr(days);

  const alwaysOpen = Object.values(days).every((d) => d.allDay);
  const permanentlyClosed = Object.values(days).every((d) => d.closed);

  return {
    raw,
    alwaysOpen,
    permanentlyClosed,
    days,
    hasRamadanHours,
    summaryAr,
    summaryEn,
  };
}

// ---------------------------------------------------------------------------
// Prayer time interval subtraction
// ---------------------------------------------------------------------------

/**
 * Remove a blocked interval [blockStart, blockEnd] from a set of open intervals.
 * Returns the remaining open intervals.
 */
function subtractInterval(
  intervals: TimeInterval[],
  blockStart: MinuteOfDay,
  blockEnd: MinuteOfDay,
): TimeInterval[] {
  const result: TimeInterval[] = [];
  for (const iv of intervals) {
    if (iv.open >= blockEnd || iv.close <= blockStart) {
      // No overlap
      result.push(iv);
    } else {
      // Partial overlaps
      if (iv.open < blockStart) {
        result.push({ open: iv.open, close: blockStart, overnight: false });
      }
      if (iv.close > blockEnd) {
        result.push({ open: blockEnd, close: iv.close, overnight: iv.close < iv.open });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function intervalsToString(intervals: TimeInterval[]): string {
  return intervals.map((iv) => `${formatTime(iv.open)}–${formatTime(iv.close)}`).join(', ');
}

function intervalsToStringAr(intervals: TimeInterval[]): string {
  return intervals
    .map((iv) => `${formatTimeAr(iv.open)} – ${formatTimeAr(iv.close)}`)
    .join('، ');
}

function buildSummaryEn(days: Record<WeekdayNumber, DaySchedule>): string {
  const lines: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const day = days[d as WeekdayNumber];
    if (day.allDay) {
      lines.push(`${day.nameEn}: 24h`);
    } else if (day.closed) {
      lines.push(`${day.nameEn}: Closed`);
    } else {
      lines.push(`${day.nameEn}: ${intervalsToString(day.intervals)}`);
    }
  }
  return lines.join(' | ');
}

function buildSummaryAr(days: Record<WeekdayNumber, DaySchedule>): string {
  const lines: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const day = days[d as WeekdayNumber];
    if (day.allDay) {
      lines.push(`${day.nameAr}: مفتوح 24 ساعة`);
    } else if (day.closed) {
      lines.push(`${day.nameAr}: مغلق`);
    } else {
      lines.push(`${day.nameAr}: ${intervalsToStringAr(day.intervals)}`);
    }
    if (day.hasPrayerBlock) {
      lines[lines.length - 1] += ' (مغلق وقت صلاة الجمعة)';
    }
  }
  return lines.join(' | ');
}

// ---------------------------------------------------------------------------
// Open-status checker
// ---------------------------------------------------------------------------

/**
 * Check whether a place is open at a given time.
 *
 * @param schedule  Parsed WeeklySchedule.
 * @param now       Current time (default: system time).
 * @param isRamadan Whether to use Ramadan hours (default: false).
 */
export function checkOpenStatus(
  schedule: WeeklySchedule,
  now: Date = new Date(),
  isRamadan = false,
): OpenStatus {
  if (schedule.alwaysOpen) {
    return { isOpen: true, status: 'open', labelAr: 'مفتوح دائماً' };
  }
  if (schedule.permanentlyClosed) {
    return { isOpen: false, status: 'closed', labelAr: 'مغلق' };
  }

  // JS getDay(): 0=Sunday, 1=Mon,...,6=Sat → map to ISO 1-7
  const jsDay = now.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const day = schedule.days[isoDay as WeekdayNumber];
  if (!day) return { isOpen: false, status: 'unknown', labelAr: 'غير معروف' };

  const intervals =
    isRamadan && day.ramadanIntervals ? day.ramadanIntervals : day.intervals;

  if (day.closed || intervals.length === 0) {
    return { isOpen: false, status: 'closed', labelAr: 'مغلق اليوم' };
  }

  if (day.allDay) {
    return { isOpen: true, status: 'open', labelAr: 'مفتوح 24 ساعة' };
  }

  for (const iv of intervals) {
    if (currentMinute >= iv.open && currentMinute < iv.close) {
      // Find closing time
      const minutesUntilClose = iv.close - currentMinute;
      const label =
        minutesUntilClose <= 30
          ? `يغلق خلال ${minutesUntilClose} دقيقة`
          : `مفتوح حتى ${formatTimeAr(iv.close)}`;
      return {
        isOpen: true,
        status: 'open',
        labelAr: label,
        nextChange: { dayOffset: 0, minute: iv.close },
      };
    }
  }

  // Find next opening
  let nextOpenMinute: MinuteOfDay | null = null;
  for (const iv of intervals) {
    if (iv.open > currentMinute) {
      if (nextOpenMinute === null || iv.open < nextOpenMinute) {
        nextOpenMinute = iv.open;
      }
    }
  }

  if (nextOpenMinute !== null) {
    const minutesUntilOpen = nextOpenMinute - currentMinute;
    const label =
      minutesUntilOpen <= 60
        ? `يفتح خلال ${minutesUntilOpen} دقيقة`
        : `يفتح الساعة ${formatTimeAr(nextOpenMinute)}`;
    return {
      isOpen: false,
      status: 'closed',
      labelAr: label,
      nextChange: { dayOffset: 0, minute: nextOpenMinute },
    };
  }

  // Closed for the rest of today
  return {
    isOpen: false,
    status: 'closed',
    labelAr: 'مغلق لبقية اليوم',
  };
}

// ---------------------------------------------------------------------------
// Convenience: get today's hours as a string
// ---------------------------------------------------------------------------

/**
 * Returns the hours for today as a formatted Arabic string.
 * e.g. "9 ص – 9 م"  or  "مغلق"
 */
export function todayHoursAr(schedule: WeeklySchedule, now: Date = new Date()): string {
  if (schedule.alwaysOpen) return 'مفتوح 24 ساعة';
  if (schedule.permanentlyClosed) return 'مغلق';

  const jsDay = now.getDay();
  const isoDay = (jsDay === 0 ? 7 : jsDay) as WeekdayNumber;
  const day = schedule.days[isoDay];
  if (!day || day.closed || day.intervals.length === 0) return 'مغلق';
  if (day.allDay) return 'مفتوح 24 ساعة';
  return intervalsToStringAr(day.intervals);
}

/**
 * Returns a compact weekly schedule as a list of day-range + hours lines.
 * Groups consecutive days with identical hours together.
 * e.g. ["الاثنين – الخميس: 9 ص – 9 م", "الجمعة: 2 م – 9 م", "السبت: مغلق"]
 */
export function compactScheduleAr(schedule: WeeklySchedule): string[] {
  if (schedule.alwaysOpen) return ['مفتوح 24 ساعة / 7 أيام'];
  if (schedule.permanentlyClosed) return ['مغلق'];

  const lines: string[] = [];
  let groupStart = 1 as WeekdayNumber;
  let groupHours = dayHoursKey(schedule.days[1 as WeekdayNumber]);

  const flush = (end: WeekdayNumber) => {
    const startDay = schedule.days[groupStart];
    const endDay = schedule.days[end];
    const dayRange =
      groupStart === end
        ? startDay.nameAr
        : `${startDay.nameAr} – ${endDay.nameAr}`;
    const hoursStr = groupHours === '__closed__' ? 'مغلق' : groupHours;
    lines.push(`${dayRange}: ${hoursStr}`);
  };

  for (let d = 2; d <= 7; d++) {
    const current = dayHoursKey(schedule.days[d as WeekdayNumber]);
    if (current !== groupHours) {
      flush((d - 1) as WeekdayNumber);
      groupStart = d as WeekdayNumber;
      groupHours = current;
    }
  }
  flush(7 as WeekdayNumber);

  return lines;
}

function dayHoursKey(day: DaySchedule): string {
  if (day.closed || day.intervals.length === 0) return '__closed__';
  if (day.allDay) return '24h';
  return day.intervals.map((iv) => `${iv.open}-${iv.close}`).join(',');
}

// ---------------------------------------------------------------------------
// Iraq-specific Ramadan schedule helper
// ---------------------------------------------------------------------------

/**
 * Typical Ramadan business hours in Iraq:
 * - Morning shift: 09:00–14:00
 * - Evening shift (after Iftar): 20:00–24:00
 * - Friday: 10:00–14:00 only
 */
export const TYPICAL_RAMADAN_INTERVALS: Record<WeekdayNumber, TimeInterval[]> = {
  1: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
  2: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
  3: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
  4: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
  5: [{ open: 10 * 60, close: 14 * 60, overnight: false }],
  6: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
  7: [{ open: 9 * 60, close: 14 * 60, overnight: false }, { open: 20 * 60, close: 24 * 60, overnight: false }],
};
