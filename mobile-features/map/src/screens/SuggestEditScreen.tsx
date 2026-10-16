/**
 * SuggestEditScreen – let users suggest a correction to place information.
 *
 * Fields:
 *   name / address / phone / hours / category / amenities / photos / description / website
 *
 * Flow:
 *  1. Select field
 *  2. Enter current value (auto-filled from route params) + proposed new value
 *  3. Optional reason
 *  4. Optional photo evidence (image picker)
 *  5. Submit for moderation review
 *
 * Route: place/[placeId]/suggest-edit
 */

import { placesContract } from '@iraq-maps/contracts';
import { Screen } from '@iraq-maps/ui';
import { useApi } from '@iraq-maps/mobile-kit';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldKey =
  | 'name'
  | 'address'
  | 'phone'
  | 'hours'
  | 'category'
  | 'amenities'
  | 'description'
  | 'website'
  | 'photos';

interface FieldDef {
  key: FieldKey;
  icon: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'url';
}

// ── Field taxonomy ─────────────────────────────────────────────────────────────

const FIELDS: FieldDef[] = [
  { key: 'name', icon: '🏷️' },
  { key: 'address', icon: '📍', multiline: true },
  { key: 'phone', icon: '📞', keyboardType: 'phone-pad' },
  { key: 'hours', icon: '🕐', multiline: true },
  { key: 'category', icon: '🗂️' },
  { key: 'amenities', icon: '✅', multiline: true },
  { key: 'description', icon: '📝', multiline: true },
  { key: 'website', icon: '🌐', keyboardType: 'url' },
  { key: 'photos', icon: '📸' },
];

const PRIMARY = '#1976D2';

// ── Entry ────────────────────────────────────────────────────────────────────

