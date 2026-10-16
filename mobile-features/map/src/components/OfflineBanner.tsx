/**
 * OfflineBanner – enhanced offline status banner for the map screen.
 *
 * Beyond the minimal OfflineIndicator this shows:
 *  - Which features work offline (map, search, places).
 *  - A "Download this area" suggestion when no region covers the viewport.
 *  - Last sync time in a human-readable format.
 *  - A retry / refresh button.
 *  - A staleness warning when cached data is older than STALE_MS.
 */

import { tokens } from '@iraq-maps/ui';
import { useOffline } from '@iraq-maps/mobile-kit';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
} from 'react-native';
import { t } from '../strings';
import { isOfflineAvailable } from '../offline/OfflineMapManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
const BANNER_HEIGHT = 44;
const EXPANDED_HEIGHT = 160;
const FEATURE_WORKS = ['map', 'search', 'places'] as const;
type OfflineFeature = (typeof FEATURE_WORKS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfflineBannerProps {
  /** Current map viewport centre (used to check whether the area is downloaded). */
  viewportCenter?: [number, number]; // [lng, lat]
  /** ISO-8601 string of when data was last synced from the server. */
  lastSyncedAt?: string;
  /** Called when the user taps "Download this area". */
  onDownloadArea?: () => void;
  /** Called when the user taps the retry button. */
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Feature label map
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<OfflineFeature, string> = {
  map: 'offlineBanner.featureMap',
  search: 'offlineBanner.featureSearch',
  places: 'offlineBanner.featurePlaces',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanTimeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 2) return t('offlineBanner.timeJustNow');
  if (mins < 60) return t('offlineBanner.timeMinutesAgo', { n: String(mins) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('offlineBanner.timeHoursAgo', { n: String(hours) });
  const days = Math.round(hours / 24);
  return t('offlineBanner.timeDaysAgo', { n: String(days) });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfflineBanner({
  viewportCenter,
  lastSyncedAt,
  onDownloadArea,
  onRetry,
}: OfflineBannerProps): ReactElement | null {
  const { isOnline } = useOffline();
  const [expanded, setExpanded] = useState(false);
  const [areaDownloaded, setAreaDownloaded] = useState(true);
  const [isStale, setIsStale] = useState(false);

  const heightAnim = useRef(new Animated.Value(BANNER_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Check whether the current viewport centre is offline-available
  useEffect(() => {
    if (!viewportCenter || isOnline) return;
    isOfflineAvailable(viewportCenter).then((avail) => setAreaDownloaded(avail));
  }, [viewportCenter, isOnline]);

  // Check data staleness
  useEffect(() => {
    if (!lastSyncedAt) return;
    const stale = Date.now() - new Date(lastSyncedAt).getTime() > STALE_MS;
    setIsStale(stale);
  }, [lastSyncedAt]);

  // Animate height when expanding / collapsing
  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: expanded ? EXPANDED_HEIGHT : BANNER_HEIGHT,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }, [expanded, heightAnim]);

  // Fade out when going online (if no stale warning)
  useEffect(() => {
    if (isOnline && !isStale) {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isOnline, isStale, opacityAnim]);

  // Don't render when online and data is fresh
  if (isOnline && !isStale) return null;

  const bannerColor = isOnline && isStale
    ? tokens.color.warning ?? '#f59e0b'
    : tokens.color.danger;

  return (
    <Animated.View
      style={[styles.container, { height: heightAnim, opacity: opacityAnim }]}
      accessibilityRole={'alert' as AccessibilityRole}
      accessibilityLiveRegion="polite"
    >
      {/* ── Slim header row ──────────────────────────────────────────────── */}
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={[styles.header, { backgroundColor: bannerColor }]}
        accessibilityRole="button"
        accessibilityLabel={t('offlineBanner.toggleDetails')}
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerContent}>
          <View style={styles.dot} />
          <Text style={styles.headerText}>
            {isOnline && isStale
              ? t('offlineBanner.staleTitle')
              : t('offlineBanner.offlineTitle')}
          </Text>

          {lastSyncedAt && (
            <Text style={styles.syncTime}>
              {t('offlineBanner.lastSync', { time: humanTimeSince(lastSyncedAt) })}
            </Text>
          )}

          {onRetry && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onRetry(); }}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('offlineBanner.retry')}
            >
              <Text style={styles.retryText}>{t('offlineBanner.retry')}</Text>
            </Pressable>
          )}

          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>

        {isStale && !expanded && (
          <Text style={styles.staleSubtitle}>
            {t('offlineBanner.staleSubtitle')}
          </Text>
        )}
      </Pressable>

      {/* ── Expanded detail panel ─────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.detail,
          { opacity: heightAnim.interpolate({ inputRange: [BANNER_HEIGHT, EXPANDED_HEIGHT], outputRange: [0, 1] }) },
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        {/* Features that work offline */}
        <Text style={styles.detailSectionLabel}>
          {t('offlineBanner.worksOfflineTitle')}
        </Text>
        <View style={styles.featureRow}>
          {FEATURE_WORKS.map((feature) => (
            <View key={feature} style={styles.featureChip}>
              <Text style={styles.featureChipText}>
                ✓ {t(FEATURE_LABELS[feature] as Parameters<typeof t>[0])}
              </Text>
            </View>
          ))}
        </View>

        {/* Download suggestion */}
        {!areaDownloaded && !isOnline && onDownloadArea && (
          <Pressable
            onPress={onDownloadArea}
            style={styles.downloadSuggestion}
            accessibilityRole="button"
            accessibilityLabel={t('offlineBanner.downloadAreaA11y')}
          >
            <Text style={styles.downloadSuggestionIcon}>⬇</Text>
            <Text style={styles.downloadSuggestionText}>
              {t('offlineBanner.downloadAreaSuggestion')}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 9998,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.xs,
    minHeight: BANNER_HEIGHT,
    justifyContent: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  headerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  syncTime: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  staleSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  chevron: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  detail: {
    backgroundColor: '#1f2937',
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
    gap: tokens.space.xs,
    flex: 1,
  },
  detailSectionLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.xs,
  },
  featureChip: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderRadius: 6,
    paddingHorizontal: tokens.space.s,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  featureChipText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 8,
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    marginTop: tokens.space.xs,
  },
  downloadSuggestionIcon: {
    fontSize: 16,
    color: '#93c5fd',
  },
  downloadSuggestionText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
