/**
 * EventCalendarScreen – monthly calendar view for Iraq Smart Maps events.
 *
 * Features:
 *  - Full monthly grid (6 rows × 7 columns, Sunday-start)
 *  - Coloured dots on dates with events (up to 3 category colours)
 *  - Event-count badge on calendar days
 *  - Swipe between months (PanResponder-based, no external deps)
 *  - Iraqi national and religious holidays highlighted
 *  - Hijri date display toggle (approximate, for Ramadan / Eid awareness)
 *  - Filter drawer: category / free-paid / distance
 *  - Day detail sheet listing events for the tapped date
 */

/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { type DiscoverEventType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Animated,
  I18nManager,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { EventCard, type RsvpStatus } from '../components/EventCard';
import { COLORS, LoadingIndicator, sharedStyles } from './shared';

I18nManager.forceRTL(true);

// ─── Iraqi timezone ───────────────────────────────────────────────────────────

const IRAQ_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function nowIraq(): Date {
  return new Date(Date.now() + IRAQ_UTC_OFFSET_MS);
}

function toIraqDate(utcDate: Date): Date {
  return new Date(utcDate.getTime() + IRAQ_UTC_OFFSET_MS);
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── Iraqi national holidays (fixed list, lunar ones approximate) ─────────────

interface _IraqiHoliday {
  nameAr: string;
  pattern: (year: number, month: number, day: number) => boolean;
  color: string;
}

// We ship a lightweight holiday checker for the most common fixed-date holidays.
// Lunar holidays (Eid, Mawlid) are approximated by known recent years.
const FIXED_HOLIDAYS: Array<{ nameAr: string; mm: number; dd: number; color: string }> = [
  { nameAr: 'رأس السنة', mm: 1, dd: 1, color: '#E91E63' },
  { nameAr: 'نوروز', mm: 3, dd: 21, color: '#4CAF50' },
  { nameAr: 'عيد العمال', mm: 5, dd: 1, color: '#FF5722' },
  { nameAr: 'الجمهورية', mm: 7, dd: 14, color: '#009688' },
  { nameAr: 'اليوم الوطني', mm: 10, dd: 3, color: '#3F51B5' },
  { nameAr: 'عيد الميلاد', mm: 12, dd: 25, color: '#E91E63' },
];

/** Returns the Arabic holiday name for a yyyy-MM-dd string, if it's a holiday. */
function getHolidayForDate(dateStr: string): string | null {
  const [_yearStr, monthStr, dayStr] = dateStr.split('-');
  const month = parseInt(monthStr ?? '0', 10);
  const day = parseInt(dayStr ?? '0', 10);

  for (const h of FIXED_HOLIDAYS) {
    if (h.mm === month && h.dd === day) return h.nameAr;
  }

  // Approximate lunar holidays for 2024-2027
  const LUNAR: Record<string, string> = {
    '2024-04-09': 'عيد الفطر',
    '2024-04-10': 'عيد الفطر',
    '2024-06-16': 'عيد الأضحى',
    '2024-06-17': 'عيد الأضحى',
    '2024-09-15': 'المولد النبوي',
    '2025-03-30': 'عيد الفطر',
    '2025-03-31': 'عيد الفطر',
    '2025-06-06': 'عيد الأضحى',
    '2025-06-07': 'عيد الأضحى',
    '2025-09-04': 'المولد النبوي',
    '2026-03-20': 'عيد الفطر',
    '2026-03-21': 'عيد الفطر',
    '2026-05-27': 'عيد الأضحى',
    '2026-05-28': 'عيد الأضحى',
    '2027-03-09': 'عيد الفطر',
    '2027-03-10': 'عيد الفطر',
    '2027-05-16': 'عيد الأضحى',
    '2027-05-17': 'عيد الأضحى',
  };

  return LUNAR[dateStr] ?? null;
}

// ─── Approximate Hijri display ────────────────────────────────────────────────

/**
 * Returns an approximate Hijri date string (e.g. "١٥ رمضان") for a Gregorian Date.
 * Uses the standard epoch: 1 Muharram 1 AH = 16 July 622 CE (Julian).
 * Accuracy: ±1-2 days. Sufficient for calendar display.
 */
function toHijriApprox(gregorianDate: Date): { day: number; month: number; year: number; monthName: string } {
  const JD_EPOCH = 1948439.5; // Julian Day of 1 Muharram 1 AH
  const MEAN_MONTH = 29.53059;
  // Julian Day Number from Unix timestamp
  const jd = gregorianDate.getTime() / 86400000 + 2440587.5;
  const daysSinceEpoch = jd - JD_EPOCH;

  const hijriYear = Math.floor(daysSinceEpoch / 354.36708) + 1;
  const hijriDayOfYear = daysSinceEpoch - Math.floor((hijriYear - 1) * 354.36708);
  const hijriMonth = Math.floor(hijriDayOfYear / MEAN_MONTH) + 1;
  const hijriDay = Math.floor(hijriDayOfYear % MEAN_MONTH) + 1;

  const HIJRI_MONTHS_AR = [
    'محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة',
  ];
  const safeMMonth = Math.max(1, Math.min(12, hijriMonth));
  const monthName = HIJRI_MONTHS_AR[safeMMonth - 1] ?? '';

  return { day: hijriDay, month: hijriMonth, year: hijriYear, monthName };
}

/** Format Hijri date as Arabic-numeral string. */
function formatHijri(d: Date): string {
  const h = toHijriApprox(d);
  return `${h.day} ${h.monthName} ${h.year}`;
}

// ─── Category colors ──────────────────────────────────────────────────────────

const CATEGORY_DOT_COLORS: Record<string, string> = {
  cultural: '#9C27B0',
  food: '#FF9800',
  sport: '#4CAF50',
  business: '#2196F3',
  education: '#00BCD4',
  entertainment: '#E91E63',
  social: '#607D8B',
  other: '#9E9E9E',
};

function categoryColor(cat: string): string {
  return CATEGORY_DOT_COLORS[cat] ?? '#9E9E9E';
}

// ─── Calendar month helpers ───────────────────────────────────────────────────

interface CalendarDay {
  date: Date | null; // null = padding cell
  isoStr: string | null;
  isToday: boolean;
  isCurrentMonth: boolean;
}

function buildCalendarGrid(year: number, month: number): CalendarDay[] {
  const today = isoDate(nowIraq());
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const startDow = firstDay.getUTCDay(); // 0=Sun
  const daysInMonth = lastDay.getUTCDate();

  const cells: CalendarDay[] = [];

  // Leading padding
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, isoStr: null, isToday: false, isCurrentMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const iso = isoDate(date);
    cells.push({
      date,
      isoStr: iso,
      isToday: iso === today,
      isCurrentMonth: true,
    });
  }

  // Trailing padding to fill 6 rows
  while (cells.length < 42) {
    cells.push({ date: null, isoStr: null, isToday: false, isCurrentMonth: false });
  }

  return cells;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type PriceFilter = 'all' | 'free' | 'paid';

interface FilterState {
  category: string;
  priceFilter: PriceFilter;
  maxDistanceKm: number | null;
}

const DEFAULT_FILTERS: FilterState = {
  category: 'all',
  priceFilter: 'all',
  maxDistanceKm: null,
};

const CATEGORIES = ['all', 'cultural', 'food', 'sport', 'business', 'education', 'entertainment', 'social', 'other'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  all: 'الكل',
  cultural: 'ثقافي',
  food: 'طعام',
  sport: 'رياضي',
  business: 'أعمال',
  education: 'تعليمي',
  entertainment: 'ترفيهي',
  social: 'اجتماعي',
  other: 'أخرى',
};

// ─── Calendar Day Cell ────────────────────────────────────────────────────────

interface DayEvents {
  count: number;
  categories: string[];
}

function CalendarDayCell({
  cell,
  dayEvents,
  isSelected,
  holidayName,
  showHijri,
  onPress,
}: {
  cell: CalendarDay;
  dayEvents: DayEvents | null;
  isSelected: boolean;
  holidayName: string | null;
  showHijri: boolean;
  onPress: (iso: string) => void;
}): ReactElement {
  if (!cell.date || !cell.isoStr) {
    return <View style={dayStyles.empty} />;
  }

  const hijriStr = showHijri ? toHijriApprox(cell.date) : null;
  const dots = (dayEvents?.categories ?? []).slice(0, 3);

  return (
    <Pressable
      style={[
        dayStyles.cell,
        isSelected && dayStyles.cellSelected,
        cell.isToday && !isSelected && dayStyles.cellToday,
        !!holidayName && dayStyles.cellHoliday,
      ]}
      onPress={() => onPress(cell.isoStr!)}
      accessibilityRole="button"
      accessibilityLabel={`${cell.date.getUTCDate()} ${holidayName ?? ''}`}
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[
          dayStyles.dayNum,
          isSelected && dayStyles.dayNumSelected,
          cell.isToday && !isSelected && dayStyles.dayNumToday,
          !!holidayName && dayStyles.dayNumHoliday,
        ]}
      >
        {cell.date.getUTCDate().toLocaleString('ar-IQ')}
      </Text>

      {hijriStr && (
        <Text style={dayStyles.hijriText} numberOfLines={1}>
          {hijriStr.day}
        </Text>
      )}

      {dayEvents && dayEvents.count > 0 && (
        <View style={dayStyles.badge}>
          <Text style={dayStyles.badgeText}>{dayEvents.count}</Text>
        </View>
      )}

      <View style={dayStyles.dotsRow}>
        {dots.map((cat, i) => (
          <View
            key={`${cat}-${i}`}
            style={[dayStyles.dot, { backgroundColor: categoryColor(cat) }]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const dayStyles = StyleSheet.create({
  empty: { flex: 1, aspectRatio: 1 },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    alignItems: 'center',
    paddingTop: 4,
    borderRadius: 8,
    marginHorizontal: 1,
    marginVertical: 1,
    position: 'relative',
  },
  cellSelected: { backgroundColor: COLORS.primary },
  cellToday: { backgroundColor: COLORS.primaryXLight, borderWidth: 1.5, borderColor: COLORS.primary },
  cellHoliday: { backgroundColor: '#FFF3E0' },
  dayNum: { fontSize: 13, fontWeight: '500', color: COLORS.textPrimary },
  dayNumSelected: { color: '#FFF', fontWeight: '700' },
  dayNumToday: { color: COLORS.primary, fontWeight: '700' },
  dayNumHoliday: { color: '#E65100', fontWeight: '700' },
  hijriText: { fontSize: 8, color: COLORS.textMuted, marginTop: 1 },
  badge: {
    position: 'absolute',
    top: 1,
    end: 2,
    backgroundColor: COLORS.error,
    borderRadius: 5,
    minWidth: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: { fontSize: 7, color: '#FFF', fontWeight: '700' },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    height: 5,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Calendar header row ──────────────────────────────────────────────────────

const WEEKDAY_LABELS_AR = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun–Sat

function WeekdayHeaderRow(): ReactElement {
  return (
    <View style={calHeaderStyles.row}>
      {WEEKDAY_LABELS_AR.map((label) => (
        <View key={label} style={calHeaderStyles.cell}>
          <Text style={calHeaderStyles.text}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const calHeaderStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center' },
  text: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
});

// ─── Filter Drawer ────────────────────────────────────────────────────────────

function FilterDrawer({
  visible,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
}): ReactElement {
  const [local, setLocal] = useState<FilterState>(filters);

  useEffect(() => { if (visible) setLocal(filters); }, [visible, filters]);

  const DISTANCES = [null, 5, 10, 25, 50];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={drawerStyles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق" />
      <View style={drawerStyles.sheet}>
        <View style={drawerStyles.handle} />
        <Text style={drawerStyles.title}>تصفية الفعاليات</Text>

        {/* Category */}
        <Text style={drawerStyles.sectionLabel}>التصنيف</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={drawerStyles.chipRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[drawerStyles.chip, local.category === cat && drawerStyles.chipActive]}
              onPress={() => setLocal((f) => ({ ...f, category: cat }))}
              accessibilityRole="button"
              accessibilityState={{ selected: local.category === cat }}
            >
              <Text style={[drawerStyles.chipText, local.category === cat && drawerStyles.chipTextActive]}>
                {CATEGORY_LABELS[cat] ?? cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Price */}
        <Text style={drawerStyles.sectionLabel}>السعر</Text>
        <View style={drawerStyles.priceRow}>
          {(['all', 'free', 'paid'] as PriceFilter[]).map((p) => {
            const labels: Record<PriceFilter, string> = { all: 'الكل', free: 'مجاني', paid: 'مدفوع' };
            return (
              <Pressable
                key={p}
                style={[drawerStyles.chip, local.priceFilter === p && drawerStyles.chipActive]}
                onPress={() => setLocal((f) => ({ ...f, priceFilter: p }))}
                accessibilityRole="button"
                accessibilityState={{ selected: local.priceFilter === p }}
              >
                <Text style={[drawerStyles.chipText, local.priceFilter === p && drawerStyles.chipTextActive]}>
                  {labels[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Distance */}
        <Text style={drawerStyles.sectionLabel}>المسافة الأقصى</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={drawerStyles.chipRow}>
          {DISTANCES.map((d) => (
            <Pressable
              key={String(d)}
              style={[drawerStyles.chip, local.maxDistanceKm === d && drawerStyles.chipActive]}
              onPress={() => setLocal((f) => ({ ...f, maxDistanceKm: d }))}
              accessibilityRole="button"
              accessibilityState={{ selected: local.maxDistanceKm === d }}
            >
              <Text style={[drawerStyles.chipText, local.maxDistanceKm === d && drawerStyles.chipTextActive]}>
                {d === null ? 'أي مسافة' : `${d} كم`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={drawerStyles.actions}>
          <Pressable
            style={[drawerStyles.btn, drawerStyles.resetBtn]}
            onPress={() => setLocal(DEFAULT_FILTERS)}
            accessibilityRole="button"
          >
            <Text style={drawerStyles.resetText}>إعادة تعيين</Text>
          </Pressable>
          <Pressable
            style={[drawerStyles.btn, drawerStyles.applyBtn]}
            onPress={() => { onChange(local); onClose(); }}
            accessibilityRole="button"
          >
            <Text style={drawerStyles.applyText}>تطبيق</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const drawerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 8 },
  chipRow: { flexGrow: 0 },
  priceRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginEnd: 6,
  },
  chipActive: { backgroundColor: COLORS.primaryXLight, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  resetBtn: { backgroundColor: COLORS.inputBg },
  applyBtn: { backgroundColor: COLORS.primary },
  resetText: { color: COLORS.textSecondary, fontWeight: '600' },
  applyText: { color: '#FFF', fontWeight: '700' },
});

// ─── Day events sheet ─────────────────────────────────────────────────────────

function _DayEventsSheet({
  isoStr,
  events,
  holidayName,
  onClose,
  onEventPress,
  onRsvp,
}: {
  isoStr: string;
  events: DiscoverEventType[];
  holidayName: string | null;
  onClose: () => void;
  onEventPress: (id: string) => void;
  onRsvp: (id: string, status: RsvpStatus) => void;
}): ReactElement {
  const [year, month, day] = isoStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const dateLabel = dateObj.toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hijriLabel = formatHijri(dateObj);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق" />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.dateLabel}>{dateLabel}</Text>
        <Text style={sheetStyles.hijriLabel}>{hijriLabel} هـ</Text>

        {holidayName && (
          <View style={sheetStyles.holidayBadge}>
            <Text style={sheetStyles.holidayText}>{holidayName} 🎉</Text>
          </View>
        )}

        {events.length === 0 ? (
          <View style={sheetStyles.empty}>
            <Text style={sheetStyles.emptyText}>{t('events.empty')}</Text>
          </View>
        ) : (
          <ScrollView style={sheetStyles.list} showsVerticalScrollIndicator={false}>
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                onPress={() => { onClose(); onEventPress(ev.id); }}
                onRsvp={onRsvp}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  dateLabel: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 2 },
  hijriLabel: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: 20, marginBottom: 8 },
  holidayBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 20,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  holidayText: { fontSize: 13, color: '#E65100', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  list: { flexGrow: 0 },
});

// ─── EventCalendarScreen ──────────────────────────────────────────────────────

export function EventCalendarScreen(): ReactElement {
  const router = useRouter();
  const client = useEventsClient();

  const iraqNow = nowIraq();
  const [displayYear, setDisplayYear] = useState(iraqNow.getUTCFullYear());
  const [displayMonth, setDisplayMonth] = useState(iraqNow.getUTCMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(isoDate(iraqNow));
  const [showHijri, setShowHijri] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Events data
  const [allEvents, setAllEvents] = useState<DiscoverEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Swipe animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const loadEvents = useCallback(
    async (year: number, month: number, isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      try {
        const firstDay = new Date(Date.UTC(year, month - 1, 1));
        const lastDay = new Date(Date.UTC(year, month, 0, 23, 59, 59));
        const res = await client.listEvents({
          query: {
            fromDate: firstDay.toISOString(),
            toDate: lastDay.toISOString(),
            limit: 50,
            ...(filters.category !== 'all' ? { category: filters.category as never } : {}),
          },
        });
        if (res.status === 200) {
          setAllEvents(res.body.items);
        }
      } catch {
        // silent; empty state shown
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, filters],
  );

  useEffect(() => {
    void loadEvents(displayYear, displayMonth);
  }, [displayYear, displayMonth, filters, loadEvents]);

  // Build event map keyed by yyyy-MM-dd
  const eventsByDate = useMemo<Map<string, DiscoverEventType[]>>(() => {
    const map = new Map<string, DiscoverEventType[]>();
    for (const ev of allEvents) {
      const d = toIraqDate(new Date(ev.startTime));
      const key = isoDate(d);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [allEvents]);

  const calendarCells = useMemo(
    () => buildCalendarGrid(displayYear, displayMonth),
    [displayYear, displayMonth],
  );

  // Swipe handler
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 15 && Math.abs(g.dy) < 30,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 40) return;
        const direction = g.dx < 0 ? 1 : -1; // swipe left = next month
        Animated.sequence([
          Animated.timing(slideAnim, { toValue: direction * -300, duration: 150, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]).start();
        setDisplayYear((y) => {
          setDisplayMonth((m) => {
            const newM = m + direction;
            if (newM > 12) { return 1; }
            if (newM < 1) { return 12; }
            return newM;
          });
          const targetM = displayMonth + direction;
          if (targetM > 12) return y + 1;
          if (targetM < 1) return y - 1;
          return y;
        });
      },
    }),
  ).current;

  const goToMonth = (delta: number) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: delta < 0 ? 300 : -300, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
    setDisplayMonth((m) => {
      const newM = m + delta;
      if (newM > 12) { setDisplayYear((y) => y + 1); return 1; }
      if (newM < 1) { setDisplayYear((y) => y - 1); return 12; }
      return newM;
    });
    setSelectedDate(null);
  };

  const monthLabel = new Date(Date.UTC(displayYear, displayMonth - 1, 1)).toLocaleDateString('ar-IQ', {
    month: 'long',
    year: 'numeric',
  });

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  const handleRsvp = useCallback(async (eventId: string, status: RsvpStatus) => {
    try {
      if (status === 'none') {
        await client.cancelRsvp({ params: { eventId: eventId as never } });
      } else {
        await client.rsvpEvent({ params: { eventId: eventId as never }, body: {} });
      }
    } catch {
      // optimistic; silent
    }
  }, [client]);

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('profile.back')}
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </Pressable>

        <Text style={styles.headerTitle}>{t('events.title')}</Text>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setShowHijri((v) => !v)}
            accessibilityRole="switch"
            accessibilityLabel="عرض التقويم الهجري"
            accessibilityState={{ checked: showHijri }}
          >
            <Text style={[styles.iconBtnText, showHijri && styles.iconBtnActive]}>هـ</Text>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setFilterDrawerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="تصفية"
          >
            <Text style={styles.iconBtnText}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Month navigator ────────────────────────────────────────────── */}
      <View style={styles.monthNav}>
        <Pressable
          style={styles.monthNavBtn}
          onPress={() => goToMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="الشهر السابق"
        >
          <Text style={styles.monthNavIcon}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const now = nowIraq();
            setDisplayYear(now.getUTCFullYear());
            setDisplayMonth(now.getUTCMonth() + 1);
            setSelectedDate(isoDate(now));
          }}
          accessibilityRole="button"
          accessibilityLabel="اليوم"
        >
          <Text style={styles.monthLabel}>{monthLabel}</Text>
        </Pressable>

        <Pressable
          style={styles.monthNavBtn}
          onPress={() => goToMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="الشهر القادم"
        >
          <Text style={styles.monthNavIcon}>‹</Text>
        </Pressable>
      </View>

      {/* ── Calendar grid ──────────────────────────────────────────────── */}
      <View style={styles.calendarCard}>
        <WeekdayHeaderRow />

        {loading ? (
          <View style={{ paddingVertical: 40 }}>
            <LoadingIndicator />
          </View>
        ) : (
          <Animated.View
            {...panResponder.panHandlers}
            style={{ transform: [{ translateX: slideAnim }] }}
          >
            {Array.from({ length: 6 }, (_, row) => (
              <View key={row} style={styles.weekRow}>
                {calendarCells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                  const evList = cell.isoStr ? (eventsByDate.get(cell.isoStr) ?? []) : [];
                  const dayCats = [...new Set(evList.map((e) => e.category))];
                  const holiday = cell.isoStr ? getHolidayForDate(cell.isoStr) : null;
                  return (
                    <CalendarDayCell
                      key={`${row}-${col}`}
                      cell={cell}
                      dayEvents={evList.length > 0 ? { count: evList.length, categories: dayCats } : null}
                      isSelected={cell.isoStr !== null && cell.isoStr === selectedDate}
                      holidayName={holiday}
                      showHijri={showHijri}
                      onPress={(iso) => setSelectedDate(iso === selectedDate ? null : iso)}
                    />
                  );
                })}
              </View>
            ))}
          </Animated.View>
        )}
      </View>

      {/* ── Selected day event list ─────────────────────────────────────── */}
      {selectedDate && (
        <ScrollView
          style={styles.dayList}
          contentContainerStyle={styles.dayListContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void loadEvents(displayYear, displayMonth, true); }}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Day header */}
          <View style={styles.dayHeader}>
            {(() => {
              const [y, mo, d] = selectedDate.split('-').map(Number);
              const dObj = new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
              const holiday = getHolidayForDate(selectedDate);
              return (
                <>
                  <Text style={styles.dayHeaderText}>
                    {dObj.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  {showHijri && (
                    <Text style={styles.dayHijriText}>{formatHijri(dObj)} هـ</Text>
                  )}
                  {holiday && (
                    <View style={styles.holidayRow}>
                      <Text style={styles.holidayText}>{holiday} 🎉</Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>

          {selectedEvents.length === 0 ? (
            <View style={sharedStyles.emptyContainer}>
              <Text style={sharedStyles.emptyText}>{t('events.empty')}</Text>
            </View>
          ) : (
            selectedEvents.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                onPress={() => router.push(`/discover/events/${ev.id}`)}
                onRsvp={handleRsvp}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ── Filter drawer ───────────────────────────────────────────────── */}
      <FilterDrawer
        visible={filterDrawerOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFilterDrawerOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#FFF', fontSize: 28, lineHeight: 32 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  iconBtnActive: { color: '#FFE082' },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  monthNavBtn: { padding: 8 },
  monthNavIcon: { fontSize: 22, color: COLORS.primary, fontWeight: '700' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },

  calendarCard: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 4,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  weekRow: { flexDirection: 'row', paddingHorizontal: 2 },

  dayList: { flex: 1 },
  dayListContent: { paddingTop: 8, paddingBottom: 80 },

  dayHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  dayHeaderText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  dayHijriText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  holidayRow: {
    marginTop: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  holidayText: { fontSize: 12, color: '#E65100', fontWeight: '600' },
});
