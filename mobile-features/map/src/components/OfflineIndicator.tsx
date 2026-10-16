/**
 * OfflineIndicator – a slim animated banner shown at the top of any screen
 * when the device loses internet connectivity.
 *
 * Behaviour:
 *  - "Offline" banner slides in when offline.
 *  - "Reconnected" banner flashes briefly when connectivity is restored.
 *  - A badge on the reconnected banner shows how many actions are queued for sync.
 *  - A "cached data" sub-label can be shown when displaying stale content.
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
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfflineIndicatorProps {
  /**
   * When true, an extra line warns the user they are seeing cached data.
   * Controlled by the parent screen.
   */
  showCachedWarning?: boolean;
}

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const BANNER_HEIGHT = 36;
const RECONNECT_VISIBLE_MS = 3000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfflineIndicator({
  showCachedWarning = false,
}: OfflineIndicatorProps): ReactElement | null {
  const { isOnline, pendingActionsCount, syncStatus } = useOffline();
  const wasOnlineRef = useRef(true);
  const [showReconnect, setShowReconnect] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slide animation (0 = hidden above screen, 1 = visible)
  const slideAnim = useRef(new Animated.Value(isOnline ? 0 : 1)).current;

  // ── Animate banner in / out ──────────────────────────────────────────────
  const animateTo = useCallback(
    (toValue: number) => {
      Animated.spring(slideAnim, {
        toValue,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [slideAnim],
  );

  useEffect(() => {
    if (!isOnline) {
      // Coming offline: hide any reconnect banner, show offline banner
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setShowReconnect(false);
      animateTo(1);
      wasOnlineRef.current = false;
    } else {
      // Coming online
      if (!wasOnlineRef.current) {
        // We were offline — show "Reconnected" flash
        setShowReconnect(true);
        animateTo(1);
        reconnectTimer.current = setTimeout(() => {
          animateTo(0);
          setTimeout(() => setShowReconnect(false), 300);
        }, RECONNECT_VISIBLE_MS);
      } else {
        // Already online from mount — keep hidden
        animateTo(0);
      }
      wasOnlineRef.current = true;
    }

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [isOnline, animateTo]);

  // Nothing to render when online and no reconnect flash
  if (isOnline && !showReconnect) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-BANNER_HEIGHT, 0],
  });

  const isSyncing = syncStatus === 'syncing';

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      accessibilityRole={'alert' as AccessibilityRole}
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        isOnline
          ? t('offlineIndicator.reconnectedA11y')
          : t('offlineIndicator.offlineA11y')
      }
    >
      {isOnline && showReconnect ? (
        // ── Reconnected banner ────────────────────────────────────────────
        <View style={[styles.banner, styles.reconnectedBanner]}>
          <Text style={styles.bannerText}>{t('offlineIndicator.reconnected')}</Text>
          {pendingActionsCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isSyncing
                  ? t('offlineIndicator.syncing')
                  : t('offlineIndicator.pendingBadge', {
                      count: String(pendingActionsCount),
                    })}
              </Text>
            </View>
          )}
        </View>
      ) : (
        // ── Offline banner ────────────────────────────────────────────────
        <View style={[styles.banner, styles.offlineBanner]}>
          <View style={styles.row}>
            <View style={styles.dot} />
            <Text style={styles.bannerText}>{t('offlineIndicator.offline')}</Text>
            {pendingActionsCount > 0 && (
              <View style={[styles.badge, styles.offlineBadge]}>
                <Text style={styles.badgeText}>
                  {t('offlineIndicator.pendingBadge', {
                    count: String(pendingActionsCount),
                  })}
                </Text>
              </View>
            )}
          </View>
          {showCachedWarning && (
            <Text style={styles.cachedWarning}>
              {t('offlineIndicator.cachedWarning')}
            </Text>
          )}
        </View>
      )}
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
    zIndex: 9999,
  },
  banner: {
    minHeight: BANNER_HEIGHT,
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.xs,
    justifyContent: 'center',
  },
  offlineBanner: {
    backgroundColor: tokens.color.danger,
  },
  reconnectedBanner: {
    backgroundColor: '#22c55e',
  },
  row: {
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
  bannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  cachedWarning: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    paddingHorizontal: tokens.space.s,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  offlineBadge: {
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
