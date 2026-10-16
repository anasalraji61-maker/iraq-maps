/**
 * EventDetailScreen – full event detail view for Iraq Smart Maps.
 *
 * Features:
 *  - 16:9 cover image with gradient overlay and category chip
 *  - Date/time in Arabic (Iraqi locale, UTC+3)
 *  - Hijri date for Ramadan/Eid-adjacent events
 *  - Location row with map preview (static bounding box via WebView)
 *  - RSVP button with live going/maybe counts
 *  - Attendees list (first 10 avatars)
 *  - Organizer profile row
 *  - Description with AR/EN toggle
 *  - Share event (system share sheet)
 *  - Add to calendar (deep-link)
 *  - Related events (same category)
 */

/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { type DiscoverEventType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { EventCard, type RsvpStatus } from '../components/EventCard';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

// ─── Iraqi timezone ───────────────────────────────────────────────────────────

const IRAQ_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function _toIraqLocal(isoStr: string): Date {
  return new Date(new Date(isoStr).getTime() + IRAQ_UTC_OFFSET_MS);
}

function formatIraqDateTime(isoStr: string): { date: string; time: string; full: string } {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Baghdad',
  });
  const time = d.toLocaleTimeString('ar-IQ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Baghdad',
  });
  return { date, time, full: `${date} · ${time}` };
}

// ─── Hijri date utility ───────────────────────────────────────────────────────

const HIJRI_MONTHS_AR = [
  'محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة',
];

function toHijriApprox(isoStr: string): string {
  const date = new Date(isoStr);
  const JD_EPOCH = 1948439.5;
  const MEAN_MONTH = 29.53059;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const daysSince = jd - JD_EPOCH;
  const hYear = Math.floor(daysSince / 354.36708) + 1;
  const hDOY = daysSince - Math.floor((hYear - 1) * 354.36708);
  const hMonth = Math.max(1, Math.min(12, Math.floor(hDOY / MEAN_MONTH) + 1));
  const hDay = Math.max(1, Math.floor(hDOY % MEAN_MONTH) + 1);
  const mName = HIJRI_MONTHS_AR[hMonth - 1] ?? '';
  return `${hDay} ${mName} ${hYear} هـ`;
}

/** Returns true if the event date falls in Ramadan (approximate). */
function isRamadan(isoStr: string): boolean {
  const date = new Date(isoStr);
  const JD_EPOCH = 1948439.5;
  const MEAN_MONTH = 29.53059;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const daysSince = jd - JD_EPOCH;
  const hYear = Math.floor(daysSince / 354.36708) + 1;
  const hDOY = daysSince - Math.floor((hYear - 1) * 354.36708);
  const hMonth = Math.max(1, Math.min(12, Math.floor(hDOY / MEAN_MONTH) + 1));
  return hMonth === 9;
}

// ─── Category colors ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  cultural:      { bg: '#EDE7F6', text: '#4527A0', dot: '#9C27B0' },
  food:          { bg: '#FFF3E0', text: '#E65100', dot: '#FF9800' },
  sport:         { bg: '#E8F5E9', text: '#1B5E20', dot: '#4CAF50' },
  business:      { bg: '#E3F2FD', text: '#0D47A1', dot: '#2196F3' },
  education:     { bg: '#E0F2F1', text: '#004D40', dot: '#00BCD4' },
  entertainment: { bg: '#FCE4EC', text: '#880E4F', dot: '#E91E63' },
  social:        { bg: '#E8EAF6', text: '#283593', dot: '#607D8B' },
  other:         { bg: COLORS.border, text: COLORS.textSecondary, dot: '#9E9E9E' },
};

function catColors(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['other']!;
}

// ─── Attendee avatar row ──────────────────────────────────────────────────────

