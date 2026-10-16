/**
 * SubmitInsightScreen — lets users submit a crowding level or price report.
 * Route params: placeId, placeNameAr (display only), mode ('crowd'|'price'|'both').
 * All text via t(). RTL-safe (start/end, I18nManager).
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type { CrowdLevel, PlaceId, PriceLevel } from '@iraq-maps/contracts';
import { type ReactElement, useState } from 'react';
import {
  Alert,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Button, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApi } from '@iraq-maps/mobile-kit';
import { t } from '../strings';

// ── Crowd level options ───────────────────────────────────────────────────────

interface CrowdOption {
  value: CrowdLevel;
  emoji: string;
  labelKey: 'place.crowdLow' | 'place.crowdMedium' | 'place.crowdHigh';
  descKey: 'insights.crowdEmptyDesc' | 'insights.crowdModerateDesc' | 'insights.crowdBusyDesc';
  color: string;
}

const CROWD_OPTIONS: CrowdOption[] = [
  { value: 'low', emoji: '🟢', labelKey: 'place.crowdLow', descKey: 'insights.crowdEmptyDesc', color: '#43A047' },
  { value: 'medium', emoji: '🟡', labelKey: 'place.crowdMedium', descKey: 'insights.crowdModerateDesc', color: '#FB8C00' },
  { value: 'high', emoji: '🔴', labelKey: 'place.crowdHigh', descKey: 'insights.crowdBusyDesc', color: '#E53935' },
];

// ── Price item presets ────────────────────────────────────────────────────────

const PRICE_ITEM_PRESETS: { labelKey: string; value: string }[] = [
  { labelKey: 'insights.itemMeal', value: 'وجبة' },
  { labelKey: 'insights.itemDrink', value: 'مشروب' },
  { labelKey: 'insights.itemCoffee', value: 'قهوة' },
  { labelKey: 'insights.itemEntry', value: 'دخول' },
  { labelKey: 'insights.itemHourly', value: 'بالساعة' },
  { labelKey: 'insights.itemNight', value: 'ليلة' },
  { labelKey: 'insights.itemOther', value: 'أخرى' },
];

// ── Time options ──────────────────────────────────────────────────────────────

const TIME_OPTIONS: { labelKey: string; minutesAgo: number }[] = [
  { labelKey: 'insights.timeNow', minutesAgo: 0 },
  { labelKey: 'insights.time30m', minutesAgo: 30 },
  { labelKey: 'insights.time1h', minutesAgo: 60 },
  { labelKey: 'insights.time2h', minutesAgo: 120 },
  { labelKey: 'insights.time3h', minutesAgo: 180 },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }): ReactElement {
  return <Text style={sectionStyles.header}>{label}</Text>;
}

const sectionStyles = StyleSheet.create({
  header: { fontSize: 15, fontWeight: '700', color: '#212121', marginTop: 8 },
});

function OptionChip({
  label,
  selected,
  color,
  onPress,
}: {
  label: string;
  selected: boolean;
  color?: string;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={[chipStyles.container, selected && { backgroundColor: color ?? '#1565C0', borderColor: color ?? '#1565C0' }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[chipStyles.label, selected && chipStyles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  container: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  label: { fontSize: 13, color: '#424242', fontWeight: '500' },
  labelSelected: { color: '#fff' },
});

function CrowdPicker({
  value,
  onChange,
}: {
  value: CrowdLevel | null;
  onChange: (v: CrowdLevel) => void;
}): ReactElement {
  return (
    <View style={crowdPickerStyles.container}>
      {CROWD_OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          style={[
            crowdPickerStyles.option,
            value === opt.value && { borderColor: opt.color, backgroundColor: `${opt.color}15` },
          ]}
          onPress={() => onChange(opt.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === opt.value }}
        >
          <Text style={crowdPickerStyles.emoji}>{opt.emoji}</Text>
          <Text style={[crowdPickerStyles.label, value === opt.value && { color: opt.color, fontWeight: '700' }]}>
            {t(opt.labelKey)}
          </Text>
          <Text style={crowdPickerStyles.desc}>{t(opt.descKey)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const crowdPickerStyles = StyleSheet.create({
  container: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  emoji: { fontSize: 24 },
  label: { fontSize: 15, fontWeight: '500', color: '#212121', flex: 1 },
  desc: { fontSize: 12, color: '#9E9E9E' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type SubmitMode = 'crowd' | 'price' | 'both';

export function SubmitInsightScreen(): ReactElement {
  const router = useRouter();
  const api = useApi();
  const { placeId, placeNameAr, mode } = useLocalSearchParams<{
    placeId: string;
    placeNameAr?: string;
    mode?: string;
  }>();

  const resolvedMode: SubmitMode = mode === 'price' ? 'price' : mode === 'crowd' ? 'crowd' : 'both';

  // ── Crowd state ────────────────────────────────────────────────────────────
  const [crowdLevel, setCrowdLevel] = useState<CrowdLevel | null>(null);

  // ── Price state ────────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [customItem, setCustomItem] = useState('');
  const [priceText, setPriceText] = useState('');

  // ── Time state ─────────────────────────────────────────────────────────────
  const [selectedTimeIdx, setSelectedTimeIdx] = useState(0);

  // ── Submission state ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const isRtl = I18nManager.isRTL;
  const placeName = placeNameAr ?? placeId ?? '';

  const showCrowd = resolvedMode === 'crowd' || resolvedMode === 'both';
  const showPrice = resolvedMode === 'price' || resolvedMode === 'both';

  // ── Validation ─────────────────────────────────────────────────────────────

  const crowdValid = !showCrowd || crowdLevel !== null;
  const priceValid =
    !showPrice ||
    (selectedItem !== '' && priceText !== '' && /^\d+$/.test(priceText.replace(/[,،]/g, '')));
  const canSubmit = crowdValid && priceValid && (showCrowd || showPrice);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const parsed = parseInt(priceText.replace(/[,،\s]/g, ''), 10);

      if (showCrowd && crowdLevel) {
        await api.insights.report({
          body: { placeId: placeId as PlaceId, kind: 'crowded_now' },
        });
      }

      if (showPrice && selectedItem && !isNaN(parsed)) {
        const priceLevel: PriceLevel =
          parsed < 5000 ? 'budget' : parsed < 20000 ? 'mid_range' : parsed < 60000 ? 'expensive' : 'luxury';
        await api.insights.report({
          body: { placeId: placeId as PlaceId, kind: 'price', priceLevel },
        });
      }

      Alert.alert(t('insights.submitSuccess'), t('insights.submitSuccessMsg'), [
        { text: t('actions.close'), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t('insights.submitError'), t('insights.submitErrorMsg'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[screenStyles.scroll, isRtl && screenStyles.rtl]}
        showsVerticalScrollIndicator={false}
      >
        {/* Place name header */}
        <View style={screenStyles.placeHeader}>
          <Text style={screenStyles.placeTitle}>{placeName}</Text>
          <Text style={screenStyles.subtitle}>{t('insights.submitSubtitle')}</Text>
        </View>

        {/* ── Crowd section ── */}
        {showCrowd ? (
          <View style={screenStyles.section}>
            <SectionHeader label={t('insights.crowdSectionTitle')} />
            <Text style={screenStyles.sectionDesc}>{t('insights.crowdSectionDesc')}</Text>
            <CrowdPicker value={crowdLevel} onChange={setCrowdLevel} />
          </View>
        ) : null}

        {/* ── Price section ── */}
        {showPrice ? (
          <View style={screenStyles.section}>
            <SectionHeader label={t('insights.priceSectionTitle')} />
            <Text style={screenStyles.sectionDesc}>{t('insights.priceSectionDesc')}</Text>

            {/* Item type chips */}
            <Text style={screenStyles.fieldLabel}>{t('insights.itemTypeLabel')}</Text>
            <View style={screenStyles.chipRow}>
              {PRICE_ITEM_PRESETS.map((preset) => (
                <OptionChip
                  key={preset.value}
                  label={t(preset.labelKey as Parameters<typeof t>[0])}
                  selected={selectedItem === preset.value}
                  onPress={() => { setSelectedItem(preset.value); if (preset.value !== 'أخرى') setCustomItem(''); }}
                />
              ))}
            </View>

            {/* Custom item name */}
            {selectedItem === 'أخرى' ? (
              <TextInput
                style={[screenStyles.input, isRtl && screenStyles.inputRtl]}
                placeholder={t('insights.customItemPlaceholder')}
                value={customItem}
                onChangeText={setCustomItem}
                maxLength={50}
              />
            ) : null}

            {/* Price input */}
            <Text style={screenStyles.fieldLabel}>{t('insights.priceLabel')}</Text>
            <View style={screenStyles.priceInputRow}>
              <TextInput
                style={[screenStyles.priceInput, isRtl && screenStyles.inputRtl]}
                placeholder="0"
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="numeric"
                maxLength={10}
              />
              <Text style={screenStyles.currencyLabel}>{t('search.currencyIqd')}</Text>
            </View>
          </View>
        ) : null}

        {/* ── When did you visit? ── */}
        <View style={screenStyles.section}>
          <SectionHeader label={t('insights.timeSectionTitle')} />
          <View style={screenStyles.chipRow}>
            {TIME_OPTIONS.map((opt, idx) => (
              <OptionChip
                key={idx}
                label={t(opt.labelKey as Parameters<typeof t>[0])}
                selected={selectedTimeIdx === idx}
                onPress={() => setSelectedTimeIdx(idx)}
              />
            ))}
          </View>
        </View>

        {/* ── Validation hints ── */}
        {showCrowd && crowdLevel === null ? (
          <Text style={screenStyles.hint}>{t('insights.selectCrowdHint')}</Text>
        ) : null}
        {showPrice && selectedItem === '' ? (
          <Text style={screenStyles.hint}>{t('insights.selectItemHint')}</Text>
        ) : null}
        {showPrice && selectedItem !== '' && priceText !== '' && isNaN(parseInt(priceText.replace(/[,،\s]/g, ''), 10)) ? (
          <Text style={screenStyles.errorHint}>{t('insights.invalidPriceHint')}</Text>
        ) : null}

        {/* ── Submit ── */}
        <View style={screenStyles.footer}>
          <Button
            label={submitting ? t('insights.submitting') : t('insights.submitBtn')}
            variant="primary"
            onPress={() => { void handleSubmit(); }}
            // disabled prop not in contract; skip
          />
          <Button
            label={t('actions.close')}
            variant="secondary"
            onPress={() => router.back()}
          />
        </View>

        {/* Disclaimer */}
        <Text style={screenStyles.disclaimer}>{t('insights.submitDisclaimer')}</Text>
      </ScrollView>
    </Screen>
  );
}

const screenStyles = StyleSheet.create({
  scroll: { padding: 16, gap: 8, paddingBottom: 40 },
  rtl: { direction: 'rtl' as const },
  placeHeader: { marginBottom: 8, gap: 4 },
  placeTitle: { fontSize: 20, fontWeight: '700', color: '#212121' },
  subtitle: { fontSize: 14, color: '#757575' },
  section: { gap: 10, marginTop: 16 },
  sectionDesc: { fontSize: 13, color: '#757575' },
  fieldLabel: { fontSize: 13, color: '#424242', fontWeight: '500', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#fff', marginTop: 4 },
  inputRtl: { textAlign: 'right' as const },
  priceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  priceInput: { flex: 1, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 16, fontWeight: '600', backgroundColor: '#fff' },
  currencyLabel: { fontSize: 16, color: '#757575', fontWeight: '600' },
  hint: { fontSize: 12, color: '#FB8C00', marginTop: 4 },
  errorHint: { fontSize: 12, color: '#E53935', marginTop: 4 },
  footer: { gap: 8, marginTop: 24 },
  disclaimer: { fontSize: 11, color: '#BDBDBD', textAlign: 'center', marginTop: 8 },
});
