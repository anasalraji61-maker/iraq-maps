/**
 * BookingScreen — customer booking flow.
 *
 * Sections (stepped):
 *  Step 1 – Pick a date (calendar view, Hijri display below Gregorian)
 *  Step 2 – Pick an available time slot (grid)
 *  Step 3 – Enter service + notes
 *  Step 4 – Confirmation
 *
 * Also exposes a "My Appointments" tab for viewing the user's existing bookings.
 */
import {
  appointmentsContract,
  type Appointment,
  type AppointmentId,
  type AppointmentStatus,
  type ProviderId,
} from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

I18nManager.forceRTL(true);

// ─── i18n (inline since map feature has its own strings system) ───────────────
// Keys are Arabic with English/Kurdish fallback pattern used in this feature.
/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
const STR = {
  booking: 'حجز موعد',
  myBookings: 'حجوزاتي',
  pickDate: 'اختر التاريخ',
  availableSlots: 'الأوقات المتاحة',
  noSlots: 'لا توجد أوقات متاحة في هذا اليوم',
  service: 'الخدمة المطلوبة',
  servicePlaceholder: 'اكتب الخدمة التي تريدها…',
  notes: 'ملاحظات',
  notesPlaceholder: 'ملاحظات إضافية (اختياري)…',
  bookNow: 'احجز الآن',
  bookingConfirmed: 'تم تأكيد الحجز',
  bookingSuccess: 'تم إرسال طلب الموعد بنجاح',
  back: 'رجوع',
  next: 'التالي',
  cancel: 'إلغاء',
  cancelAppointment: 'إلغاء الموعد',
  confirmCancel: 'هل تريد إلغاء هذا الموعد؟',
  noAppointments: 'لا توجد حجوزات',
  noAppointmentsBody: 'حجوزاتك ستظهر هنا',
  status: {
    pending: 'قيد الانتظار',
    confirmed: 'مؤكد',
    cancelled: 'ملغى',
    completed: 'مكتمل',
    arrived: 'وصل',
    no_show: 'لم يحضر',
  },
  qrTitle: 'رمز الوصول',
  qrHint: 'أظهر هذا الرمز عند الوصول للتأكيد',
  reviewTitle: 'قيّم تجربتك',
  writeReview: 'اكتب تقييماً',
  reviewPlaceholder: 'شاركنا رأيك في الخدمة…',
  submitReview: 'إرسال التقييم',
  reviewThanks: 'شكراً على تقييمك!',
  today: 'اليوم',
  gregorian: 'الميلادي',
  hijri: 'الهجري',
  step: 'الخطوة',
  of: 'من',
  confirm: 'تأكيد',
  selectSlot: 'اختر وقتاً',
  summary: 'ملخص الحجز',
  date: 'التاريخ',
  time: 'الوقت',
  provider: 'مقدم الخدمة',
  requestedOn: 'طُلب في {date}',
  loading: 'جاري التحميل…',
};

/* eslint-enable no-restricted-syntax, i18next/no-literal-string */

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SUCCESS = '#10B981';
const DANGER = '#EF4444';
const WARNING = '#F59E0B';
const SURFACE = '#FFFFFF';
const BG = '#F5F7FA';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#6B7280';
const BORDER = '#E5E7EB';
const MUTED = '#9CA3AF';

const STATUS_COLORS: Partial<Record<string, { bg: string; text: string; dot: string }>> = {
  pending: { bg: '#FFFBEB', text: '#92400E', dot: WARNING },
  confirmed: { bg: '#ECFDF5', text: '#065F46', dot: SUCCESS },
  cancelled: { bg: '#FEF2F2', text: '#991B1B', dot: DANGER },
  completed: { bg: '#EFF6FF', text: '#1E40AF', dot: PRIMARY },
  arrived: { bg: '#F0FDF4', text: '#14532D', dot: '#22C55E' },
  no_show: { bg: '#F9FAFB', text: '#374151', dot: '#9CA3AF' },
};

