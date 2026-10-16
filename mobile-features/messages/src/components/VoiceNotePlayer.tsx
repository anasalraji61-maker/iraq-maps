/**
 * VoiceNotePlayer – animated waveform + play/pause button.
 * Actual audio playback is a stub (expo-av integration wired but gated).
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../strings';

// Number of waveform bars to render
const BAR_COUNT = 30;

// Deterministic bar heights seeded by URL hash so they stay stable per message
function barHeights(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const base = 6 + (h % 22);
    // Taper edges
    const edge = Math.min(i, count - 1 - i) / (count / 4);
    return Math.max(4, Math.round(base * Math.min(1, edge)));
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface VoiceNotePlayerProps {
  durationSecs: number;
  audioUrl?: string;
  isOwn?: boolean;
  /** Called when playback finishes or user stops */
  onPlaybackEnd?: () => void;
}

type PlayState = 'idle' | 'playing' | 'paused';

export function VoiceNotePlayer({
  durationSecs,
  audioUrl,
  isOwn = false,
  onPlaybackEnd,
}: VoiceNotePlayerProps): ReactElement {
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const playAnim = useRef<Animated.CompositeAnimation | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heights = barHeights(audioUrl ?? String(durationSecs), BAR_COUNT);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      playAnim.current?.stop();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startPlayback = useCallback(() => {
    // Stub: real implementation uses expo-av Sound object
    setPlayState('playing');

    playAnim.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationSecs * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    playAnim.current.start(({ finished }) => {
      if (finished) {
        setPlayState('idle');
        setElapsed(0);
        progressAnim.setValue(0);
        onPlaybackEnd?.();
      }
    });

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= durationSecs) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return durationSecs;
        }
        return prev + 1;
      });
    }, 1000);
  }, [durationSecs, progressAnim, onPlaybackEnd]);

  const pausePlayback = useCallback(() => {
    playAnim.current?.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlayState('paused');
  }, []);

  const resumePlayback = useCallback(() => {
    setPlayState('playing');
    const remaining = durationSecs - elapsed;
    if (remaining <= 0) {
      setElapsed(0);
      progressAnim.setValue(0);
      startPlayback();
      return;
    }
    playAnim.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remaining * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    playAnim.current.start(({ finished }) => {
      if (finished) {
        setPlayState('idle');
        setElapsed(0);
        progressAnim.setValue(0);
        onPlaybackEnd?.();
      }
    });
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= durationSecs) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return durationSecs;
        }
        return prev + 1;
      });
    }, 1000);
  }, [durationSecs, elapsed, progressAnim, startPlayback, onPlaybackEnd]);

  const handlePress = useCallback(() => {
    if (playState === 'idle') startPlayback();
    else if (playState === 'playing') pausePlayback();
    else resumePlayback();
  }, [playState, startPlayback, pausePlayback, resumePlayback]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const displayTime = playState === 'idle'
    ? formatDuration(durationSecs)
    : formatDuration(elapsed);

  const playIcon = playState === 'playing' ? '⏸' : '▶';
  const accentColor = isOwn ? 'rgba(255,255,255,0.9)' : '#1976D2';
  const dimColor = isOwn ? 'rgba(255,255,255,0.35)' : '#BDBDBD';

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('typing.indicator')}
      accessibilityRole="none"
    >
      {/* Play / pause button */}
      <TouchableOpacity
        style={[styles.playBtn, { borderColor: accentColor }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={playState === 'playing' ? t('conversation.pause') : t('conversation.play')}
        hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
      >
        <Text style={[styles.playIcon, { color: accentColor }]}>{playIcon}</Text>
      </TouchableOpacity>

      {/* Waveform */}
      <View style={styles.waveformArea}>
        <View style={styles.waveformBars}>
          {heights.map((h, i) => {
            const barProgress = i / BAR_COUNT;
            const isActive = elapsed / durationSecs > barProgress;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: isActive ? accentColor : dimColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Continuous progress overlay */}
        <View style={styles.progressTrack} pointerEvents="none">
          <Animated.View
            style={[
              styles.progressFill,
              { width: progressWidth, backgroundColor: accentColor },
            ]}
          />
        </View>
      </View>

      {/* Duration */}
      <Text style={[styles.duration, { color: accentColor }]}>
        {displayTime}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    maxWidth: 280,
    paddingVertical: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 14 },
  waveformArea: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: 2,
    bottom: 0,
    marginVertical: 'auto',
    overflow: 'hidden',
    opacity: 0,
  },
  progressFill: {
    height: '100%',
  },
  duration: {
    fontSize: 11,
    minWidth: 34,
    textAlign: 'right',
  },
});
