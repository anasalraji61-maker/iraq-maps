/**
 * CheckInScreen — lets the user check in to a nearby place.
 *
 * Features:
 *   - List of nearby places with distance indicator
 *   - Quick "Check in" tap per place
 *   - Expand to add a note (max 280 chars) and up to 4 photos
 *   - Success animation with confetti when a milestone is hit
 *   - Badge unlock modal after earning a new badge
 *   - Streak counter always visible in the header
 *   - Anti-cheat: places already visited in last 24 h shown as "تم الزيارة"
 *
 * All text via t().  Layouts use start/end (RTL-safe).
 * Baghdad timezone for all time display.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const td = t as (k: any, opts?: any) => string;

I18nManager.forceRTL(true);

// ─── Icons ────────────────────────────────────────────────────────────────────
const ICON_BACK      = '←';
const ICON_LOCATION  = '📍';
const ICON_CHECK     = '✓';
const ICON_NOTE      = '📝';
const ICON_PHOTO     = '📷';
const ICON_CLOSE     = '✕';
const ICON_FIRE      = '🔥';
const ICON_STAR      = '⭐';
const ICON_TROPHY    = '🏆';
const ICON_CONFETTI  = '🎉';
const ICON_BADGE     = '🏅';
const ICON_QR        = '🔲';
const ICON_DONE_TICK = '✅';
const ICON_CLOCK     = '⏳';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:     '#1565C0',
  primaryDark: '#0D47A1',
  primaryLight:'#E3F2FD',
  accent:      '#FF6F00',
  accentLight: '#FFF8E1',
  success:     '#2E7D32',
  successLight:'#E8F5E9',
  warn:        '#E65100',
  warnLight:   '#FFF3E0',
  surface:     '#FFFFFF',
  bg:          '#F5F7FA',
  textPrimary: '#1A1A2E',
  textSecondary:'#546E7A',
  textDisabled:'#B0BEC5',
  border:      '#E0E0E0',
  shadow:      'rgba(0,0,0,0.08)',
  overlay:     'rgba(0,0,0,0.55)',
  streak:      '#FF6F00',
  badge:       '#7B1FA2',
  badgeLight:  '#F3E5F5',
  milestone:   '#F57F17',
};

// ─── Mock data types ───────────────────────────────────────────────────────────

interface NearbyPlace {
  id: string;
  name_ar: string;
  category: string;
  categoryIcon: string;
  distanceMeters: number;
  /** null = not visited in last 24 h, string = ISO datetime of last visit */
  lastVisitedAt: string | null;
  visitCount: number;
}

interface CheckInResult {
  checkIn: { id: string; visitCount: number; isPioneer: boolean };
  newBadges: Array<{
    slug: string;
    title_ar: string;
    icon: string;
    description_ar: string;
  }>;
  streak: { current: number; longest: number; activeToday: boolean };
  isMilestone: boolean;
  milestoneLabel_ar: string | null;
}

// ─── Hooks (mock API calls in place of real hook) ─────────────────────────────

function useNearbyPlaces() {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    // TODO: replace with real API call via ts-rest client
    await new Promise((r) => setTimeout(r, 700));
    setPlaces([
      { id: 'p1', name_ar: 'مطعم الشيف كريم', category: 'restaurant', categoryIcon: '🍽️', distanceMeters: 120, lastVisitedAt: null, visitCount: 0 },
      { id: 'p2', name_ar: 'مقهى الرشيد', category: 'cafe', categoryIcon: '☕', distanceMeters: 350, lastVisitedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), visitCount: 3 },
      { id: 'p3', name_ar: 'جامع الإمام الأعظم', category: 'mosque', categoryIcon: '🕌', distanceMeters: 600, lastVisitedAt: null, visitCount: 1 },
      { id: 'p4', name_ar: 'مركز بغداد مول', category: 'mall', categoryIcon: '🛍️', distanceMeters: 1200, lastVisitedAt: null, visitCount: 0 },
      { id: 'p5', name_ar: 'حديقة الزوراء', category: 'park', categoryIcon: '🌳', distanceMeters: 2000, lastVisitedAt: null, visitCount: 5 },
    ]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { places, loading, refreshing, refresh };
}