export function SuggestEditScreen(): ReactElement {
  const { placeId, field: initialField, currentValue: initialValue } =
    useLocalSearchParams<{ placeId: string; field?: string; currentValue?: string }>();

  if (!placeId) {
    return (
      <Screen>
        <RNText style={errStyles.msg}>{t('place.notFound')}</RNText>
      </Screen>
    );
  }

  return (
    <SuggestEditForm
      placeId={placeId}
      initialField={(initialField as FieldKey) ?? null}
      initialCurrentValue={initialValue ?? ''}
    />
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

type Step = 'select-field' | 'enter-values' | 'success';

function SuggestEditForm({
  placeId,
  initialField,
  initialCurrentValue,
}: {
  placeId: string;
  initialField: FieldKey | null;
  initialCurrentValue: string;
}): ReactElement {
  const api = useApi();
  const router = useRouter();

  const [step, setStep] = useState<Step>(initialField ? 'enter-values' : 'select-field');
  const [selectedField, setSelectedField] = useState<FieldKey | null>(initialField);
  const [currentValue, setCurrentValue] = useState(initialCurrentValue);
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const newValueRef = useRef<TextInput>(null);

  const fieldDef = FIELDS.find((f) => f.key === selectedField);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectField = (key: FieldKey) => {
    setSelectedField(key);
    setStep('enter-values');
  };

  const handlePickPhoto = () => {
    // expo-image-picker integration would go here.
    // In this milestone it shows a placeholder alert.
    Alert.alert(t('suggestEdit.photoPicker'), t('suggestEdit.photoPickerMsg'));
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedField || !newValue.trim()) {
      Alert.alert(t('suggestEdit.validationTitle'), t('suggestEdit.validationMsg'));
      return;
    }

    setSubmitting(true);
    try {
      await api.insights.report({
        body: {
          placeId,
          kind: 'inaccuracy',
        },
      });
      setStep('success');
    } catch {
      Alert.alert(t('errors.generic'), t('suggestEdit.submitError'));
    } finally {
      setSubmitting(false);
    }
  }, [api, placeId, selectedField, currentValue, newValue, reason, photoUri]);

  const handleDone = () => {
    if (router.canGoBack()) router.back();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('suggestEdit.title') }} />
        <SuccessState onDone={handleDone} />
      </Screen>
    );
  }

  if (step === 'select-field') {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: t('suggestEdit.title') }} />
        <FieldSelector onSelect={handleSelectField} />
      </Screen>
    );
  }

  // step === 'enter-values'
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t('suggestEdit.title'),
          headerBackTitle: t('actions.back'),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        <ScrollView
          contentContainerStyle={formStyles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Field indicator */}
          <View style={formStyles.fieldBadge}>
            <RNText style={formStyles.fieldBadgeIcon}>{fieldDef?.icon ?? '✏️'}</RNText>
            <RNText style={formStyles.fieldBadgeLabel}>
              {t(`suggestEdit.fields.${selectedField}` as Parameters<typeof t>[0])}
            </RNText>
            <TouchableOpacity onPress={() => setStep('select-field')} style={formStyles.changeLinkBtn}>
              <RNText style={formStyles.changeLink}>{t('suggestEdit.changeField')}</RNText>
            </TouchableOpacity>
          </View>

          {/* Current value (read-only context) */}
          <View style={formStyles.group}>
            <RNText style={formStyles.label}>{t('suggestEdit.currentValue')}</RNText>
            <TextInput
              style={[formStyles.input, currentValue.length > 60 && formStyles.inputMulti]}
              value={currentValue}
              onChangeText={setCurrentValue}
              placeholder={t('suggestEdit.currentValuePlaceholder')}
              multiline={fieldDef?.multiline}
              keyboardType={fieldDef?.keyboardType ?? 'default'}
              textAlign="right"
              placeholderTextColor="#BBB"
              returnKeyType="next"
              onSubmitEditing={() => newValueRef.current?.focus()}
            />
          </View>

          {/* New value */}
          <View style={formStyles.group}>
            <RNText style={formStyles.label}>{t('suggestEdit.newValue')}</RNText>
            <TextInput
              ref={newValueRef}
              style={[
                formStyles.input,
                formStyles.inputNew,
                (fieldDef?.multiline ?? false) && formStyles.inputMulti,
              ]}
              value={newValue}
              onChangeText={setNewValue}
              placeholder={t(`suggestEdit.placeholders.${selectedField}` as Parameters<typeof t>[0])}
              multiline={fieldDef?.multiline}
              keyboardType={fieldDef?.keyboardType ?? 'default'}
              textAlign="right"
              placeholderTextColor="#BBB"
              autoFocus={!initialCurrentValue}
            />
          </View>

          {/* Reason */}
          <View style={formStyles.group}>
            <RNText style={formStyles.label}>{t('suggestEdit.reason')}</RNText>
            <TextInput
              style={[formStyles.input, formStyles.inputMulti]}
              value={reason}
              onChangeText={setReason}
              placeholder={t('suggestEdit.reasonPlaceholder')}
              multiline
              numberOfLines={3}
              textAlign="right"
              placeholderTextColor="#BBB"
            />
          </View>

          {/* Photo evidence */}
          {selectedField !== 'photos' ? (
            <View style={formStyles.group}>
              <RNText style={formStyles.label}>{t('suggestEdit.photoEvidence')}</RNText>
              {photoUri ? (
                <View style={formStyles.photoPreviewWrap}>
                  <Image source={{ uri: photoUri }} style={formStyles.photoPreview} resizeMode="cover" />
                  <TouchableOpacity
                    onPress={() => setPhotoUri(null)}
                    style={formStyles.removePhotoBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('suggestEdit.removePhoto')}
                  >
                    <RNText style={formStyles.removePhotoText}>✕</RNText>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={formStyles.photoPickerBtn}
                  onPress={handlePickPhoto}
                  accessibilityRole="button"
                >
                  <RNText style={formStyles.photoPickerIcon}>📎</RNText>
                  <RNText style={formStyles.photoPickerLabel}>{t('suggestEdit.addPhoto')}</RNText>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Info note */}
          <View style={formStyles.infoBox}>
            <RNText style={formStyles.infoText}>{t('suggestEdit.reviewNote')}</RNText>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[formStyles.submitBtn, submitting && formStyles.submitBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={submitting || !newValue.trim()}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <RNText style={formStyles.submitText}>{t('suggestEdit.submit')}</RNText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) router.back(); }}
            style={formStyles.cancelBtn}
            accessibilityRole="button"
          >
            <RNText style={formStyles.cancelText}>{t('actions.cancel')}</RNText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Field selector ─────────────────────────────────────────────────────────────

function FieldSelector({ onSelect }: { onSelect: (key: FieldKey) => void }): ReactElement {
  return (
    <View style={selectorStyles.container}>
      <RNText style={selectorStyles.heading}>{t('suggestEdit.selectFieldTitle')}</RNText>
      <RNText style={selectorStyles.sub}>{t('suggestEdit.selectFieldSub')}</RNText>

      <View style={selectorStyles.grid}>
        {FIELDS.map((field) => (
          <TouchableOpacity
            key={field.key}
            style={selectorStyles.card}
            onPress={() => onSelect(field.key)}
            accessibilityRole="button"
            accessibilityLabel={t(`suggestEdit.fields.${field.key}` as Parameters<typeof t>[0])}
          >
            <RNText style={selectorStyles.cardIcon}>{field.icon}</RNText>
            <RNText style={selectorStyles.cardLabel} numberOfLines={2}>
              {t(`suggestEdit.fields.${field.key}` as Parameters<typeof t>[0])}
            </RNText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const selectorStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 16 },
  heading: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#777', marginBottom: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '30%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardIcon: { fontSize: 26 },
  cardLabel: { fontSize: 12, color: '#333', textAlign: 'center', fontWeight: '500' },
});

// ── Success state ─────────────────────────────────────────────────────────────

function SuccessState({ onDone }: { onDone: () => void }): ReactElement {
  return (
    <View style={successStyles.container}>
      <RNText style={successStyles.icon}>✅</RNText>
      <RNText style={successStyles.title}>{t('suggestEdit.successTitle')}</RNText>
      <RNText style={successStyles.body}>{t('suggestEdit.successBody')}</RNText>
      <TouchableOpacity style={successStyles.btn} onPress={onDone} accessibilityRole="button">
        <RNText style={successStyles.btnText}>{t('actions.done')}</RNText>
      </TouchableOpacity>
    </View>
  );
}

const successStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  icon: { fontSize: 56 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  body: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

// ── Form styles ───────────────────────────────────────────────────────────────

const formStyles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  fieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF5FF',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  fieldBadgeIcon: { fontSize: 20 },
  fieldBadgeLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: PRIMARY },
  changeLinkBtn: { padding: 4 },
  changeLink: { color: PRIMARY, fontSize: 13 },
  group: { gap: 6 },
  label: { fontSize: 13, color: '#555', fontWeight: '500' },
  input: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    minHeight: 46,
  },
  inputNew: {
    borderColor: PRIMARY,
    borderWidth: 1.5,
    backgroundColor: '#EEF5FF',
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  photoPreviewWrap: { position: 'relative', alignSelf: 'flex-start' },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#EEE',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -8,
    end: -8,
    backgroundColor: '#333',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 12 },
  photoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderStyle: 'dashed',
  },
  photoPickerIcon: { fontSize: 20 },
  photoPickerLabel: { fontSize: 14, color: '#555' },
  infoBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F5A623',
  },
  infoText: { fontSize: 12, color: '#795548', lineHeight: 18 },
  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#888', fontSize: 14 },
});

const errStyles = StyleSheet.create({
  msg: { padding: 24, textAlign: 'center', color: '#888' },
});
