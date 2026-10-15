/**
 * NotificationPrefsScreen — per-category toggles, quiet hours, sound, vibration,
 * badge count, in-app banners, and preview button.
 * Baghdad timezone = UTC+3; quiet hours stored as HH:MM strings.
 */
import { type NotificationPrefs } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER   = '#C62828';
const DIVIDER  = '#E0E0E0';

// ─────────────────────────────────────────────────────────────────────────────
// Local prefs shape (extends the contract prefs with UI-only fields)
// ─────────────────────────────────────────────────────────────────────────────

interface LocalPrefs extends NotificationPrefs {
  quietHoursEnabled: boolean;
  quietStart: string;       // "HH:MM" Baghdad time
  quietEnd: string;         // "HH:MM" Baghdad time
  sound: 'default' | 'soft' | 'none' | 'chime';
  vibrate: boolean;
  badge: boolean;
  inAppBanners: boolean;
}

const DEFAULT_LOCAL: LocalPrefs = {
  newInquiry:       true,
  replyReceived:    true,
  statusUpdate:     true,
  discoverLikes:    true,
  discoverComments: true,
  messages:         true,
  quietHoursEnabled: false,
  quietStart:       '23:00',
  quietEnd:         '08:00',
  sound:            'default',
  vibrate:          true,
  badge:            true,
  inAppBanners:     true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Row components
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }): ReactElement {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, value, onChange, disabled }: ToggleRowProps): ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.disabledText]}>{label}</Text>
        {description ? <Text style={[styles.rowDesc, disabled && styles.disabledText]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#BDBDBD', true: `${PRIMARY}88` }}
        thumbColor={value ? PRIMARY : '#F5F5F5'}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

interface PickerRowProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

function PickerRow({ label, value, options, onChange }: PickerRowProps): ReactElement {
  const current = options.find((o) => o.value === value)?.label ?? value;
  const handlePress = () => {
    if (Platform.OS === 'ios') {
      // Use ActionSheet-style alert on iOS
      Alert.alert(
        label,
        undefined,
        [
          ...options.map((o) => ({ text: o.label, onPress: () => onChange(o.value) })),
          { text: t('prefsCancel'), style: 'cancel' as const },
        ],
      );
    } else {
      Alert.alert(
        label,
        undefined,
        [
          ...options.map((o) => ({ text: o.label, onPress: () => onChange(o.value) })),
          { text: t('prefsCancel'), style: 'cancel' as const },
        ],
      );
    }
  };

  return (
    <Pressable style={styles.row} onPress={handlePress} accessibilityRole="button" accessibilityLabel={`${label}: ${current}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.pickerValue}>
        <Text style={styles.pickerValueText}>{current}</Text>
        <Text style={styles.chevron} accessibilityElementsHidden>{'›'}</Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Time picker modal (simple HH:MM input)
// ─────────────────────────────────────────────────────────────────────────────

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initial: string;
  onDone: (v: string) => void;
  onCancel: () => void;
}

function TimePickerModal({ visible, title, initial, onDone, onCancel }: TimePickerModalProps): ReactElement {
  const [val, setVal] = useState(initial);

  useEffect(() => { if (visible) setVal(initial); }, [visible, initial]);

  const isValid = /^\d{2}:\d{2}$/.test(val);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.timeInput}
            value={val}
            onChangeText={(s) => {
              // auto-insert colon after 2 digits
              const clean = s.replace(/[^0-9:]/g, '');
              if (clean.length === 2 && !clean.includes(':') && val.length === 1) {
                setVal(`${clean}:`);
              } else {
                setVal(clean.slice(0, 5));
              }
            }}
            placeholder="HH:MM"
            keyboardType="numeric"
            maxLength={5}
            accessibilityLabel={title}
          />
          <Text style={styles.timeHint}>{t('prefsTimeHint')}</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onCancel} accessibilityRole="button">
              <Text style={styles.modalCancelText}>{t('prefsCancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSave, !isValid && { opacity: 0.4 }]}
              onPress={() => { if (isValid) onDone(val); }}
              disabled={!isValid}
              accessibilityRole="button"
            >
              <Text style={styles.modalSaveText}>{t('prefsSave')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationPrefsScreen(): ReactElement {
  const api    = useApi();
  const session = useSession();

  const [prefs, setPrefs]       = useState<LocalPrefs>(DEFAULT_LOCAL);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | undefined>();
  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load remote prefs on mount
  useEffect(() => {
    if (!session) { setLoading(false); return; }
    void (async () => {
      try {
        const res = await api.notifications.getPrefs({});
        if (res.status === 200) {
          setPrefs((prev) => ({ ...prev, ...res.body }));
        }
      } catch { /* show defaults */ } finally {
        setLoading(false);
      }
    })();
  }, [api, session]);

  // Auto-save when prefs change (debounced 800 ms)
  const autoSave = useCallback((next: LocalPrefs) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      if (!session) return;
      setSaving(true);
      try {
        await api.notifications.updatePrefs({
          body: {
            newInquiry:       next.newInquiry,
            replyReceived:    next.replyReceived,
            statusUpdate:     next.statusUpdate,
            discoverLikes:    next.discoverLikes,
            discoverComments: next.discoverComments,
            messages:         next.messages,
          },
        });
        setError(undefined);
      } catch {
        setError(t('prefsSaveError'));
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [api, session]);

  const update = useCallback((patch: Partial<LocalPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const handlePreview = () => {
    Alert.alert(t('prefsPreviewTitle'), t('prefsPreviewBody'));
  };

  const soundOptions = [
    { value: 'default', label: t('prefsSoundDefault') },
    { value: 'soft',    label: t('prefsSoundSoft') },
    { value: 'chime',   label: t('prefsSoundChime') },
    { value: 'none',    label: t('prefsSoundNone') },
  ];

  if (!session) {
    return (
      <View style={styles.screen}>
        <Header saving={false} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('loginPrompt')}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header saving={false} />
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header saving={saving} />
      {error ? <View style={styles.errorBar}><Text style={styles.errorBarText}>{error}</Text></View> : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Notification types ── */}
        <SectionTitle label={t('prefsCategoryTitle')} />

        <ToggleRow
          label={t('prefsNewInquiry')}
          description={t('prefsNewInquiryDesc')}
          value={prefs.newInquiry}
          onChange={(v) => update({ newInquiry: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsReplyReceived')}
          description={t('prefsReplyReceivedDesc')}
          value={prefs.replyReceived}
          onChange={(v) => update({ replyReceived: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsStatusUpdate')}
          description={t('prefsStatusUpdateDesc')}
          value={prefs.statusUpdate}
          onChange={(v) => update({ statusUpdate: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsDiscoverLikes')}
          description={t('prefsDiscoverLikesDesc')}
          value={prefs.discoverLikes}
          onChange={(v) => update({ discoverLikes: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsDiscoverComments')}
          description={t('prefsDiscoverCommentsDesc')}
          value={prefs.discoverComments}
          onChange={(v) => update({ discoverComments: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsMessages')}
          description={t('prefsMessagesDesc')}
          value={prefs.messages}
          onChange={(v) => update({ messages: v })}
        />

        {/* ── Quiet hours ── */}
        <SectionTitle label={t('prefsQuietTitle')} />

        <ToggleRow
          label={t('prefsQuietEnable')}
          description={t('prefsQuietEnableDesc')}
          value={prefs.quietHoursEnabled}
          onChange={(v) => update({ quietHoursEnabled: v })}
        />
        {prefs.quietHoursEnabled && (
          <>
            <View style={styles.divider} />
            <Pressable
              style={styles.row}
              onPress={() => setTimePicker('start')}
              accessibilityRole="button"
              accessibilityLabel={t('prefsQuietStart')}
            >
              <Text style={styles.rowLabel}>{t('prefsQuietStart')}</Text>
              <Text style={styles.timeValue}>{prefs.quietStart}</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.row}
              onPress={() => setTimePicker('end')}
              accessibilityRole="button"
              accessibilityLabel={t('prefsQuietEnd')}
            >
              <Text style={styles.rowLabel}>{t('prefsQuietEnd')}</Text>
              <Text style={styles.timeValue}>{prefs.quietEnd}</Text>
            </Pressable>
            <Text style={styles.timezoneNote}>{t('prefsTimezone')}</Text>
          </>
        )}

        {/* ── Sound & vibration ── */}
        <SectionTitle label={t('prefsSoundVibTitle')} />

        <PickerRow
          label={t('prefsSound')}
          value={prefs.sound}
          options={soundOptions}
          onChange={(v) => update({ sound: v as LocalPrefs['sound'] })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsVibrate')}
          value={prefs.vibrate}
          onChange={(v) => update({ vibrate: v })}
        />

        {/* ── Display ── */}
        <SectionTitle label={t('prefsDisplayTitle')} />

        <ToggleRow
          label={t('prefsBadge')}
          description={t('prefsBadgeDesc')}
          value={prefs.badge}
          onChange={(v) => update({ badge: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('prefsInAppBanners')}
          description={t('prefsInAppBannersDesc')}
          value={prefs.inAppBanners}
          onChange={(v) => update({ inAppBanners: v })}
        />

        {/* ── Preview button ── */}
        <Pressable
          style={styles.previewBtn}
          onPress={handlePreview}
          accessibilityRole="button"
        >
          <Text style={styles.previewBtnText}>{t('prefsPreviewBtn')}</Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Time picker modals */}
      <TimePickerModal
        visible={timePicker === 'start'}
        title={t('prefsQuietStart')}
        initial={prefs.quietStart}
        onDone={(v) => { update({ quietStart: v }); setTimePicker(null); }}
        onCancel={() => setTimePicker(null)}
      />
      <TimePickerModal
        visible={timePicker === 'end'}
        title={t('prefsQuietEnd')}
        initial={prefs.quietEnd}
        onDone={(v) => { update({ quietEnd: v }); setTimePicker(null); }}
        onCancel={() => setTimePicker(null)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header sub-component
// ─────────────────────────────────────────────────────────────────────────────

function Header({ saving }: { saving: boolean }): ReactElement {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{t('prefsTitle')}</Text>
      {saving ? <ActivityIndicator size="small" color="#B3E5FC" /> : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#F5F5F5' },
  header:         { backgroundColor: PRIMARY, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:    { color: '#FFF', fontSize: 18, fontWeight: '600' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontSize: 15, color: '#666', textAlign: 'center' },
  scroll:         { paddingBottom: 16 },
  sectionTitle:   { fontSize: 12, fontWeight: '700', color: '#9E9E9E', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  row:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  rowText:        { flex: 1, paddingEnd: 12 },
  rowLabel:       { fontSize: 15, color: '#212121' },
  rowDesc:        { fontSize: 12, color: '#9E9E9E', marginTop: 2, lineHeight: 16 },
  disabledText:   { color: '#BDBDBD' },
  divider:        { height: 1, backgroundColor: DIVIDER, marginStart: 16 },
  pickerValue:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickerValueText:{ fontSize: 15, color: PRIMARY },
  chevron:        { fontSize: 18, color: '#BDBDBD' },
  timeValue:      { fontSize: 16, fontWeight: '600', color: PRIMARY },
  timezoneNote:   { fontSize: 11, color: '#9E9E9E', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  previewBtn:     { margin: 16, marginTop: 24, backgroundColor: PRIMARY, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  previewBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  errorBar:       { backgroundColor: '#FFCDD2', paddingHorizontal: 16, paddingVertical: 8 },
  errorBarText:   { color: DANGER, fontSize: 13 },
  // Modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:       { backgroundColor: '#FFF', borderRadius: 14, padding: 20, width: '100%', maxWidth: 360 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 16, textAlign: 'center' },
  timeInput:      { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 24, textAlign: 'center', letterSpacing: 4, marginBottom: 4 },
  timeHint:       { fontSize: 11, color: '#9E9E9E', textAlign: 'center', marginBottom: 16 },
  modalActions:   { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalCancel:    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: DIVIDER },
  modalCancelText:{ fontSize: 14, color: '#555' },
  modalSave:      { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: PRIMARY, minWidth: 72, alignItems: 'center' },
  modalSaveText:  { fontSize: 14, color: '#FFF', fontWeight: '600' },
});
