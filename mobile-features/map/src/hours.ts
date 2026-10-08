/** Minutes from the day's 00:00. The end passes 1440 when the span runs past midnight (18:00-02:00 is [1080, 1560]). */
type Span = [start: number, end: number];

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY = `(?:${DAYS.join('|')})`;
const TIME = '\\d{2}:\\d{2}-\\d{2}:\\d{2}';
/** `[days ]times|off`: "Sa-Th 09:00-13:00,16:00-22:00", "Fr off", "08:00-22:00". */
const RULE = new RegExp(`^(?:(${DAY}(?:-${DAY})?(?:,${DAY}(?:-${DAY})?)*) +)?(off|closed|${TIME}(?:,${TIME})*)$`);
/** Iraq has stayed on UTC+3 all year since 2008, and every MVP city is in Iraq. */
const IRAQ_UTC_OFFSET_MS = 3 * 3_600_000;

const minutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return m < 60 && h * 60 + m <= 1440 ? h * 60 + m : NaN;
};

function span(range: string): Span | null {
  const [start = NaN, end = NaN] = range.split('-').map(minutes);
  if (Number.isNaN(start) || Number.isNaN(end) || start === 1440) return null;
  return [start, end <= start ? end + 1440 : end];
}

/** "Sa-Th,Fr" => [5, 6, 0, 1, 2, 3, 4]; a range may wrap past Sunday. */
const days = (selector: string) =>
  selector.split(',').flatMap((part) => {
    const [from = 0, to = from] = part.split('-').map((d) => DAYS.indexOf(d));
    return Array.from({ length: ((to - from + 7) % 7) + 1 }, (_, i) => (from + i) % 7);
  });

/** Opening spans per weekday (0 = Monday), or null for anything beyond the simple forms (PH, months, comments, `||`). */
function parse(raw: string): Span[][] | null {
  if (raw.trim() === '24/7') return DAYS.map(() => [[0, 1440]]);
  const week: Span[][] = DAYS.map(() => []);
  for (const rule of raw.split(';').map((r) => r.trim())) {
    const [, selector, times = ''] = RULE.exec(rule) ?? [];
    if (!times) return null;
    const spans = times === 'off' || times === 'closed' ? [] : times.split(',').map(span);
    if (spans.includes(null)) return null;
    // A later rule replaces the earlier ones for the days it names.
    for (const day of selector ? days(selector) : DAYS.keys()) week[day] = spans as Span[];
  }
  return week;
}

/**
 * Whether a place is open at `at`, from its OSM opening_hours, in Iraq time. Handles 24/7 and `;`-separated rules of
 * weekdays (ranges and lists) with time spans or off, including spans past midnight. Returns null when the value uses
 * anything else, so the card shows the raw text without claiming open or closed.
 */
export function openNow(raw: string, at = new Date()): boolean | null {
  const week = parse(raw);
  if (!week) return null;
  const local = new Date(at.getTime() + IRAQ_UTC_OFFSET_MS);
  const day = (local.getUTCDay() + 6) % 7;
  const now = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = week[day] ?? [];
  const yesterday = week[(day + 6) % 7] ?? [];
  return today.some(([start, end]) => start <= now && now < end) || yesterday.some(([, end]) => now + 1440 < end);
}
