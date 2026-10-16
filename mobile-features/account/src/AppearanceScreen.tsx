/**
 * AppearanceScreen – full appearance & localisation preferences.
 * Theme / font size / UI language / number format / map labels / date format.
 * Changes apply immediately via context; persisted to AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ThemeMode, useAppTheme } from '@iraq-maps/ui';
import { ListItem, Screen, Text } from '@iraq-maps/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

// ─── persistence key ────────────────────────────────────────────────────────
const STORAGE_KEY = '@iraq-maps/account/appearance';

// ─── types ───────────────────────────────────────────────────────────────────
export type FontSize = 'small' | 'normal' | 'large' | 'xlarge';
export type NumberFormat = 'arabic-indic' | 'western';
export type MapLanguage = 'ar' | 'en';
export type DateFormat = 'arabic' | 'gregorian';

export interface AppearancePrefs {
  fontSize: FontSize;
  numberFormat: NumberFormat;
  mapLanguage: MapLanguage;
  dateFormat: DateFormat;
}

const DEFAULTS: AppearancePrefs = {
  fontSize: 'normal',
  numberFormat: 'arabic-indic',
  mapLanguage: 'ar',
  dateFormat: 'arabic',
};

async function loadPrefs(): Promise<AppearancePrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppearancePrefs>) };
  } catch {
    return DEFAULTS;
  }
}

async function savePrefs(p: AppearancePrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────
interface SectionHeadingProps { label: string }
function SectionHeading({ label }: SectionHeadingProps): ReactElement {
  return (
    <View style={styles.sectionHead}>
      <Text variant="caption" tone="muted" style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

interface OptionRowProps {
  title: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}
function OptionRow({ title, selected, onPress, testID }: OptionRowProps): ReactElement {
  return (
    <ListItem
      title={title}
      selected={selected}
      onPress={onPress}
      testID={testID}
    />
  );
}

// ─── font-size preview ───────────────────────────────────────────────────────
const FONT_SIZE_PX: Record<FontSize, number> = {
  small: 13,
  normal: 16,
  large: 19,
  xlarge: 22,
};

interface FontPreviewProps { fontSize: FontSize }
function FontPreview({ fontSize }: FontPreviewProps): ReactElement {
  const px = FONT_SIZE_PX[fontSize];
  return (
    <View style={styles.preview} accessibilityLabel={t('appearance.fontPreviewLabel')}>
      <Text style={[styles.previewText, { fontSize: px }]}>
        {t('appearance.fontPreviewText')}
      </Text>
      <Text variant="caption" tone="muted" style={styles.previewSub}>
        {t('appearance.fontPreviewSub')}
      </Text>
    </View>
  );
}

// ─── number-format preview ───────────────────────────────────────────────────
function formatNumber(n: number, fmt: NumberFormat): string {
  if (fmt === 'arabic-indic') {
    return n.toLocaleString('ar-IQ');
  }
  return n.toLocaleString('en-US');
}

interface NumberPreviewProps { format: NumberFormat }
function NumberPreview({ format }: NumberPreviewProps): ReactElement {
  return (
    <View style={styles.preview} accessibilityLabel={t('appearance.numberPreviewLabel')}>
      <Text variant="body">{formatNumber(1234567, format)}</Text>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────
const THEME_OPTIONS: { value: ThemeMode; key: 'appearance.themeSystem' | 'appearance.themeLight' | 'appearance.themeDark' }[] = [
  { value: 'system', key: 'appearance.themeSystem' },
  { value: 'light',  key: 'appearance.themeLight' },
  { value: 'dark',   key: 'appearance.themeDark' },
];

const FONT_SIZE_OPTIONS: { value: FontSize; key: 'appearance.fontSmall' | 'appearance.fontNormal' | 'appearance.fontLarge' | 'appearance.fontXlarge' }[] = [
  { value: 'small',   key: 'appearance.fontSmall' },
  { value: 'normal',  key: 'appearance.fontNormal' },
  { value: 'large',   key: 'appearance.fontLarge' },
  { value: 'xlarge',  key: 'appearance.fontXlarge' },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; key: 'appearance.numArabicIndic' | 'appearance.numWestern' }[] = [
  { value: 'arabic-indic', key: 'appearance.numArabicIndic' },
  { value: 'western',      key: 'appearance.numWestern' },
];

const MAP_LANG_OPTIONS: { value: MapLanguage; key: 'appearance.mapLangAr' | 'appearance.mapLangEn' }[] = [
  { value: 'ar', key: 'appearance.mapLangAr' },
  { value: 'en', key: 'appearance.mapLangEn' },
];

const DATE_FORMAT_OPTIONS: { value: DateFormat; key: 'appearance.dateArabic' | 'appearance.dateGregorian' }[] = [
  { value: 'arabic',    key: 'appearance.dateArabic' },
  { value: 'gregorian', key: 'appearance.dateGregorian' },
];

export function AppearanceScreen(): ReactElement {
  const { mode, setMode } = useAppTheme();
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULTS);

  useEffect(() => {
    void loadPrefs().then(setPrefs);
  }, []);

  const update = <K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void savePrefs(next);
  };

  return (
    <Screen scroll testID="appearance-screen">
      <ScreenTitle title={t('appearance.title')} />

      {/* ── Theme ── */}
      <SectionHeading label={t('appearance.sectionTheme')} />
      {THEME_OPTIONS.map(({ value, key }) => (
        <OptionRow
          key={value}
          title={t(key)}
          selected={mode === value}
          onPress={() => setMode(value)}
          testID={`appearance-theme-${value}`}
        />
      ))}

      {/* ── Font size ── */}
      <SectionHeading label={t('appearance.sectionFontSize')} />
      <FontPreview fontSize={prefs.fontSize} />
      {FONT_SIZE_OPTIONS.map(({ value, key }) => (
        <OptionRow
          key={value}
          title={t(key)}
          selected={prefs.fontSize === value}
          onPress={() => update('fontSize', value)}
          testID={`appearance-font-${value}`}
        />
      ))}

      {/* ── Number format ── */}
      <SectionHeading label={t('appearance.sectionNumberFormat')} />
      <NumberPreview format={prefs.numberFormat} />
      {NUMBER_FORMAT_OPTIONS.map(({ value, key }) => (
        <OptionRow
          key={value}
          title={t(key)}
          selected={prefs.numberFormat === value}
          onPress={() => update('numberFormat', value)}
          testID={`appearance-numfmt-${value}`}
        />
      ))}

      {/* ── Map labels language ── */}
      <SectionHeading label={t('appearance.sectionMapLanguage')} />
      {MAP_LANG_OPTIONS.map(({ value, key }) => (
        <OptionRow
          key={value}
          title={t(key)}
          selected={prefs.mapLanguage === value}
          onPress={() => update('mapLanguage', value)}
          testID={`appearance-maplang-${value}`}
        />
      ))}

      {/* ── Date format ── */}
      <SectionHeading label={t('appearance.sectionDateFormat')} />
      {DATE_FORMAT_OPTIONS.map(({ value, key }) => (
        <OptionRow
          key={value}
          title={t(key)}
          selected={prefs.dateFormat === value}
          onPress={() => update('dateFormat', value)}
          testID={`appearance-datefmt-${value}`}
        />
      ))}

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
  preview: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    gap: 4,
  },
  previewText: {
    textAlign: 'center',
  },
  previewSub: {
    textAlign: 'center',
  },
  spacer: {
    height: 32,
  },
});
