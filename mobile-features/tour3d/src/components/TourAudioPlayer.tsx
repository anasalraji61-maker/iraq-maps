/**
 * TourAudioPlayer – stub audio guide player with animated waveform,
 * playback controls, track info, and language selection.
 *
 * No real audio API is used – the audio engine is stubbed out and
 * would be replaced with expo-av or react-native-track-player.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudioLanguage = 'ar' | 'ckb' | 'en';

export interface AudioTrack {
  id: string;
  titleAr: string;
  titleCkb?: string;
  titleEn?: string;
  /** Duration in seconds (stub) */
  durationSeconds: number;
}

interface TourAudioPlayerProps {
  track: AudioTrack;
  language: AudioLanguage;
  onLanguageChange: (lang: AudioLanguage) => void;
  /** Called when track finishes (stub: after durationSeconds) */
  onTrackEnd?: () => void;
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = '#c9a84c';
const WAVE_BAR_COUNT = 24;
function getLangLabels(): Record<AudioLanguage, string> {
  return { ar: t('audio.languageAr'), ckb: t('audio.languageCkb'), en: t('audio.languageEn') };
}
function getLangShort(): Record<AudioLanguage, string> {
  return {
    ar: t('audio.languageAr').slice(0, 2),
    ckb: t('audio.languageCkb').slice(0, 2),
    en: t('audio.languageEn').slice(0, 2),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getTrackTitle(track: AudioTrack, lang: AudioLanguage): string {
  if (lang === 'ckb' && track.titleCkb) return track.titleCkb;
  if (lang === 'en' && track.titleEn) return track.titleEn;
  return track.titleAr;
}

function generateWaveHeights(): number[] {
  // Pseudo-random but deterministic pattern for the waveform
  return Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
    const x = Math.sin(i * 0.8) * 0.5 + Math.sin(i * 1.3) * 0.3 + Math.sin(i * 2.1) * 0.2;
    return Math.max(0.15, Math.min(1, 0.5 + x));
  });
}

// ---------------------------------------------------------------------------
// WaveformDisplay
// ---------------------------------------------------------------------------

interface WaveformDisplayProps {
  isPlaying: boolean;
  progress: number; // 0..1
  accentColor: string;
}

function WaveformDisplay({ isPlaying, progress, accentColor }: WaveformDisplayProps) {
  const barAnimsRef = useRef<Animated.Value[]>(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(1)),
  );
  const waveHeights = useRef(generateWaveHeights()).current;

  useEffect(() => {
    const animations = barAnimsRef.current.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 300 + i * 20,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration: 300 + i * 20,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    if (isPlaying) {
      animations.forEach((a) => a.start());
    } else {
      animations.forEach((a) => a.stop());
      barAnimsRef.current.forEach((anim) =>
        Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start(),
      );
    }

    return () => animations.forEach((a) => a.stop());
  }, [isPlaying]);

  const playedCount = Math.round(progress * WAVE_BAR_COUNT);

