/**
 * BusinessHoursScreen — enhanced 7-day schedule editor.
 * Features: open/closed toggle, time pickers (from/to), split shifts (breaks),
 * copy-from-day, special holiday hours, specific-date overrides,
 * temporarily-closed toggle with message, and permanently-closed option.
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { Button } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  I18nManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#EF4444';
const WARN = '#D97706';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeSlot {
  from: string; // HH:MM
  to: string;   // HH:MM
}

export interface DaySchedule {
  open: boolean;
  slots: TimeSlot[]; // first slot is main shift, rest are breaks / extra shifts
}

export interface SpecialDay {
  id: string;
  date: string; // ISO YYYY-MM-DD
  note: string;
  schedule: DaySchedule;
}

export interface BusinessHoursState {
  days: DaySchedule[]; // 0=Sat … 6=Fri (Iraqi week)
  temporarilyClosed: boolean;
  temporaryMessage: string;
  permanentlyClosed: boolean;
  specialDays: SpecialDay[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const DAY_KEYS: Parameters<typeof t>[0][] = [
  'hours.day0', 'hours.day1', 'hours.day2', 'hours.day3', 'hours.day4', 'hours.day5', 'hours.day6',
];

function makeId(): string { return Math.random().toString(36).slice(2, 10); }

function validateTime(s: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

const DEFAULT_SCHEDULE: DaySchedule = { open: true, slots: [{ from: '09:00', to: '22:00' }] };
const CLOSED_SCHEDULE: DaySchedule = { open: false, slots: [{ from: '09:00', to: '22:00' }] };

const INITIAL_STATE: BusinessHoursState = {
  days: [
    { ...DEFAULT_SCHEDULE },
    { ...DEFAULT_SCHEDULE },
    { ...DEFAULT_SCHEDULE },
    { ...DEFAULT_SCHEDULE },
    { ...DEFAULT_SCHEDULE },
    { ...DEFAULT_SCHEDULE },
    { open: false, slots: [{ from: '09:00', to: '22:00' }] }, // Fri closed
  ],
  temporarilyClosed: false,
  temporaryMessage: '',
  permanentlyClosed: false,
  specialDays: [],
};

// ─── Time input ───────────────────────────────────────────────────────────────

function TimeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }): ReactElement {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState(false);

  useEffect(() => { setLocal(value); setError(false); }, [value]);

  const handleBlur = useCallback(() => {
    if (!local || validateTime(local)) {
      setError(false);
      onChange(local);
    } else {
      setError(true);
    }
  }, [local, onChange]);

  return (
    <TextInput
      style={[styles.timeInput, error && styles.timeInputError]}
      value={local}
      onChangeText={setLocal}
      onBlur={handleBlur}
      placeholder={placeholder ?? t('hours.timePlaceholder')}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

// ─── Slot row ─────────────────────────────────────────────────────────────────

function SlotRow({ slot, label, onChangeFrom, onChangeTo, onRemove, removable }: { slot: TimeSlot; label?: string; onChangeFrom: (v: string) => void; onChangeTo: (v: string) => void; onRemove?: () => void; removable: boolean }): ReactElement {
  return (
    <View style={styles.slotRow}>
      {label ? <Text style={styles.slotLabel}>{label}</Text> : null}
      <View style={styles.slotInputs}>
        <Text style={styles.slotFromLabel}>{t('hours.from')}</Text>
        <TimeInput value={slot.from} onChange={onChangeFrom} />
        <Text style={styles.slotFromLabel}>{t('hours.to')}</Text>
        <TimeInput value={slot.to} onChange={onChangeTo} />
        {removable && onRemove ? (
          <TouchableOpacity onPress={onRemove} style={styles.removeSlotBtn}>
            <Text style={styles.removeSlotBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── Day row ──────────────────────────────────────────────────────────────────

function DayRow({ dayIdx, schedule, onChange }: { dayIdx: number; schedule: DaySchedule; onChange: (s: DaySchedule) => void }): ReactElement {
  const setOpen = useCallback((v: boolean) => onChange({ ...schedule, open: v }), [schedule, onChange]);

  const setSlotFrom = useCallback((slotIdx: number, v: string) => {
    const slots = schedule.slots.map((sl, i) => i === slotIdx ? { ...sl, from: v } : sl);
    onChange({ ...schedule, slots });
  }, [schedule, onChange]);

  const setSlotTo = useCallback((slotIdx: number, v: string) => {
    const slots = schedule.slots.map((sl, i) => i === slotIdx ? { ...sl, to: v } : sl);
    onChange({ ...schedule, slots });
  }, [schedule, onChange]);

  const addBreak = useCallback(() => {
    onChange({ ...schedule, slots: [...schedule.slots, { from: '13:00', to: '14:00' }] });
  }, [schedule, onChange]);

  const removeSlot = useCallback((slotIdx: number) => {
    onChange({ ...schedule, slots: schedule.slots.filter((_, i) => i !== slotIdx) });
  }, [schedule, onChange]);

  return (
    <View style={[styles.dayRow, !schedule.open && styles.dayRowClosed]}>
      <View style={styles.dayRowHeader}>
        <Switch
          value={schedule.open}
          onValueChange={setOpen}
          trackColor={{ false: BORDER, true: PRIMARY }}
          thumbColor={SURFACE}
        />
        <Text style={[styles.dayName, !schedule.open && styles.dayNameClosed]}>{t(DAY_KEYS[dayIdx]!)}</Text>
        {!schedule.open && <Text style={styles.closedTag}>{t('hours.closed')}</Text>}
      </View>
      {schedule.open && (
        <>
          {schedule.slots.map((slot, i) => (
            <SlotRow
              key={i}
              slot={slot}
              label={i > 0 ? `${t('hours.breakFrom')} ${i}` : undefined}
              onChangeFrom={v => setSlotFrom(i, v)}
              onChangeTo={v => setSlotTo(i, v)}
              onRemove={() => removeSlot(i)}
              removable={i > 0}
            />
          ))}
          <TouchableOpacity style={styles.addBreakBtn} onPress={addBreak}>
            <Text style={styles.addBreakBtnText}>+ {t('hours.addBreak')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Copy modal ───────────────────────────────────────────────────────────────

function CopyDayModal({ visible, onApply, onCancel }: { visible: boolean; onApply: (fromDay: number, toDays: number[]) => void; onCancel: () => void }): ReactElement {
  const [fromDay, setFromDay] = useState(0);
  const [toDays, setToDays] = useState<number[]>([]);

  useEffect(() => { if (visible) { setFromDay(0); setToDays([]); } }, [visible]);

  const toggleTo = useCallback((d: number) => {
    setToDays(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d]);
  }, []);

  const handleApply = useCallback(() => {
    if (toDays.length === 0) { Alert.alert(t('hours.copyTo')); return; }
    onApply(fromDay, toDays);
  }, [fromDay, toDays, onApply]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>{t('hours.copyFrom')}</Text>
          <Text style={styles.fieldLabel}>{t('hours.copyFrom')}</Text>
          <View style={styles.dayPicker}>
            {DAY_KEYS.map((k, i) => (
              <TouchableOpacity key={i} style={[styles.dayChip, fromDay === i && styles.dayChipActive]} onPress={() => setFromDay(i)}>
                <Text style={[styles.dayChipText, fromDay === i && styles.dayChipTextActive]}>{t(k)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('hours.copyTo')}</Text>
          <View style={styles.dayPicker}>
            {DAY_KEYS.map((k, i) => {
              if (i === fromDay) return null;
              const sel = toDays.includes(i);
              return (
                <TouchableOpacity key={i} style={[styles.dayChip, sel && styles.dayChipActive]} onPress={() => toggleTo(i)}>
                  <Text style={[styles.dayChipText, sel && styles.dayChipTextActive]}>{t(k)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('hours.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleApply}><Text style={styles.saveBtnText}>{t('hours.copyApply')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Special day modal ────────────────────────────────────────────────────────

function SpecialDayModal({ visible, initial, onSave, onCancel }: { visible: boolean; initial: SpecialDay | null; onSave: (d: SpecialDay) => void; onCancel: () => void }): ReactElement {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState<DaySchedule>(DEFAULT_SCHEDULE);

  useEffect(() => {
    if (visible) {
      setDate(initial?.date ?? '');
      setNote(initial?.note ?? '');
      setSchedule(initial?.schedule ?? { ...DEFAULT_SCHEDULE, slots: [{ from: '09:00', to: '22:00' }] });
    }
  }, [visible, initial]);

  const handleSave = useCallback(() => {
    if (!date.trim()) { Alert.alert(t('hours.specialDate')); return; }
    onSave({ id: initial?.id ?? makeId(), date: date.trim(), note: note.trim(), schedule });
  }, [date, note, schedule, initial, onSave]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlayBg}>
        <View style={[styles.overlayCard, { maxHeight: '80%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.overlayTitle}>{t('hours.addSpecial')}</Text>
            <Text style={styles.fieldLabel}>{t('hours.specialDate')} (YYYY-MM-DD) *</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2024-12-25" keyboardType="numeric" />
            <Text style={styles.fieldLabel}>{t('hours.specialNote')}</Text>
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={t('hours.specialNote')} textAlign="right" />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('hours.open')}</Text>
              <Switch value={schedule.open} onValueChange={v => setSchedule(s => ({ ...s, open: v }))} trackColor={{ false: BORDER, true: PRIMARY }} thumbColor={SURFACE} />
            </View>
            {schedule.open && schedule.slots.map((slot, i) => (
              <SlotRow
                key={i}
                slot={slot}
                onChangeFrom={v => setSchedule(s => ({ ...s, slots: s.slots.map((sl, j) => j === i ? { ...sl, from: v } : sl) }))}
                onChangeTo={v => setSchedule(s => ({ ...s, slots: s.slots.map((sl, j) => j === i ? { ...sl, to: v } : sl) }))}
                onRemove={() => setSchedule(s => ({ ...s, slots: s.slots.filter((_, j) => j !== i) }))}
                removable={i > 0}
              />
            ))}
          </ScrollView>
          <View style={styles.overlayActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelBtnText}>{t('hours.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>{t('hours.save')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function BusinessHoursScreen(): ReactElement {
  const [state, setState] = useState<BusinessHoursState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [copyModal, setCopyModal] = useState(false);
  const [specialModal, setSpecialModal] = useState<{ visible: boolean; target: SpecialDay | null }>({ visible: false, target: null });

  const setDay = useCallback((i: number, s: DaySchedule) => {
    setState(prev => {
      const days = [...prev.days];
      days[i] = s;
      return { ...prev, days };
    });
  }, []);

  const handleCopy = useCallback((fromDay: number, toDays: number[]) => {
    const src = state.days[fromDay]!;
    setState(prev => {
      const days = [...prev.days];
      for (const d of toDays) { days[d] = { ...src, slots: src.slots.map(s => ({ ...s })) }; }
      return { ...prev, days };
    });
    setCopyModal(false);
    Alert.alert(t('hours.copyDone'));
  }, [state.days]);

  const handleSaveSpecial = useCallback((day: SpecialDay) => {
    setState(prev => {
      const existing = prev.specialDays.find(d => d.id === day.id);
      if (existing) return { ...prev, specialDays: prev.specialDays.map(d => d.id === day.id ? day : d) };
      return { ...prev, specialDays: [...prev.specialDays, day] };
    });
    setSpecialModal({ visible: false, target: null });
  }, []);

  const handleRemoveSpecial = useCallback((id: string) => {
    setState(prev => ({ ...prev, specialDays: prev.specialDays.filter(d => d.id !== id) }));
  }, []);

  const handlePermanentlyClosed = useCallback(() => {
    Alert.alert(t('hours.permanentlyClosed'), t('hours.permanentlyClosedConfirm'), [
      { text: t('hours.cancel'), style: 'cancel' },
      { text: t('hours.permanentlyClosed'), style: 'destructive', onPress: () => setState(prev => ({ ...prev, permanentlyClosed: true })) },
    ]);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    Alert.alert(t('hours.saved'));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.screenTitle}>{t('hours.title')}</Text>

        {/* Permanently closed banner */}
        {state.permanentlyClosed && (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerText}>{t('hours.permanentlyClosed')}</Text>
            <TouchableOpacity onPress={() => setState(prev => ({ ...prev, permanentlyClosed: false }))}>
              <Text style={styles.closedBannerUndo}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Temporarily closed */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('hours.temporarilyClosed')}</Text>
              {state.temporarilyClosed && (
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={state.temporaryMessage}
                  onChangeText={v => setState(prev => ({ ...prev, temporaryMessage: v }))}
                  placeholder={t('hours.temporaryMessage')}
                  textAlign="right"
                />
              )}
            </View>
            <Switch
              value={state.temporarilyClosed}
              onValueChange={v => setState(prev => ({ ...prev, temporarilyClosed: v }))}
              trackColor={{ false: BORDER, true: WARN }}
              thumbColor={SURFACE}
            />
          </View>
        </View>

        {/* Copy day shortcut */}
        <TouchableOpacity style={styles.copyBtn} onPress={() => setCopyModal(true)}>
          <Text style={styles.copyBtnText}>📋 {t('hours.copyFrom')}</Text>
        </TouchableOpacity>

        {/* 7-day schedule */}
        <View style={styles.card}>
          {state.days.map((day, i) => (
            <View key={i} style={i < state.days.length - 1 ? styles.dayDivider : undefined}>
              <DayRow dayIdx={i} schedule={day} onChange={s => setDay(i, s)} />
            </View>
          ))}
        </View>

        {/* Special hours */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('hours.specialHours')}</Text>
          <TouchableOpacity style={styles.addSpecialBtn} onPress={() => setSpecialModal({ visible: true, target: null })}>
            <Text style={styles.addSpecialBtnText}>+ {t('hours.addSpecial')}</Text>
          </TouchableOpacity>
        </View>

        {state.specialDays.length === 0 ? (
          <Text style={styles.noSpecial}>{t('hours.noSpecial')}</Text>
        ) : (
          <View style={styles.card}>
            {state.specialDays.map(d => (
              <View key={d.id} style={styles.specialDayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.specialDayDate}>{d.date}</Text>
                  {d.note ? <Text style={styles.specialDayNote}>{d.note}</Text> : null}
                  <Text style={styles.specialDayStatus}>
                    {d.schedule.open
                      ? `${d.schedule.slots[0]?.from ?? '?'} – ${d.schedule.slots[0]?.to ?? '?'}`
                      : t('hours.closed')}
                  </Text>
                </View>
                <View style={styles.specialDayActions}>
                  <TouchableOpacity onPress={() => setSpecialModal({ visible: true, target: d })} style={styles.specialDayBtn}>
                    <Text style={{ color: PRIMARY, fontSize: 13 }}>✎</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveSpecial(d.id)} style={styles.specialDayBtn}>
                    <Text style={{ color: DANGER, fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Permanently closed */}
        {!state.permanentlyClosed && (
          <TouchableOpacity style={styles.permanentBtn} onPress={handlePermanentlyClosed}>
            <Text style={styles.permanentBtnText}>{t('hours.permanentlyClosed')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Save bar */}
      <View style={styles.saveBar}>
        <TouchableOpacity style={styles.saveBarBtn} onPress={handleSave} disabled={saving || state.permanentlyClosed}>
          {saving ? <ActivityIndicator color={SURFACE} size="small" /> : <Text style={styles.saveBarBtnText}>{t('hours.save')}</Text>}
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <CopyDayModal visible={copyModal} onApply={handleCopy} onCancel={() => setCopyModal(false)} />
      <SpecialDayModal
        visible={specialModal.visible}
        initial={specialModal.target}
        onSave={handleSaveSpecial}
        onCancel={() => setSpecialModal({ visible: false, target: null })}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'right', marginBottom: 4 },
  card: { backgroundColor: SURFACE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BORDER },
  dayRow: { paddingVertical: 10 },
  dayRowClosed: { opacity: 0.7 },
  dayRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111', textAlign: 'right' },
  dayNameClosed: { color: '#999' },
  closedTag: { fontSize: 12, color: '#999', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dayDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
  slotRow: { marginTop: 8 },
  slotLabel: { fontSize: 12, color: '#888', textAlign: 'right', marginBottom: 4 },
  slotInputs: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  slotFromLabel: { fontSize: 13, color: '#555' },
  timeInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 72, textAlign: 'center', backgroundColor: BG },
  timeInputError: { borderColor: DANGER },
  removeSlotBtn: { padding: 6 },
  removeSlotBtnText: { color: DANGER, fontSize: 14 },
  addBreakBtn: { marginTop: 6, alignSelf: 'flex-end' },
  addBreakBtnText: { color: PRIMARY, fontSize: 13 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  toggleLabel: { fontSize: 15, color: '#333', flex: 1 },
  copyBtn: { backgroundColor: SURFACE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  copyBtnText: { color: PRIMARY, fontSize: 14, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  addSpecialBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: PRIMARY, borderRadius: 8 },
  addSpecialBtnText: { color: SURFACE, fontSize: 13, fontWeight: '600' },
  noSpecial: { textAlign: 'center', color: '#999', paddingVertical: 8 },
  specialDayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  specialDayDate: { fontSize: 15, fontWeight: '700', color: '#111', textAlign: 'right' },
  specialDayNote: { fontSize: 12, color: '#888', textAlign: 'right' },
  specialDayStatus: { fontSize: 13, color: PRIMARY, textAlign: 'right' },
  specialDayActions: { flexDirection: 'row', gap: 8 },
  specialDayBtn: { padding: 6 },
  permanentBtn: { padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: DANGER, alignItems: 'center' },
  permanentBtnText: { color: DANGER, fontWeight: '700', fontSize: 15 },
  closedBanner: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closedBannerText: { color: DANGER, fontWeight: '700', fontSize: 15 },
  closedBannerUndo: { color: PRIMARY, fontSize: 13, fontWeight: '600' },
  saveBar: { backgroundColor: SURFACE, padding: 12, borderTopWidth: 1, borderTopColor: BORDER },
  saveBarBtn: { backgroundColor: PRIMARY, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBarBtnText: { color: SURFACE, fontWeight: '700', fontSize: 16 },
  // Overlay
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 },
  overlayTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'right', color: '#111' },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: SURFACE, marginBottom: 8 },
  dayPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  dayChipActive: { borderColor: PRIMARY, backgroundColor: '#DBEAFE' },
  dayChipText: { fontSize: 13, color: '#555' },
  dayChipTextActive: { color: PRIMARY, fontWeight: '700' },
  overlayActions: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  cancelBtnText: { color: '#555', fontSize: 14 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: PRIMARY, alignItems: 'center' },
  saveBtnText: { color: SURFACE, fontWeight: '700', fontSize: 14 },
});