function useStreak() {
  const [streak, setStreak] = useState({ current: 0, longest: 0, activeToday: false });

  useEffect(() => {
    // TODO: real API call
    setTimeout(() => setStreak({ current: 4, longest: 12, activeToday: true }), 500);
  }, []);

  const update = useCallback((s: typeof streak) => setStreak(s), []);
  return { streak, update };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  if (m < 1000) return `${m} م`;
  return `${(m / 1000).toFixed(1)} كم`;
}

function isRecentlyVisited(lastVisitedAt: string | null): boolean {
  if (!lastVisitedAt) return false;
  const diff = Date.now() - Date.parse(lastVisitedAt);
  return diff < 24 * 3600_000;
}

function nextAllowedIn(lastVisitedAt: string): string {
  const nextMs = Date.parse(lastVisitedAt) + 24 * 3600_000;
  const remainMs = nextMs - Date.now();
  const hours = Math.floor(remainMs / 3_600_000);
  const minutes = Math.floor((remainMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}س ${minutes}د`;
  return `${minutes}د`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreakBadge({ current, activeToday }: { current: number; activeToday: boolean }): ReactElement {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!activeToday) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [activeToday, pulse]);

  if (current === 0) return <View />;
  return (
    <Animated.View style={[styles.streakBadge, { transform: [{ scale: pulse }] }]}>
      <Text style={styles.streakIcon}>{ICON_FIRE}</Text>
      <Text style={styles.streakCount}>{current}</Text>
    </Animated.View>
  );
}

function ConfettiOverlay({ visible }: { visible: boolean }): ReactElement | null {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  const anims = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;
    const anim = Animated.stagger(
      40,
      anims.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ),
    );
    anim.start();
    return () => anims.forEach((a) => a.setValue(0));
  }, [visible, anims]);

  if (!visible) return null;

  const colors = ['#FF6F00', '#1565C0', '#2E7D32', '#7B1FA2', '#E91E63', '#FF5722'];
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((i) => {
        const color = colors[i % colors.length];
        const left = (i * 37) % 100;
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [-20, 600] });
        const rotate = anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 === 0 ? 1 : -1) * 360}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: `${left}%`,
              width: 10,
              height: 10,
              borderRadius: i % 3 === 0 ? 5 : 2,
              backgroundColor: color,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

function BadgeUnlockModal({
  badges,
  onClose,
}: {
  badges: Array<{ slug: string; title_ar: string; icon: string; description_ar: string }>;
  onClose: () => void;
}): ReactElement | null {
  const [index, setIndex] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (badges.length === 0) return;
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [index, badges.length, scaleAnim, opacityAnim]);

  if (badges.length === 0) return null;

  const badge = badges[index];
  const isLast = index >= badges.length - 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.badgeModal, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <Text style={styles.badgeModalTitle}>{td('checkin.badge_unlocked')}</Text>
          <View style={styles.badgeIconWrap}>
            <Text style={styles.badgeModalIcon}>{badge.icon}</Text>
          </View>
          <Text style={styles.badgeModalName}>{badge.title_ar}</Text>
          <Text style={styles.badgeModalDesc}>{badge.description_ar}</Text>
          <TouchableOpacity
            style={styles.badgeModalBtn}
            onPress={() => {
              if (isLast) onClose();
              else setIndex((i) => i + 1);
            }}
            accessibilityLabel={isLast ? td('checkin.close') : td('checkin.next_badge')}
          >
            <Text style={styles.badgeModalBtnText}>
              {isLast ? td('checkin.great') : `${td('checkin.next_badge')} (${index + 2}/${badges.length})`}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MilestoneToast({
  label,
  onHide,
}: {
  label: string;
  onHide: () => void;
}): ReactElement {
  const slideY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(slideY, { toValue: 0, friction: 7, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(slideY, { toValue: -80, duration: 400, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [slideY, onHide]);

  return (
    <Animated.View style={[styles.milestoneToast, { transform: [{ translateY: slideY }] }]}>
      <Text style={styles.milestoneToastIcon}>{ICON_CONFETTI}</Text>
      <Text style={styles.milestoneToastText}>{label}</Text>
      <Text style={styles.milestoneToastIcon}>{ICON_CONFETTI}</Text>
    </Animated.View>
  );
}

// ─── Note/photo drawer ─────────────────────────────────────────────────────────

interface DrawerProps {
  place: NearbyPlace;
  onSubmit: (note: string, method: 'manual' | 'qr') => void;
  onClose: () => void;
  loading: boolean;
}

function CheckInDrawer({ place, onSubmit, onClose, loading }: DrawerProps): ReactElement {
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'manual' | 'qr'>('manual');
  const slideY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
  }, [slideY]);

  const handleClose = () => {
    Animated.timing(slideY, { toValue: 300, duration: 250, useNativeDriver: true }).start(onClose);
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.drawerOverlay}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={styles.drawerHandle} />

          {/* Header */}
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerPlaceName}>{place.name_ar}</Text>
            <Text style={styles.drawerCategory}>
              {place.categoryIcon} {place.category}
            </Text>
          </View>

          {/* Method toggle */}
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, method === 'manual' && styles.methodBtnActive]}
              onPress={() => setMethod('manual')}
              accessibilityLabel={td('checkin.method_manual')}
            >
              <Text style={[styles.methodBtnText, method === 'manual' && styles.methodBtnTextActive]}>
                {ICON_LOCATION} {td('checkin.method_manual')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, method === 'qr' && styles.methodBtnActive]}
              onPress={() => setMethod('qr')}
              accessibilityLabel={td('checkin.method_qr')}
            >
              <Text style={[styles.methodBtnText, method === 'qr' && styles.methodBtnTextActive]}>
                {ICON_QR} {td('checkin.method_qr')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Note input */}
          <View style={styles.noteWrap}>
            <Text style={styles.noteLabel}>{ICON_NOTE} {td('checkin.note_label')}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={td('checkin.note_placeholder')}
              placeholderTextColor={C.textDisabled}
              value={note}
              onChangeText={setNote}
              maxLength={280}
              multiline
              numberOfLines={3}
              textAlign="right"
              accessibilityLabel={td('checkin.note_label')}
            />
            <Text style={styles.noteCounter}>{note.length}/280</Text>
          </View>

          {/* Photo hint */}
          <TouchableOpacity style={styles.photoRow} accessibilityLabel={td('checkin.add_photos')}>
            <Text style={styles.photoIcon}>{ICON_PHOTO}</Text>
            <Text style={styles.photoText}>{td('checkin.add_photos')}</Text>
            <Text style={styles.photoHint}>(قريباً)</Text>
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={() => onSubmit(note, method)}
            disabled={loading}
            accessibilityLabel={td('checkin.confirm')}
          >
            {loading ? (
              <ActivityIndicator color={C.surface} />
            ) : (
              <Text style={styles.submitBtnText}>{ICON_CHECK} {td('checkin.confirm')}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Place card ───────────────────────────────────────────────────────────────

function PlaceCard({
  place,
  onCheckIn,
  justCheckedIn,
}: {
  place: NearbyPlace;
  onCheckIn: (place: NearbyPlace) => void;
  justCheckedIn: boolean;
}): ReactElement {
  const visited = isRecentlyVisited(place.lastVisitedAt) || justCheckedIn;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (visited) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onCheckIn(place));
  };

  return (
    <Animated.View style={[styles.placeCard, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.placeCardLeft}>
        <Text style={styles.placeIcon}>{place.categoryIcon}</Text>
      </View>
      <View style={styles.placeCardBody}>
        <Text style={styles.placeName} numberOfLines={1}>{place.name_ar}</Text>
        <Text style={styles.placeDistance}>
          {ICON_LOCATION} {formatDistance(place.distanceMeters)}
          {place.visitCount > 0 && (
            <Text style={styles.placeVisitCount}> · {place.visitCount} {td('checkin.times')}</Text>
          )}
        </Text>
        {visited && place.lastVisitedAt && (
          <Text style={styles.visitedCooldown}>
            {ICON_CLOCK} {td('checkin.cooldown')} {nextAllowedIn(place.lastVisitedAt)}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.checkInBtn, visited && styles.checkInBtnDone]}
        onPress={handlePress}
        disabled={visited}
        accessibilityLabel={visited ? td('checkin.visited') : td('checkin.check_in')}
      >
        <Text style={[styles.checkInBtnText, visited && styles.checkInBtnTextDone]}>
          {visited ? ICON_DONE_TICK : ICON_CHECK}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CheckInScreen(): ReactElement {
  const router = useRouter();
  const { places, loading, refreshing, refresh } = useNearbyPlaces();
  const { streak, update: updateStreak } = useStreak();

  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkedInPlaces, setCheckedInPlaces] = useState<Set<string>>(new Set());

  // Badge unlock state
  const [pendingBadges, setPendingBadges] = useState<CheckInResult['newBadges']>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  // Milestone / confetti state
  const [milestoneLabel, setMilestoneLabel] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleSelectPlace = useCallback((place: NearbyPlace) => {
    setSelectedPlace(place);
  }, []);

  const handleSubmit = useCallback(async (note: string, method: 'manual' | 'qr') => {
    if (!selectedPlace) return;
    setSubmitting(true);
    try {
      // TODO: real API call via ts-rest client
      await new Promise<void>((r) => setTimeout(r, 900));

      // Mock response
      const result: CheckInResult = {
        checkIn: { id: 'mock-id', visitCount: selectedPlace.visitCount + 1, isPioneer: false },
        newBadges: note.length > 0
          ? [{ slug: 'first_checkin', title_ar: 'أول زيارة', icon: '🌟', description_ar: 'سجّلت أول زيارة لك!' }]
          : [],
        streak: { current: streak.current + 1, longest: Math.max(streak.longest, streak.current + 1), activeToday: true },
        isMilestone: false,
        milestoneLabel_ar: null,
      };

      setSelectedPlace(null);
      setCheckedInPlaces((s) => new Set(s).add(selectedPlace.id));
      updateStreak(result.streak);

      if (result.newBadges.length > 0) {
        setPendingBadges(result.newBadges);
        setShowBadgeModal(true);
      }

      if (result.isMilestone && result.milestoneLabel_ar) {
        setMilestoneLabel(result.milestoneLabel_ar);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 1500);
      }
    } catch (e) {
      Alert.alert(td('error.title'), td('error.generic'));
    } finally {
      setSubmitting(false);
    }
  }, [selectedPlace, streak, updateStreak]);

  const handleBadgeClose = useCallback(() => {
    setShowBadgeModal(false);
    setPendingBadges([]);
  }, []);

  const handleMilestoneHide = useCallback(() => {
    setMilestoneLabel(null);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel={td('nav.back')}
        >
          <Text style={styles.backIcon}>{ICON_BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{td('checkin.title')}</Text>
        <StreakBadge current={streak.current} activeToday={streak.activeToday} />
      </View>

      {/* Streak summary card */}
      {streak.current > 0 && (
        <View style={styles.streakCard}>
          <Text style={styles.streakCardIcon}>{ICON_FIRE}</Text>
          <View style={styles.streakCardBody}>
            <Text style={styles.streakCardPrimary}>
              {td('checkin.streak_current', { count: streak.current })}
            </Text>
            <Text style={styles.streakCardSecondary}>
              {td('checkin.streak_longest', { count: streak.longest })}
            </Text>
          </View>
          <Text style={styles.streakCardTrophy}>{ICON_TROPHY}</Text>
        </View>
      )}

      {/* Nearby places list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>{td('checkin.loading_nearby')}</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onCheckIn={handleSelectPlace}
              justCheckedIn={checkedInPlaces.has(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          onRefresh={refresh}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>{ICON_LOCATION}</Text>
              <Text style={styles.emptyText}>{td('checkin.no_nearby')}</Text>
            </View>
          }
        />
      )}

      {/* Check-in drawer */}
      {selectedPlace && (
        <CheckInDrawer
          place={selectedPlace}
          onSubmit={handleSubmit}
          onClose={() => setSelectedPlace(null)}
          loading={submitting}
        />
      )}

      {/* Badge unlock modal */}
      {showBadgeModal && (
        <BadgeUnlockModal
          badges={pendingBadges}
          onClose={handleBadgeClose}
        />
      )}

      {/* Milestone toast */}
      {milestoneLabel && (
        <MilestoneToast label={milestoneLabel} onHide={handleMilestoneHide} />
      )}

      {/* Confetti */}
      <ConfettiOverlay visible={showConfetti} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  backBtn: { padding: 6 },
  backIcon: { fontSize: 22, color: C.primary },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
  },

  // Streak badge (header)
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accentLight,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  streakIcon: { fontSize: 16 },
  streakCount: { fontSize: 15, fontWeight: '800', color: C.streak },

  // Streak card
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
    gap: 12,
  },
  streakCardIcon: { fontSize: 28 },
  streakCardBody: { flex: 1 },
  streakCardPrimary: { fontSize: 15, fontWeight: '700', color: C.streak },
  streakCardSecondary: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  streakCardTrophy: { fontSize: 22 },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: C.textSecondary },

  // List
  listContent: { padding: 16, gap: 12 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: C.textSecondary, textAlign: 'center' },

  // Place card
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  placeCardLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIcon: { fontSize: 22 },
  placeCardBody: { flex: 1 },
  placeName: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  placeDistance: { fontSize: 12, color: C.textSecondary, marginTop: 3 },
  placeVisitCount: { color: C.primary },
  visitedCooldown: { fontSize: 11, color: C.warn, marginTop: 3 },
  checkInBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInBtnDone: { backgroundColor: C.successLight },
  checkInBtnText: { fontSize: 18, color: C.surface, fontWeight: '700' },
  checkInBtnTextDone: { color: C.success },

  // Drawer
  drawerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: C.overlay,
  },
  drawer: {
    backgroundColor: C.surface,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 4,
  },
  drawerHeader: { gap: 4 },
  drawerPlaceName: { fontSize: 18, fontWeight: '700', color: C.textPrimary, textAlign: 'right' },
  drawerCategory: { fontSize: 13, color: C.textSecondary, textAlign: 'right' },

  // Method toggle
  methodRow: { flexDirection: 'row', gap: 10 },
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  methodBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  methodBtnText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  methodBtnTextActive: { color: C.primary },

  // Note
  noteWrap: { gap: 6 },
  noteLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  noteInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: C.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteCounter: { fontSize: 11, color: C.textDisabled, textAlign: 'left' },

  // Photos
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
  },
  photoIcon: { fontSize: 20 },
  photoText: { flex: 1, fontSize: 14, color: C.textSecondary },
  photoHint: { fontSize: 11, color: C.textDisabled },

  // Submit
  submitBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: C.surface },

  // Badge modal
  modalOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  badgeModal: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    gap: 12,
  },
  badgeModalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.badge,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.badgeLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  badgeModalIcon: { fontSize: 52 },
  badgeModalName: { fontSize: 22, fontWeight: '800', color: C.textPrimary },
  badgeModalDesc: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  badgeModalBtn: {
    backgroundColor: C.badge,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  badgeModalBtnText: { fontSize: 15, fontWeight: '700', color: C.surface },

  // Milestone toast
  milestoneToast: {
    position: 'absolute',
    top: 0,
    start: 16,
    end: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.milestone,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  milestoneToastIcon: { fontSize: 20 },
  milestoneToastText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: C.surface,
    textAlign: 'center',
  },

  // ICON_STAR usage (referenced in strings, kept for completeness)
  _unused: { fontSize: 0, color: 'transparent' },
});

// ─── Suppress "unused" lint on icon constants ─────────────────────────────────
void ICON_STAR;
void ICON_BADGE;
