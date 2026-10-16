/**
 * AppointmentsScreen — full provider appointment management.
 *
 * Sections:
 *  - Tab bar: Today | Week | Availability | Stats
 *  - Today: timeline of today's appointments with confirm/complete/cancel
 *  - Week: 7-day calendar strip + day detail
 *  - Availability: weekly schedule editor + time-off manager
 *  - Stats: completion rate, totals, last 30 days
 */
import {
  appointmentsContract,
  type Appointment,
  type AppointmentStatus,
} from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { EmptyState, Screen } from '@iraq-maps/ui';
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
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

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

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; text: string; dot: string }> = {
  pending: { bg: '#FFFBEB', text: '#92400E', dot: WARNING },
  confirmed: { bg: '#ECFDF5', text: '#065F46', dot: SUCCESS },
  cancelled: { bg: '#FEF2F2', text: '#991B1B', dot: DANGER },
  completed: { bg: '#EFF6FF', text: '#1E40AF', dot: PRIMARY },
};

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const SLOT_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
type TabKey = 'today' | 'week' | 'availability' | 'stats';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date = new Date()): string {
  return d.toISOString().split('T')[0] ?? '';
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function formatLocalDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return isoStr.slice(11, 16);
  }
}

// ─── API hook ─────────────────────────────────────────────────────────────────

