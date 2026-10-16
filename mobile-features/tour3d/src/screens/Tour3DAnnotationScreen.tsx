/**
 * Tour3DAnnotationScreen – 3D scene viewer with rich annotation overlays,
 * audio guide player stub, language selector, and "navigate to real location" button.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type {
  Tour3DAnnotation,
  Tour3DCategory,
  Tour3DSceneDetail,
} from '@iraq-maps/contracts';
import { useTour3DClient } from '../client';
import { t } from '../strings';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIEWER_H = Math.round(SCREEN_H * 0.52);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnnotationType = 'historical' | 'current' | 'fun_fact';
type Language = 'ar' | 'ckb' | 'en';
type LoadState = 'loading' | 'loaded' | 'error' | 'not-found';

interface AnnotationWithType extends Tour3DAnnotation {
  annotationType: AnnotationType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAnnotationType(iconType: string): AnnotationType {
  if (iconType === 'historic') return 'historical';
  if (iconType === 'info') return 'current';
  return 'fun_fact';
}

function getAnnotationLabel(ann: Tour3DAnnotation, lang: Language): string {
  if (lang === 'ckb' && ann.labelCkb) return ann.labelCkb;
  if (lang === 'en' && ann.labelEn) return ann.labelEn;
  return ann.labelAr;
}

function annotationTypeIcon(type: AnnotationType): string {
  switch (type) {
    case 'historical': return '🏛';
    case 'current': return 'ℹ️';
    case 'fun_fact': return '⭐';
  }
}

function annotationTypeColor(type: AnnotationType): string {
  switch (type) {
    case 'historical': return '#8B4513';
    case 'current': return '#1a3a5c';
    case 'fun_fact': return '#c9a84c';
  }
}

function categoryIcon(cat: Tour3DCategory): string {
  const icons: Record<Tour3DCategory, string> = {
    heritage: '🏛',
    mosque: '🕌',
    market: '🛍',
    park: '🌿',
    museum: '🎨',
    shrine: '✨',
    bridge: '🌉',
    neighborhood: '🏘',
    other: '📍',
  };
  return icons[cat] ?? '📍';
}

// ---------------------------------------------------------------------------
// Panorama stub
// ---------------------------------------------------------------------------

interface PanoramaViewProps {
  scene: Tour3DSceneDetail;
  currentIndex: number;
}

function PanoramaView({ scene, currentIndex }: PanoramaViewProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const asset = scene.assets[currentIndex];
  const assetLabel = asset?.labelAr ?? asset?.labelEn ?? '';

  return (
    <View style={panoStyles.container}>
      {/* Simulated panorama background */}
      <View style={panoStyles.gradient}>
        <Animated.View style={[panoStyles.orb, { transform: [{ rotate }] }]}>
          <Text style={panoStyles.orbIcon}>
            {categoryIcon(scene.category)}
          </Text>
        </Animated.View>
      </View>

      {/* Scene info overlay */}
      <View style={panoStyles.infoOverlay}>
        <Text style={panoStyles.infoTitle}>
          {scene.nameAr ?? scene.nameEn ?? ''}
        </Text>
        {assetLabel.length > 0 && (
          <Text style={panoStyles.assetLabel}>{assetLabel}</Text>
        )}
        <Text style={panoStyles.hint}>{t('annotation.dragHint')}</Text>
      </View>

      {/* 360 badge */}
      <View style={panoStyles.badge360}>
        <Text style={panoStyles.badge360Text}>{t('icon.badge360')}</Text>
      </View>
    </View>
  );
}

const panoStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: VIEWER_H,
    backgroundColor: '#0d1b2a',
    overflow: 'hidden',
    position: 'relative',
  },
  gradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(201,168,76,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  orbIcon: {
    fontSize: 72,
    opacity: 0.7,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 12,
    gap: 3,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  assetLabel: {
    color: '#c9a84c',
    fontSize: 12,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
  badge360: {
    position: 'absolute',
    top: 10,
    end: 10,
    backgroundColor: 'rgba(201,168,76,0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badge360Text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});

// ---------------------------------------------------------------------------
// Annotation overlay marker
// ---------------------------------------------------------------------------

interface AnnotationMarkerProps {
  annotation: AnnotationWithType;
  position: { x: number; y: number };
  isSelected: boolean;
  onPress: (ann: AnnotationWithType) => void;
}

function AnnotationMarker({ annotation, position, isSelected, onPress }: AnnotationMarkerProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress(annotation);
  };

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const color = annotationTypeColor(annotation.annotationType);

  return (
    <Pressable
      // eslint-disable-next-line no-restricted-syntax
      style={[markerStyles.container, { left: position.x, top: position.y }]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={annotation.labelAr}
    >
      {/* Pulse ring */}
      <Animated.View
        style={[
          markerStyles.pulse,
          { borderColor: color, opacity: pulseOpacity },
        ]}
      />

      {/* Icon button */}
      <Animated.View
        style={[
          markerStyles.marker,
          { backgroundColor: color, transform: [{ scale: scaleAnim }] },
          isSelected && markerStyles.markerSelected,
        ]}
      >
        <Text style={markerStyles.icon}>
          {annotationTypeIcon(annotation.annotationType)}
        </Text>
      </Animated.View>

      {/* Label (visible when selected) */}
      {isSelected && (
        <View style={[markerStyles.label, { backgroundColor: color }]}>
          <Text style={markerStyles.labelText} numberOfLines={1}>
            {annotation.labelAr}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const markerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    top: -8,
    start: -8,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerSelected: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  icon: { fontSize: 14 },
  label: {
    marginTop: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 120,
  },
  labelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Info card for selected annotation
// ---------------------------------------------------------------------------

interface AnnotationInfoCardProps {
  annotation: AnnotationWithType;
  language: Language;
  onClose: () => void;
  onNavigate: () => void;
}

function AnnotationInfoCard({ annotation, language, onClose, onNavigate }: AnnotationInfoCardProps) {
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const label = getAnnotationLabel(annotation, language);
  const color = annotationTypeColor(annotation.annotationType);
  const typeLabel =
    annotation.annotationType === 'historical'
      ? t('annotation.typeHistorical')
      : annotation.annotationType === 'current'
        ? t('annotation.typeCurrent')
        : t('annotation.typeFunFact');

  // Stub description based on type
  const description =
    annotation.annotationType === 'historical'
      ? t('annotation.historicalDesc')
      : annotation.annotationType === 'fun_fact'
        ? t('annotation.funFactDesc')
        : t('annotation.currentDesc');

  return (
    <Animated.View
      style={[
        cardStyles.container,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {/* Type badge + close */}
      <View style={cardStyles.topRow}>
        <View style={[cardStyles.typeBadge, { backgroundColor: color }]}>
          <Text style={cardStyles.typeIcon}>{annotationTypeIcon(annotation.annotationType)}</Text>
          <Text style={cardStyles.typeLabel}>{typeLabel}</Text>
        </View>
        <Pressable
          style={cardStyles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('annotation.close')}
        >
          <Text style={cardStyles.closeIcon}>{t('icon.close')}</Text>
        </Pressable>
      </View>

      {/* Title */}
      <Text style={cardStyles.title}>{label}</Text>

      {/* Description stub */}
      <Text style={cardStyles.description}>{description}</Text>

      {/* Navigate button (shown if linked place) */}
      {annotation.linkedPlaceId && (
        <Pressable
          style={[cardStyles.navButton, { backgroundColor: color }]}
          onPress={onNavigate}
          accessibilityRole="button"
        >
          <Text style={cardStyles.navButtonText}>{t('annotation.navigateToPlace')}</Text>
          <Text style={cardStyles.navButtonArrow}>←</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeIcon: { fontSize: 13 },
  typeLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ece6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 13, color: '#555', fontWeight: '700' },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  description: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  navButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  navButtonArrow: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ---------------------------------------------------------------------------
// Audio guide stub
// ---------------------------------------------------------------------------

interface AudioGuideBarProps {
  scene: Tour3DSceneDetail;
  language: Language;
  isPlaying: boolean;
  onToggle: () => void;
  onLanguageChange: (lang: Language) => void;
}

function AudioGuideBar({ scene, language, isPlaying, onToggle, onLanguageChange }: AudioGuideBarProps) {
  const waveAnim = useRef(new Animated.Value(0)).current;
  const sceneName = scene.nameAr ?? scene.nameEn ?? '';

  useEffect(() => {
    if (isPlaying) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      waveAnim.setValue(0);
    }
  }, [isPlaying, waveAnim]);

  /* eslint-disable-next-line i18next/no-literal-string */
  const LANGS: Language[] = ['ar', 'ckb', 'en'];
  const langLabels: Record<Language, string> = {
    ar: t('audio.languageAr').slice(0, 2),
    ckb: t('audio.languageCkb').slice(0, 2),
    en: t('audio.languageEn').slice(0, 2),
  };

  return (
    <View style={audioBar.container}>
      <View style={audioBar.start}>
        {/* Play/pause */}
        <Pressable
          style={[audioBar.playButton, isPlaying && audioBar.playButtonActive]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? t('annotation.audioPause') : t('annotation.audioPlay')}
        >
          <Text style={audioBar.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>

        {/* Track info */}
        <View style={audioBar.trackInfo}>
          <Text style={audioBar.trackTitle} numberOfLines={1}>{sceneName}</Text>
          <Text style={audioBar.trackSub}>{t('annotation.audioGuide')}</Text>
        </View>
      </View>

      {/* Wave animation (stub) */}
      {isPlaying && (
        <View style={audioBar.waveRow}>
          {[0.6, 1, 0.7, 1, 0.5].map((height, i) => (
            <Animated.View
              key={i}
              style={[
                audioBar.waveBar,
                {
                  height: 4 + height * 12,
                  opacity: waveAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4 + i * 0.1, 0.9],
                  }),
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Language picker */}
      <View style={audioBar.langRow}>
        {LANGS.map((lang) => (
          <Pressable
            key={lang}
            style={[audioBar.langChip, language === lang && audioBar.langChipActive]}
            onPress={() => onLanguageChange(lang)}
            accessibilityRole="button"
            accessibilityState={{ selected: language === lang }}
            accessibilityLabel={lang}
          >
            <Text style={[audioBar.langText, language === lang && audioBar.langTextActive]}>
              {langLabels[lang]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const audioBar = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2b3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  start: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.4)',
  },
  playButtonActive: {
    backgroundColor: 'rgba(201,168,76,0.35)',
    borderColor: '#c9a84c',
  },
  playIcon: { fontSize: 16 },
  trackInfo: { flex: 1, gap: 2 },
  trackTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  trackSub: { color: 'rgba(255,255,255,0.45)', fontSize: 10 },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 32,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#c9a84c',
    borderRadius: 2,
  },
  langRow: {
    flexDirection: 'row',
    gap: 4,
  },
  langChip: {
    width: 28,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipActive: {
    backgroundColor: '#c9a84c',
  },
  langText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700' },
  langTextActive: { color: '#fff' },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function Tour3DAnnotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useTour3DClient();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [scene, setScene] = useState<Tour3DSceneDetail | null>(null);
  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationWithType | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [language, setLanguage] = useState<Language>('ar');
  const [filterType, setFilterType] = useState<AnnotationType | 'all'>('all');

  const loadScene = useCallback(async () => {
    if (!id) return;
    setLoadState('loading');
    try {
      const res = await client.getScene({ params: { id } });
      if (res.status === 404) { setLoadState('not-found'); return; }
      if (res.status !== 200) throw new Error();
      setScene(res.body);
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, [id, client]);

  useEffect(() => { void loadScene(); }, [loadScene]);

  const annotationsWithType: AnnotationWithType[] = (scene?.annotations ?? []).map((ann) => ({
    ...ann,
    annotationType: getAnnotationType(ann.iconType),
  }));

  const filteredAnnotations = filterType === 'all'
    ? annotationsWithType
    : annotationsWithType.filter((a) => a.annotationType === filterType);

  const handleAnnotationPress = (ann: AnnotationWithType) => {
    setSelectedAnnotation((prev) => (prev?.id === ann.id ? null : ann));
  };

  const handleNavigate = () => {
    if (!selectedAnnotation?.linkedPlaceId) return;
    router.push({
      pathname: '/places/[id]',
      params: { id: selectedAnnotation.linkedPlaceId },
    } as Parameters<typeof router.push>[0]);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
  };

  // Distribute annotation markers across the viewport
  const getMarkerPosition = (index: number, total: number) => ({
    x: Math.round(((index + 1) / (total + 1)) * SCREEN_W) - 14,
    y: Math.round(VIEWER_H * 0.25 + (index % 4) * (VIEWER_H * 0.15)),
  });

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={screenStyles.loadBg}>
        <ActivityIndicator size="large" color="#c9a84c" />
        <Text style={screenStyles.loadText}>{t('viewer.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={screenStyles.loadBg}>
        <Text style={screenStyles.errorText}>{t('viewer.loadError')}</Text>
        <Pressable style={screenStyles.retryBtn} onPress={loadScene}>
          <Text style={screenStyles.retryText}>{t('viewer.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loadState === 'not-found' || !scene) {
    return (
      <SafeAreaView style={screenStyles.loadBg}>
        <Text style={screenStyles.errorText}>{t('viewer.notFound')}</Text>
        <Pressable style={screenStyles.retryBtn} onPress={handleBack}>
          <Text style={screenStyles.retryText}>{'←'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const sceneName = scene.nameAr ?? scene.nameEn ?? '';

  return (
    <View style={screenStyles.container}>
      {/* Back row */}
      <View style={screenStyles.backRow}>
        <Pressable
          style={screenStyles.backBtn}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('viewer.back')}
        >
          <Text style={screenStyles.backIcon}>{'←'}</Text>
        </Pressable>
        <Text style={screenStyles.title} numberOfLines={1}>{sceneName}</Text>
        <Pressable
          style={screenStyles.toggleBtn}
          onPress={() => setShowAnnotations((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t('viewer.controls.toggleAnnotations')}
        >
          <Text style={screenStyles.toggleIcon}>{showAnnotations ? '👁' : '🙈'}</Text>
        </Pressable>
      </View>

      {/* Panorama viewport + annotations */}
      <View style={{ position: 'relative' }}>
        <PanoramaView scene={scene} currentIndex={currentAssetIndex} />

        {showAnnotations && (
          <View style={screenStyles.annotLayer} pointerEvents="box-none">
            {filteredAnnotations.map((ann, i) => (
              <AnnotationMarker
                key={ann.id}
                annotation={ann}
                position={getMarkerPosition(i, filteredAnnotations.length)}
                isSelected={selectedAnnotation?.id === ann.id}
                onPress={handleAnnotationPress}
              />
            ))}
          </View>
        )}

        {/* Asset navigation arrows */}
        {scene.assets.length > 1 && (
          <>
            <Pressable
              style={[screenStyles.navArrow, screenStyles.navArrowStart]}
              onPress={() => setCurrentAssetIndex((v) => Math.max(0, v - 1))}
              disabled={currentAssetIndex === 0}
              accessibilityRole="button"
              accessibilityLabel={t('viewer.controls.previous')}
            >
              <Text style={[screenStyles.navArrowText, currentAssetIndex === 0 && { opacity: 0.3 }]}>
                {'←'}
              </Text>
            </Pressable>
            <Pressable
              style={[screenStyles.navArrow, screenStyles.navArrowEnd]}
              onPress={() => setCurrentAssetIndex((v) => Math.min(scene.assets.length - 1, v + 1))}
              disabled={currentAssetIndex === scene.assets.length - 1}
              accessibilityRole="button"
              accessibilityLabel={t('viewer.controls.next')}
            >
              <Text style={[screenStyles.navArrowText, currentAssetIndex === scene.assets.length - 1 && { opacity: 0.3 }]}>
                {'→'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Audio guide bar */}
      <AudioGuideBar
        scene={scene}
        language={language}
        isPlaying={audioPlaying}
        onToggle={() => setAudioPlaying((v) => !v)}
        onLanguageChange={setLanguage}
      />

      {/* Annotation type filter row */}
      <View style={screenStyles.filterRow}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {(['all', 'historical', 'current', 'fun_fact'] as const).map((type) => {
          const isActive = filterType === type;
          const label =
            type === 'all'
              ? t('annotation.filterAll')
              : type === 'historical'
                ? t('annotation.typeHistorical')
                : type === 'current'
                  ? t('annotation.typeCurrent')
                  : t('annotation.typeFunFact');

          return (
            <Pressable
              key={type}
              style={[
                screenStyles.filterChip,
                isActive && screenStyles.filterChipActive,
                type !== 'all' && isActive && { backgroundColor: annotationTypeColor(type) },
              ]}
              onPress={() => {
                setFilterType(type);
                setSelectedAnnotation(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
            >
              {type !== 'all' && <Text style={screenStyles.filterIcon}>{annotationTypeIcon(type)}</Text>}
              <Text style={[screenStyles.filterText, isActive && screenStyles.filterTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom: selected annotation card OR annotation list */}
      <ScrollView
        style={screenStyles.bottomPanel}
        contentContainerStyle={screenStyles.bottomContent}
        showsVerticalScrollIndicator={false}
      >
        {selectedAnnotation ? (
          <AnnotationInfoCard
            annotation={selectedAnnotation}
            language={language}
            onClose={() => setSelectedAnnotation(null)}
            onNavigate={handleNavigate}
          />
        ) : (
          <>
            <Text style={screenStyles.listTitle}>
              {t('annotation.annotationCount', { count: filteredAnnotations.length })}
            </Text>
            {filteredAnnotations.map((ann) => (
              <Pressable
                key={ann.id}
                style={({ pressed }) => [
                  screenStyles.annListItem,
                  pressed && screenStyles.annListItemPressed,
                ]}
                onPress={() => handleAnnotationPress(ann)}
                accessibilityRole="button"
                accessibilityLabel={ann.labelAr}
              >
                <View
                  style={[
                    screenStyles.annListIcon,
                    { backgroundColor: annotationTypeColor(ann.annotationType) },
                  ]}
                >
                  <Text style={screenStyles.annListIconText}>
                    {annotationTypeIcon(ann.annotationType)}
                  </Text>
                </View>
                <View style={screenStyles.annListBody}>
                  <Text style={screenStyles.annListName} numberOfLines={1}>
                    {getAnnotationLabel(ann, language)}
                  </Text>
                  <Text style={screenStyles.annListType}>
                    {ann.annotationType === 'historical'
                      ? t('annotation.typeHistorical')
                      : ann.annotationType === 'current'
                        ? t('annotation.typeCurrent')
                        : t('annotation.typeFunFact')}
                  </Text>
                </View>
                {ann.linkedPlaceId && (
                  <Text style={screenStyles.annListArrow}>{'←'}</Text>
                )}
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1b2a' },
  loadBg: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
  },
  loadText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  errorText: { color: '#e74c3c', fontSize: 15, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#c9a84c',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIcon: { fontSize: 16 },
  annotLayer: { ...StyleSheet.absoluteFill },
  navArrow: {
    position: 'absolute',
    top: VIEWER_H / 2 - 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowStart: { start: 8 },
  navArrowEnd: { end: 8 },
  navArrowText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#1a2b3c',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterChipActive: {
    borderColor: 'transparent',
  },
  filterIcon: { fontSize: 12 },
  filterText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: '700' },
  bottomPanel: { flex: 1, backgroundColor: '#1a2b3c' },
  bottomContent: { padding: 12, gap: 10, paddingBottom: 24 },
  listTitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  annListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  annListItemPressed: { opacity: 0.75 },
  annListIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annListIconText: { fontSize: 16 },
  annListBody: { flex: 1, gap: 2 },
  annListName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  annListType: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  annListArrow: { color: '#c9a84c', fontSize: 16, fontWeight: '700' },
});
