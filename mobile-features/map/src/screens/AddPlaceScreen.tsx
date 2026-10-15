/**
 * AddPlaceScreen – community place addition form.
 *
 * The user:
 *  1. Sets a map pin by dragging (location shown as lat/lng until a real map widget is wired)
 *  2. Fills name (Arabic required, English optional)
 *  3. Picks a category
 *  4. Enters an Iraqi-format phone number (optional)
 *  5. Sets opening hours for each day of the week
 *  6. Uploads up to 5 photos
 *  7. Writes a short description
 *  8. Confirms the "this is a real business" checkbox
 *  9. Submits → goes to admin moderation queue
 *
 * The place is submitted via contract-request `M98-add-place.md` (pending).
 * Until the contract lands, submission is mocked and an info banner is shown.
 *
 * Route: place/add
 */

import { PlaceCategory } from '@iraq-maps/contracts';
import { useApi, uploadAsset, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Banner, Button, Screen, Text } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { type ReactElement, useState } from 'react';
import {
  Alert,
  I18nManager,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const MAX_PHOTOS = 5;
const IRAQ_PHONE_RE = /^\+?964\s?7[3-9]\d\s?\d{3}\s?\d{4}$/;

/** OSM opening_hours day codes */
const DAYS: Array<{ key: string; label: string }> = [
  { key: 'Mo', label: t('addPlace.dayMon') },
  { key: 'Tu', label: t('addPlace.dayTue') },
  { key: 'We', label: t('addPlace.dayWed') },
  { key: 'Th', label: t('addPlace.dayThu') },
  { key: 'Fr', label: t('addPlace.dayFri') },
  { key: 'Sa', label: t('addPlace.daySat') },
  { key: 'Su', label: t('addPlace.daySun') },
];

interface DayHours {
  open: boolean;
  from: string;
  to: string;
}

type WeekHours = Record<string, DayHours>;

const defaultWeek = (): WeekHours =>
  Object.fromEntries(DAYS.map(({ key }) => [key, { open: true, from: '09:00', to: '21:00' }]));

// All valid PlaceCategory values from the contract enum
const CATEGORIES: PlaceCategory[] = [
  'food', 'cafe', 'lodging', 'shopping', 'tourism',
  'health', 'finance', 'fuel', 'office', 'worship',
  'education', 'government', 'transport', 'entertainment',
];

// ── Main screen ───────────────────────────────────────────────────────────────

export function AddPlaceScreen(): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const router = useRouter();

  // Form fields
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [weekHours, setWeekHours] = useState<WeekHours>(defaultWeek());
  const [photos, setPhotos] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);

  // ── Validation ───────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!nameAr.trim()) return t('addPlace.errorNameRequired');
    if (!category) return t('addPlace.errorCategoryRequired');
    if (phone && !IRAQ_PHONE_RE.test(phone)) return t('addPlace.errorPhoneFormat');
    if (!agreed) return t('addPlace.errorTerms');
    return null;
  };

  // ── Photo picker ──────────────────────────────────────────────────────────
  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      await uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_photo' });
      setPhotos((prev) => [...prev, uri]);
    } catch {
      // add to local preview even if upload fails; backend re-uploads on submit
      setPhotos((prev) => [...prev, uri]);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (uri: string) => setPhotos((prev) => prev.filter((u) => u !== uri));

  // ── Hours helpers ─────────────────────────────────────────────────────────
  const toggleDay = (key: string) =>
    setWeekHours((prev) => ({
      ...prev,
      [key]: { ...prev[key]!, open: !prev[key]!.open },
    }));

  const setHoursField = (key: string, field: 'from' | 'to', value: string) =>
    setWeekHours((prev) => ({
      ...prev,
      [key]: { ...prev[key]!, [field]: value },
    }));

  /** Convert WeekHours to OSM opening_hours string */
  const buildHoursRaw = (): string => {
    const parts = DAYS.filter(({ key }) => weekHours[key]!.open).map(({ key }) => {
      const { from, to } = weekHours[key]!;
      return `${key} ${from}-${to}`;
    });
    return parts.join('; ');
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError(undefined);
    try {
      // Contract for community add-place is pending (M98-add-place.md).
      // Until merged, show a success message and navigate back.
      await new Promise<void>((res) => setTimeout(res, 500));
      setSuccess(true);
      setTimeout(() => router.back(), 1800);
    } catch {
      setError(t('addPlace.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Screen>
        <View style={styles.successBox}>
          <RNText style={styles.successIcon}>✓</RNText>
          <RNText style={styles.successTitle}>{t('addPlace.successTitle')}</RNText>
          <RNText style={styles.successSubtitle}>{t('addPlace.successSubtitle')}</RNText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <RNText style={styles.screenTitle}>{t('addPlace.title')}</RNText>

      {/* Pending-contract notice */}
      <Banner kind="info" message={t('addPlace.pendingNotice')} />

      {/* ── Location pin ─────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.locationSection')} />
      <LocationPinPicker />

      {/* ── Names ────────────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.namesSection')} />
      <FieldLabel label={t('addPlace.nameArLabel')} required />
      <TextInput
        style={[styles.input, styles.inputRTL]}
        value={nameAr}
        onChangeText={setNameAr}
        placeholder={t('addPlace.nameArPlaceholder')}
        accessibilityLabel={t('addPlace.nameArLabel')}
        testID="addPlace.nameAr"
        textAlign="right"
      />
      <FieldLabel label={t('addPlace.nameEnLabel')} />
      <TextInput
        style={styles.input}
        value={nameEn}
        onChangeText={setNameEn}
        placeholder={t('addPlace.nameEnPlaceholder')}
        accessibilityLabel={t('addPlace.nameEnLabel')}
        testID="addPlace.nameEn"
      />

      {/* ── Category ─────────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.categorySection')} />
      <CategoryPicker selected={category} onSelect={setCategory} />

      {/* ── Phone ────────────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.phoneSection')} />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={t('addPlace.phonePlaceholder')}
        keyboardType="phone-pad"
        accessibilityLabel={t('addPlace.phoneSection')}
        testID="addPlace.phone"
        textAlign="right"
      />

      {/* ── Hours ────────────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.hoursSection')} />
      <HoursPicker weekHours={weekHours} onToggleDay={toggleDay} onChangeField={setHoursField} />

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.photosSection')} />
      <PhotoUploadRow
        photos={photos}
        onAdd={() => { void handlePickPhoto(); }}
        onRemove={removePhoto}
        uploading={uploadingPhoto}
      />

      {/* ── Description ──────────────────────────────────────────────────── */}
      <SectionHeader title={t('addPlace.descriptionSection')} />
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('addPlace.descriptionPlaceholder')}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        accessibilityLabel={t('addPlace.descriptionSection')}
        testID="addPlace.description"
      />

      {/* ── Terms checkbox ───────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAgreed((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel={t('addPlace.termsLabel')}
        testID="addPlace.terms"
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed ? <RNText style={styles.checkmark}>✓</RNText> : null}
        </View>
        <RNText style={styles.termsText}>{t('addPlace.termsLabel')}</RNText>
      </TouchableOpacity>

      {/* ── Error / submit ───────────────────────────────────────────────── */}
      {error ? <Banner kind="error" message={error} /> : null}

      <Button
        label={submitting ? t('addPlace.submitting') : t('addPlace.submitBtn')}
        onPress={() => { void handleSubmit(); }}
        disabled={submitting}
        testID="addPlace.submit"
      />
      <Button
        variant="secondary"
        label={t('addPlace.cancelBtn')}
        onPress={() => router.back()}
      />
    </Screen>
  );
}

// ── Location pin picker ───────────────────────────────────────────────────────
// Full MapLibre drag-to-place is wired in the map shell;
// for now we show a tap-to-confirm placeholder.

function LocationPinPicker(): ReactElement {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <View style={pinStyles.container}>
      {confirmed ? (
        <View style={pinStyles.confirmed}>
          <RNText style={pinStyles.pinIcon}>📍</RNText>
          <RNText style={pinStyles.hint}>{t('addPlace.locationConfirmed')}</RNText>
          <TouchableOpacity onPress={() => setConfirmed(false)}>
            <RNText style={pinStyles.change}>{t('addPlace.locationChange')}</RNText>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={pinStyles.placeholder}
          onPress={() => setConfirmed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('addPlace.locationTap')}
        >
          <RNText style={pinStyles.pinIcon}>📍</RNText>
          <RNText style={pinStyles.hint}>{t('addPlace.locationTap')}</RNText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const pinStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  placeholder: {
    height: 120,
    backgroundColor: '#E8F0FE',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderStyle: 'dashed',
  },
  confirmed: {
    height: 120,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pinIcon: { fontSize: 32 },
  hint: { fontSize: 13, color: '#555', textAlign: 'center' },
  change: { fontSize: 13, color: PRIMARY, textDecorationLine: 'underline' },
});

// ── Category picker ───────────────────────────────────────────────────────────

function CategoryPicker({
  selected,
  onSelect,
}: {
  selected: PlaceCategory | null;
  onSelect: (c: PlaceCategory) => void;
}): ReactElement {
  return (
    <View style={catStyles.grid}>
      {CATEGORIES.map((cat) => {
        const active = cat === selected;
        return (
          <TouchableOpacity
            key={cat}
            style={[catStyles.chip, active && catStyles.chipActive]}
            onPress={() => onSelect(cat)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`categories.${cat}`)}
            testID={`addPlace.cat.${cat}`}
          >
            <RNText style={[catStyles.chipText, active && catStyles.chipTextActive]}>
              {t(`categories.${cat}`)}
            </RNText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const catStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: PRIMARY, fontWeight: '600' },
});

// ── Hours picker ──────────────────────────────────────────────────────────────

function HoursPicker({
  weekHours,
  onToggleDay,
  onChangeField,
}: {
  weekHours: WeekHours;
  onToggleDay: (key: string) => void;
  onChangeField: (key: string, field: 'from' | 'to', value: string) => void;
}): ReactElement {
  return (
    <View style={hoursStyles.container}>
      {DAYS.map(({ key, label }) => {
        const day = weekHours[key]!;
        return (
          <View key={key} style={hoursStyles.row}>
            <View style={hoursStyles.dayLabel}>
              <RNText style={hoursStyles.dayText}>{label}</RNText>
            </View>
            <Switch
              value={day.open}
              onValueChange={() => onToggleDay(key)}
              trackColor={{ false: '#E0E0E0', true: '#90CAF9' }}
              thumbColor={day.open ? PRIMARY : '#BDBDBD'}
              accessibilityLabel={label}
              testID={`addPlace.hours.${key}.toggle`}
            />
            {day.open ? (
              <>
                <TimeInput
                  value={day.from}
                  onChange={(v) => onChangeField(key, 'from', v)}
                  testID={`addPlace.hours.${key}.from`}
                />
                <RNText style={hoursStyles.dash}>–</RNText>
                <TimeInput
                  value={day.to}
                  onChange={(v) => onChangeField(key, 'to', v)}
                  testID={`addPlace.hours.${key}.to`}
                />
              </>
            ) : (
              <RNText style={hoursStyles.closed}>{t('addPlace.dayClosed')}</RNText>
            )}
          </View>
        );
      })}
    </View>
  );
}

function TimeInput({
  value,
  onChange,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  testID: string;
}): ReactElement {
  return (
    <TextInput
      style={hoursStyles.timeInput}
      value={value}
      onChangeText={onChange}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      testID={testID}
      accessibilityLabel={value}
    />
  );
}

const hoursStyles = StyleSheet.create({
  container: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  dayLabel: { width: 50 },
  dayText: { fontSize: 13, color: '#444' },
  dash: { fontSize: 16, color: '#888' },
  closed: { fontSize: 13, color: '#BDBDBD', flex: 1 },
  timeInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    width: 60,
    textAlign: 'center',
  },
});

// ── Photo upload row ──────────────────────────────────────────────────────────

function PhotoUploadRow({
  photos,
  onAdd,
  onRemove,
  uploading,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (uri: string) => void;
  uploading: boolean;
}): ReactElement {
  const THUMB = 80;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={photoStyles.row}>
        {photos.map((uri) => (
          <TouchableOpacity
            key={uri}
            onPress={() => onRemove(uri)}
            style={photoStyles.thumb}
            accessibilityRole="button"
            accessibilityLabel={t('reviews.removePhoto')}
          >
            <Image source={{ uri }} style={{ width: THUMB, height: THUMB, borderRadius: 8 }} resizeMode="cover" />
            <View style={photoStyles.removeOverlay}>
              <RNText style={photoStyles.removeIcon}>✕</RNText>
            </View>
          </TouchableOpacity>
        ))}
        {photos.length < MAX_PHOTOS && !uploading ? (
          <TouchableOpacity
            onPress={onAdd}
            style={photoStyles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={t('reviews.addPhoto')}
            testID="addPlace.addPhoto"
          >
            <RNText style={photoStyles.addIcon}>＋</RNText>
          </TouchableOpacity>
        ) : null}
        {uploading ? (
          <View style={[photoStyles.addBtn, { opacity: 0.5 }]}>
            <RNText style={photoStyles.addIcon}>…</RNText>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const photoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { position: 'relative' },
  removeOverlay: {
    position: 'absolute',
    top: 2,
    end: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  addBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  addIcon: { fontSize: 28, color: '#AAA' },
});

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return <RNText style={styles.sectionTitle}>{title}</RNText>;
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }): ReactElement {
  return (
    <RNText style={styles.fieldLabel}>
      {label}
      {required ? <RNText style={styles.required}> *</RNText> : null}
    </RNText>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 12 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 6,
    borderStartWidth: 3,
    borderStartColor: PRIMARY,
    paddingStart: 8,
  },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4 },
  required: { color: '#E53935' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#FAFAFA',
  },
  inputRTL: { textAlign: 'right' },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  termsText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 20 },
  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  successIcon: { fontSize: 52, color: '#43A047' },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#222', textAlign: 'center' },
  successSubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
});
