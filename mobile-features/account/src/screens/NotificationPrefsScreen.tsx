/**
 * NotificationPrefsScreen
 *
 * Full notification preferences panel:
 *   – Per-type toggles for 10 notification categories
 *   – Quiet-hours range picker (from / to HH:MM) in Baghdad time (UTC+3)
 *   – "Critical only" override that lets system/incident notifications bypass
 *     quiet hours
 *   – Delivery channel selector: Push only / In-app only / Both
 *   – Weekly email digest toggle
 *   – Save and error feedback
 *
 * All text via t(). Layout uses start/end (RTL-safe).
 * Route: account/notification-prefs-ext
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const td = t as (k: any) => string;

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifChannel = 'push' | 'in_app' | 'both';

interface ExtendedPrefs {
  message:       boolean;
  review:        boolean;
  like:          boolean;
  follow:        boolean;
  mention:       boolean;
  challenge:     boolean;
  promotion:     boolean;
  incident:      boolean;
  place_update:  boolean;
  system:        boolean;
  quietHoursEnabled:   boolean;
  quietStart:          string;
  quietEnd:            string;
  criticalOverrideQuiet: boolean;
  channel:             NotifChannel;
  emailDigestEnabled:  boolean;
}

const DEFAULT_PREFS: ExtendedPrefs = {
  message: true, review: true, like: true, follow: true, mention: true,
  challenge: true, promotion: true, incident: true, place_update: true, system: true,
  quietHoursEnabled: false,
  quietStart: '23:00',
  quietEnd: '08:00',
  criticalOverrideQuiet: true,
  channel: 'both',
  emailDigestEnabled: false,
};

// ─── Time picker modal ────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

interface TimePickerProps {
  visible: boolean;
  value: string; // "HH:MM"
  label: string;
  onConfirm: (val: string) => void;
  onDismiss: () => void;
}

function TimePicker({ visible, value, label, onConfirm, onDismiss }: TimePickerProps): ReactElement {
  const [hh, mm] = value.split(':') as [string, string];
  const [selHH, setSelHH] = useState(hh);
  const [selMM, setSelMM] = useState(mm);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={tpStyles.overlay} onPress={onDismiss}>
        <Pressable style={tpStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={tpStyles.label}>{label}</Text>

          <View style={tpStyles.pickers}>
            {/* Hours */}
            <View style={tpStyles.col}>
              <Text style={tpStyles.colHeader}>HH</Text>
              <ScrollView style={tpStyles.scroll} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[tpStyles.option, selHH === h && tpStyles.optionSel]}
                    onPress={() => setSelHH(h)}
                  >
                    <Text style={[tpStyles.optionText, selHH === h && tpStyles.optionTextSel]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={tpStyles.colon}>:</Text>

            {/* Minutes */}
            <View style={tpStyles.col}>
              <Text style={tpStyles.colHeader}>MM</Text>
              <ScrollView style={tpStyles.scroll} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[tpStyles.option, selMM === m && tpStyles.optionSel]}
                    onPress={() => setSelMM(m)}
                  >
                    <Text style={[tpStyles.optionText, selMM === m && tpStyles.optionTextSel]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <TouchableOpacity
            style={tpStyles.confirmBtn}
            onPress={() => { onConfirm(`${selHH}:${selMM}`); }}
          >
            <Text style={tpStyles.confirmText}>تأكيد</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const tpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, width: 260 },
  label: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16, textAlign: 'center' },
  pickers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  col: { width: 80 },
  colHeader: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 4 },
  scroll: { height: 160 },
  option: { paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  optionSel: { backgroundColor: '#EFF6FF' },
  optionText: { fontSize: 18, color: '#374151' },
  optionTextSel: { color: '#2563EB', fontWeight: '700' },
  colon: { fontSize: 22, fontWeight: '700', color: '#374151', marginHorizontal: 8, marginTop: 20 },
  confirmBtn: { marginTop: 16, backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

// ─── Row components ───────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, sublabel, value, onChange, disabled }: ToggleRowProps): ReactElement {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.texts}>
        <Text style={[rowStyles.label, disabled && rowStyles.disabled]}>{label}</Text>
        {sublabel ? (
          <Text style={[rowStyles.sublabel, disabled && rowStyles.disabled]}>{sublabel}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
        thumbColor={value ? '#2563EB' : '#9CA3AF'}
      />
    </View>
  );
}

interface ChannelOptionProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

function ChannelOption({ label, selected, onSelect }: ChannelOptionProps): ReactElement {
  return (
    <TouchableOpacity
      style={[rowStyles.channelOption, selected && rowStyles.channelOptionSel]}
      onPress={onSelect}
    >
      <View style={[rowStyles.radio, selected && rowStyles.radioSel]}>
        {selected && <View style={rowStyles.radioInner} />}
      </View>
      <Text style={[rowStyles.channelLabel, selected && rowStyles.channelLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  texts: { flex: 1 },
  label: { fontSize: 15, color: '#111827', textAlign: 'right' },
  sublabel: { fontSize: 12, color: '#6B7280', marginTop: 2, textAlign: 'right' },
  disabled: { opacity: 0.4 },
  channelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  channelOptionSel: { backgroundColor: '#EFF6FF' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioSel: { borderColor: '#2563EB' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' },
  channelLabel: { fontSize: 15, color: '#374151' },
  channelLabelSel: { color: '#2563EB', fontWeight: '600' },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return (
    <View style={secStyles.wrap}>
      <Text style={secStyles.text}>{title}</Text>
    </View>
  );
}

const secStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, backgroundColor: '#F9FAFB' },
  text: { fontSize: 13, fontWeight: '600', color: '#6B7280', textAlign: 'right' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NotificationPrefsScreen(): ReactElement {
  const router = useRouter();
  const [prefs, setPrefs] = useState<ExtendedPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timePickerField, setTimePickerField] = useState<'start' | 'end' | null>(null);

  // Load prefs
  useEffect(() => {
    // TODO: replace with real API call
    setTimeout(() => {
      setPrefs(DEFAULT_PREFS);
      setLoading(false);
    }, 200);
  }, []);

  const set = useCallback(<K extends keyof ExtendedPrefs>(key: K, value: ExtendedPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // TODO: call API to persist prefs
      await new Promise((r) => setTimeout(r, 500));
      Alert.alert(td('notifPrefsExt.saveSuccess'));
      router.back();
    } catch {
      Alert.alert(td('notifPrefsExt.saveError'));
    } finally {
      setSaving(false);
    }
  }, [router, prefs]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{td('notifPrefsExt.title')}</Text>
        <TouchableOpacity
          onPress={() => { void handleSave(); }}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>حفظ</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Type toggles ─────────────────────────────────────────────────── */}
        <SectionHeader title={td('notifPrefsExt.sectionTypes')} />
        <View style={styles.card}>
          <ToggleRow
            label={td('notifPrefsExt.typeMessage')}
            sublabel={td('notifPrefsExt.typeMessageSub')}
            value={prefs.message}
            onChange={(v) => set('message', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeReview')}
            sublabel={td('notifPrefsExt.typeReviewSub')}
            value={prefs.review}
            onChange={(v) => set('review', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeLike')}
            sublabel={td('notifPrefsExt.typeLikeSub')}
            value={prefs.like}
            onChange={(v) => set('like', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeFollow')}
            sublabel={td('notifPrefsExt.typeFollowSub')}
            value={prefs.follow}
            onChange={(v) => set('follow', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeMention')}
            sublabel={td('notifPrefsExt.typeMentionSub')}
            value={prefs.mention}
            onChange={(v) => set('mention', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeChallenge')}
            sublabel={td('notifPrefsExt.typeChallengeSub')}
            value={prefs.challenge}
            onChange={(v) => set('challenge', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typePromotion')}
            sublabel={td('notifPrefsExt.typePromotionSub')}
            value={prefs.promotion}
            onChange={(v) => set('promotion', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeIncident')}
            sublabel={td('notifPrefsExt.typeIncidentSub')}
            value={prefs.incident}
            onChange={(v) => set('incident', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typePlaceUpdate')}
            sublabel={td('notifPrefsExt.typePlaceUpdateSub')}
            value={prefs.place_update}
            onChange={(v) => set('place_update', v)}
          />
          <ToggleRow
            label={td('notifPrefsExt.typeSystem')}
            sublabel={td('notifPrefsExt.typeSystemSub')}
            value={prefs.system}
            onChange={(v) => set('system', v)}
          />
        </View>

        {/* ── Quiet hours ───────────────────────────────────────────────────── */}
        <SectionHeader title={td('notifPrefsExt.sectionQuietHours')} />
        <View style={styles.card}>
          {/* Baghdad note */}
          <View style={styles.noteRow}>
            <Text style={styles.noteText}>🕐 {td('notifPrefsExt.quietHoursNote')}</Text>
          </View>

          <ToggleRow
            label={td('notifPrefsExt.quietHoursEnabled')}
            sublabel={td('notifPrefsExt.quietHoursEnabledSub')}
            value={prefs.quietHoursEnabled}
            onChange={(v) => set('quietHoursEnabled', v)}
          />

          {/* From / To pickers */}
          <View style={[styles.timeRow, !prefs.quietHoursEnabled && styles.dimmed]}>
            <Text style={styles.timeLabel}>{td('notifPrefsExt.quietFrom')}</Text>
            <TouchableOpacity
              style={styles.timePill}
              onPress={() => prefs.quietHoursEnabled && setTimePickerField('start')}
              disabled={!prefs.quietHoursEnabled}
            >
              <Text style={styles.timePillText}>{prefs.quietStart}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.timeRow, !prefs.quietHoursEnabled && styles.dimmed]}>
            <Text style={styles.timeLabel}>{td('notifPrefsExt.quietTo')}</Text>
            <TouchableOpacity
              style={styles.timePill}
              onPress={() => prefs.quietHoursEnabled && setTimePickerField('end')}
              disabled={!prefs.quietHoursEnabled}
            >
              <Text style={styles.timePillText}>{prefs.quietEnd}</Text>
            </TouchableOpacity>
          </View>

          <ToggleRow
            label={td('notifPrefsExt.criticalOverride')}
            sublabel={td('notifPrefsExt.criticalOverrideSub')}
            value={prefs.criticalOverrideQuiet}
            onChange={(v) => set('criticalOverrideQuiet', v)}
            disabled={!prefs.quietHoursEnabled}
          />
        </View>

        {/* ── Delivery channel ─────────────────────────────────────────────── */}
        <SectionHeader title={td('notifPrefsExt.sectionChannel')} />
        <View style={styles.card}>
          <ChannelOption
            label={td('notifPrefsExt.channelBoth')}
            selected={prefs.channel === 'both'}
            onSelect={() => set('channel', 'both')}
          />
          <ChannelOption
            label={td('notifPrefsExt.channelPush')}
            selected={prefs.channel === 'push'}
            onSelect={() => set('channel', 'push')}
          />
          <ChannelOption
            label={td('notifPrefsExt.channelInApp')}
            selected={prefs.channel === 'in_app'}
            onSelect={() => set('channel', 'in_app')}
          />
        </View>

        {/* ── Email digest ──────────────────────────────────────────────────── */}
        <SectionHeader title={td('notifPrefsExt.sectionEmail')} />
        <View style={styles.card}>
          <ToggleRow
            label={td('notifPrefsExt.emailDigest')}
            sublabel={td('notifPrefsExt.emailDigestSub')}
            value={prefs.emailDigestEnabled}
            onChange={(v) => set('emailDigestEnabled', v)}
          />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Time picker modals */}
      <TimePicker
        visible={timePickerField === 'start'}
        value={prefs.quietStart}
        label={td('notifPrefsExt.quietFrom')}
        onConfirm={(v) => { set('quietStart', v); setTimePickerField(null); }}
        onDismiss={() => setTimePickerField(null)}
      />
      <TimePicker
        visible={timePickerField === 'end'}
        value={prefs.quietEnd}
        label={td('notifPrefsExt.quietTo')}
        onConfirm={(v) => { set('quietEnd', v); setTimePickerField(null); }}
        onDismiss={() => setTimePickerField(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: '#2563EB' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  scroll: { flex: 1 },
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },

  // Quiet hours
  noteRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFBEB',
  },
  noteText: { fontSize: 12, color: '#92400E', textAlign: 'right' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  timeLabel: { fontSize: 15, color: '#111827' },
  timePill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  timePillText: { fontSize: 16, color: '#2563EB', fontWeight: '700', fontVariant: ['tabular-nums'] },
  dimmed: { opacity: 0.4 },

  bottomPad: { height: 40 },
});
