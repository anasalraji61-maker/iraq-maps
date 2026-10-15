/**
 * AddReviewScreen – dedicated screen to write/edit a review with photo picker.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { type ReactElement, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { reviewsContract } from '@iraq-maps/contracts';
import { initClient } from '@ts-rest/core';
import { uploadAsset, useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { t } from '../strings';

I18nManager.forceRTL(true);

const STAR = '★';
const STAR_EMPTY = '☆';
const MAX_PHOTOS = 5;

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }): ReactElement {
  return (
    <View style={srStyles.row} accessibilityLabel={t('reviews.ratingLabel')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.starLabel', { n })}
          testID={`star-input-${n}`}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[srStyles.star, { color: n <= value ? '#F5A623' : '#CCC' }]}>
            {n <= value ? STAR : STAR_EMPTY}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function AddReviewScreen(): ReactElement {
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const baseUrl = useApiBaseUrl();
  const { userId } = useSession();
  const client = initClient(reviewsContract, { baseUrl, baseHeaders: {} });

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]); // local URIs
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0]!.uri]);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!placeId || rating === 0) return;
    if (!userId) {
      Alert.alert(t('reviews.loginRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // Upload photos
      const assetIds: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        for (const uri of photos) {
          try {
            const id = await uploadAsset(baseUrl, uri);
            assetIds.push(id);
          } catch {
            // skip failed uploads silently
          }
        }
        setUploading(false);
      }

      const res = await client.submit({
        params: { placeId: placeId as never },
        body: { rating, text: text.trim() || undefined, photoAssetIds: assetIds },
      });

      if (res.status === 201) {
        router.back();
      } else {
        Alert.alert(t('reviews.submitError'));
      }
    } catch {
      Alert.alert(t('reviews.submitError'));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const busy = submitting || uploading;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('reviews.cancelForm')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('reviews.writeReview')}</Text>
        <TouchableOpacity
          style={[styles.submitBtn, (rating === 0 || busy) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={rating === 0 || busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>{t('reviews.submitLabel')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Star rating */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('reviews.ratingLabel')}</Text>
          <StarRating value={rating} onChange={setRating} />
        </View>

        {/* Text */}
        <View style={styles.section}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder={t('reviews.textPlaceholder')}
            placeholderTextColor="#9E9E9E"
            multiline
            maxLength={500}
            textAlignVertical="top"
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('reviews.addPhotosLabel')}</Text>
          <View style={styles.photoRow}>
            {photos.map((uri, idx) => (
              <View key={idx} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() => removePhoto(idx)}
                  accessibilityRole="button"
                  accessibilityLabel={t('reviews.removePhoto')}
                >
                  <Text style={styles.removePhotoText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable style={styles.addPhotoBtn} onPress={pickPhoto} accessibilityRole="button">
                <Text style={styles.addPhotoBtnText}>＋</Text>
                <Text style={styles.addPhotoBtnLabel}>{t('reviews.addPhoto')}</Text>
              </Pressable>
            )}
          </View>
          {uploading && <Text style={styles.uploadingText}>{t('reviews.uploadingPhoto')}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  cancelBtn: { width: 60 },
  cancelText: { color: '#2196F3', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  submitBtn: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 60,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#BDBDBD' },
  submitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  scroll: { padding: 20, gap: 20 },
  section: { gap: 8 },
  label: { fontSize: 14, color: '#757575', fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    color: '#212121',
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 80, height: 80, position: 'relative' },
  thumbImg: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: {
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
  removePhotoText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoBtnText: { fontSize: 24, color: '#9E9E9E' },
  addPhotoBtnLabel: { fontSize: 10, color: '#9E9E9E' },
  uploadingText: { color: '#1976D2', fontSize: 13, marginTop: 4 },
});

const srStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 36 },
});
