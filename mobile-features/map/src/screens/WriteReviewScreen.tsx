/**
 * WriteReviewScreen – full review writing experience with category-specific
 * prompts, photo upload, visit date picker, anonymous option and tips.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fullReviewsContract } from '@iraq-maps/contracts';
import { initClient } from '@ts-rest/core';
import { uploadAsset, useApi, useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const STAR = '★';
const STAR_EMPTY = '☆';
const MAX_PHOTOS = 5;
const MIN_TEXT = 10;
const MAX_TEXT = 1000;
const PRIMARY = '#1976D2';
const GOLD = '#F5A623';
const GREY = '#9E9E9E';

// ── Category-specific prompts ─────────────────────────────────────────────────

type PlaceCategory = 'restaurant' | 'cafe' | 'hotel' | 'shop' | 'attraction' | 'service' | 'other';

const CATEGORY_PROMPTS: Record<PlaceCategory, string[]> = {
  restaurant: [
    t('reviews.prompt.foodQuality'),
    t('reviews.prompt.service'),
    t('reviews.prompt.ambiance'),
    t('reviews.prompt.value'),
  ],
  cafe: [
    t('reviews.prompt.drinks'),
    t('reviews.prompt.atmosphere'),
    t('reviews.prompt.wifi'),
    t('reviews.prompt.prices'),
  ],
  hotel: [
    t('reviews.prompt.cleanliness'),
    t('reviews.prompt.staffFriendliness'),
    t('reviews.prompt.location'),
    t('reviews.prompt.facilities'),
  ],
  shop: [
    t('reviews.prompt.productQuality'),
    t('reviews.prompt.priceValue'),
    t('reviews.prompt.staffHelpfulness'),
    t('reviews.prompt.stockVariety'),
  ],
  attraction: [
    t('reviews.prompt.experience'),
    t('reviews.prompt.accessibility'),
    t('reviews.prompt.crowding'),
    t('reviews.prompt.worth'),
  ],
  service: [
    t('reviews.prompt.quality'),
    t('reviews.prompt.professionalism'),
    t('reviews.prompt.waitTime'),
    t('reviews.prompt.valueForMoney'),
  ],
  other: [
    t('reviews.prompt.overall'),
    t('reviews.prompt.recommend'),
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }): ReactElement {
  return (
    <View style={srStyles.row} accessibilityLabel={t('reviews.ratingLabel')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.starLabel', { n })}
          testID={`write-review-star-${n}`}
          // eslint-disable-next-line no-restricted-syntax
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Text style={[srStyles.star, { color: n <= value ? GOLD : '#DDD' }]}>
            {n <= value ? STAR : STAR_EMPTY}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RatingLabel({ rating }: { rating: number }): ReactElement {
  const labels: Record<number, string> = {
    1: t('reviews.ratingLabel1'),
    2: t('reviews.ratingLabel2'),
    3: t('reviews.ratingLabel3'),
    4: t('reviews.ratingLabel4'),
    5: t('reviews.ratingLabel5'),
  };
  if (rating === 0) return <Text style={srStyles.labelHint}>{t('reviews.tapToRate')}</Text>;
  return <Text style={[srStyles.labelHint, { color: GOLD }]}>{labels[rating] ?? ''}</Text>;
}

function Tip({ text }: { text: string }): ReactElement {
  return (
    <View style={tipStyles.row}>
      <Text style={tipStyles.bullet}>•</Text>
      <Text style={tipStyles.text}>{text}</Text>
    </View>
  );
}

function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  uploading,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  uploading: boolean;
}): ReactElement {
  return (
    <View>
      <View style={photoStyles.row}>
        {photos.map((uri, idx) => (
          <View key={uri + String(idx)} style={photoStyles.thumb}>
            <Image source={{ uri }} style={photoStyles.img} />
            <TouchableOpacity
              style={photoStyles.remove}
              onPress={() => onRemove(idx)}
              accessibilityRole="button"
              accessibilityLabel={t('reviews.removePhoto')}
              testID={`remove-photo-${idx}`}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={photoStyles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable
            style={photoStyles.addBtn}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={t('reviews.addPhoto')}
            testID="add-photo-btn"
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={photoStyles.addIcon}>＋</Text>
            <Text style={photoStyles.addLabel}>{t('reviews.addPhoto')}</Text>
          </Pressable>
        )}
      </View>
      {uploading && (
        <View style={photoStyles.uploadRow}>
          <ActivityIndicator size="small" color={PRIMARY} />
          <Text style={photoStyles.uploadLabel}>{t('reviews.uploadingPhoto')}</Text>
        </View>
      )}
      <Text style={photoStyles.counter}>
        {t('reviews.photoCount', { n: `${photos.length}/${MAX_PHOTOS}` })}
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function WriteReviewScreen(): ReactElement {
  const router = useRouter();
  const { placeId, placeName, category } = useLocalSearchParams<{
    placeId: string;
    placeName?: string;
    category?: string;
  }>();
  const baseUrl = useApiBaseUrl();
  const api = useApi();
  const session = useSession();
  const userId = session.state.status === 'signedIn' ? session.state.user.id : null;

  const client = useMemo(
    () => initClient(fullReviewsContract, { baseUrl, baseHeaders: {} }),
    [baseUrl],
  );

  const placeCategory = (category as PlaceCategory | undefined) ?? 'other';
  const prompts = CATEGORY_PROMPTS[placeCategory] ?? CATEGORY_PROMPTS.other;

  // ── Form state ──────────────────────────────────────────────────────────────

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [visitDate, setVisitDate] = useState<Date | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // ── Loading state ───────────────────────────────────────────────────────────

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Validation ──────────────────────────────────────────────────────────────

  const textLen = text.trim().length;
  const textValid = textLen === 0 || (textLen >= MIN_TEXT && textLen <= MAX_TEXT);
  const canSubmit = rating > 0 && !submitting && !uploading && textValid;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const pickPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0]!.uri]);
    }
  }, [photos.length]);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDateChange = useCallback((_: unknown, date?: Date) => {
    setShowDatePicker(false);
    if (date) setVisitDate(date);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    if (!userId) {
      Alert.alert(t('reviews.loginRequired'));
      return;
    }
    if (!placeId) return;

    setSubmitting(true);
    try {
      // Upload photos to asset store first
      const photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        for (const uri of photos) {
          try {
            const id = await uploadAsset(api, baseUrl, { uri, purpose: 'provider_photo' });
            // Build full URL for photo reference
            photoUrls.push(`${baseUrl}/media/assets/${id}`);
          } catch {
            // Non-fatal: skip failed photo uploads
          }
        }
        setUploading(false);
      }

      const res = await client.createReview({
        body: {
          placeId: placeId as never,
          rating,
          text: text.trim().length >= MIN_TEXT ? text.trim() : undefined,
          photos: photoUrls.length > 0 ? photoUrls : undefined,
          isAnonymous,
          visitDate: visitDate ? visitDate.toISOString().split('T')[0] : undefined,
        },
      });

      if (res.status === 201) {
        router.back();
      } else if (res.status === 409) {
        Alert.alert(t('reviews.alreadyReviewed'));
      } else {
        Alert.alert(t('reviews.submitError'));
      }
    } catch {
      Alert.alert(t('reviews.submitError'));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }, [canSubmit, userId, placeId, photos, rating, text, isAnonymous, visitDate, client, api, baseUrl, router]);

  // ── Preview modal ───────────────────────────────────────────────────────────

  if (showPreview) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.backBtn}>
            <Text style={styles.backText}>{t('reviews.previewBack')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('reviews.previewTitle')}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <View style={srStyles.row}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Text key={n} style={[srStyles.star, { color: n <= rating ? GOLD : '#DDD' }]}>
                  {n <= rating ? STAR : STAR_EMPTY}
                </Text>
              ))}
            </View>
            {text.trim().length > 0 && (
              <Text style={styles.previewText}>{text.trim()}</Text>
            )}
            {isAnonymous && (
              <Text style={styles.anonBadge}>{t('reviews.anonymousLabel')}</Text>
            )}
            {visitDate && (
              <Text style={styles.visitDateText}>
                {t('reviews.visitDate')}: {visitDate.toLocaleDateString('ar-IQ')}
              </Text>
            )}
            {photos.length > 0 && (
              <View style={photoStyles.row}>
                {photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={previewStyles.photo} />
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitBig, !canSubmit && styles.submitBigDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            testID="write-review-submit-confirm"
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBigText}>{t('reviews.confirmSubmit')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('reviews.cancelForm')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {placeName ? t('reviews.writeReviewFor', { name: placeName }) : t('reviews.writeReview')}
        </Text>
        <TouchableOpacity
          style={[styles.previewBtn, !canSubmit && styles.previewBtnDisabled]}
          onPress={() => setShowPreview(true)}
          disabled={!canSubmit}
          accessibilityRole="button"
          testID="write-review-preview-btn"
        >
          <Text style={styles.previewBtnText}>{t('reviews.previewBtn')}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Star rating ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('reviews.ratingLabel')}</Text>
            <View style={styles.starRow}>
              <StarRating value={rating} onChange={setRating} />
            </View>
            <RatingLabel rating={rating} />
          </View>

          {/* ── Category-specific prompts ────────────────────────────── */}
          {prompts.length > 0 && rating > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('reviews.thinkAbout')}</Text>
              <View style={styles.promptGrid}>
                {prompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={styles.promptChip}
                    onPress={() => {
                      const append = text.trim() ? `\n${prompt}: ` : `${prompt}: `;
                      setText((prev) => prev + append);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.promptChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Text input ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('reviews.yourOpinion')}</Text>
            <TextInput
              style={[styles.textInput, !textValid && styles.textInputError]}
              value={text}
              onChangeText={setText}
              placeholder={t('reviews.textPlaceholder')}
              placeholderTextColor={GREY}
              multiline
              maxLength={MAX_TEXT}
              textAlignVertical="top"
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
              accessibilityLabel={t('reviews.yourOpinion')}
              testID="write-review-text-input"
            />
            <View style={styles.textCountRow}>
              {!textValid && textLen > 0 && (
                <Text style={styles.textError}>{t('reviews.textTooShort', { min: MIN_TEXT })}</Text>
              )}
              <Text style={[styles.textCount, textLen > MAX_TEXT * 0.9 && { color: '#F44336' }]}>
                {textLen} / {MAX_TEXT}
              </Text>
            </View>
          </View>

          {/* ── Photo strip ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('reviews.addPhotosLabel')}</Text>
            <PhotoStrip
              photos={photos}
              onAdd={pickPhoto}
              onRemove={removePhoto}
              uploading={uploading}
            />
          </View>

          {/* ── Visit date picker ────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('reviews.visitDateLabel')}</Text>
            <TouchableOpacity
              style={styles.datePicker}
              onPress={() => setShowDatePicker(true)}
              accessibilityRole="button"
              testID="write-review-date-btn"
            >
              <Text style={visitDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                {visitDate
                  ? visitDate.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })
                  : t('reviews.visitDatePlaceholder')}
              </Text>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.datePickerIcon}>📅</Text>
            </TouchableOpacity>
            {visitDate && (
              <TouchableOpacity onPress={() => setVisitDate(null)} accessibilityRole="button">
                <Text style={styles.clearDate}>{t('reviews.clearDate')}</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={visitDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={handleDateChange}
                locale="ar"
              />
            )}
          </View>

          {/* ── Anonymous toggle ─────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{t('reviews.anonymousLabel')}</Text>
                <Text style={styles.toggleHint}>{t('reviews.anonymousHint')}</Text>
              </View>
              <Switch
                value={isAnonymous}
                onValueChange={setIsAnonymous}
                thumbColor={isAnonymous ? PRIMARY : '#F5F5F5'}
                trackColor={{ false: '#E0E0E0', true: '#BBDEFB' }}
                testID="write-review-anon-switch"
              />
            </View>
          </View>

          {/* ── Tips ──────────────────────────────────────────────────── */}
          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>{t('reviews.tipsTitle')}</Text>
            <Tip text={t('reviews.tipSpecific')} />
            <Tip text={t('reviews.tipRespectful')} />
            <Tip text={t('reviews.tipRecent')} />
            <Tip text={t('reviews.tipHonest')} />
          </View>

          {/* ── Submit ──────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.submitBig, !canSubmit && styles.submitBigDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            testID="write-review-submit-btn"
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBigText}>{t('reviews.submitLabel')}</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 64 },
  backText: { color: PRIMARY, fontSize: 15 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  previewBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    minWidth: 64,
    alignItems: 'center',
  },
  previewBtnDisabled: { backgroundColor: '#BDBDBD' },
  previewBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  scroll: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#616161', textTransform: 'uppercase', letterSpacing: 0.4 },
  starRow: { alignItems: 'flex-start' },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    color: '#212121',
    backgroundColor: '#FFF',
  },
  textInputError: { borderColor: '#F44336' },
  textCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  textCount: { fontSize: 12, color: GREY, textAlign: 'auto' as const },
  textError: { fontSize: 12, color: '#F44336' },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: {
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promptChipText: { color: PRIMARY, fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  toggleLabel: { fontSize: 15, color: '#212121', fontWeight: '600' },
  toggleHint: { fontSize: 12, color: GREY, marginTop: 2 },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datePickerValue: { fontSize: 15, color: '#212121' },
  datePickerPlaceholder: { fontSize: 15, color: GREY },
  datePickerIcon: { fontSize: 18 },
  clearDate: { fontSize: 13, color: '#F44336', textAlign: 'auto' as const, marginTop: 4 },
  tipsBox: {
    backgroundColor: '#F9FBE7',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#F0F4C3',
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: '#558B2F', marginBottom: 2 },
  submitBig: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBigDisabled: { backgroundColor: '#BDBDBD' },
  submitBigText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  previewText: { fontSize: 15, color: '#212121', lineHeight: 22 },
  anonBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: '#F5F5F5',
    color: GREY,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  visitDateText: { fontSize: 13, color: GREY },
});

const srStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 40 },
  labelHint: { fontSize: 14, color: GREY, marginTop: 4 },
});

const photoStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 80, height: 80, position: 'relative' },
  img: { width: 80, height: 80, borderRadius: 10 },
  remove: {
    position: 'absolute',
    top: -6,
    end: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D32F2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  addBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#FAFAFA',
  },
  addIcon: { fontSize: 26, color: GREY },
  addLabel: { fontSize: 10, color: GREY },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  uploadLabel: { fontSize: 13, color: PRIMARY },
  counter: { fontSize: 12, color: GREY, marginTop: 4 },
});

const tipStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  bullet: { color: '#558B2F', fontSize: 15, lineHeight: 20 },
  text: { flex: 1, fontSize: 13, color: '#558B2F', lineHeight: 20 },
});

const previewStyles = StyleSheet.create({
  photo: { width: 80, height: 80, borderRadius: 8 },
});
