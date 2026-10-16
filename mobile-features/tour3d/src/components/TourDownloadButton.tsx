/**
 * TourDownloadButton – download a tour for offline use.
 * Stub implementation: simulates download progress with a timer.
 * A real implementation would use expo-file-system + a background fetch.
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

type DownloadState = 'idle' | 'downloading' | 'complete' | 'error';

export interface TourDownloadButtonProps {
  tourId: string;
  tourNameAr: string;
  /** Approximate size in megabytes (displayed to user). */
  sizeMb?: number;
  /** If already downloaded offline. */
  isOffline?: boolean;
  onDownloadComplete?: (tourId: string) => void;
  onDownloadError?: (tourId: string, error: string) => void;
  onDelete?: (tourId: string) => void;
  accentColor?: string;
  /** Compact single-icon mode (no text label). */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = '#c9a84c';

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ---------------------------------------------------------------------------
// Circular progress ring
// ---------------------------------------------------------------------------

interface RingProps {
  progress: number; // 0..1
  size: number;
  strokeWidth: number;
  color: string;
}

function ProgressRing({ progress, size, strokeWidth, color }: RingProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const dashOffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  // Since SVG isn't straightforward in RN, we simulate with a View arc overlay
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Track ring */}
      <View
        style={{
          position: 'absolute',
          inset: strokeWidth / 2,
          borderRadius: radius + strokeWidth / 2,
          borderWidth: strokeWidth,
          borderColor: 'rgba(255,255,255,0.2)',
        }}
      />
      {/* Fill – approximate with a growing border; works for a stub */}
      <Animated.View
        style={{
          position: 'absolute',
          inset: strokeWidth / 2,
          borderRadius: radius + strokeWidth / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          opacity: dashOffset.interpolate({
            inputRange: [0, circumference],
            outputRange: [1, 0.1],
          }),
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main button
// ---------------------------------------------------------------------------

export function TourDownloadButton({
  tourId,
  tourNameAr,
  sizeMb = 45,
  isOffline = false,
  onDownloadComplete,
  onDownloadError,
  onDelete,
  accentColor = DEFAULT_ACCENT,
  compact = false,
}: TourDownloadButtonProps) {
  const [state, setState] = useState<DownloadState>(isOffline ? 'complete' : 'idle');
  const [progress, setProgress] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  // Sync with external isOffline prop
  useEffect(() => {
    if (isOffline && state === 'idle') {
      setState('complete');
      setProgress(1);
    }
  }, [isOffline, state]);

  const handleDownloadPress = () => {
    if (state !== 'idle') return;
    setState('downloading');
    progressRef.current = 0;
    setProgress(0);

    // Simulate download: ~3 seconds total
    const totalSteps = 30;
    let step = 0;

    intervalRef.current = setInterval(() => {
      step++;
      const p = step / totalSteps;
      progressRef.current = p;
      setProgress(p);

      if (step >= totalSteps) {
        stopInterval();
        const didSucceed = Math.random() > 0.05; // 95% success
        if (didSucceed) {
          setState('complete');
          setProgress(1);
          onDownloadComplete?.(tourId);
        } else {
          setState('error');
          onDownloadError?.(tourId, 'network_error');
        }
      }
    }, 100);
  };

  const handleCancelDownload = () => {
    stopInterval();
    setState('idle');
    setProgress(0);
    progressRef.current = 0;
  };

  const handleDeletePress = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setState('idle');
    setProgress(0);
    onDelete?.(tourId);
  };

  const handleRetry = () => {
    setState('idle');
    setProgress(0);
    progressRef.current = 0;
    // Retry immediately
    setTimeout(() => handleDownloadPress(), 50);
  };

  const progressPercent = Math.round(progress * 100);

  // ---------------------------------------------------------------------------
  // Compact mode
  // ---------------------------------------------------------------------------

  if (compact) {
    return (
      <View>
        {state === 'idle' && (
          <Pressable
            style={[compactStyles.btn, { backgroundColor: accentColor }]}
            onPress={handleDownloadPress}
            accessibilityRole="button"
            accessibilityLabel={t('explore.downloadTour')}
          >
            <Text style={compactStyles.icon}>⬇</Text>
          </Pressable>
        )}

        {state === 'downloading' && (
          <Pressable
            style={[compactStyles.btn, { backgroundColor: 'rgba(201,168,76,0.2)', borderWidth: 2, borderColor: accentColor }]}
            onPress={handleCancelDownload}
            accessibilityRole="button"
            accessibilityLabel={t('explore.cancelDownload')}
          >
            <Text style={[compactStyles.progressText, { color: accentColor }]}>
              {progressPercent}%
            </Text>
          </Pressable>
        )}

        {state === 'complete' && (
          <Pressable
            style={[compactStyles.btn, { backgroundColor: 'rgba(39,174,96,0.15)', borderWidth: 2, borderColor: '#27ae60' }]}
            onPress={handleDeletePress}
            accessibilityRole="button"
            accessibilityLabel={t('explore.offlineAvailable')}
          >
            <Text style={compactStyles.doneIcon}>{t('icon.check')}</Text>
          </Pressable>
        )}

        {state === 'error' && (
          <Pressable
            style={[compactStyles.btn, { backgroundColor: 'rgba(231,76,60,0.15)', borderWidth: 2, borderColor: '#e74c3c' }]}
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel={t('explore.downloadError')}
          >
            <Text style={compactStyles.errorIcon}>{t('icon.retry')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Full mode
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* Delete confirm sheet */}
      {showDeleteConfirm && (
        <View style={styles.confirmSheet}>
          <Text style={styles.confirmTitle}>{t('explore.deleteOfflineTour')}</Text>
          <Text style={styles.confirmBody} numberOfLines={2}>{tourNameAr}</Text>
          <View style={styles.confirmActions}>
            <Pressable
              style={styles.confirmCancel}
              onPress={() => setShowDeleteConfirm(false)}
              accessibilityRole="button"
            >
              <Text style={styles.confirmCancelText}>{t('explore.cancel')}</Text>
            </Pressable>
            <Pressable
              style={styles.confirmDelete}
              onPress={handleDeleteConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.confirmDeleteText}>{t('explore.delete')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Idle */}
      {state === 'idle' && (
        <Pressable
          style={({ pressed }) => [
            styles.mainBtn,
            { borderColor: accentColor },
            pressed && styles.mainBtnPressed,
          ]}
          onPress={handleDownloadPress}
          accessibilityRole="button"
          accessibilityLabel={t('explore.downloadTour')}
        >
          <Text style={[styles.mainBtnIcon, { color: accentColor }]}>⬇</Text>
          <View style={styles.mainBtnTextGroup}>
            <Text style={[styles.mainBtnLabel, { color: accentColor }]}>
              {t('explore.downloadTour')}
            </Text>
            <Text style={styles.mainBtnSub}>
              {formatSize(sizeMb)} · {t('explore.offlineUse')}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Downloading */}
      {state === 'downloading' && (
        <View style={[styles.mainBtn, { borderColor: accentColor }]}>
          <ProgressRing
            progress={progress}
            size={36}
            strokeWidth={3}
            color={accentColor}
          />
          <View style={styles.mainBtnTextGroup}>
            <Text style={[styles.mainBtnLabel, { color: accentColor }]}>
              {t('explore.downloading')} {progressPercent}%
            </Text>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: `${progressPercent}%` as `${number}%`, backgroundColor: accentColor },
                ]}
              />
            </View>
          </View>
          <Pressable
            style={styles.cancelBtn}
            onPress={handleCancelDownload}
            accessibilityRole="button"
            accessibilityLabel={t('explore.cancelDownload')}
          >
            <Text style={styles.cancelIcon}>{t('icon.close')}</Text>
          </Pressable>
        </View>
      )}

      {/* Complete */}
      {state === 'complete' && (
        <View style={[styles.mainBtn, { borderColor: '#27ae60', backgroundColor: 'rgba(39,174,96,0.06)' }]}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkIcon}>{t('icon.check')}</Text>
          </View>
          <View style={styles.mainBtnTextGroup}>
            <Text style={[styles.mainBtnLabel, { color: '#27ae60' }]}>
              {t('explore.offlineAvailable')}
            </Text>
            <Text style={styles.mainBtnSub}>{formatSize(sizeMb)}</Text>
          </View>
          <Pressable
            style={styles.deleteBtn}
            onPress={handleDeletePress}
            accessibilityRole="button"
            accessibilityLabel={t('explore.deleteOfflineTour')}
          >
            <Text style={styles.deleteIcon}>🗑</Text>
          </Pressable>
        </View>
      )}

      {/* Error */}
      {state === 'error' && (
        <Pressable
          style={[styles.mainBtn, { borderColor: '#e74c3c' }]}
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel={t('explore.downloadError')}
        >
          <Text style={styles.errorEmoji}>{t('icon.warning')}</Text>
          <View style={styles.mainBtnTextGroup}>
            <Text style={[styles.mainBtnLabel, { color: '#e74c3c' }]}>
              {t('explore.downloadError')}
            </Text>
            <Text style={styles.mainBtnSub}>{t('explore.tapToRetry')}</Text>
          </View>
          <Text style={[styles.retryArrow, { color: '#e74c3c' }]}>{t('icon.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const compactStyles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16, color: '#fff' },
  progressText: { fontSize: 10, fontWeight: '800' },
  doneIcon: { fontSize: 16, color: '#27ae60', fontWeight: '800' },
  errorIcon: { fontSize: 18, color: '#e74c3c', fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { gap: 0 },
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  mainBtnPressed: { opacity: 0.82 },
  mainBtnIcon: { fontSize: 24 },
  mainBtnTextGroup: { flex: 1, gap: 4 },
  mainBtnLabel: { fontSize: 14, fontWeight: '700' },
  mainBtnSub: { fontSize: 11, color: '#888' },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    minWidth: 4,
  },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIcon: { fontSize: 12, color: '#555', fontWeight: '800' },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(39,174,96,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { fontSize: 18, color: '#27ae60', fontWeight: '800' },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(231,76,60,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: { fontSize: 16 },
  errorEmoji: { fontSize: 24 },
  retryArrow: { fontSize: 22, fontWeight: '700' },
  confirmSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  confirmBody: {
    fontSize: 13,
    color: '#555',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  confirmCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f0e8',
  },
  confirmCancelText: { fontSize: 13, color: '#555', fontWeight: '600' },
  confirmDelete: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e74c3c',
  },
  confirmDeleteText: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
