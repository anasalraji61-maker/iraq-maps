/**
 * MapSettingsScreen – map-specific display preferences.
 * Default style / city / distance units / traffic / places / zoom / compass.
 * Changes persisted to AsyncStorage and applied immediately.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ListItem, Screen, Text } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ─── persistence key ─────────────────────────────────────────────────────────
const STORAGE_KEY = '@iraq-maps/account/map-settings';

// ─── types ────────────────────────────────────────────────────────────────────
export type MapStyle = 'street' | 'satellite' | 'terrain';
export type DefaultCity = 'baghdad' | 'erbil' | 'basra' | 'mosul' | 'other';
export type DistanceUnit = 'km' | 'mi';
export type DefaultZoom = 10 | 12 | 14 | 16;

export interface MapSettings {
  mapStyle: MapStyle;
  defaultCity: DefaultCity;
  distanceUnit: DistanceUnit;
  showTraffic: boolean;
  showPlaces: boolean;
  defaultZoom: DefaultZoom;
  autoFollowLocation: boolean;
  compassAlwaysVisible: boolean;
}

const DEFAULTS: MapSettings = {
  mapStyle: 'street',
  defaultCity: 'baghdad',
  distanceUnit: 'km',
  showTraffic: false,
  showPlaces: true,
  defaultZoom: 14,
  autoFollowLocation: true,
  compassAlwaysVisible: false,
};

async function loadSettings(): Promise<MapSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MapSettings>) };
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(s: MapSettings): Promise<void> {
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
  testID?: string;
}
function ToggleRow({ title, subtitle, value, onValueChange, testID }: ToggleRowProps): ReactElement {
  return (
    <View
      style={styles.toggleRow}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.toggleText}>
        <Text variant="body">{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted">{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} testID={testID} />
    </View>
  );
}

// ─── option groups ─────────────────────────────────────────────────────────────
const MAP_STYLE_OPTIONS: { value: MapStyle; key: 'mapSettings.styleStreet' | 'mapSettings.styleSatellite' | 'mapSettings.styleTerrain' }[] = [
  { value: 'street',    key: 'mapSettings.styleStreet' },
  { value: 'satellite', key: 'mapSettings.styleSatellite' },
  { value: 'terrain',   key: 'mapSettings.styleTerrain' },
];

const CITY_OPTIONS: { value: DefaultCity; key: 'mapSettings.cityBaghdad' | 'mapSettings.cityErbil' | 'mapSettings.cityBasra' | 'mapSettings.cityMosul' | 'mapSettings.cityOther' }[] = [
  { value: 'baghdad', key: 'mapSettings.cityBaghdad' },
  { value: 'erbil',   key: 'mapSettings.cityErbil' },
  { value: 'basra',   key: 'mapSettings.cityBasra' },
  { value: 'mosul',   key: 'mapSettings.cityMosul' },
  { value: 'other',   key: 'mapSettings.cityOther' },
];

const DISTANCE_OPTIONS: { value: DistanceUnit; key: 'mapSettings.unitKm' | 'mapSettings.unitMi' }[] = [
  { value: 'km', key: 'mapSettings.unitKm' },
  { value: 'mi', key: 'mapSettings.unitMi' },
];

const ZOOM_OPTIONS: { value: DefaultZoom; label: string }[] = [
  { value: 10, label: '10' },
  { value: 12, label: '12' },
  { value: 14, label: '14' },
  { value: 16, label: '16' },
];

// ─── main screen ──────────────────────────────────────────────────────────────
export function MapSettingsScreen(): ReactElement {
  const [settings, setSettings] = useState<MapSettings>(DEFAULTS);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void saveSettings(next);
  };

  return (
    <Screen scroll testID="map-settings-screen">
      <ScreenTitle title={t('mapSettings.title')} />

      {/* ── Map style ── */}
      <SectionHeading label={t('mapSettings.sectionStyle')} />
      {MAP_STYLE_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.mapStyle === value}
          onPress={() => update('mapStyle', value)}
          testID={`map-style-${value}`}
        />
      ))}

      {/* ── Default city ── */}
      <SectionHeading label={t('mapSettings.sectionDefaultCity')} />
      {CITY_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.defaultCity === value}
          onPress={() => update('defaultCity', value)}
          testID={`map-city-${value}`}
        />
      ))}

      {/* ── Distance unit ── */}
      <SectionHeading label={t('mapSettings.sectionDistanceUnit')} />
      {DISTANCE_OPTIONS.map(({ value, key }) => (
        <ListItem
          key={value}
          title={t(key)}
          selected={settings.distanceUnit === value}
          onPress={() => update('distanceUnit', value)}
          testID={`map-unit-${value}`}
        />
      ))}

      {/* ── Default zoom level ── */}
      <SectionHeading label={t('mapSettings.sectionDefaultZoom')} />
      {ZOOM_OPTIONS.map(({ value, label }) => (
        <ListItem
          key={value}
          title={label}
          selected={settings.defaultZoom === value}
          onPress={() => update('defaultZoom', value)}
          testID={`map-zoom-${value}`}
        />
      ))}

      {/* ── Toggles ── */}
      <SectionHeading label={t('mapSettings.sectionDisplay')} />
      <ToggleRow
        title={t('mapSettings.showTraffic')}
        subtitle={t('mapSettings.showTrafficSub')}
        value={settings.showTraffic}
        onValueChange={(v) => update('showTraffic', v)}
        testID="map-toggle-traffic"
      />
      <ToggleRow
        title={t('mapSettings.showPlaces')}
        subtitle={t('mapSettings.showPlacesSub')}
        value={settings.showPlaces}
        onValueChange={(v) => update('showPlaces', v)}
        testID="map-toggle-places"
      />
      <ToggleRow
        title={t('mapSettings.autoFollowLocation')}
        subtitle={t('mapSettings.autoFollowLocationSub')}
        value={settings.autoFollowLocation}
        onValueChange={(v) => update('autoFollowLocation', v)}
        testID="map-toggle-follow"
      />
      <ToggleRow
        title={t('mapSettings.compassAlwaysVisible')}
        subtitle={t('mapSettings.compassAlwaysVisibleSub')}
        value={settings.compassAlwaysVisible}
        onValueChange={(v) => update('compassAlwaysVisible', v)}
        testID="map-toggle-compass"
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
  toggleText: {
    flex: 1,
    gap: 2,
  },
  spacer: {
    height: 32,
  },
});
