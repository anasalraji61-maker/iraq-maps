/**
 * M75: Reviews section for PlaceScreen.
 * Shows average rating, a list of reviews, and a form to submit or update your own.
 * M98: Users can attach up to 4 photos when writing a review (optimistic local display;
 *      backend persistence pending contract request M98-place-photo-reviews.md).
 */
import { type PlaceId, type Review, type RatingSummary } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl, uploadAsset, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, Text } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, TouchableOpacity, View } from 'react-native';
import { t } from '../strings';

const MAX_PHOTOS = 4;
// Unicode symbol constants — not translatable user-facing strings
const ICON_REMOVE = '✕'; // ✕
const ICON_ADD = '＋'; // ＋ (fullwidth plus)

// ── Star row ─────────────────────────────────────────────────────────────────

const STAR = '★';

function StarRow({
  value,
  onChange,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}): ReactElement {
  return (
    <View style={styles.stars} accessibilityLabel={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={readonly ? undefined : () => onChange?.(n)}
          disabled={readonly}
          accessibilityRole={readonly ? 'text' : 'button'}
          accessibilityLabel={`${n}`}
          testID={`star-${n}`}
        >
          <RNText style={{ fontSize: 24, color: n <= value ? '#F5A623' : '#CCC' }}>{STAR}</RNText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Photo strip (read-only thumbnails) ───────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;

function PhotoStrip({ uris }: { uris: string[] }): ReactElement | null {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (uris.length === 0) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
        {uris.map((uri, i) => (
          <TouchableOpacity
            key={uri}
            onPress={() => setLightboxIndex(i)}
            accessibilityRole="button"
            accessibilityLabel={t('lightbox.photo')}
          >
            <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {lightboxIndex !== null ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxIndex(null)}
        >
          <View style={lightboxStyles.overlay}>
            <Pressable
              style={lightboxStyles.closeBtn}
              onPress={() => setLightboxIndex(null)}
              accessibilityRole="button"
              accessibilityLabel={t('lightbox.close')}
            >
              <RNText style={lightboxStyles.closeText}>{t('lightbox.closeSymbol')}</RNText>
            </Pressable>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: lightboxIndex * SCREEN_W, y: 0 }}
            >
              {uris.map((uri) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={{ width: SCREEN_W, height: SCREEN_W }}
                  resizeMode="contain"
                />
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const lightboxStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 48, end: 16, zIndex: 10, padding: 8 },
  closeText: { fontSize: 24, color: '#fff' },
});

// ── Review card ───────────────────────────────────────────────────────────────

interface ReviewWithPhotos extends Review {
  /** Local-only photo URIs (not persisted to backend yet). */
  localPhotoUris?: string[];
}

function ReviewCard({ review }: { review: ReviewWithPhotos }): ReactElement {
  return (
    <View style={styles.card}>
      <StarRow value={review.rating} readonly />
      {review.text ? <Text variant="caption">{review.text}</Text> : null}
      {review.localPhotoUris && review.localPhotoUris.length > 0 ? (
        <PhotoStrip uris={review.localPhotoUris} />
      ) : null}
    </View>
  );
}

// ── Photo picker row ──────────────────────────────────────────────────────────

function PhotoPickerRow({
  uris,
  onAdd,
  onRemove,
  uploading,
}: {
  uris: string[];
  onAdd: () => void;
  onRemove: (uri: string) => void;
  uploading: boolean;
}): ReactElement {
  return (
    <View style={styles.pickerRow}>
      <RNText style={styles.pickerLabel}>{t('reviews.addPhotosLabel')}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.pickerInner}>
          {uris.map((uri) => (
            <TouchableOpacity key={uri} onPress={() => onRemove(uri)} style={styles.pickerThumb} accessibilityLabel={t('reviews.removePhoto')}>
              <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
              <View style={styles.removeOverlay}>
                <RNText style={styles.removeIcon}>{ICON_REMOVE}</RNText>
              </View>
            </TouchableOpacity>
          ))}
          {uris.length < MAX_PHOTOS && !uploading ? (
            <TouchableOpacity onPress={onAdd} style={styles.addPhotoBtn} accessibilityLabel={t('reviews.addPhoto')}>
              <RNText style={styles.addPhotoIcon}>{ICON_ADD}</RNText>
            </TouchableOpacity>
          ) : null}
          {uploading ? (
            <View style={[styles.addPhotoBtn, styles.addPhotoBtnLoading]}>
              <RNText style={styles.addPhotoIcon}>{'…'}</RNText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReviewsSection({ placeId }: { placeId: PlaceId }): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const session = useSession();
  const isSignedIn = session.state.status === 'signedIn';

  const [reviews, setReviews] = useState<ReviewWithPhotos[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      const res = await api.reviews.list({ params: { placeId } });
      if (res.status === 200) {
        setReviews(res.body.items);
        setSummary(res.body.summary);
      }
    } catch {
      // ignore load errors silently
    }
  }, [api.reviews, placeId]);

  useEffect(() => { void load(); }, [load]);

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || result.assets.length === 0 || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      // Upload for asset ID; use provider_photo purpose (place_review_photo pending contract request M98)
      await uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_photo' });
      setPhotoUris((prev) => [...prev, uri]);
    } catch {
      // silently ignore upload errors — still add to local preview
      setPhotoUris((prev) => [...prev, uri]);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotoUris((prev) => prev.filter((u) => u !== uri));
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await api.reviews.submit({
        params: { placeId },
        body: { rating, text: reviewText || undefined },
      });
      if (res.status === 201) {
        // Optimistically show photos locally on the new review card
        const newReview: ReviewWithPhotos = {
          ...res.body,
          localPhotoUris: photoUris.length > 0 ? [...photoUris] : undefined,
        };
        setReviews((prev) => [newReview, ...prev.filter((r) => r.id !== res.body.id)]);
        setShowForm(false);
        setRating(0);
        setReviewText('');
        setPhotoUris([]);
        await load();
      }
    } catch {
      setError('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container} testID="reviews-section">
      <Text variant="subtitle">{t('reviews.title')}</Text>
      {summary && summary.count > 0 ? (
        <Text tone="muted">
          {t('reviews.avgRating', {
            avg: String(summary.average ?? 0),
            count: String(summary.count),
          })}
        </Text>
      ) : null}

      {!isSignedIn ? (
        <Text tone="muted" variant="caption">{t('reviews.loginRequired')}</Text>
      ) : showForm ? (
        <View style={styles.form}>
          <Text variant="caption">{t('reviews.ratingLabel')}</Text>
          <StarRow value={rating} onChange={setRating} />
          <TextInput
            placeholder={t('reviews.textPlaceholder')}
            value={reviewText}
            onChangeText={setReviewText}
            multiline
            accessibilityLabel={t('reviews.textPlaceholder')}
            style={styles.textInput}
          />
          <PhotoPickerRow
            uris={photoUris}
            onAdd={() => { void handlePickPhoto(); }}
            onRemove={handleRemovePhoto}
            uploading={uploadingPhoto}
          />
          {error ? <Banner kind="error" message={error} /> : null}
          <Button
            label={t('reviews.submitLabel')}
            onPress={() => { void handleSubmit(); }}
            disabled={rating === 0 || submitting}
            testID="review-submit"
          />
          <Button
            label={t('reviews.deleteOwn')}
            variant="secondary"
            onPress={() => setShowForm(false)}
          />
        </View>
      ) : (
        <Button
          label={t('reviews.writeReview')}
          variant="secondary"
          onPress={() => setShowForm(true)}
          testID="write-review-btn"
        />
      )}

      {reviews.length === 0 ? (
        <Text tone="muted" variant="caption">{t('reviews.empty')}</Text>
      ) : (
        reviews.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, gap: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  card: { gap: 4, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E0E0' },
  form: { gap: 8 },
  textInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
  photoStrip: { marginTop: 4 },
  thumbnail: { width: 72, height: 72, borderRadius: 6, marginEnd: 6 },
  pickerRow: { gap: 4 },
  pickerLabel: { fontSize: 12, color: '#555' },
  pickerInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerThumb: { position: 'relative' },
  removeOverlay: { position: 'absolute', top: 2, end: 2, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  removeIcon: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  addPhotoBtn: { width: 72, height: 72, borderRadius: 6, borderWidth: 1, borderColor: '#DDD', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  addPhotoBtnLoading: { opacity: 0.5 },
  addPhotoIcon: { fontSize: 24, color: '#999' },
});