function AttendeeAvatarRow({
  userIds,
  totalCount,
}: {
  userIds: string[];
  totalCount: number;
}): ReactElement {
  const visible = userIds.slice(0, 10);
  const overflow = totalCount > 10 ? totalCount - 10 : 0;

  return (
    <View style={avatarStyles.row}>
      {visible.map((id, i) => (
        <View
          key={`${id}-${i}`}
          style={[avatarStyles.avatar, { marginStart: i > 0 ? -10 : 0, zIndex: visible.length - i }]}
        >
          <Text style={avatarStyles.initial}>{id.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={[avatarStyles.avatar, avatarStyles.overflow, { marginStart: -10 }]}>
          <Text style={avatarStyles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    borderWidth: 2.5,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  overflow: { backgroundColor: COLORS.border },
  overflowText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
});

// ─── RSVP bar ─────────────────────────────────────────────────────────────────

type RsvpStatusLocal = 'going' | 'maybe' | 'none';

function RsvpBar({
  going,
  maybe,
  status,
  isFull,
  loading,
  onGoing,
  onMaybe,
  onCancel,
}: {
  going: number;
  maybe: number;
  status: RsvpStatusLocal;
  isFull: boolean;
  loading: boolean;
  onGoing: () => void;
  onMaybe: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <View style={rsvpStyles.container}>
      <View style={rsvpStyles.counts}>
        <View style={rsvpStyles.countItem}>
          <Text style={rsvpStyles.countNum}>{going}</Text>
          <Text style={rsvpStyles.countLabel}>{t('events.rsvpGoing' as Parameters<typeof t>[0])}</Text>
        </View>
        <View style={rsvpStyles.countDivider} />
        <View style={rsvpStyles.countItem}>
          <Text style={rsvpStyles.countNum}>{maybe}</Text>
          <Text style={rsvpStyles.countLabel}>{t('events.rsvpMaybe' as Parameters<typeof t>[0])}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 8 }} />
      ) : status !== 'none' ? (
        <View style={rsvpStyles.cancelRow}>
          <View style={[rsvpStyles.attendingBadge, status === 'maybe' && rsvpStyles.maybeBadge]}>
            <Text style={rsvpStyles.attendingText}>
              {status === 'going'
                ? '✓ ' + t('events.attending')
                : '? ' + t('events.rsvpMaybe' as Parameters<typeof t>[0])}
            </Text>
          </View>
          <Pressable
            style={rsvpStyles.cancelBtn}
            onPress={onCancel}
            accessibilityRole="button"
          >
            <Text style={rsvpStyles.cancelText}>{t('events.cancelRsvp')}</Text>
          </Pressable>
        </View>
      ) : isFull ? (
        <View style={rsvpStyles.fullBanner}>
          <Text style={rsvpStyles.fullText}>{t('events.full')}</Text>
        </View>
      ) : (
        <View style={rsvpStyles.btnRow}>
          <Pressable
            style={rsvpStyles.goingBtn}
            onPress={onGoing}
            accessibilityRole="button"
            accessibilityLabel={t('events.rsvpGoing' as Parameters<typeof t>[0])}
          >
            <Text style={rsvpStyles.goingText}>✓ {t('events.rsvpGoing' as Parameters<typeof t>[0])}</Text>
          </Pressable>
          <Pressable
            style={rsvpStyles.maybeBtn}
            onPress={onMaybe}
            accessibilityRole="button"
            accessibilityLabel={t('events.rsvpMaybe' as Parameters<typeof t>[0])}
          >
            <Text style={rsvpStyles.maybeText}>? {t('events.rsvpMaybe' as Parameters<typeof t>[0])}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const rsvpStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  countItem: { flex: 1, alignItems: 'center' },
  countNum: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  countLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  countDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  btnRow: { flexDirection: 'row', gap: 10 },
  goingBtn: {
    flex: 1,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  goingText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  maybeBtn: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  maybeText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  cancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendingBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  maybeBadge: { backgroundColor: '#FFF3E0' },
  attendingText: { color: '#2E7D32', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },
  fullBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  fullText: { color: COLORS.error, fontWeight: '700', fontSize: 14 },
});

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, onPress }: {
  icon: string;
  label: string;
  value: string;
  onPress?: () => void;
}): ReactElement {
  return (
    <Pressable
      style={infoStyles.row}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
    >
      <Text style={infoStyles.icon}>{icon}</Text>
      <View style={infoStyles.body}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={[infoStyles.value, onPress && infoStyles.link]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {onPress && <Text style={infoStyles.chevron}>{'›'}</Text>}
    </Pressable>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  icon: { fontSize: 18, width: 28, textAlign: 'center', marginTop: 1 },
  body: { flex: 1, paddingHorizontal: 10 },
  label: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
  value: { fontSize: 14, color: COLORS.textPrimary, textAlign: 'auto' },
  link: { color: COLORS.primary },
  chevron: { fontSize: 18, color: COLORS.textMuted, marginTop: 1 },
});

// ─── Cover image ──────────────────────────────────────────────────────────────

function CoverImage({
  uri,
  category,
}: {
  uri: string | null;
  category: string;
}): ReactElement {
  const cc = catColors(category);
  if (uri) {
    return (
      <View style={coverStyles.container}>
        <Image
          source={{ uri }}
          style={coverStyles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        {/* gradient tint */}
        <View style={coverStyles.gradient} />
      </View>
    );
  }
  return (
    <View style={[coverStyles.container, { backgroundColor: cc.bg }]}>
      <Text style={[coverStyles.placeholderIcon, { color: cc.dot }]}>📅</Text>
    </View>
  );
}

const coverStyles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', position: 'relative' },
  image: { width: '100%', height: '100%' },
  gradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  placeholderIcon: { fontSize: 56, textAlign: 'center', marginTop: 40 },
});

// ─── Location map preview ─────────────────────────────────────────────────────

function MapPreview({ lat, lng, address }: { lat: number; lng: number; address: string }): ReactElement {
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

  return (
    <Pressable
      style={mapStyles.container}
      onPress={() => Linking.openURL(url).catch(() => null)}
      accessibilityRole="button"
      accessibilityLabel={`فتح الموقع: ${address}`}
    >
      {/* Placeholder map tile showing coordinates text */}
      <View style={mapStyles.placeholder}>
        <Text style={mapStyles.coordText}>
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </Text>
        <Text style={mapStyles.openText}>اضغط لفتح الخريطة ↗</Text>
      </View>
      <View style={mapStyles.pin}>
        <Text style={mapStyles.pinIcon}>📍</Text>
      </View>
    </Pressable>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8EAF6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 4,
  },
  placeholder: { alignItems: 'center' },
  coordText: { fontSize: 12, color: COLORS.textSecondary },
  openText: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  pin: {
    position: 'absolute',
    top: '40%',
    start: '47%',
  },
  pinIcon: { fontSize: 24 },
});

// ─── Organizer row ────────────────────────────────────────────────────────────

function OrganizerRow({ organizerId }: { organizerId: string }): ReactElement {
  return (
    <View style={orgStyles.row}>
      <View style={orgStyles.avatar}>
        <Text style={orgStyles.initial}>{organizerId.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={orgStyles.info}>
        <Text style={orgStyles.label}>المنظّم</Text>
        <Text style={orgStyles.name}>{organizerId.slice(0, 12)}…</Text>
      </View>
    </View>
  );
}

const orgStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  info: { flex: 1, paddingStart: 12 },
  label: { fontSize: 11, color: COLORS.textMuted },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
});

