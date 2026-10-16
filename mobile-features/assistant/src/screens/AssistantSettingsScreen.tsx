import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#C62828';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssistantPreferences {
  responseLanguage: 'ar' | 'ckb' | 'en';
  responseStyle: 'brief' | 'detailed';
  interests: string[];
  favoriteAreas: string[];
  dietaryPreferences: string[];
  transportMode: 'walking' | 'driving' | 'transit' | 'cycling';
  receiveProactiveSuggestions: boolean;
}

const DEFAULT_PREFS: AssistantPreferences = {
  responseLanguage: 'ar',
  responseStyle: 'brief',
  interests: [],
  favoriteAreas: [],
  dietaryPreferences: [],
  transportMode: 'driving',
  receiveProactiveSuggestions: true,
};

const INTEREST_OPTIONS = ['food', 'culture', 'shopping', 'history', 'religious', 'nature'] as const;
const DIETARY_OPTIONS = ['vegetarian', 'vegan', 'halal', 'glutenFree', 'dairyFree'] as const;
const AREA_OPTIONS = ['alRashid', 'karada', 'mansour', 'zaytoun', 'jadiriya', 'adhamiyya'] as const;

// ─── Section components ───────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }): ReactElement {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement;
}): ReactElement {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowLabel}>
        <Text style={styles.settingsRowLabelText}>{label}</Text>
        {hint ? <Text style={styles.settingsRowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  labelFn,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelFn: (v: T) => string;
}): ReactElement {
  return (
    <View style={styles.segment}>
      {options.map(opt => (
        <Pressable
          key={opt}
          style={[styles.segmentItem, value === opt && styles.segmentItemActive]}
          onPress={() => onChange(opt)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === opt }}
          accessibilityLabel={labelFn(opt)}
        >
          <Text style={[styles.segmentItemText, value === opt && styles.segmentItemTextActive]}>
            {labelFn(opt)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MultiChips<T extends string>({
  options,
  selected,
  onToggle,
  labelFn,
}: {
  options: readonly T[];
  selected: T[];
  onToggle: (v: T) => void;
  labelFn: (v: T) => string;
}): ReactElement {
  return (
    <View style={styles.chipsWrap}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(opt)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={labelFn(opt)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{labelFn(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function AssistantSettingsScreen(): ReactElement {
  const router = useRouter();
  const [prefs, setPrefs] = useState<AssistantPreferences>(DEFAULT_PREFS);
  const [_saved, setSaved] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const savedAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const update = <K extends keyof AssistantPreferences>(key: K, value: AssistantPreferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const toggleArrayItem = <T extends string>(
    key: 'interests' | 'favoriteAreas' | 'dietaryPreferences',
    item: T,
  ) => {
    setPrefs(prev => {
      const arr = prev[key] as string[];
      const next = arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
      return { ...prev, [key]: next };
    });
    setSaved(false);
  };

  const handleSave = () => {
    // In production: persist to AsyncStorage or API via useAssistantClient
    setSaved(true);
    Animated.sequence([
      Animated.timing(savedAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(savedAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleClearHistory = () => {
    Alert.alert(
      t('settings.clearHistoryTitle'),
      t('settings.clearHistoryConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.clearHistoryAction'),
          style: 'destructive',
          onPress: () => {
            // Stub: call clearPersistedHistory in production
          },
        },
      ],
    );
  };

  const langOptions = ['ar', 'ckb', 'en'] as const;
  const styleOptions = ['brief', 'detailed'] as const;
  const transportOptions = ['walking', 'driving', 'transit', 'cycling'] as const;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('settings.back')}
        >
          <Text style={styles.backBtnText}>{'‹'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <Pressable
          onPress={handleSave}
          style={styles.saveBtn}
          accessibilityRole="button"
          accessibilityLabel={t('settings.save')}
        >
          <Text style={styles.saveBtnText}>{t('settings.save')}</Text>
        </Pressable>
      </View>

      {/* Saved toast */}
      <Animated.View
        style={[styles.savedToast, { opacity: savedAnim }]}
        pointerEvents="none"
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.savedToastText}>{`✓ ${t('settings.saved')}`}</Text>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ─── Language ─── */}
        <SectionTitle label={t('settings.sectionLanguage')} />
        <View style={styles.card}>
          <SettingsRow label={t('settings.responseLanguage')}>
            <SegmentControl
              options={langOptions}
              value={prefs.responseLanguage}
              onChange={v => update('responseLanguage', v)}
              labelFn={v => ({ ar: t('settings.langAr'), ckb: t('settings.langCkb'), en: t('settings.langEn') }[v])}
            />
          </SettingsRow>
        </View>

        {/* ─── Response style ─── */}
        <SectionTitle label={t('settings.sectionStyle')} />
        <View style={styles.card}>
          <SettingsRow label={t('settings.responseStyle')} hint={t('settings.responseStyleHint')}>
            <SegmentControl
              options={styleOptions}
              value={prefs.responseStyle}
              onChange={v => update('responseStyle', v)}
              labelFn={v => (v === 'brief' ? t('settings.styleBrief') : t('settings.styleDetailed'))}
            />
          </SettingsRow>
        </View>

        {/* ─── Transport ─── */}
        <SectionTitle label={t('settings.sectionTransport')} />
        <View style={styles.card}>
          <Text style={styles.chipSectionLabel}>{t('settings.defaultTransport')}</Text>
          <View style={styles.chipsWrap}>
            {transportOptions.map(opt => {
              const active = prefs.transportMode === opt;
              const icons: Record<string, string> = { walking: '🚶', driving: '🚗', transit: '🚌', cycling: '🚴' };
              return (
                <Pressable
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => update('transportMode', opt)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`settings.transport_${opt}`)}
                >
                  <Text style={styles.chipIcon}>{icons[opt]}</Text>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t(`settings.transport_${opt}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ─── Dietary ─── */}
        <SectionTitle label={t('settings.sectionDietary')} />
        <View style={styles.card}>
          <Text style={styles.chipSectionLabel}>{t('settings.dietaryHint')}</Text>
          <MultiChips
            options={DIETARY_OPTIONS}
            selected={prefs.dietaryPreferences as typeof DIETARY_OPTIONS[number][]}
            onToggle={v => toggleArrayItem('dietaryPreferences', v)}
            labelFn={v => t(`settings.dietary_${v}`)}
          />
        </View>

        {/* ─── Interests ─── */}
        <SectionTitle label={t('settings.sectionInterests')} />
        <View style={styles.card}>
          <Text style={styles.chipSectionLabel}>{t('settings.interestsHint')}</Text>
          <MultiChips
            options={INTEREST_OPTIONS}
            selected={prefs.interests as typeof INTEREST_OPTIONS[number][]}
            onToggle={v => toggleArrayItem('interests', v)}
            labelFn={v => t(`settings.interest_${v}`)}
          />
        </View>

        {/* ─── Favorite areas ─── */}
        <SectionTitle label={t('settings.sectionAreas')} />
        <View style={styles.card}>
          <Text style={styles.chipSectionLabel}>{t('settings.areasHint')}</Text>
          <MultiChips
            options={AREA_OPTIONS}
            selected={prefs.favoriteAreas as typeof AREA_OPTIONS[number][]}
            onToggle={v => toggleArrayItem('favoriteAreas', v)}
            labelFn={v => t(`settings.area_${v}`)}
          />
        </View>

        {/* ─── Proactive suggestions ─── */}
        <SectionTitle label={t('settings.sectionNotifications')} />
        <View style={styles.card}>
          <SettingsRow label={t('settings.proactiveSuggestions')} hint={t('settings.proactiveSuggestionsHint')}>
            <Switch
              value={prefs.receiveProactiveSuggestions}
              onValueChange={v => update('receiveProactiveSuggestions', v)}
              trackColor={{ false: '#CFD8DC', true: '#BBDEFB' }}
              thumbColor={prefs.receiveProactiveSuggestions ? PRIMARY : '#90A4AE'}
              accessibilityLabel={t('settings.proactiveSuggestions')}
            />
          </SettingsRow>
        </View>

        {/* ─── Danger zone ─── */}
        <SectionTitle label={t('settings.sectionDanger')} />
        <View style={styles.card}>
          <Pressable
            style={styles.dangerBtn}
            onPress={handleClearHistory}
            accessibilityRole="button"
            accessibilityLabel={t('settings.clearHistoryAction')}
          >
            <Text style={styles.dangerBtnText}>{t('settings.clearHistoryAction')}</Text>
          </Pressable>
          <Text style={styles.dangerHint}>{t('settings.clearHistoryHint')}</Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: 24,
    lineHeight: 28,
  },
  headerTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'auto',
  },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  savedToast: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    backgroundColor: '#43A047',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 6,
  },
  savedToastText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'auto',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  settingsRowLabel: {
    flex: 1,
    gap: 2,
  },
  settingsRowLabelText: {
    fontSize: 15,
    color: '#212121',
    textAlign: 'auto',
  },
  settingsRowHint: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'auto',
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FAFAFA',
  },
  segmentItemActive: {
    backgroundColor: PRIMARY,
  },
  segmentItemText: {
    fontSize: 13,
    color: '#616161',
    fontWeight: '500',
  },
  segmentItemTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  chipSectionLabel: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
    textAlign: 'auto',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FAFAFA',
  },
  chipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
  },
  chipIcon: {
    fontSize: 14,
  },
  chipText: {
    fontSize: 13,
    color: '#424242',
    fontWeight: '500',
  },
  chipTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },
  dangerBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DANGER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: DANGER,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerHint: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 24,
  },
});
