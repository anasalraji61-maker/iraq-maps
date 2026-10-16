/**
 * NavigationSettingsScreen – turn-by-turn navigation preferences.
 * Transport mode / avoid options / speed alerts / lane guidance / night mode /
 * voice language / volume / keep-screen-on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ListItem, Screen, Text } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ─── persistence key ─────────────────────────────────────────────────────────
const STORAGE_KEY = '@iraq-maps/account/nav-settings';

// ─── types ────────────────────────────────────────────────────────────────────
export type TransportMode = 'driving' | 'walking' | 'cycling';
export type NavNightMode = 'auto' | 'always' | 'never';
export type VoiceLocale = 'ar' | 'ckb' | 'en';
export type VoiceVolume = 'off' | 'low' | 'medium' | 'high';

export interface NavigationSettings {
  transportMode: TransportMode;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  speedLimitAlerts: boolean;
  speedLimitSound: boolean;
  laneGuidance: boolean;
  nightMode: NavNightMode;
  voiceLocale: VoiceLocale;
  voiceVolume: VoiceVolume;
  keepScreenOn: boolean;
}

const DEFAULTS: NavigationSettings = {
  transportMode: 'driving',
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  speedLimitAlerts: true,
  speedLimitSound: true,
  laneGuidance: true,
  nightMode: 'auto',
  voiceLocale: 'ar',
  voiceVolume: 'medium',
  keepScreenOn: true,
};

async function loadSettings(): Promise<NavigationSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NavigationSettings>) };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(s: NavigationSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────
interface SectionHeadingProps { label: string }
function SectionHeading({ label }: SectionHeadingProps): ReactElement {
  return (
    <View style={styles.sectionHead}>
      <Text variant="caption" tone="muted" style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

interface ToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}
function ToggleRow({ title, subtitle, value, onValueChange, disabled, testID }: ToggleRowProps): ReactElement {
  return (
    <View
      style={[styles.toggleRow, disabled && styles.disabledRow]}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.toggleText}>
        <Text variant="body" tone={disabled ? 'muted' : undefined}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted">{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} testID={testID} />
    </View>
  );
}

// ─── option groups ─────────────────────────────────────────────────────────────
const TRANSPORT_OPTIONS: { value: TransportMode; key: 'navSettings.modeDriving' | 'navSettings.modeWalking' | 'navSettings.modeCycling' }[] = [
  { value: 'driving', key: 'navSettings.modeDriving' },
  { value: 'walking', key: 'navSettings.modeWalking' },
  { value: 'cycling', key: 'navSettings.modeCycling' },
];

const NIGHT_MODE_OPTIONS: { value: NavNightMode; key: 'navSettings.nightAuto' | 'navSettings.nightAlways' | 'navSettings.nightNever' }[] = [
  { value: 'auto',   key: 'navSettings.nightAuto' },
  { value: 'always', key: 'navSettings.nightAlways' },
  { value: 'never',  key: 'navSettings.nightNever' },
];

const VOICE_LOCALE_OPTIONS: { value: VoiceLocale; key: 'navSettings.voiceAr' | 'navSettings.voiceCkb' | 'navSettings.voiceEn' }[] = [
  { value: 'ar',  key: 'navSettings.voiceAr' },
  { value: 'ckb', key: 'navSettings.voiceCkb' },
  { value: 'en',  key: 'navSettings.voiceEn' },
];

const VOLUME_OPTIONS: { value: VoiceVolume; key: 'navSettings.volOff' | 'navSettings.volLow' | 'navSettings.volMedium' | 'navSettings.volHigh' }[] = [
  { value: 'off',    key: 'navSettings.volOff' },
  { value: 'low',    key: 'navSettings.volLow' },
  { value: 'medium', key: 'navSettings.volMedium' },
  { value: 'high',   key: 'navSettings.volHigh' },
];

// ─── main screen ──────────────────────────────────────────────────────────────
export function NavigationSettingsScreen(): ReactElement {
  const [settings, setSettings] = useState<NavigationSettings>(DEFAULTS);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = <K extends keyof NavigationSettings>(key: K, value: NavigationSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void saveSettings(next);
  };

  return (
    <Screen scroll testID="nav-settings-screen">
      <ScreenTitle title={t('navSettings.title')} />

      {/* ── Transport mode ── */}
      <SectionHeading label={t('navSettings.sectionMode')} />
      {TRANSPORT_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.transportMode === value}
          onPress={() => update('transportMode', value)}
          testID={`nav-mode-${value}`}
        />
      ))}

      {/* ── Avoid ── */}
      <SectionHeading label={t('navSettings.sectionAvoid')} />
      <ToggleRow
        title={t('navSettings.avoidTolls')}
        value={settings.avoidTolls}
        onValueChange={(v) => update('avoidTolls', v)}
        testID="nav-avoid-tolls"
      />
      <ToggleRow
        title={t('navSettings.avoidHighways')}
        value={settings.avoidHighways}
        onValueChange={(v) => update('avoidHighways', v)}
        testID="nav-avoid-highways"
      />
      <ToggleRow
        title={t('navSettings.avoidFerries')}
        value={settings.avoidFerries}
        onValueChange={(v) => update('avoidFerries', v)}
        testID="nav-avoid-ferries"
      />

      {/* ── Speed limit alerts ── */}
      <SectionHeading label={t('navSettings.sectionSpeed')} />
      <ToggleRow
        title={t('navSettings.speedLimitAlerts')}
        subtitle={t('navSettings.speedLimitAlertsSub')}
        value={settings.speedLimitAlerts}
        onValueChange={(v) => update('speedLimitAlerts', v)}
        testID="nav-speed-alerts"
      />
      <ToggleRow
        title={t('navSettings.speedLimitSound')}
        subtitle={t('navSettings.speedLimitSoundSub')}
        value={settings.speedLimitSound}
        disabled={!settings.speedLimitAlerts}
        onValueChange={(v) => update('speedLimitSound', v)}
        testID="nav-speed-sound"
      />

      {/* ── Lane guidance ── */}
      <SectionHeading label={t('navSettings.sectionGuidance')} />
      <ToggleRow
        title={t('navSettings.laneGuidance')}
        subtitle={t('navSettings.laneGuidanceSub')}
        value={settings.laneGuidance}
        onValueChange={(v) => update('laneGuidance', v)}
        testID="nav-lane-guidance"
      />

      {/* ── Night mode ── */}
      <SectionHeading label={t('navSettings.sectionNightMode')} />
      {NIGHT_MODE_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.nightMode === value}
          onPress={() => update('nightMode', value)}
          testID={`nav-night-${value}`}
        />
      ))}

      {/* ── Voice language ── */}
      <SectionHeading label={t('navSettings.sectionVoiceLanguage')} />
      {VOICE_LOCALE_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.voiceLocale === value}
          onPress={() => update('voiceLocale', value)}
          testID={`nav-voice-${value}`}
        />
      ))}

      {/* ── Volume ── */}
      <SectionHeading label={t('navSettings.sectionVolume')} />
      {VOLUME_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.voiceVolume === value}
          onPress={() => update('voiceVolume', value)}
          testID={`nav-vol-${value}`}
        />
      ))}

      {/* ── Screen ── */}
      <SectionHeading label={t('navSettings.sectionScreen')} />
      <ToggleRow
        title={t('navSettings.keepScreenOn')}
        subtitle={t('navSettings.keepScreenOnSub')}
        value={settings.keepScreenOn}
        onValueChange={(v) => update('keepScreenOn', v)}
        testID="nav-keep-screen"
      />

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  disabledRow: {
    opacity: 0.45,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  spacer: {
    height: 32,
  },
});
