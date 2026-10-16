/**
 * VoiceInputButton — hold-to-record voice input with animated waveform.
 * Voice transcription is a STUB: returns placeholder text; no real speech API is called.
 * All AI calls go server-side only.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  I18nManager,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const ICON_CLOSE = String.fromCharCode(0x2715);
const RECORD_COLOR = '#D32F2F';
const MAX_DURATION_MS = 30_000;
const WAVEFORM_BARS = 20;
const TICK_MS = 100;

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type RecordState = 'idle' | 'recording' | 'cancelled' | 'processing';

function usePulseAnimation(active: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.18, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 500, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity]);

  return { scale, opacity };
}

function useWaveformBars(active: boolean): Animated.Value[] {
  const bars = useRef<Animated.Value[]>(
    Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(0.2)),
  ).current;

  useEffect(() => {
    if (!active) {
      bars.forEach(b => b.setValue(0.2));
      return;
    }

    const loops = bars.map((bar, i) => {
      const delay = (i * 60) % 400;
      const duration = 200 + Math.floor(Math.random() * 200);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(bar, {
            toValue: 0.3 + Math.random() * 0.7,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.15 + Math.random() * 0.3,
            duration,
            useNativeDriver: true,
          }),
        ]),
      );
    });
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, bars]);

  return bars;
}

/** Stub transcriber — returns a generic placeholder. No network call made. */
async function stubTranscribe(_durationMs: number): Promise<string> {
  // Simulate brief processing delay
  await new Promise(r => setTimeout(r, 600));
  return t('voice.stubTranscript');
}

function WaveformView({ bars }: { bars: Animated.Value[] }): ReactElement {
  return (
    <View style={waveStyles.container} accessibilityLabel={t('voice.waveformA11y')}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            {
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    gap: 2,
    paddingHorizontal: 4,
  },
  bar: {
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: '#FFF',
    opacity: 0.9,
  },
});

function TimerText({ startMs }: { startMs: number | null }): ReactElement {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startMs === null) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - startMs);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [startMs]);

  const seconds = Math.floor(elapsed / 1000);
  const remaining = Math.max(0, Math.floor((MAX_DURATION_MS - elapsed) / 1000));
  return (
    <Text style={timerStyles.text} accessibilityLabel={t('voice.timerA11y', { seconds: String(seconds) })}>
      {`${seconds}s / ${remaining}s`}
    </Text>
  );
}

