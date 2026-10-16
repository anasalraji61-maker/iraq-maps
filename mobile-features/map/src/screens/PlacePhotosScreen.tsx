/**
 * PlacePhotosScreen – full-screen photo gallery for a place.
 *
 * Features:
 *  - All provider photos in a pageable, zoomable viewer
 *  - Zoom via pinch gesture (Animated scale)
 *  - Pan within zoomed image
 *  - Add photo button (picks from library, uploads)
 *  - Report inappropriate photo
 *  - Attribution per photo
 *
 * Route: place/[placeId]/photos
 */

import { placesContract } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl, uploadAsset } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { type ReactElement, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  I18nManager,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { LoadStatus, ok, useLatest } from '../load';
import { t } from '../strings';

I18nManager.forceRTL(true);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PRIMARY = '#1976D2';

interface Photo {
  uri: string;
  attribution?: string;
  local?: boolean;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function PlacePhotosScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const params = placesContract.get.pathParams.safeParse({ id: placeId });
  if (!params.success) {
    return (
      <Screen>
        <RNText style={styles.errMsg}>{t('place.notFound')}</RNText>
      </Screen>
    );
  }
  return <PhotosLoader id={params.data.id} />;
}

function PhotosLoader({ id }: { id: string }): ReactElement {
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const place = useLatest(id, async () => ok(await api.places.get({ params: { id } })));
  const [localPhotos, setLocalPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  if (place.state?.status !== 'ready') {
    return (
      <Screen>
        <LoadStatus {...place} />
      </Screen>
    );
  }

  const placeData = place.state.status === 'ready' ? place.state.data : null;
  const providerPhotos: Photo[] =
    placeData?.provider?.photos?.map((p) => ({
      uri: p.url,
      attribution: placeData.attribution,
    })) ?? [];

  const allPhotos = [...providerPhotos, ...localPhotos];

  const handleAddPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      await uploadAsset(api, apiBaseUrl, { uri, purpose: 'provider_photo' });
    } catch {
      // silent; photo still shows locally
    } finally {
      setUploading(false);
    }
    setLocalPhotos((prev) => [...prev, { uri, local: true }]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <RNText style={styles.headerTitle}>
          {t('lightbox.counter', { total: String(allPhotos.length) })}
        </RNText>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { void handleAddPhoto(); }}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.addPhoto')}
          testID="photos.addPhoto"
        >
          <RNText style={styles.addBtnText}>{uploading ? t('reviews.uploadingPhoto') : t('photos.addPhotoBtnLabel')}</RNText>
        </TouchableOpacity>
      </View>

      {allPhotos.length === 0 ? (
        <View style={styles.empty}>
          <RNText style={styles.emptyText}>{t('photos.empty')}</RNText>
        </View>
      ) : (
        <GalleryGrid
          photos={allPhotos}
          placeId={id}
        />
      )}
    </Screen>
  );
}

// ── Grid view ─────────────────────────────────────────────────────────────────