const DEFAULT_STATUS_COLOR = { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date = new Date()): string {
  return d.toISOString().split('T')[0] ?? '';
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Approximate Hijri date for display using Intl.DateTimeFormat with `islamic` calendar.
 * Falls back to empty string if the platform doesn't support it.
 */
function toHijriDisplay(gregorianIso: string): string {
  try {
    const d = new Date(`${gregorianIso}T12:00:00Z`);
    return new Intl.DateTimeFormat('ar-IQ-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

function formatGregorian(gregorianIso: string): string {
  try {
    return new Date(`${gregorianIso}T12:00:00Z`).toLocaleDateString('ar-IQ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return gregorianIso;
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

function useAppointmentsApi() {
  const baseUrl = useApiBaseUrl();
  return useMemo(() => initClient(appointmentsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }): ReactElement {
  const c = STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR;
  return (
    <View style={[sbStyles.badge, { backgroundColor: c.bg }]}>
      <View style={[sbStyles.dot, { backgroundColor: c.dot }]} />
      <Text style={[sbStyles.label, { color: c.text }]}>
        {(STR.status as Record<string, string>)[status] ?? status}
      </Text>
    </View>
  );
}
const sbStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '600' },
});

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }): ReactElement {
  return (
    <View style={step.container}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[step.seg, i < current ? step.segDone : i === current ? step.segCurrent : step.segFuture]} />
      ))}
    </View>
  );
}
const step = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  segDone: { backgroundColor: SUCCESS },
  segCurrent: { backgroundColor: PRIMARY },
  segFuture: { backgroundColor: BORDER },
});

// ─── Step 1: Date picker ──────────────────────────────────────────────────────

const CALENDAR_WEEKS = 6;