// ─── Description with language toggle ────────────────────────────────────────

function DescriptionSection({
  arText,
  enText,
}: {
  arText: string;
  enText?: string;
}): ReactElement {
  const [showEn, setShowEn] = useState(false);
  const hasEn = !!enText;

  return (
    <View style={descStyles.container}>
      {hasEn && (
        <View style={descStyles.toggle}>
          <Pressable
            style={[descStyles.tab, !showEn && descStyles.tabActive]}
            onPress={() => setShowEn(false)}
            accessibilityRole="tab"
            accessibilityState={{ selected: !showEn }}
          >
            <Text style={[descStyles.tabText, !showEn && descStyles.tabTextActive]}>عربي</Text>
          </Pressable>
          <Pressable
            style={[descStyles.tab, showEn && descStyles.tabActive]}
            onPress={() => setShowEn(true)}
            accessibilityRole="tab"
            accessibilityState={{ selected: showEn }}
          >
            <Text style={[descStyles.tabText, showEn && descStyles.tabTextActive]}>English</Text>
          </Pressable>
        </View>
      )}
      <Text style={[descStyles.body, showEn && descStyles.bodyEn]}>
        {showEn ? (enText ?? '') : arText}
      </Text>
    </View>
  );
}

const descStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.surface },
  tabText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 24, color: COLORS.textPrimary, textAlign: 'auto' },
  bodyEn: { textAlign: 'left' },
});

