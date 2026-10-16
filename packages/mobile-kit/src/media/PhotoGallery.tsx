/**
 * PhotoGallery – full-screen photo viewer with zoom/pan, swipe, share, download,
 * counter, captions, and blurhash loading placeholders.
 *
 * Uses React Native's built-in Animated API for zoom/pan (no third-party gesture lib required).
 * RTL-safe: swipe direction is flipped for RTL layouts.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Animated,
  Dimensions,
  I18nManager,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GalleryPhoto {
  /** Unique identifier used as the React key. */
  id: string;
  /** Full-resolution URL. */
  url: string;
  /** Low-res thumbnail (shown in grid). */
  thumbUrl?: string;
  /** Blurhash placeholder string. */
  blurhash?: string;
  caption?: string;
  /** Width in pixels (used for aspect ratio). */
  width?: number;
  height?: number;
}

export interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  /** Index of the initially visible photo. Default 0. */
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps the download button. */
  onDownload?: (photo: GalleryPhoto) => void;
  /** Caption prefix string (e.g. translated "Photo"). */
  photoLabel?: string;
  /** "Share" button label. */
  shareLabel?: string;
  /** "Close" button label. */
  closeLabel?: string;
  /** "Download" button label. */
  downloadLabel?: string;
  /** Called when the active index changes. */
  onIndexChange?: (index: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAX_ZOOM = 4;
const MIN_ZOOM = 1;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const DOUBLE_TAP_DELAY = 300;

// ─── Blurhash placeholder (solid colour fallback) ─────────────────────────────

/** Render a solid placeholder using the first 6 chars of the blurhash as a colour hint. */
function BlurhashPlaceholder({ blurhash, style }: { blurhash?: string; style?: object }): ReactElement {
  const color = useMemo(() => {
    if (!blurhash || blurhash.length < 6) return '#e0e0e0';
    // Very rough: decode the first two base-83 chars as a brightness hint.
    const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
    const v1 = CHARS.indexOf(blurhash[4] ?? '0');
    const v2 = CHARS.indexOf(blurhash[5] ?? '0');
    const grey = Math.floor(((v1 * 83 + v2) / (83 * 83)) * 200 + 30);
    return `rgb(${grey},${grey},${grey})`;
  }, [blurhash]);

  return <View style={[{ backgroundColor: color }, style]} />;
}

// ─── Single photo viewer ──────────────────────────────────────────────────────

interface PhotoViewerProps {
  photo: GalleryPhoto;
  isActive: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onClose: () => void;
}

function PhotoViewer({
  photo,
  isActive,
  onSwipeLeft,
  onSwipeRight,
  onClose,
}: PhotoViewerProps): ReactElement {
  const scale  = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const lastTap = useRef(0);

  const [loaded, setLoaded] = useState(false);

  // Reset zoom when photo changes.
  useEffect(() => {
    if (!isActive) {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
      currentScale.current = 1;
    }
  }, [isActive, scale, translateX, translateY]);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,

      onPanResponderGrant: () => {
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_DELAY) {
          // Double-tap: toggle zoom.
          const nextScale = currentScale.current > 1 ? MIN_ZOOM : MAX_ZOOM / 2;
          Animated.parallel([
            Animated.spring(scale, { toValue: nextScale, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start();
          currentScale.current = nextScale;
        }
        lastTap.current = now;
      },

      onPanResponderMove: (_, g) => {
        if (currentScale.current > 1) {
          // Pan when zoomed.
          translateX.setValue(g.dx);
          translateY.setValue(g.dy);
        }
        // Horizontal drag for swipe (only when not zoomed).
      },

      onPanResponderRelease: (_, g) => {
        if (currentScale.current <= 1) {
          // Swipe to navigate; respect RTL.
          const rtl = I18nManager.isRTL;
          if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
            const goNext = rtl ? g.dx > 0 : g.dx < 0;
            if (goNext) onSwipeLeft();
            else onSwipeRight();
          } else if (g.dy < -SCREEN_H * 0.3) {
            onClose();
          }
        } else {
          // Snap back if dragged out of bounds.
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  [onClose, onSwipeLeft, onSwipeRight, scale, translateX, translateY]);

  return (
    <Animated.View
      style={[
        styles.photoContainer,
        { transform: [{ scale }, { translateX }, { translateY }] },
      ]}
      {...panResponder.panHandlers}
    >
      {!loaded && (
        <BlurhashPlaceholder
          blurhash={photo.blurhash}
          style={styles.placeholder}
        />
      )}
      <Image
        source={{ uri: photo.url }}
        style={styles.fullImage}
        resizeMode="contain"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        accessibilityLabel={photo.caption ?? photo.id}
      />
    </Animated.View>
  );
}

// ─── PhotoGallery ─────────────────────────────────────────────────────────────

export function PhotoGallery({
  photos,
  initialIndex = 0,
  visible,
  onClose,
  onDownload,
  photoLabel = 'صورة', // eslint-disable-line no-restricted-syntax
  shareLabel = 'مشاركة', // eslint-disable-line no-restricted-syntax
  closeLabel = 'إغلاق', // eslint-disable-line no-restricted-syntax
  downloadLabel = 'تحميل', // eslint-disable-line no-restricted-syntax
  onIndexChange,
}: PhotoGalleryProps): ReactElement {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  // Reset to initialIndex when gallery opens.
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  // Keep scroll position in sync.
  useEffect(() => {
    if (visible) {
      scrollRef.current?.scrollTo({
        x: index * SCREEN_W,
        animated: false,
      });
    }
  }, [index, visible]);

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(photos.length - 1, next));
    setIndex(clamped);
    onIndexChange?.(clamped);
  }, [photos.length, onIndexChange]);

  const handleSwipeLeft  = useCallback(() => goTo(index + 1), [goTo, index]);
  const handleSwipeRight = useCallback(() => goTo(index - 1), [goTo, index]);

  const handleShare = useCallback(async () => {
    const photo = photos[index];
    if (!photo) return;
    try {
      await Share.share({ url: photo.url, message: photo.caption ?? '' });
    } catch {
      // user cancelled or not supported
    }
  }, [index, photos]);

  const handleDownload = useCallback(() => {
    const photo = photos[index];
    if (photo && onDownload) onDownload(photo);
  }, [index, onDownload, photos]);

  const currentPhoto = photos[index];

  if (!visible) return <></>;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.iconText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.counter}>
            {`${index + 1} / ${photos.length}`}
          </Text>

          <View style={styles.topBarActions}>
            {onDownload && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleDownload}
                accessibilityRole="button"
                accessibilityLabel={downloadLabel}
              >
                <Text style={styles.iconText}>↓</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel={shareLabel}
            >
              <Text style={styles.iconText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Photo pager */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}   // navigation handled by swipe via PanResponder
          style={styles.pager}
          contentContainerStyle={{ width: SCREEN_W * photos.length }}
        >
          {photos.map((photo, i) => (
            <View key={photo.id} style={{ width: SCREEN_W, height: SCREEN_H }}>
              <PhotoViewer
                photo={photo}
                isActive={i === index}
                onSwipeLeft={handleSwipeLeft}
                onSwipeRight={handleSwipeRight}
                onClose={onClose}
              />
            </View>
          ))}
        </ScrollView>

        {/* Caption */}
        {currentPhoto?.caption ? (
          <View style={styles.captionBar}>
            <Text style={styles.captionText} numberOfLines={3}>
              {currentPhoto.caption}
            </Text>
          </View>
        ) : null}

        {/* Dot indicators */}
        {photos.length > 1 && photos.length <= 10 && (
          <View style={styles.dots}>
            {photos.map((_, i) => (
              <Pressable
                key={i}
                style={[styles.dot, i === index && styles.dotActive]}
                onPress={() => goTo(i)}
                accessibilityRole="button"
                accessibilityLabel={`${photoLabel} ${i + 1}`}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 44,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 20,
  },
  counter: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  pager: {
    flex: 1,
  },
  photoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: SCREEN_W,
    height: SCREEN_H - 180,
  },
  placeholder: {
    position: 'absolute',
    width: SCREEN_W,
    height: SCREEN_H - 180,
  },
  captionBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 9,
    height: 9,
  },
});

