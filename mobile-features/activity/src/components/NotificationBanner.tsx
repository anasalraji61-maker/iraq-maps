/**
 * NotificationBanner — in-app notification banner that slides in from top.
 * Auto-dismiss after 4 s. Swipe-up-to-dismiss. Tap to navigate.
 * Color-coded per notification type.
 */
import { useRouter } from 'expo-router';
import { href } from '@iraq-maps/mobile-kit';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BannerNotifType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'message'
  | 'event_reminder'
  | 'challenge_update'
  | 'nearby_place'
  | 'system'
  | 'promo'
  | 'general';

export interface BannerPayload {
  id: string;
  type: BannerNotifType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationBannerProps {
  payload: BannerPayload | null;
  onDismiss?: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type → visual
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<BannerNotifType, { icon: string; accent: string; bg: string }> = {
  like:             { icon: '❤️',  accent: '#E91E63', bg: '#FCE4EC' },
  comment:          { icon: '💬',  accent: '#1565C0', bg: '#E3F2FD' },
  follow:           { icon: '👤',  accent: '#6A1B9A', bg: '#F3E5F5' },
  mention:          { icon: '@',   accent: '#00695C', bg: '#E0F2F1' },
  message:          { icon: '✉️',  accent: '#2E7D32', bg: '#E8F5E9' },
  event_reminder:   { icon: '📅',  accent: '#E65100', bg: '#FBE9E7' },
  challenge_update: { icon: '🏆',  accent: '#F9A825', bg: '#FFFDE7' },
  nearby_place:     { icon: '📍',  accent: '#BF360C', bg: '#FBE9E7' },
  system:           { icon: '✅',  accent: '#37474F', bg: '#ECEFF1' },
  promo:            { icon: '🎁',  accent: '#AD1457', bg: '#FCE4EC' },
  general:          { icon: '🔔',  accent: '#616161', bg: '#F5F5F5' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const SLIDE_IN_MS  = 280;
const AUTO_DISMISS = 4_000;
const SWIPE_DISMISS_Y = -40; // swipe up

export function NotificationBanner({ payload, onDismiss }: NotificationBannerProps): ReactElement | null {
  const router = useRouter();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<BannerPayload | null>(null);

  const dismiss = useCallback((id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,    duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setCurrent(null);
      onDismiss?.(id);
    });
  }, [translateY, opacity, onDismiss]);

  useEffect(() => {
    if (!payload) return;
    // Slide in
    setCurrent(payload);
    setVisible(true);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(opacity,    { toValue: 1, duration: SLIDE_IN_MS, useNativeDriver: true }),
    ]).start();
    // Auto-dismiss
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { dismiss(payload.id); }, AUTO_DISMISS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [payload, dismiss, translateY, opacity]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dx) < 20,
      onPanResponderMove: (_e, g) => {
        if (g.dy < 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy < SWIPE_DISMISS_Y && current) {
          dismiss(current.id);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (!visible || !current) return null;

  const meta = TYPE_STYLE[current.type];

  const handlePress = () => {
    dismiss(current.id);
    const d = current.data ?? {};
    if ((current.type === 'like' || current.type === 'comment') && d['postId']) {
      router.push(href('discoverPost', { postId: d['postId'] }));
    } else if (current.type === 'message' && d['requestId']) {
      router.push(href('messageThread', { requestId: d['requestId'] }));
    } else if (current.type === 'nearby_place' && d['placeId']) {
      router.push(href('place', { placeId: d['placeId'] }));
    }
  };

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity, backgroundColor: meta.bg, borderStartColor: meta.accent }]}
      {...panResponder.panHandlers}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Pressable style={styles.inner} onPress={handlePress} accessibilityLabel={`${current.title}. ${current.body}`}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: `${meta.accent}22` }]}>
          <Text style={styles.iconText} accessibilityElementsHidden>{meta.icon}</Text>
        </View>

        {/* Text */}
        <View style={styles.textWrap}>
          <Text style={[styles.titleText, { color: meta.accent }]} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.bodyText} numberOfLines={2}>{current.body}</Text>
        </View>

        {/* Dismiss button */}
        <Pressable
          hitSlop={8}
          onPress={() => dismiss(current.id)}
          accessibilityRole="button"
          accessibilityLabel={t('bannerDismiss')}
          style={styles.dismissBtn}
        >
          <Text style={[styles.dismissIcon, { color: meta.accent }]} accessibilityElementsHidden>{t('bannerDismissIcon')}</Text>
        </Pressable>
      </Pressable>

      {/* Progress bar */}
      <ProgressBar durationMs={AUTO_DISMISS} accent={meta.accent} running={visible} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar (shrinks left to right over AUTO_DISMISS ms)
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ durationMs, accent, running }: { durationMs: number; accent: string; running: boolean }): ReactElement {
  const width = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!running) return;
    width.setValue(1);
    const anim = Animated.timing(width, {
      toValue: 0,
      duration: durationMs,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [running, durationMs, width]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[
          styles.progressFill,
          { backgroundColor: accent, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 9999,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    borderStartWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText:   { fontSize: 18 },
  textWrap:   { flex: 1 },
  titleText:  { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bodyText:   { fontSize: 13, color: '#424242', lineHeight: 17 },
  dismissBtn: { paddingStart: 4, paddingEnd: 2 },
  dismissIcon:{ fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 3, backgroundColor: 'transparent', borderBottomStartRadius: 14, borderBottomEndRadius: 14, overflow: 'hidden' },
  progressFill:  { height: '100%', borderBottomStartRadius: 14 },
});