  return (
    <View style={waveStyles.container}>
      {barAnimsRef.current.map((anim, i) => {
        const isPlayed = i < playedCount;
        const baseHeight = waveHeights[i] ?? 1;

        return (
          <Animated.View
            key={i}
            style={[
              waveStyles.bar,
              {
                height: isPlaying
                  ? anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, Math.round(32 * baseHeight)],
                    })
                  : Math.round(20 * baseHeight),
                backgroundColor: isPlayed ? accentColor : 'rgba(255,255,255,0.25)',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
    flex: 1,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
});

// ---------------------------------------------------------------------------
// ProgressSlider (stub – touch area only, no native Slider)
// ---------------------------------------------------------------------------

interface ProgressSliderProps {
  progress: number; // 0..1
  accentColor: string;
  onSeek: (ratio: number) => void;
}

function ProgressSlider({ progress, accentColor, onSeek }: ProgressSliderProps) {
  const containerRef = useRef<View>(null);

  const handlePress = (evt: { nativeEvent: { locationX: number } }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (containerRef.current as any)?.measure((_x: number, _y: number, width: number) => {
      if (width > 0) {
        onSeek(Math.max(0, Math.min(1, evt.nativeEvent.locationX / width)));
      }
    });
  };

  return (
    <Pressable onPress={handlePress} style={sliderStyles.track} accessibilityRole="adjustable">
      <View ref={containerRef} style={sliderStyles.inner}>
        <View style={[sliderStyles.fill, { width: `${Math.round(progress * 100)}%` as `${number}%`, backgroundColor: accentColor }]} />
        <View
          style={[
            sliderStyles.thumb,
            { start: `${Math.max(0, Math.round(progress * 100) - 1)}%` as `${number}%`, backgroundColor: accentColor },
          ]}
        />
      </View>
    </Pressable>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 24,
    justifyContent: 'center',
  },
  inner: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    minWidth: 4,
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});

// ---------------------------------------------------------------------------
// Main TourAudioPlayer
// ---------------------------------------------------------------------------

export function TourAudioPlayer({
  track,
  language,
  onLanguageChange,
  onTrackEnd,
  accentColor = DEFAULT_ACCENT,
}: TourAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= track.durationSeconds) {
        stopInterval();
        setIsPlaying(false);
        onTrackEnd?.();
      }
    }, 1000);
  }, [track.durationSeconds, onTrackEnd, stopInterval]);

  useEffect(() => {
    // Reset when track changes
    stopInterval();
    setIsPlaying(false);
    setElapsed(0);
    elapsedRef.current = 0;
  }, [track.id, stopInterval]);

  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopInterval();
      setIsPlaying(false);
    } else {
      if (elapsedRef.current >= track.durationSeconds) {
        elapsedRef.current = 0;
        setElapsed(0);
      }
      startInterval();
      setIsPlaying(true);
    }
  };

  const handleSeek = (ratio: number) => {
    const newElapsed = Math.round(ratio * track.durationSeconds);
    elapsedRef.current = newElapsed;
    setElapsed(newElapsed);
    if (isPlaying) {
      startInterval(); // restart interval from new position
    }
  };

  const handleRewind = () => {
    const newElapsed = Math.max(0, elapsedRef.current - 10);
    elapsedRef.current = newElapsed;
    setElapsed(newElapsed);
  };

  const handleFastForward = () => {
    const newElapsed = Math.min(track.durationSeconds, elapsedRef.current + 10);
    elapsedRef.current = newElapsed;
    setElapsed(newElapsed);
    if (newElapsed >= track.durationSeconds) {
      stopInterval();
      setIsPlaying(false);
      onTrackEnd?.();
    }
  };

  const progress = track.durationSeconds > 0 ? elapsed / track.durationSeconds : 0;
  const remaining = track.durationSeconds - elapsed;
  const title = getTrackTitle(track, language);

  return (
    <View style={playerStyles.container}>
      {/* Track info */}
      <View style={playerStyles.trackRow}>
        <View style={playerStyles.iconWrap}>
          <Text style={playerStyles.icon}>🎧</Text>
        </View>
        <View style={playerStyles.trackInfo}>
          <Text style={playerStyles.trackTitle} numberOfLines={1}>{title}</Text>
          <Text style={playerStyles.trackSub}>{t('annotation.audioGuide')}</Text>
        </View>

        {/* Language selector trigger */}
        <Pressable
          style={playerStyles.langBtn}
          onPress={() => setShowLangPicker((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={getLangLabels()[language]}
        >
          <Text style={[playerStyles.langBtnText, { color: accentColor }]}>
            {getLangShort()[language]}
          </Text>
        </Pressable>
      </View>

      {/* Language picker */}
      {showLangPicker && (
        <View style={playerStyles.langPicker}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {(['ar', 'ckb', 'en'] as AudioLanguage[]).map((lang) => (
            <Pressable
              key={lang}
              style={[
                playerStyles.langOption,
                language === lang && { backgroundColor: accentColor },
              ]}
              onPress={() => {
                onLanguageChange(lang);
                setShowLangPicker(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: language === lang }}
              accessibilityLabel={getLangLabels()[lang]}
            >
              <Text style={[playerStyles.langOptionText, language === lang && { color: '#fff' }]}>
                {getLangLabels()[lang]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Waveform */}
      <View style={playerStyles.waveRow}>
        <WaveformDisplay isPlaying={isPlaying} progress={progress} accentColor={accentColor} />
      </View>

      {/* Progress slider */}
      <ProgressSlider progress={progress} accentColor={accentColor} onSeek={handleSeek} />

      {/* Time row */}
      <View style={playerStyles.timeRow}>
        <Text style={playerStyles.timeText}>{formatTime(elapsed)}</Text>
        <Text style={playerStyles.timeText}>-{formatTime(remaining)}</Text>
      </View>

      {/* Controls */}
      <View style={playerStyles.controls}>
        {/* Mute */}
        <Pressable
          style={playerStyles.controlBtn}
          onPress={() => setIsMuted((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={isMuted ? t('annotation.audioUnmute') : t('annotation.audioMute')}
        >
          <Text style={playerStyles.controlIcon}>{isMuted ? '🔇' : '🔊'}</Text>
        </Pressable>

        {/* Rewind 10s */}
        <Pressable
          style={playerStyles.controlBtn}
          onPress={handleRewind}
          accessibilityRole="button"
          accessibilityLabel={t('annotation.audioRewind')}
        >
          <Text style={playerStyles.controlIcon}>⏮</Text>
          <Text style={playerStyles.controlSub}>10</Text>
        </Pressable>

        {/* Play / Pause */}
        <Pressable
          style={[playerStyles.playBtn, { backgroundColor: accentColor }]}
          onPress={handlePlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? t('annotation.audioPause') : t('annotation.audioPlay')}
        >
          <Text style={playerStyles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>

        {/* Fast-forward 10s */}
        <Pressable
          style={playerStyles.controlBtn}
          onPress={handleFastForward}
          accessibilityRole="button"
          accessibilityLabel={t('annotation.audioForward')}
        >
          <Text style={playerStyles.controlIcon}>⏭</Text>
          <Text style={playerStyles.controlSub}>10</Text>
        </Pressable>

        {/* Speed stub */}
        <Pressable
          style={playerStyles.controlBtn}
          accessibilityRole="button"
          accessibilityLabel={t('annotation.audioSpeed')}
        >
          <Text style={playerStyles.speedText}>{t('icon.speed1x')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const playerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a2b3c',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(201,168,76,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  trackInfo: { flex: 1 },
  trackTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  trackSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
  langBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  langBtnText: { fontSize: 13, fontWeight: '800' },
  langPicker: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  langOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  langOptionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  waveRow: {
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 2,
  },
  controlIcon: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.7)',
  },
  controlSub: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '700',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playIcon: { fontSize: 22, color: '#fff' },
  speedText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
});
