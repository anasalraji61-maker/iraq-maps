/**
 * Tour3DViewerScreen – 3D virtual tour viewer.
 *
 * Shows a 360° panorama placeholder (WebView stub) with annotation overlays,
 * asset navigation controls, and a tour progress indicator.
 * A real 3D engine (Three.js, A-Frame, etc.) would replace the WebView stub
 * when available on both platforms.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Tour3DAnnotation, Tour3DAsset, Tour3DSceneDetail } from '@iraq-maps/contracts';
import { useTour3DClient } from '../client';
import { TourAnnotationMarker } from '../components/TourAnnotationMarker';
import { Tour3DControls } from '../components/Tour3DControls';
import { VirtualTourProgress } from '../components/VirtualTourProgress';
import { t } from '../strings';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIEWER_HEIGHT = SCREEN_H * 0.5;

type LoadState = 'loading' | 'loaded' | 'error' | 'not-found';

/** Stub panorama viewer rendered inside the asset viewport.
 *  Replace with WebView + A-Frame or a native 360 component. */
function PanoramaStub({ asset }: { asset: Tour3DAsset }) {
  const label = asset.labelAr ?? asset.labelEn ?? '';
  return (
    <View style={stubStyles.container}>
      <View style={stubStyles.sphere}>
        <Text style={stubStyles.sphereIcon}>🌐</Text>
        <Text style={stubStyles.title}>{t('viewer.panoramaTitle')}</Text>
        <Text style={stubStyles.instructions}>{t('viewer.panoramaInstructions')}</Text>
        {label.length > 0 && <Text style={stubStyles.assetLabel}>{label}</Text>}
        <View style={stubStyles.metaRow}>
          <Text style={stubStyles.metaText}>
            {asset.type === 'photo360' ? '📷' : asset.type === 'video360' ? '🎥' : '🗿'} {asset.type}
          </Text>
          <Text style={stubStyles.metaText}>↑ {asset.pitch}° → {asset.heading}°</Text>
        </View>
      </View>
    </View>
  );
}

const stubStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sphere: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  sphereIcon: {
    fontSize: 64,
    opacity: 0.7,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  instructions: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  assetLabel: {
    color: '#c9a84c',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  metaText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
});