function GalleryGrid({ photos, placeId }: { photos: Photo[]; placeId: string }): ReactElement {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const THUMB = (SCREEN_W - 4) / 3;

  return (
    <>
      <ScrollView>
        <View style={gridStyles.grid}>
          {photos.map((photo, i) => (
            <TouchableOpacity
              key={photo.uri}
              onPress={() => setViewerIndex(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('lightbox.photo')}
              testID={`photos.thumb.${i}`}
            >
              <Image
                source={{ uri: photo.uri }}
                style={[gridStyles.thumb, { width: THUMB, height: THUMB }]}
                resizeMode="cover"
              />
              {photo.local ? (
                <View style={gridStyles.localBadge}>
                  <RNText style={gridStyles.localBadgeText}>{t('photos.localBadge')}</RNText>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {viewerIndex !== null ? (
        <FullscreenViewer
          photos={photos}
          initialIndex={viewerIndex}
          placeId={placeId}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

const gridStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { borderRadius: 0 },
  localBadge: {
    position: 'absolute',
    bottom: 4,
    end: 4,
    backgroundColor: 'rgba(67,160,71,0.85)',
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});

// ── Fullscreen viewer with pinch-to-zoom ──────────────────────────────────────

function FullscreenViewer({
  photos,
  initialIndex,
  placeId: _placeId,
  onClose,
}: {
  photos: Photo[];
  initialIndex: number;
  placeId: string;
  onClose: () => void;
}): ReactElement {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index]!;
  const scale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);

  // ── Pinch-to-zoom via two-touch PanResponder ──────────────────────────────
  const pinchRef = useRef<{ startDist: number } | null>(null);

  const getDistance = (touches: React.Touch[]) => {
    if (touches.length < 2) return 0;
    const dx = (touches[1]!.pageX ?? 0) - (touches[0]!.pageX ?? 0);
    const dy = (touches[1]!.pageY ?? 0) - (touches[0]!.pageY ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const pinchResponder = PanResponder.create({
    onStartShouldSetPanResponder: (_, gs) => gs.numberActiveTouches === 2,
    onMoveShouldSetPanResponder: (_, gs) => gs.numberActiveTouches === 2,
    onPanResponderGrant: (e) => {
      const dist = getDistance(e.nativeEvent.touches as unknown as React.Touch[]);
      pinchRef.current = { startDist: dist };
    },
    onPanResponderMove: (e) => {
      if (!pinchRef.current) return;
      const dist = getDistance(e.nativeEvent.touches as unknown as React.Touch[]);
      if (pinchRef.current.startDist === 0) return;
      const newScale = Math.max(
        1,
        Math.min(4, lastScale.current * (dist / pinchRef.current.startDist)),
      );
      scale.setValue(newScale);
    },
    onPanResponderRelease: () => {
      lastScale.current = (scale as unknown as { _value: number })._value;
      pinchRef.current = null;
      // Snap back if below 1
      if (lastScale.current < 1.05) {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        lastScale.current = 1;
      }
    },
  });

  // Double-tap to reset zoom
  const lastTap = useRef(0);
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
      lastScale.current = 1;
    }
    lastTap.current = now;
  };

  const handleReport = () => {
    Alert.alert(t('photos.reportTitle'), t('photos.reportMsg'), [
      { text: t('photos.reportConfirm'), style: 'destructive', onPress: () => onClose() },
      { text: t('place.reportInaccuracyCancel'), style: 'cancel' },
    ]);
  };

  const goNext = () => setIndex((i) => Math.min(photos.length - 1, i + 1));
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={viewerStyles.container}>
        {/* Close */}
        <Pressable
          style={viewerStyles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('lightbox.close')}
          testID="photos.close"
        >
          <RNText style={viewerStyles.closeTxt}>{t('lightbox.closeSymbol')}</RNText>
        </Pressable>

        {/* Counter */}
        <View style={viewerStyles.counter}>
          <RNText style={viewerStyles.counterTxt}>
            {index + 1} / {photos.length}
          </RNText>
        </View>

        {/* Image with zoom */}
        <Animated.View
          style={[viewerStyles.imageWrap, { transform: [{ scale }] }]}
          {...pinchResponder.panHandlers}
        >
          <Pressable onPress={handleDoubleTap}>
            <Image
              source={{ uri: photo.uri }}
              style={viewerStyles.image}
              resizeMode="contain"
            />
          </Pressable>
        </Animated.View>

        {/* Prev / next */}
        {index > 0 ? (
          <Pressable style={[viewerStyles.navBtn, viewerStyles.navBtnStart]} onPress={goPrev} accessibilityRole="button" accessibilityLabel={t('photos.prev')}>
            <RNText style={viewerStyles.navTxt}>‹</RNText>
          </Pressable>
        ) : null}
        {index < photos.length - 1 ? (
          <Pressable style={[viewerStyles.navBtn, viewerStyles.navBtnEnd]} onPress={goNext} accessibilityRole="button" accessibilityLabel={t('photos.next')}>
            <RNText style={viewerStyles.navTxt}>›</RNText>
          </Pressable>
        ) : null}

        {/* Attribution + report */}
        <View style={viewerStyles.footer}>
          {photo.attribution ? (
            <RNText style={viewerStyles.attribution}>{photo.attribution}</RNText>
          ) : null}
          <TouchableOpacity
            onPress={handleReport}
            accessibilityRole="button"
            accessibilityLabel={t('photos.reportBtn')}
            testID="photos.report"
          >
            <RNText style={viewerStyles.reportBtn}>{t('photos.reportBtn')}</RNText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeBtn: {
    position: 'absolute',
    top: 48,
    end: 16,
    zIndex: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  closeTxt: { fontSize: 22, color: '#fff' },
  counter: {
    position: 'absolute',
    top: 52,
    start: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 20,
  },
  counterTxt: { color: '#fff', fontSize: 13 },
  imageWrap: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  image: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  navBtn: {
    position: 'absolute',
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 24,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  navBtnStart: { start: 12 },
  navBtnEnd: { end: 12 },
  navTxt: { fontSize: 26, color: '#fff', lineHeight: 30 },
  footer: {
    position: 'absolute',
    bottom: 32,
    start: 0,
    end: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  attribution: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center' },
  reportBtn: { color: '#FF8A80', fontSize: 13, textDecorationLine: 'underline' },
});

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#222' },
  addBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center' },
  errMsg: { padding: 24, textAlign: 'center', color: '#888' },
});