const timerStyles = StyleSheet.create({
  text: {
    color: '#FFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});

export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps): ReactElement {
  const [state, setState] = useState<RecordState>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [cancelHint, setCancelHint] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<RecordState>('idle');

  const isRecording = state === 'recording';
  const { scale, opacity } = usePulseAnimation(isRecording);
  const bars = useWaveformBars(isRecording);

  const startRecording = () => {
    if (disabled || stateRef.current !== 'idle') return;
    setState('recording');
    stateRef.current = 'recording';
    startTimeRef.current = Date.now();
    setTranscript(null);
    setCancelHint(false);

    // Auto-stop after MAX_DURATION_MS
    timeoutRef.current = setTimeout(() => {
      if (stateRef.current === 'recording') {
        void stopRecording(false);
      }
    }, MAX_DURATION_MS);
  };

  const stopRecording = async (cancelled: boolean) => {
    if (stateRef.current !== 'recording') return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (cancelled) {
      setState('cancelled');
      stateRef.current = 'cancelled';
      setTimeout(() => {
        setState('idle');
        stateRef.current = 'idle';
        setTranscript(null);
      }, 800);
      return;
    }

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    setState('processing');
    stateRef.current = 'processing';

    const text = await stubTranscribe(durationMs);
    setTranscript(text);
    setState('idle');
    stateRef.current = 'idle';
    onTranscript(text);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => stateRef.current === 'recording',
    onPanResponderGrant: () => startRecording(),
    onPanResponderMove: (_, gestureState) => {
      // Slide up to cancel
      if (gestureState.dy < -40 && stateRef.current === 'recording') {
        setCancelHint(true);
      } else {
        setCancelHint(false);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy < -40) {
        void stopRecording(true);
      } else {
        void stopRecording(false);
      }
      setCancelHint(false);
    },
    onPanResponderTerminate: () => {
      void stopRecording(true);
      setCancelHint(false);
    },
  });

  const isProcessing = state === 'processing';
  const isCancelled = state === 'cancelled';

  return (
    <View style={styles.wrapper}>
      {/* Cancel hint */}
      {isRecording && cancelHint ? (
        <View style={styles.cancelHint} accessibilityLiveRegion="polite">
          <Text style={styles.cancelHintText}>{t('voice.slideToCancel')}</Text>
        </View>
      ) : null}

      {/* Waveform panel shown while recording */}
      {isRecording ? (
        <View style={styles.waveformPanel} accessibilityRole="none">
          <WaveformView bars={bars} />
          <TimerText startMs={startTimeRef.current} />
        </View>
      ) : null}

      {/* Transcript preview */}
      {transcript && !isRecording ? (
        <View style={styles.transcriptRow} accessibilityLiveRegion="polite">
          <Text style={styles.transcriptText} numberOfLines={2}>{transcript}</Text>
          <Pressable
            onPress={() => setTranscript(null)}
            style={styles.transcriptDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('voice.dismissTranscript')}
          >
            <Text style={styles.transcriptDismissText} accessibilityElementsHidden>{ICON_CLOSE}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Cancelled feedback */}
      {isCancelled ? (
        <View style={styles.cancelledRow} accessibilityLiveRegion="polite">
          <Text style={styles.cancelledText}>{t('voice.cancelled')}</Text>
        </View>
      ) : null}

      {/* Main button */}
      <Animated.View
        style={[
          styles.buttonOuter,
          {
            transform: [{ scale }],
            opacity: disabled ? 0.4 : opacity,
          },
          isRecording && styles.buttonOuterRecording,
        ]}
        {...panResponder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? t('voice.releaseToStop') : t('voice.holdToRecord')}
        accessibilityState={{ disabled: !!disabled, busy: isProcessing }}
      >
        <View style={[styles.button, isRecording && styles.buttonRecording, isProcessing && styles.buttonProcessing]}>
          {isProcessing ? (
            <Text style={styles.buttonIcon}>⏳</Text>
          ) : isRecording ? (
            <Text style={styles.buttonIcon}>🎙</Text>
          ) : (
            <Text style={styles.buttonIcon}>🎤</Text>
          )}
        </View>
      </Animated.View>

      {/* Status label */}
      <Text style={styles.label} importantForAccessibility="no-hide-descendants">
        {isProcessing
          ? t('voice.processing')
          : isRecording
          ? t('voice.recording')
          : t('voice.holdToRecord')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 6,
  },
  cancelHint: {
    backgroundColor: RECORD_COLOR,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 4,
  },
  cancelHintText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  waveformPanel: {
    backgroundColor: RECORD_COLOR,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 4,
    minWidth: 180,
  },
  transcriptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 260,
    gap: 8,
  },
  transcriptText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    textAlign: 'auto',
  },
  transcriptDismiss: {
    padding: 2,
  },
  transcriptDismissText: {
    color: '#90A4AE',
    fontSize: 14,
  },
  cancelledRow: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelledText: {
    color: RECORD_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  buttonOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(25,118,210,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOuterRecording: {
    backgroundColor: 'rgba(211,47,47,0.15)',
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonRecording: {
    backgroundColor: RECORD_COLOR,
  },
  buttonProcessing: {
    backgroundColor: '#546E7A',
  },
  buttonIcon: {
    fontSize: 24,
  },
  label: {
    fontSize: 11,
    color: '#757575',
    textAlign: 'center',
  },
});