export function Tour3DViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useTour3DClient();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [scene, setScene] = useState<Tour3DSceneDetail | null>(null);
  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Tour3DAnnotation | null>(null);
  const viewRecorded = useRef(false);

  const loadScene = useCallback(async () => {
    if (!id) return;
    setLoadState('loading');
    try {
      const res = await client.getScene({ params: { id } });
      if (res.status === 404) {
        setLoadState('not-found');
        return;
      }
      if (res.status !== 200) throw new Error('fetch failed');
      setScene(res.body);
      setCurrentAssetIndex(0);
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, [id, client]);

  useEffect(() => {
    void loadScene();
  }, [loadScene]);

  // Record view once per mount (fire-and-forget)
  useEffect(() => {
    if (loadState !== 'loaded' || !id || viewRecorded.current) return;
    viewRecorded.current = true;
    void client.recordView({ params: { id }, body: {} }).catch(() => undefined);
  }, [loadState, id, client]);

  const handlePrevious = () => {
    setCurrentAssetIndex((prev) => Math.max(0, prev - 1));
    setSelectedAnnotation(null);
  };

  const handleNext = () => {
    if (!scene) return;
    setCurrentAssetIndex((prev) => Math.min(scene.assets.length - 1, prev + 1));
    setSelectedAnnotation(null);
  };

  const handleToggleAnnotations = () => {
    setShowAnnotations((prev) => !prev);
    setSelectedAnnotation(null);
  };

  const handleAnnotationPress = (annotation: Tour3DAnnotation) => {
    setSelectedAnnotation((prev) => (prev?.id === annotation.id ? null : annotation));
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#c9a84c" />
        <Text style={styles.loadingText}>{t('viewer.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>{t('viewer.loadError')}</Text>
        <Pressable style={styles.retryButton} onPress={loadScene} accessibilityRole="button">
          <Text style={styles.retryText}>{t('viewer.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loadState === 'not-found' || !scene) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>{t('viewer.notFound')}</Text>
        <Pressable style={styles.retryButton} onPress={handleBack} accessibilityRole="button">
          <Text style={styles.retryText}>{'←'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const currentAsset = scene.assets[currentAssetIndex];
  const hasAssets = scene.assets.length > 0;
  const sceneName = scene.nameAr ?? scene.nameEn ?? '';

  return (
    <View style={styles.container}>
      {/* Back button */}
      <View style={styles.backRow}>
        <Pressable style={styles.backButton} onPress={handleBack} accessibilityRole="button" accessibilityLabel="back">
          <Text style={styles.backButtonText}>{'←'}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{sceneName}</Text>
        <View style={styles.backButton} />
      </View>

      {/* Panorama viewport */}
      <View style={[styles.viewer, { height: VIEWER_HEIGHT }]}>
        {!hasAssets ? (
          <View style={styles.noAssets}>
            <Text style={styles.noAssetsText}>{t('viewer.webviewUnavailable')}</Text>
          </View>
        ) : currentAsset ? (
          <PanoramaStub asset={currentAsset} />
        ) : null}

        {/* Annotation overlays */}
        {showAnnotations && hasAssets && scene.annotations.length > 0 && (
          <View style={styles.annotationOverlay} pointerEvents="box-none">
            {scene.annotations.map((ann) => (
              <View
                key={ann.id}
                style={[
                  styles.annotationPosition,
                  {
                    // Distribute annotations across the viewport width based on index
                    left: ((scene.annotations.indexOf(ann) + 1) / (scene.annotations.length + 1)) * SCREEN_W,
                    top: VIEWER_HEIGHT * 0.3 + (scene.annotations.indexOf(ann) % 3) * 40,
                  },
                ]}
              >
                <TourAnnotationMarker
                  annotation={ann}
                  onPress={handleAnnotationPress}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Bottom panel */}
      <ScrollView
        style={styles.bottomPanel}
        contentContainerStyle={styles.bottomContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Scene description */}
        {scene.descriptionAr && (
          <Text style={styles.description} numberOfLines={3}>
            {scene.descriptionAr}
          </Text>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          {hasAssets && (
            <Text style={styles.stat}>
              {t('viewer.assetCount', { count: scene.assets.length })}
            </Text>
          )}
          {scene.annotations.length > 0 && (
            <Text style={styles.stat}>
              {t('viewer.annotationCount', { count: scene.annotations.length })}
            </Text>
          )}
        </View>

        {/* Progress */}
        {hasAssets && scene.assets.length > 1 && (
          <VirtualTourProgress
            currentIndex={currentAssetIndex}
            totalCount={scene.assets.length}
          />
        )}

        {/* Navigation controls */}
        {hasAssets && scene.assets.length > 0 && (
          <Tour3DControls
            currentIndex={currentAssetIndex}
            totalCount={scene.assets.length}
            showAnnotations={showAnnotations}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onToggleAnnotations={handleToggleAnnotations}
          />
        )}

        {/* Selected annotation detail */}
        {selectedAnnotation && (
          <View style={styles.annotationDetail}>
            <Text style={styles.annotationDetailTitle}>
              {selectedAnnotation.labelAr ?? selectedAnnotation.labelEn ?? ''}
            </Text>
            {selectedAnnotation.linkedPlaceId && (
              <Text style={styles.annotationDetailLink}>
                {t('viewer.annotation.linkedPlace')} →
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1b2a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#c9a84c',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  viewer: {
    width: '100%',
    backgroundColor: '#0d1b2a',
    position: 'relative',
    overflow: 'hidden',
  },
  noAssets: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAssetsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  annotationPosition: {
    position: 'absolute',
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: '#1a2b3c',
  },
  bottomContent: {
    padding: 16,
    gap: 14,
  },
  description: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'flex-end',
  },
  stat: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  annotationDetail: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  annotationDetailTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  annotationDetailLink: {
    color: '#c9a84c',
    fontSize: 13,
    textAlign: 'right',
  },
});