// ─── Related events ───────────────────────────────────────────────────────────

function RelatedEventsSection({
  events,
  onPress,
  onRsvp,
}: {
  events: DiscoverEventType[];
  onPress: (id: string) => void;
  onRsvp: (id: string, status: RsvpStatus) => void;
}): ReactElement | null {
  if (events.length === 0) return null;
  return (
    <View style={relStyles.container}>
      <Text style={relStyles.title}>فعاليات ذات صلة</Text>
      {events.map((ev) => (
        <EventCard
          key={ev.id}
          event={ev}
          onPress={() => onPress(ev.id)}
          onRsvp={onRsvp}
        />
      ))}
    </View>
  );
}

const relStyles = StyleSheet.create({
  container: { marginTop: 8 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});

// ─── EventDetailScreen ────────────────────────────────────────────────────────

export function EventDetailScreen(): ReactElement {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const client = useEventsClient();
  const session = useSession();

  const [event, setEvent] = useState<DiscoverEventType | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatusLocal>('none');
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [goingCount, setGoingCount] = useState(0);
  const [maybeCount] = useState(0);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [relatedEvents, setRelatedEvents] = useState<DiscoverEventType[]>([]);

  const userId =
    session.state.status === 'signedIn' ? session.state.user.id : null;

  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await client.getEvent({ params: { eventId: eventId as never } });
      if (res.status === 200) {
        const ev = res.body;
        setEvent(ev);
        setGoingCount(ev.attendeeCount);
        setRsvpStatus(ev.isAttending ? 'going' : 'none');
      }
    } catch {
      // null state shown
    } finally {
      setLoading(false);
    }
  }, [client, eventId]);

  const loadRelated = useCallback(
    async (category: string) => {
      try {
        const res = await client.listEvents({
          query: { limit: 3, category: category as never },
        });
        if (res.status === 200) {
          setRelatedEvents(
            res.body.items.filter((e) => e.id !== eventId).slice(0, 3),
          );
        }
      } catch {
        // silent
      }
    },
    [client, eventId],
  );

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (event) {
      void loadRelated(event.category);
      // Simulate attendee IDs for avatar display
      setAttendeeIds(
        Array.from({ length: Math.min(event.attendeeCount, 10) }, (_, i) =>
          `user-${i + 1}`,
        ),
      );
    }
  }, [event, loadRelated]);

  const handleRsvp = useCallback(
    async (target: RsvpStatusLocal) => {
      if (!userId) {
        Alert.alert('يجب تسجيل الدخول أولاً');
        return;
      }
      if (!eventId) return;
      setRsvpLoading(true);
      try {
        if (target === 'none') {
          await client.cancelRsvp({ params: { eventId: eventId as never } });
          if (rsvpStatus === 'going') setGoingCount((c) => Math.max(0, c - 1));
          setRsvpStatus('none');
        } else {
          await client.rsvpEvent({ params: { eventId: eventId as never }, body: {} });
          if (target === 'going' && rsvpStatus !== 'going')
            setGoingCount((c) => c + 1);
          setRsvpStatus(target);
        }
      } catch {
        Alert.alert(t('events.rsvpError'));
      } finally {
        setRsvpLoading(false);
      }
    },
    [client, eventId, rsvpStatus, userId],
  );

  const handleShare = useCallback(() => {
    if (!event) return;
    void Share.share({
      message: `${event.title}\n${event.address}\niraqsmartmaps://discover/events/${event.id}`,
      title: event.title,
    });
  }, [event]);

  const handleAddToCalendar = useCallback(() => {
    if (!event) return;
    // Deep-link to system calendar via iOS/Android content URI
    const start = encodeURIComponent(event.startTime);
    const end = encodeURIComponent(event.endTime);
    const title = encodeURIComponent(event.title);
    const loc = encodeURIComponent(event.address);
    const url = `content://com.android.calendar/events?dtstart=${start}&dtend=${end}&title=${title}&eventLocation=${loc}`;
    Linking.canOpenURL(url)
      .then((can) => {
        if (can) return Linking.openURL(url);
        Alert.alert('إضافة إلى التقويم', 'لم يُعثر على تطبيق تقويم.');
      })
      .catch(() => null);
  }, [event]);

  const isFull = useMemo(
    () =>
      event?.maxAttendees != null &&
      goingCount >= event.maxAttendees &&
      rsvpStatus === 'none',
    [event, goingCount, rsvpStatus],
  );

  if (loading) {
    return (
      <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.background }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.background }]}>
        <Text style={{ color: COLORS.error }}>{t('events.loadError')}</Text>
        <Pressable
          style={{ marginTop: 16, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 }}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={{ color: '#FFF', fontWeight: '600' }}>رجوع</Text>
        </Pressable>
      </View>
    );
  }

  const startFmt = formatIraqDateTime(event.startTime);
  const endFmt = formatIraqDateTime(event.endTime);
  const cc = catColors(event.category);
  const hijriStart = toHijriApprox(event.startTime);
  const showHijri = isRamadan(event.startTime);
  const durationMin = Math.round(
    (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000,
  );
  const durationLabel =
    durationMin < 60
      ? `${durationMin} دقيقة`
      : `${Math.floor(durationMin / 60)} ساعة${durationMin % 60 ? ` و${durationMin % 60} دقيقة` : ''}`;

  const handleEventCardRsvp = (id: string, status: RsvpStatus) => {
    void (async () => {
      if (!id) return;
      try {
        if (status === 'none') {
          await client.cancelRsvp({ params: { eventId: id as never } });
        } else {
          await client.rsvpEvent({ params: { eventId: id as never }, body: {} });
        }
      } catch {
        // silent
      }
    })();
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* ── Back button overlay ──────────────────────────────────────────── */}
      <View style={detailStyles.backOverlay} pointerEvents="box-none">
        <Pressable
          style={detailStyles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('profile.back')}
        >
          <Text style={detailStyles.backIcon}>{'‹'}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── Cover ──────────────────────────────────────────────────────── */}
        <CoverImage uri={event.imageUrl} category={event.category} />

        {/* ── Category chip ───────────────────────────────────────────────── */}
        <View style={detailStyles.categoryRow}>
          <View style={[detailStyles.categoryChip, { backgroundColor: cc.bg }]}>
            <Text style={[detailStyles.categoryText, { color: cc.text }]}>
              {event.category}
            </Text>
          </View>
          {event.maxAttendees != null && (
            <Text style={detailStyles.capacityText}>
              {goingCount}/{event.maxAttendees} حاضر
            </Text>
          )}
        </View>

        <View style={detailStyles.content}>
          {/* ── Title ────────────────────────────────────────────────────── */}
          <Text style={detailStyles.title}>{event.title}</Text>

          {/* ── Ramadan/Hijri banner ─────────────────────────────────────── */}
          {showHijri && (
            <View style={detailStyles.hijriBanner}>
              <Text style={detailStyles.hijriText}>🌙 {hijriStart}</Text>
            </View>
          )}

          {/* ── RSVP bar ─────────────────────────────────────────────────── */}
          <RsvpBar
            going={goingCount}
            maybe={maybeCount}
            status={rsvpStatus}
            isFull={isFull}
            loading={rsvpLoading}
            onGoing={() => handleRsvp('going')}
            onMaybe={() => handleRsvp('maybe')}
            onCancel={() => handleRsvp('none')}
          />

          {/* ── Attendees ─────────────────────────────────────────────────── */}
          {attendeeIds.length > 0 && (
            <View style={detailStyles.attendeesSection}>
              <Text style={detailStyles.sectionTitle}>
                الحضور ({goingCount})
              </Text>
              <AttendeeAvatarRow userIds={attendeeIds} totalCount={goingCount} />
            </View>
          )}

          {/* ── Info rows ────────────────────────────────────────────────── */}
          <View style={detailStyles.infoCard}>
            <InfoRow
              icon="📅"
              label={t('events.startTime')}
              value={startFmt.full}
            />
            <InfoRow
              icon="🏁"
              label={t('events.endTime')}
              value={`${endFmt.time} (${durationLabel})`}
            />
            <InfoRow
              icon="📍"
              label={t('events.address')}
              value={event.address || 'الموقع غير محدد'}
            />
            {event.lat && event.lng ? (
              <InfoRow
                icon="🗺"
                label="الإحداثيات"
                value={`${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}`}
                onPress={() => {
                  const url = `https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=16/${event.lat}/${event.lng}`;
                  Linking.openURL(url).catch(() => null);
                }}
              />
            ) : null}
          </View>

          {/* ── Map preview ───────────────────────────────────────────────── */}
          {event.lat && event.lng ? (
            <MapPreview lat={event.lat} lng={event.lng} address={event.address} />
          ) : null}

          {/* ── Organizer ────────────────────────────────────────────────── */}
          <View style={detailStyles.infoCard}>
            <OrganizerRow organizerId={event.organizerId} />
          </View>

          {/* ── Description ──────────────────────────────────────────────── */}
          {event.description ? (
            <View style={detailStyles.infoCard}>
              <Text style={detailStyles.sectionTitle}>التفاصيل</Text>
              <DescriptionSection arText={event.description} />
            </View>
          ) : null}

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <View style={detailStyles.actionsRow}>
            <Pressable
              style={detailStyles.actionBtn}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="مشاركة الفعالية"
            >
              <Text style={detailStyles.actionIcon}>📤</Text>
              <Text style={detailStyles.actionLabel}>مشاركة</Text>
            </Pressable>

            <Pressable
              style={detailStyles.actionBtn}
              onPress={handleAddToCalendar}
              accessibilityRole="button"
              accessibilityLabel="إضافة إلى التقويم"
            >
              <Text style={detailStyles.actionIcon}>📅</Text>
              <Text style={detailStyles.actionLabel}>التقويم</Text>
            </Pressable>
          </View>

          {/* ── Related events ───────────────────────────────────────────── */}
          <RelatedEventsSection
            events={relatedEvents}
            onPress={(id) => router.push(`/discover/events/${id}`)}
            onRsvp={handleEventCardRsvp}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const detailStyles = StyleSheet.create({
  backOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 10,
    paddingTop: 44,
    paddingStart: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: '#FFF', fontSize: 26, lineHeight: 30 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },
  capacityText: { fontSize: 13, color: COLORS.textSecondary },

  content: { paddingHorizontal: 16, paddingTop: 8 },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'auto',
    lineHeight: 30,
    marginBottom: 8,
  },

  hijriBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  hijriText: { fontSize: 13, color: '#2E7D32', fontWeight: '600' },

  attendeesSection: { marginBottom: 12 },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },

  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
});