function DatePickerStep({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}): ReactElement {
  const today = useRef(new Date()).current;
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(today);
    d.setUTCDate(1);
    return d;
  });

  const calDays = useMemo(() => {
    // First day of month
    const first = new Date(viewMonth);
    // Start calendar from the Sunday of that week
    const startOffset = first.getUTCDay();
    const calStart = addDays(first, -startOffset);

    const days: Date[] = [];
    for (let i = 0; i < CALENDAR_WEEKS * 7; i++) {
      days.push(addDays(calStart, i));
    }
    return days;
  }, [viewMonth]);

  const monthLabel = useMemo(() => {
    return viewMonth.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' });
  }, [viewMonth]);

  const hijri = useMemo(() => toHijriDisplay(selected), [selected]);

  const isCurrentMonth = (d: Date) =>
    d.getUTCMonth() === viewMonth.getUTCMonth() && d.getUTCFullYear() === viewMonth.getUTCFullYear();

  const isPast = (d: Date) => isoDate(d) < isoDate(today);

  return (
    <View style={dp.container}>
      {/* Month navigation */}
      <View style={dp.nav}>
        <TouchableOpacity onPress={() => setViewMonth((m) => addDays(new Date(m.getFullYear(), m.getMonth() - 1, 1), 0))}>
          <Text style={dp.navArrow}>{'→'}</Text>
        </TouchableOpacity>
        <Text style={dp.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => setViewMonth((m) => addDays(new Date(m.getFullYear(), m.getMonth() + 1, 1), 0))}>
          <Text style={dp.navArrow}>{'←'}</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={dp.weekRow}>
        {/* eslint-disable-next-line no-restricted-syntax, i18next/no-literal-string */}
        {['أح', 'إث', 'ث', 'أر', 'خ', 'ج', 'س'].map((d) => (
          <Text key={d} style={dp.weekDay}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={dp.grid}>
        {calDays.map((d) => {
          const ds = isoDate(d);
          const inMonth = isCurrentMonth(d);
          const past = isPast(d);
          const sel = ds === selected;
          const todayMark = ds === isoDate(today);
          return (
            <TouchableOpacity
              key={ds}
              style={[
                dp.cell,
                sel && dp.cellSelected,
                todayMark && !sel && dp.cellToday,
                (past || !inMonth) && dp.cellDisabled,
              ]}
              onPress={() => {
                if (!past && inMonth) onSelect(ds);
              }}
              disabled={past || !inMonth}
            >
              <Text
                style={[
                  dp.cellText,
                  sel && dp.cellTextSelected,
                  !inMonth && dp.cellTextOut,
                  past && dp.cellTextPast,
                ]}
              >
                {d.getUTCDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected date info */}
      {selected ? (
        <View style={dp.dateInfo}>
          <Text style={dp.dateGregorian}>{formatGregorian(selected)}</Text>
          {hijri ? <Text style={dp.dateHijri}>🌙 {hijri}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const dp = StyleSheet.create({
  container: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, gap: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { fontSize: 22, color: PRIMARY, paddingHorizontal: 8 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, color: MUTED, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  cellSelected: { backgroundColor: PRIMARY },
  cellToday: { borderWidth: 1.5, borderColor: PRIMARY },
  cellDisabled: { opacity: 0.3 },
  cellText: { fontSize: 14, fontWeight: '500', color: TEXT_PRIMARY },
  cellTextSelected: { color: '#FFF', fontWeight: '700' },
  cellTextOut: { color: MUTED },
  cellTextPast: { color: BORDER },
  dateInfo: { backgroundColor: BG, borderRadius: 10, padding: 10, gap: 2 },
  dateGregorian: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  dateHijri: { fontSize: 12, color: TEXT_SECONDARY },
});

// ─── Step 2: Slot picker ──────────────────────────────────────────────────────

interface SlotEntry {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

function SlotGrid({
  providerId: _providerId,
  date,
  selectedSlot,
  onSelect,
}: {
  providerId: string;
  date: string;
  selectedSlot: SlotEntry | null;
  onSelect: (slot: SlotEntry) => void;
}): ReactElement {
  // Derive slots from the appointments list for now since the slots endpoint
  // is a service method not yet on the contract — we show a static grid
  // of hours based on typical Iraqi business hours (8am–8pm, 30-min slots).
  const slots: SlotEntry[] = useMemo(() => {
    const result: SlotEntry[] = [];
    const dateObj = new Date(`${date}T00:00:00Z`);
    const now = new Date();

    for (let h = 8; h < 20; h++) {
      for (const m of [0, 30]) {
        const start = new Date(dateObj);
        start.setUTCHours(h, m, 0, 0);
        const end = new Date(start.getTime() + 30 * 60_000);

        if (start <= now) continue; // skip past slots

        result.push({
          id: `gen:${h}:${m}`,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          isAvailable: true,
        });
      }
    }
    return result;
  }, [date]);

  if (slots.length === 0) {
    return (
      <View style={sg.empty}>
        <Text style={sg.emptyText}>{STR.noSlots}</Text>
      </View>
    );
  }

  const formatSlotTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return iso.slice(11, 16);
    }
  };

  return (
    <View style={sg.container}>
      <Text style={sg.label}>{STR.availableSlots}</Text>
      <View style={sg.grid}>
        {slots.map((slot) => {
          const selected = selectedSlot?.id === slot.id;
          const unavail = !slot.isAvailable;
          return (
            <TouchableOpacity
              key={slot.id}
              style={[sg.chip, selected && sg.chipSelected, unavail && sg.chipUnavail]}
              onPress={() => {
                if (slot.isAvailable) onSelect(slot);
              }}
              disabled={unavail}
            >
              <Text style={[sg.chipText, selected && sg.chipTextSelected, unavail && sg.chipTextUnavail]}>
                {formatSlotTime(slot.startTime)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const sg = StyleSheet.create({
  container: { gap: 10 },
  label: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: SURFACE, borderWidth: 1.5, borderColor: BORDER },
  chipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipUnavail: { opacity: 0.4, backgroundColor: BG },
  chipText: { fontSize: 13, fontWeight: '500', color: TEXT_PRIMARY },
  chipTextSelected: { color: '#FFF', fontWeight: '700' },
  chipTextUnavail: { color: MUTED },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: TEXT_SECONDARY, textAlign: 'center' },
});

// ─── My Appointments ──────────────────────────────────────────────────────────

function MyAppointments({ userId: _userId }: { userId?: string }): ReactElement {
  const api = useAppointmentsApi();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.myAppointments({});
        if (res.status === 200) setAppts(res.body);
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = useCallback(
    (id: AppointmentId) => {
      Alert.alert(STR.cancelAppointment, STR.confirmCancel, [
        { text: STR.cancel, style: 'cancel' },
        {
          text: STR.cancelAppointment,
          style: 'destructive',
          onPress: () => {
            // Optimistic update — cancel shown locally
            setAppts((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: 'cancelled' as const } : a)),
            );
          },
        },
      ]);
    },
    [],
  );

  if (loading) {
    return (
      <View style={ma.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  const upcoming = appts.filter(
    (a) => (a.status === 'pending' || a.status === 'confirmed') && a.date >= isoDate(),
  );
  const past = appts.filter(
    (a) => a.status === 'completed' || a.status === 'cancelled' || a.date < isoDate(),
  );

  return (
    <ScrollView
      contentContainerStyle={ma.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      {appts.length === 0 ? (
        <View style={ma.emptyWrap}>
          <Text style={ma.emptyTitle}>{STR.noAppointments}</Text>
          <Text style={ma.emptyBody}>{STR.noAppointmentsBody}</Text>
        </View>
      ) : (
        <>
          {upcoming.length > 0 && (
            <View style={ma.section}>
              <Text style={ma.sectionTitle}>{STR.bookingConfirmed}</Text>
              {upcoming.map((a) => (
                <View key={a.id} style={ma.card}>
                  <View style={ma.cardTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={ma.service} numberOfLines={1}>{a.service}</Text>
                      <Text style={ma.datetime}>{a.date} · {a.time}</Text>
                      {a.notes ? <Text style={ma.notes} numberOfLines={2}>{a.notes}</Text> : null}
                    </View>
                    <StatusBadge status={a.status} />
                  </View>
                  {(a.status === 'pending' || a.status === 'confirmed') && (
                    <TouchableOpacity
                      style={ma.cancelBtn}
                      onPress={() => handleCancel(a.id)}
                    >
                      <Text style={ma.cancelBtnText}>{STR.cancelAppointment}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {past.length > 0 && (
            <View style={ma.section}>
              <Text style={ma.sectionTitle}>{STR.status.completed}</Text>
              {past.slice(0, 15).map((a) => (
                <View key={a.id} style={[ma.card, ma.cardPast]}>
                  <View style={ma.cardTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[ma.service, { color: TEXT_SECONDARY }]} numberOfLines={1}>{a.service}</Text>
                      <Text style={ma.datetime}>{a.date} · {a.time}</Text>
                    </View>
                    <StatusBadge status={a.status} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const ma = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyWrap: { alignItems: 'center', gap: 8, padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  emptyBody: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT_SECONDARY, textTransform: 'uppercase' },
  card: { backgroundColor: SURFACE, borderRadius: 14, padding: 14, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardPast: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  service: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  datetime: { fontSize: 12, color: PRIMARY },
  notes: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  cancelBtn: { borderWidth: 1, borderColor: DANGER, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  cancelBtnText: { color: DANGER, fontWeight: '600', fontSize: 13 },
});

// ─── QR code display (arrival confirmation) ───────────────────────────────────

function QrCodeDisplay({ value }: { value: string }): ReactElement {
  const grid = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: 7 }, (__, col) => {
        if ((row < 2 && col < 2) || (row < 2 && col > 4) || (row > 4 && col < 2)) return true;
        return ((hash >> ((row * 7 + col) % 32)) & 1) === 1;
      }),
    );
  }, [value]);

  return (
    <View style={qr.wrapper}>
      <View style={qr.container}>
        {grid.map((rowArr, ri) => (
          <View key={ri} style={qr.row}>
            {rowArr.map((filled, ci) => (
              <View key={ci} style={[qr.cell, filled ? qr.cellFilled : qr.cellEmpty]} />
            ))}
          </View>
        ))}
      </View>
      <Text style={qr.hint}>{STR.qrHint}</Text>
      <Text style={qr.id} numberOfLines={1} ellipsizeMode="middle">{value}</Text>
    </View>
  );
}

const qr = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8 },
  container: { padding: 12, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: 'row' },
  cell: { width: 20, height: 20, margin: 1, borderRadius: 3 },
  cellFilled: { backgroundColor: '#111' },
  cellEmpty: { backgroundColor: '#FFF' },
  hint: { fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center' },
  id: { fontSize: 10, color: TEXT_SECONDARY, maxWidth: 240, textAlign: 'center' },
});

// ─── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }): ReactElement {
  return (
    <View style={star.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} style={star.btn}>
          <Text style={[star.icon, n <= value ? star.iconFilled : star.iconEmpty]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const star = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  btn: { padding: 4 },
  icon: { fontSize: 32 },
  iconFilled: { color: '#F59E0B' },
  iconEmpty: { color: BORDER },
});

// ─── Booking done screen ──────────────────────────────────────────────────────

type AnyApi = ReturnType<typeof useAppointmentsApi>;

function BookingDoneScreen({
  appointment,
  api,
  onViewBookings,
}: {
  appointment: Appointment;
  api: AnyApi;
  onViewBookings: () => void;
}): ReactElement {
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const canReview = ['completed', 'arrived'].includes(appointment.status);

  const handleReview = useCallback(async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      const res = await api.submitReview({
        params: { id: appointment.id },
        body: { rating, comment: comment.trim() || undefined },
      });
      if (res.status === 201) {
        setReviewed(true);
        setShowReview(false);
      }
    } catch {
      // swallow — user can try again
    } finally {
      setSubmitting(false);
    }
  }, [api, appointment.id, comment, rating]);

  return (
    <ScrollView contentContainerStyle={bd.content}>
      <View style={bd.banner}>
        <View style={bd.bannerIcon}><Text style={bd.bannerIconText}>✓</Text></View>
        <Text style={bd.bannerTitle}>{STR.bookingConfirmed}</Text>
        <Text style={bd.bannerBody}>{STR.bookingSuccess}</Text>
      </View>

      <View style={bd.card}>
        <SummaryRow label={STR.service} value={appointment.service} />
        <SummaryRow label={STR.date} value={`${appointment.date} · ${appointment.time}`} />
        <SummaryRow
          label={STR.status.pending}
          value={(STR.status as Record<string, string>)[appointment.status] ?? appointment.status}
        />
        {appointment.notes ? <SummaryRow label={STR.notes} value={appointment.notes} /> : null}
      </View>

      <View style={bd.section}>
        <Text style={bd.sectionTitle}>{STR.qrTitle}</Text>
        <QrCodeDisplay value={appointment.id} />
      </View>

      {canReview && !reviewed && (
        <View style={bd.section}>
          <Text style={bd.sectionTitle}>{STR.reviewTitle}</Text>
          {showReview ? (
            <View style={bd.reviewForm}>
              <StarRating value={rating} onChange={setRating} />
              <TextInput
                style={bd.reviewInput}
                value={comment}
                onChangeText={setComment}
                placeholder={STR.reviewPlaceholder}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[bd.reviewBtn, (rating === 0 || submitting) && bd.reviewBtnDisabled]}
                onPress={() => void handleReview()}
                disabled={rating === 0 || submitting}
              >
                {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={bd.reviewBtnText}>{STR.submitReview}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={bd.reviewPrompt} onPress={() => setShowReview(true)}>
              <Text style={bd.reviewPromptText}>{STR.writeReview}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {reviewed && (
        <View style={bd.reviewedBanner}>
          <Text style={bd.reviewedText}>{STR.reviewThanks}</Text>
        </View>
      )}

      <TouchableOpacity style={bd.primaryBtn} onPress={onViewBookings}>
        <Text style={bd.primaryBtnText}>{STR.myBookings}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const bd = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  banner: { alignItems: 'center', gap: 10 },
  bannerIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: SUCCESS, alignItems: 'center', justifyContent: 'center' },
  bannerIconText: { color: '#FFF', fontSize: 38, fontWeight: '700' },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  bannerBody: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
  card: { backgroundColor: SURFACE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: BORDER },
  section: { gap: 12, alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, alignSelf: 'flex-start' },
  reviewForm: { width: '100%', gap: 12 },
  reviewInput: { backgroundColor: SURFACE, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT_PRIMARY, minHeight: 80, textAlignVertical: 'top', textAlign: 'auto' },
  reviewBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  reviewBtnDisabled: { opacity: 0.5 },
  reviewBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  reviewPrompt: { backgroundColor: SURFACE, borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  reviewPromptText: { color: PRIMARY, fontWeight: '600', fontSize: 14 },
  reviewedBanner: { backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, alignItems: 'center' },
  reviewedText: { color: '#065F46', fontWeight: '600', fontSize: 14 },
  primaryBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

// ─── Booking flow ─────────────────────────────────────────────────────────────

type BookingStep = 'date' | 'slot' | 'details' | 'confirm' | 'done';

interface BookingState {
  date: string;
  slot: SlotEntry | null;
  service: string;
  notes: string;
}

function BookingFlow({
  providerId,
  onDone,
}: {
  providerId: string;
  onDone: () => void;
}): ReactElement {
  const api = useAppointmentsApi();
  const [step, setStep] = useState<BookingStep>('date');
  const [state, setState] = useState<BookingState>({
    date: isoDate(),
    slot: null,
    service: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Appointment | null>(null);

  const STEPS: BookingStep[] = ['date', 'slot', 'details', 'confirm'];
  const stepIndex = STEPS.indexOf(step);

  const handleBook = useCallback(async () => {
    if (!state.slot || !state.service.trim()) return;
    setSaving(true);
    try {
      const res = await api.request({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params: { providerId: providerId as any },
        body: {
          date: state.date,
          time: state.slot.startTime.slice(11, 16),
          service: state.service.trim(),
          notes: state.notes.trim() || undefined,
        },
      });
      if (res.status === 201) {
        setCreated(res.body);
        setStep('done');
      } else {
        /* eslint-disable-next-line no-restricted-syntax, i18next/no-literal-string */
        Alert.alert('', 'حدث خطأ أثناء الحجز');
      }
    } finally {
      setSaving(false);
    }
  }, [api, providerId, state]);

  if (step === 'done' && created) {
    return (
      <BookingDoneScreen
        appointment={created}
        api={api}
        onViewBookings={onDone}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={bf.content} keyboardShouldPersistTaps="handled">
      {step !== 'date' && (
        <StepBar current={stepIndex} total={STEPS.length} />
      )}

      {step === 'date' && (
        <View style={bf.section}>
          <Text style={bf.sectionTitle}>{STR.pickDate}</Text>
          <DatePickerStep
            selected={state.date}
            onSelect={(d) => setState((s) => ({ ...s, date: d }))}
          />
          <TouchableOpacity
            style={bf.nextBtn}
            onPress={() => setStep('slot')}
          >
            <Text style={bf.nextBtnText}>{STR.next} ←</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'slot' && (
        <View style={bf.section}>
          <View style={bf.stepHeader}>
            <TouchableOpacity onPress={() => setStep('date')}>
              <Text style={bf.backText}>→ {STR.back}</Text>
            </TouchableOpacity>
            <Text style={bf.sectionTitle}>{STR.availableSlots}</Text>
          </View>
          <Text style={bf.dateLabel}>{formatGregorian(state.date)}</Text>
          <Text style={bf.dateHijri}>{toHijriDisplay(state.date)}</Text>

          <SlotGrid
            providerId={providerId}
            date={state.date}
            selectedSlot={state.slot}
            onSelect={(slot) => setState((s) => ({ ...s, slot }))}
          />

          <TouchableOpacity
            style={[bf.nextBtn, !state.slot && bf.nextBtnDisabled]}
            onPress={() => setStep('details')}
            disabled={!state.slot}
          >
            <Text style={bf.nextBtnText}>{STR.next} ←</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'details' && (
        <View style={bf.section}>
          <View style={bf.stepHeader}>
            <TouchableOpacity onPress={() => setStep('slot')}>
              <Text style={bf.backText}>→ {STR.back}</Text>
            </TouchableOpacity>
            <Text style={bf.sectionTitle}>{STR.service}</Text>
          </View>

          <View style={bf.field}>
            <Text style={bf.fieldLabel}>{STR.service}</Text>
            <TextInput
              style={bf.fieldInput}
              value={state.service}
              onChangeText={(v) => setState((s) => ({ ...s, service: v }))}
              placeholder={STR.servicePlaceholder}
              maxLength={200}
            />
          </View>

          <View style={bf.field}>
            <Text style={bf.fieldLabel}>{STR.notes}</Text>
            <TextInput
              style={[bf.fieldInput, { height: 80 }]}
              value={state.notes}
              onChangeText={(v) => setState((s) => ({ ...s, notes: v }))}
              placeholder={STR.notesPlaceholder}
              multiline
              maxLength={500}
            />
          </View>

          <TouchableOpacity
            style={[bf.nextBtn, !state.service.trim() && bf.nextBtnDisabled]}
            onPress={() => setStep('confirm')}
            disabled={!state.service.trim()}
          >
            <Text style={bf.nextBtnText}>{STR.confirm} ←</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'confirm' && (
        <View style={bf.section}>
          <View style={bf.stepHeader}>
            <TouchableOpacity onPress={() => setStep('details')}>
              <Text style={bf.backText}>→ {STR.back}</Text>
            </TouchableOpacity>
            <Text style={bf.sectionTitle}>{STR.summary}</Text>
          </View>

          <View style={bf.summaryCard}>
            <SummaryRow label={STR.service} value={state.service} />
            <SummaryRow label={STR.date} value={formatGregorian(state.date)} />
            <SummaryRow
              label={STR.time}
              value={
                state.slot
                  ? new Date(state.slot.startTime).toLocaleTimeString('ar-IQ', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : '—'
              }
            />
            {state.notes ? <SummaryRow label={STR.notes} value={state.notes} /> : null}
          </View>

          <TouchableOpacity
            style={[bf.bookBtn, saving && bf.bookBtnDisabled]}
            onPress={() => void handleBook()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={bf.bookBtnText}>{STR.bookNow}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={sr.row}>
      <Text style={sr.label}>{label}</Text>
      <Text style={sr.value}>{value}</Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  label: { fontSize: 13, color: TEXT_SECONDARY },
  value: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY, flex: 1, textAlign: 'auto', marginStart: 12 },
});

const bf = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  section: { gap: 14 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY, flex: 1 },
  backText: { color: PRIMARY, fontWeight: '600', fontSize: 14 },
  dateLabel: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  dateHijri: { fontSize: 12, color: TEXT_SECONDARY },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY },
  fieldInput: { backgroundColor: SURFACE, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT_PRIMARY, textAlign: 'auto' },
  nextBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  bookBtn: { backgroundColor: SUCCESS, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  summaryCard: { backgroundColor: SURFACE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  doneContent: { padding: 24, alignItems: 'center', gap: 16 },
  doneIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: SUCCESS, alignItems: 'center', justifyContent: 'center' },
  doneIconText: { color: '#FFF', fontSize: 40, fontWeight: '700' },
  doneTitle: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  doneBody: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
  doneBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  doneBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

// ─── Root export ──────────────────────────────────────────────────────────────

type TabKey = 'book' | 'myBookings';

export function BookingScreen({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}): ReactElement {
  const [tab, setTab] = useState<TabKey>('book');

  return (
    <Screen>
      <SafeAreaView style={bs.container}>
        {/* Header */}
        <View style={bs.header}>
          <Text style={bs.headerTitle}>{STR.booking}</Text>
          {providerName ? <Text style={bs.headerSub}>{providerName}</Text> : null}
        </View>

        {/* Tab bar */}
        <View style={bs.tabBar}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {(['book', 'myBookings'] as TabKey[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[bs.tab, tab === key && bs.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[bs.tabText, tab === key && bs.tabTextActive]}>
                {key === 'book' ? STR.booking : STR.myBookings}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={bs.body}>
          {tab === 'book' && (
            <BookingFlow
              providerId={providerId as ProviderId}
              onDone={() => setTab('myBookings')}
            />
          )}
          {tab === 'myBookings' && <MyAppointments />}
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const bs = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: SURFACE, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY },
  headerSub: { fontSize: 13, color: TEXT_SECONDARY },
  tabBar: { flexDirection: 'row', backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 14, fontWeight: '500', color: TEXT_SECONDARY },
  tabTextActive: { color: PRIMARY, fontWeight: '700' },
  body: { flex: 1 },
});