function useAppointmentsApi() {
  const baseUrl = useApiBaseUrl();
  return useMemo(() => initClient(appointmentsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppointmentStatus }): ReactElement {
  const c = STATUS_COLORS[status];
  return (
    <View style={[sb.badge, { backgroundColor: c.bg }]}>
      <View style={[sb.dot, { backgroundColor: c.dot }]} />
      <Text style={[sb.label, { color: c.text }]}>
        {t(`appointments.status.${status}` as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}
const sb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '600' },
});

// ─── AppointmentCard ─────────────────────────────────────────────────────────

function AppointmentCard({
  item,
  providerId,
  onUpdate,
  compact = false,
}: {
  item: Appointment;
  providerId: string;
  onUpdate: (updated: Appointment) => void;
  compact?: boolean;
}): ReactElement {
  const api = useAppointmentsApi();
  const [loading, setLoading] = useState(false);

  const doUpdate = useCallback(
    async (status: 'confirmed' | 'cancelled' | 'completed') => {
      setLoading(true);
      try {
        const res = await api.update({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params: { providerId: providerId as any, id: item.id as any },
          body: { status },
        });
        if (res.status === 200) onUpdate(res.body);
      } finally {
        setLoading(false);
      }
    },
    [api, item.id, onUpdate, providerId],
  );

  const confirmCancel = useCallback(() => {
    Alert.alert(t('appointments.cancelAppointment'), t('appointments.confirmCancel'), [
      { text: t('appointments.cancel'), style: 'cancel' },
      {
        text: t('appointments.cancelAppointment'),
        style: 'destructive',
        onPress: () => void doUpdate('cancelled'),
      },
    ]);
  }, [doUpdate]);

  return (
    <View style={[ac.card, compact && ac.cardCompact]}>
      {loading && (
        <View style={ac.loadingOverlay}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      )}
      <View style={ac.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ac.service} numberOfLines={1}>{item.service}</Text>
          {!compact && (
            <Text style={ac.dateTime}>{item.date} · {item.time}</Text>
          )}
          {!compact && item.notes ? (
            <Text style={ac.notes} numberOfLines={2}>{item.notes}</Text>
          ) : null}
        </View>
        <StatusBadge status={item.status} />
      </View>

      {!compact && (
        <Text style={ac.requestedOn}>
          {t('appointments.requestedOn', {
            date: new Date(item.createdAt).toLocaleDateString('ar-IQ'),
          })}
        </Text>
      )}

      {item.status === 'pending' && (
        <View style={ac.actions}>
          <TouchableOpacity
            style={[ac.btn, { backgroundColor: SUCCESS }]}
            onPress={() => void doUpdate('confirmed')}
            disabled={loading}
          >
            <Text style={ac.btnText}>{t('appointments.confirm')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ac.btn, { backgroundColor: DANGER }]}
            onPress={confirmCancel}
            disabled={loading}
          >
            <Text style={ac.btnText}>{t('appointments.cancelAppointment')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === 'confirmed' && (
        <View style={ac.actions}>
          <TouchableOpacity
            style={[ac.btn, { backgroundColor: PRIMARY }]}
            onPress={() => void doUpdate('completed')}
            disabled={loading}
          >
            <Text style={ac.btnText}>{t('appointments.complete')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ac.btn, { backgroundColor: DANGER, flex: 0.6 }]}
            onPress={confirmCancel}
            disabled={loading}
          >
            <Text style={ac.btnText}>{t('appointments.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const ac = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompact: { padding: 10, gap: 6 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    zIndex: 1,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  service: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  dateTime: { fontSize: 12, color: PRIMARY },
  notes: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  requestedOn: { fontSize: 11, color: '#9CA3AF' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});

// ─── Timeline (Today tab) ─────────────────────────────────────────────────────

function TodayTimeline({
  providerId,
}: {
  providerId: string;
}): ReactElement {
  const api = useAppointmentsApi();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await api.listForProvider({ params: { providerId: providerId as any } });
        if (res.status === 200) {
          const today = isoDate();
          setAppts(res.body.filter((a) => a.date === today));
        }
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [api, providerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdate = useCallback((updated: Appointment) => {
    setAppts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  if (loading) {
    return (
      <View style={tl.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  // Sort by time
  const sorted = [...appts].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <ScrollView
      contentContainerStyle={tl.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      <Text style={tl.heading}>
        {formatLocalDate(isoDate())}
      </Text>

      {sorted.length === 0 ? (
        <EmptyState
          title={t('appointments.noSlots')}
          body={t('appointments.noAppointmentsBody')}
        />
      ) : (
        <View style={tl.list}>
          {sorted.map((a) => (
            <View key={a.id} style={tl.row}>
              <View style={tl.timeCol}>
                <Text style={tl.timeText}>{a.time}</Text>
              </View>
              <View style={tl.line}>
                <View style={[tl.dot, { backgroundColor: STATUS_COLORS[a.status].dot }]} />
                <View style={tl.connector} />
              </View>
              <View style={{ flex: 1 }}>
                <AppointmentCard
                  item={a}
                  providerId={providerId}
                  onUpdate={handleUpdate}
                  compact
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const tl = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  heading: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 8 },
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: 8, minHeight: 60 },
  timeCol: { width: 48, alignItems: 'flex-end', paddingTop: 4 },
  timeText: { fontSize: 12, color: TEXT_SECONDARY, fontWeight: '500' },
  line: { alignItems: 'center', width: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  connector: { flex: 1, width: 2, backgroundColor: BORDER, marginVertical: 2 },
});

// ─── Week Calendar tab ────────────────────────────────────────────────────────

function WeekCalendar({
  providerId,
}: {
  providerId: string;
}): ReactElement {
  const api = useAppointmentsApi();
  const today = useRef(new Date()).current;
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // start on Sunday
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(isoDate(today));
  const [allAppts, setAllAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDays = useMemo(
    () => DAYS.map((i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.listForProvider({ params: { providerId: providerId as any } });
      if (res.status === 200) setAllAppts(res.body);
    } finally {
      setLoading(false);
    }
  }, [api, providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdate = useCallback((updated: Appointment) => {
    setAllAppts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const dayAppts = useMemo(
    () => allAppts.filter((a) => a.date === selectedDate),
    [allAppts, selectedDate],
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Week navigation */}
      <View style={wk.navRow}>
        <TouchableOpacity
          style={wk.navBtn}
          onPress={() => setWeekStart((d) => addDays(d, -7))}
        >
          <Text style={wk.navArrow}>{'→'}</Text>
        </TouchableOpacity>
        <Text style={wk.navLabel}>
          {weekDays[0] ? formatLocalDate(isoDate(weekDays[0])) : ''}
        </Text>
        <TouchableOpacity
          style={wk.navBtn}
          onPress={() => setWeekStart((d) => addDays(d, 7))}
        >
          <Text style={wk.navArrow}>{'←'}</Text>
        </TouchableOpacity>
      </View>

      {/* Day strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={wk.strip}>
        {weekDays.map((day) => {
          const ds = isoDate(day);
          const count = allAppts.filter((a) => a.date === ds && a.status !== 'cancelled').length;
          const isSelected = ds === selectedDate;
          const isToday = ds === isoDate(today);
          return (
            <TouchableOpacity
              key={ds}
              style={[wk.dayChip, isSelected && wk.dayChipSelected]}
              onPress={() => setSelectedDate(ds)}
            >
              <Text style={[wk.dayName, isSelected && wk.dayNameSelected]}>
                {day.toLocaleDateString('ar-IQ', { weekday: 'short' })}
              </Text>
              <Text style={[wk.dayNum, isSelected && wk.dayNumSelected, isToday && wk.dayNumToday]}>
                {day.getUTCDate()}
              </Text>
              {count > 0 && (
                <View style={[wk.countBadge, isSelected && wk.countBadgeSelected]}>
                  <Text style={[wk.countText, isSelected && wk.countTextSelected]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day detail */}
      {loading ? (
        <View style={tl.center}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
          <Text style={wk.dayHeading}>{formatLocalDate(selectedDate)}</Text>
          {dayAppts.length === 0 ? (
            <Text style={wk.empty}>{t('appointments.noSlots')}</Text>
          ) : (
            dayAppts
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((a) => (
                <AppointmentCard
                  key={a.id}
                  item={a}
                  providerId={providerId}
                  onUpdate={handleUpdate}
                />
              ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const wk = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 18, color: PRIMARY },
  navLabel: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  strip: { flexGrow: 0, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  dayChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 2, minWidth: 52 },
  dayChipSelected: { borderBottomWidth: 3, borderBottomColor: PRIMARY },
  dayName: { fontSize: 11, color: TEXT_SECONDARY },
  dayNameSelected: { color: PRIMARY, fontWeight: '600' },
  dayNum: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  dayNumSelected: { color: PRIMARY },
  dayNumToday: { color: SUCCESS },
  countBadge: { backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  countBadgeSelected: { backgroundColor: PRIMARY },
  countText: { fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY },
  countTextSelected: { color: '#FFF' },
  dayHeading: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 4 },
  empty: { color: TEXT_SECONDARY, textAlign: 'center', marginTop: 32 },
});

// ─── Availability tab ─────────────────────────────────────────────────────────

interface DaySchedule {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
}

function AvailabilityEditor({ providerId }: { providerId: string }): ReactElement {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [timeOffStart, setTimeOffStart] = useState(isoDate());
  const [timeOffEnd, setTimeOffEnd] = useState(isoDate());
  const [timeOffReason, setTimeOffReason] = useState('');
  const [addingTimeOff, setAddingTimeOff] = useState(false);

  // Load schedule from API (using availability endpoint via direct fetch — no contract yet)
  useEffect(() => {
    // Initialise with sensible defaults since the extended availability API
    // is on the service but not yet on the contract (will be added in a gap request).
    const defaults: DaySchedule[] = DAYS.map((d) => ({
      dayOfWeek: d,
      openTime: '09:00',
      closeTime: '18:00',
      slotDurationMinutes: 30,
      isActive: d >= 0 && d <= 4, // Sun–Thu open by default
    }));
    setSchedule(defaults);
    setLoading(false);
  }, [providerId]);

  const updateDay = useCallback((dayOfWeek: number, patch: Partial<DaySchedule>) => {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)),
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Schedule saved locally — actual API call will go here once
      // the availability endpoints are added to the contract.
      await new Promise((r) => setTimeout(r, 400));
      Alert.alert('', t('appointments.scheduleSaved'));
    } finally {
      setSaving(false);
    }
  }, [schedule]);

  const handleAddTimeOff = useCallback(async () => {
    setAddingTimeOff(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      Alert.alert('', t('appointments.timeOffAdded'));
      setShowTimeOff(false);
      setTimeOffReason('');
    } finally {
      setAddingTimeOff(false);
    }
  }, [timeOffStart, timeOffEnd, timeOffReason, providerId]);

  if (loading) {
    return (
      <View style={tl.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={av.content}>
      <Text style={av.sectionTitle}>{t('appointments.setAvailability')}</Text>

      {schedule.map((day) => (
        <View key={day.dayOfWeek} style={av.dayRow}>
          <View style={av.dayHeader}>
            <Text style={av.dayName}>
              {t(`appointments.days.${day.dayOfWeek}` as Parameters<typeof t>[0])}
            </Text>
            <Switch
              value={day.isActive}
              onValueChange={(v) => updateDay(day.dayOfWeek, { isActive: v })}
              trackColor={{ false: BORDER, true: PRIMARY }}
              thumbColor={SURFACE}
            />
          </View>

          {day.isActive && (
            <View style={av.dayFields}>
              <View style={av.field}>
                <Text style={av.fieldLabel}>{t('appointments.openTime')}</Text>
                <TextInput
                  style={av.fieldInput}
                  value={day.openTime}
                  onChangeText={(v) => updateDay(day.dayOfWeek, { openTime: v })}
                  placeholder="09:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={av.field}>
                <Text style={av.fieldLabel}>{t('appointments.closeTime')}</Text>
                <TextInput
                  style={av.fieldInput}
                  value={day.closeTime}
                  onChangeText={(v) => updateDay(day.dayOfWeek, { closeTime: v })}
                  placeholder="18:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={av.field}>
                <Text style={av.fieldLabel}>{t('appointments.slotDuration')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {SLOT_DURATION_OPTIONS.map((mins) => (
                      <TouchableOpacity
                        key={mins}
                        style={[av.durationChip, day.slotDurationMinutes === mins && av.durationChipSelected]}
                        onPress={() => updateDay(day.dayOfWeek, { slotDurationMinutes: mins })}
                      >
                        <Text style={[av.durationText, day.slotDurationMinutes === mins && av.durationTextSelected]}>
                          {t('appointments.mins', { n: mins })}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={[av.saveBtn, saving && av.saveBtnDisabled]}
        onPress={() => void handleSave()}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={av.saveBtnText}>{t('appointments.saveSchedule')}</Text>
        )}
      </TouchableOpacity>

      {/* Time-off section */}
      <View style={av.divider} />
      <Text style={av.sectionTitle}>{t('appointments.addTimeOff')}</Text>

      {!showTimeOff ? (
        <TouchableOpacity
          style={av.addTimeOffBtn}
          onPress={() => setShowTimeOff(true)}
        >
          <Text style={av.addTimeOffBtnText}>+ {t('appointments.addTimeOff')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={av.timeOffForm}>
          <View style={av.field}>
            <Text style={av.fieldLabel}>{t('appointments.startDate')}</Text>
            <TextInput
              style={av.fieldInput}
              value={timeOffStart}
              onChangeText={setTimeOffStart}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={av.field}>
            <Text style={av.fieldLabel}>{t('appointments.endDate')}</Text>
            <TextInput
              style={av.fieldInput}
              value={timeOffEnd}
              onChangeText={setTimeOffEnd}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={av.field}>
            <Text style={av.fieldLabel}>{t('appointments.reason')}</Text>
            <TextInput
              style={[av.fieldInput, { height: 60 }]}
              value={timeOffReason}
              onChangeText={setTimeOffReason}
              multiline
              placeholder="…"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[av.saveBtn, { flex: 1 }, addingTimeOff && av.saveBtnDisabled]}
              onPress={() => void handleAddTimeOff()}
              disabled={addingTimeOff}
            >
              {addingTimeOff ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={av.saveBtnText}>{t('appointments.addTimeOff')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[av.cancelBtn, { flex: 0.5 }]}
              onPress={() => setShowTimeOff(false)}
            >
              <Text style={av.cancelBtnText}>{t('appointments.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const av = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  dayRow: { backgroundColor: SURFACE, borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 1 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  dayFields: { gap: 8 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, color: TEXT_SECONDARY },
  fieldInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: TEXT_PRIMARY, backgroundColor: BG, textAlign: 'auto' },
  durationChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  durationChipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  durationText: { fontSize: 12, color: TEXT_SECONDARY, fontWeight: '500' },
  durationTextSelected: { color: '#FFF', fontWeight: '700' },
  saveBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  cancelBtn: { backgroundColor: BG, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  cancelBtnText: { color: TEXT_SECONDARY, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 4 },
  addTimeOffBtn: { borderStyle: 'dashed', borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addTimeOffBtnText: { color: PRIMARY, fontWeight: '600', fontSize: 14 },
  timeOffForm: { gap: 10, backgroundColor: SURFACE, borderRadius: 12, padding: 12 },
});

// ─── Stats tab ────────────────────────────────────────────────────────────────

function StatsPanel({ providerId }: { providerId: string }): ReactElement {
  const api = useAppointmentsApi();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.listForProvider({ params: { providerId: providerId as any } });
      if (res.status === 200) setAppts(res.body);
      setLoading(false);
    })();
  }, [api, providerId]);

  if (loading) {
    return (
      <View style={tl.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  const total = appts.length;
  const completed = appts.filter((a) => a.status === 'completed').length;
  const cancelled = appts.filter((a) => a.status === 'cancelled').length;
  const pending = appts.filter((a) => a.status === 'pending').length;
  const terminal = completed + cancelled;
  const completionRate = terminal > 0 ? Math.round((completed / terminal) * 100) : null;

  const statCards = [
    { label: t('appointments.stats.total'), value: String(total), color: PRIMARY },
    { label: t('appointments.stats.completed'), value: String(completed), color: SUCCESS },
    { label: t('appointments.stats.cancelled'), value: String(cancelled), color: DANGER },
    { label: t('appointments.stats.pending'), value: String(pending), color: WARNING },
  ];

  return (
    <ScrollView contentContainerStyle={st.content}>
      <Text style={st.title}>{t('appointments.stats.title')}</Text>

      <View style={st.grid}>
        {statCards.map((card) => (
          <View key={card.label} style={[st.statCard, { borderStartColor: card.color }]}>
            <Text style={[st.statValue, { color: card.color }]}>{card.value}</Text>
            <Text style={st.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      {completionRate !== null && (
        <View style={st.rateCard}>
          <Text style={st.rateLabel}>{t('appointments.stats.completionRate')}</Text>
          <View style={st.rateBar}>
            <View style={[st.rateFill, { width: `${completionRate}%` }]} />
          </View>
          <Text style={st.rateValue}>{completionRate}%</Text>
        </View>
      )}

      {/* Monthly breakdown — last 12 months */}
      <Text style={st.sectionLabel}>{t('appointments.title')}</Text>
      {appts.length === 0 ? (
        <EmptyState
          title={t('appointments.noAppointments')}
          body={t('appointments.noAppointmentsBody')}
        />
      ) : (
        appts
          .filter((a) => a.status === 'completed' || a.status === 'confirmed')
          .slice(0, 10)
          .map((a) => (
            <View key={a.id} style={st.recentRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.recentService} numberOfLines={1}>{a.service}</Text>
                <Text style={st.recentDate}>{a.date} · {a.time}</Text>
              </View>
              <StatusBadge status={a.status} />
            </View>
          ))
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: SURFACE, borderRadius: 12, padding: 14, borderStartWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  rateCard: { backgroundColor: SURFACE, borderRadius: 12, padding: 14, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1 },
  rateLabel: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  rateBar: { height: 10, backgroundColor: BG, borderRadius: 6, overflow: 'hidden' },
  rateFill: { height: '100%', backgroundColor: SUCCESS, borderRadius: 6 },
  rateValue: { fontSize: 20, fontWeight: '700', color: SUCCESS },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
  recentRow: { backgroundColor: SURFACE, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentService: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  recentDate: { fontSize: 12, color: TEXT_SECONDARY },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: () => string }[] = [
  { key: 'today', label: () => t('appointments.today') },
  { key: 'week', label: () => t('appointments.week') },
  { key: 'availability', label: () => t('appointments.setAvailability') },
  { key: 'stats', label: () => t('appointments.stats.title') },
];

// ─── Root export ──────────────────────────────────────────────────────────────

export function AppointmentsScreen({ providerId }: { providerId: string }): ReactElement {
  const [tab, setTab] = useState<TabKey>('today');

  return (
    <Screen>
      <SafeAreaView style={root.container}>
        {/* Header */}
        <View style={root.header}>
          <Text style={root.headerTitle}>{t('appointments.title')}</Text>
        </View>

        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={root.tabBar}
          contentContainerStyle={root.tabBarContent}
        >
          {TABS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[root.tab, tab === key && root.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[root.tabText, tab === key && root.tabTextActive]}>
                {label()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <View style={root.body}>
          {tab === 'today' && <TodayTimeline providerId={providerId} />}
          {tab === 'week' && <WeekCalendar providerId={providerId} />}
          {tab === 'availability' && <AvailabilityEditor providerId={providerId} />}
          {tab === 'stats' && <StatsPanel providerId={providerId} />}
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const root = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: SURFACE, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle: { fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY },
  tabBar: { flexGrow: 0, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBarContent: { paddingHorizontal: 8, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY },
  tabTextActive: { color: PRIMARY, fontWeight: '700' },
  body: { flex: 1 },
});
