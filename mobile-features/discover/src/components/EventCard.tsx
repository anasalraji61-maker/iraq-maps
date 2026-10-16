/**
 * EventCard — rich card component for community events.
 * Shows cover photo (16:9), date badge, title, organizer, location,
 * attendee avatars, and RSVP buttons.
 */
import { type DiscoverEventType } from '@iraq-maps/contracts';
import { useCallback, useState, type ReactElement } from 'react';
import {
  I18nManager,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from '../screens/shared';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

export type RsvpStatus = 'going' | 'maybe' | 'none';

export interface EventCardProps {
  event: DiscoverEventType;
  distanceKm?: number;
  onPress: () => void;
  onRsvp: (eventId: string, status: RsvpStatus) => void;
  /** Simulated attendee display names for avatar stack */
  attendeeNames?: string[];
  showMap?: boolean;
}

// ─── Date badge ───────────────────────────────────────────────────────────────

function DateBadge({ dateStr }: { dateStr: string }): ReactElement {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString('ar-IQ', { day: 'numeric' });
  const month = d.toLocaleDateString('ar-IQ', { month: 'short' });
  return (
    <View style={dateBadgeStyles.container}>
      <Text style={dateBadgeStyles.day}>{day}</Text>
      <Text style={dateBadgeStyles.month}>{month}</Text>
    </View>
  );
}

const dateBadgeStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    start: 8,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 44,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  day: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    lineHeight: 26,
  },
  month: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
});

// ─── Category badge ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  cultural:      { bg: '#EDE7F6', text: '#4527A0' },
  food:          { bg: '#FFF3E0', text: '#E65100' },
  sport:         { bg: '#E8F5E9', text: '#1B5E20' },
  business:      { bg: '#E3F2FD', text: '#0D47A1' },
  music:         { bg: '#FCE4EC', text: '#880E4F' },
  art:           { bg: '#FBE9E7', text: '#BF360C' },
  education:     { bg: '#E0F2F1', text: '#004D40' },
  entertainment: { bg: '#F3E5F5', text: '#6A1B9A' },
  social:        { bg: '#E8EAF6', text: '#283593' },
  other:         { bg: COLORS.border, text: COLORS.textSecondary },
};

function CategoryBadge({ category }: { category: string }): ReactElement {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['other']!;
  return (
    <View style={[catStyles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[catStyles.text, { color: colors.text }]}>
        {t(`events.categories.${category}` as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}

const catStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});

// ─── Attendee avatar stack ────────────────────────────────────────────────────

const MAX_VISIBLE_AVATARS = 5;

function AttendeeAvatars({
  names,
  totalCount,
}: {
  names: string[];
  totalCount: number;
}): ReactElement {
  const visible = names.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = totalCount > MAX_VISIBLE_AVATARS ? totalCount - MAX_VISIBLE_AVATARS : 0;

  return (
    <View style={avatarStyles.row}>
      {visible.map((name, i) => (
        <View
          key={`${name}-${i}`}
          style={[avatarStyles.avatar, { marginStart: i > 0 ? -8 : 0, zIndex: visible.length - i }]}
        >
          <Text style={avatarStyles.initial}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View style={[avatarStyles.avatar, avatarStyles.overflow, { marginStart: -8, zIndex: 0 }]}>
          <Text style={avatarStyles.overflowText}>+{overflow}</Text>
        </View>
      ) : null}
      <Text style={avatarStyles.label}>
        {t('events.attendees', { count: totalCount })}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  overflow: {
    backgroundColor: COLORS.border,
  },
  overflowText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  label: {
    marginStart: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});

// ─── RSVP buttons ─────────────────────────────────────────────────────────────

function RsvpButtons({
  status,
  onSelect,
  isFull,
}: {
  status: RsvpStatus;
  onSelect: (s: RsvpStatus) => void;
  isFull: boolean;
}): ReactElement {
  if (isFull && status === 'none') {
    return (
      <View style={rsvpStyles.fullBadge}>
        <Text style={rsvpStyles.fullText}>{t('events.full')}</Text>
      </View>
    );
  }

  return (
    <View style={rsvpStyles.row}>
      <Pressable
        style={[rsvpStyles.btn, rsvpStyles.goingBtn, status === 'going' && rsvpStyles.btnActive]}
        onPress={() => onSelect(status === 'going' ? 'none' : 'going')}
        accessibilityRole="button"
        accessibilityLabel={t('events.rsvpGoing' as Parameters<typeof t>[0])}
        accessibilityState={{ selected: status === 'going' }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={rsvpStyles.btnIcon}>✓</Text>
        <Text style={[rsvpStyles.btnText, status === 'going' && rsvpStyles.btnTextActive]}>
          {t('events.rsvpGoing' as Parameters<typeof t>[0])}
        </Text>
      </Pressable>

      <Pressable
        style={[rsvpStyles.btn, rsvpStyles.maybeBtn, status === 'maybe' && rsvpStyles.maybeBtnActive]}
        onPress={() => onSelect(status === 'maybe' ? 'none' : 'maybe')}
        accessibilityRole="button"
        accessibilityLabel={t('events.rsvpMaybe' as Parameters<typeof t>[0])}
        accessibilityState={{ selected: status === 'maybe' }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={rsvpStyles.btnIcon}>?</Text>
        <Text style={[rsvpStyles.btnText, status === 'maybe' && rsvpStyles.maybeBtnTextActive]}>
          {t('events.rsvpMaybe' as Parameters<typeof t>[0])}
        </Text>
      </Pressable>
    </View>
  );
}

const rsvpStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  goingBtn: {
    borderColor: '#2E7D32',
  },
  btnActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  maybeBtn: {
    borderColor: COLORS.textSecondary,
  },
  maybeBtnActive: {
    backgroundColor: '#F57F17',
    borderColor: '#F57F17',
  },
  btnIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  btnTextActive: {
    color: '#FFF',
  },
  maybeBtnTextActive: {
    color: '#FFF',
  },
  fullBadge: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  fullText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
  },
});

// ─── Joined indicator ────────────────────────────────────────────────────────

function JoinedIndicator(): ReactElement {
  return (
    <View style={joinedStyles.badge}>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <Text style={joinedStyles.icon}>✓</Text>
      <Text style={joinedStyles.text}>{t('events.attending')}</Text>
    </View>
  );
}

const joinedStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  icon: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '700',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
  },
});

// ─── Cover image / placeholder ────────────────────────────────────────────────

function CoverImage({ uri }: { uri: string | null }): ReactElement {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={coverStyles.image}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
      />
    );
  }
  return <View style={[coverStyles.image, coverStyles.placeholder]} />;
}

const coverStyles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  placeholder: {
    backgroundColor: '#E0E0E0',
  },
});

// ─── Location row ─────────────────────────────────────────────────────────────

function LocationRow({ address, distanceKm }: { address: string; distanceKm?: number }): ReactElement {
  return (
    <View style={locationStyles.row}>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <Text style={locationStyles.icon}>📍</Text>
      <Text style={locationStyles.address} numberOfLines={1}>{address}</Text>
      {distanceKm != null ? (
        <Text style={locationStyles.distance}>
          {t('events.distance', {
            val: distanceKm < 1
              ? String(Math.round(distanceKm * 1000))
              : distanceKm.toFixed(1),
            unit: distanceKm < 1 ? 'm' : 'km',
          } as Parameters<typeof t>[1])}
        </Text>
      ) : null}
    </View>
  );
}

const locationStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    fontSize: 12,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'auto',
  },
  distance: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    marginStart: 4,
  },
});

// ─── EventCard ────────────────────────────────────────────────────────────────

export function EventCard({
  event,
  distanceKm,
  onPress,
  onRsvp,
  attendeeNames = [],
  showMap: _showMap = false,
}: EventCardProps): ReactElement {
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(
    event.isAttending ? 'going' : 'none',
  );
  const [localCount, setLocalCount] = useState(event.attendeeCount);

  const isFull = event.maxAttendees != null && localCount >= event.maxAttendees;

  const handleRsvp = useCallback((status: RsvpStatus) => {
    const prev = rsvpStatus;
    setRsvpStatus(status);
    if (status === 'going' && prev !== 'going') setLocalCount((c) => c + 1);
    if (prev === 'going' && status !== 'going') setLocalCount((c) => Math.max(0, c - 1));
    onRsvp(event.id, status);
  }, [rsvpStatus, event.id, onRsvp]);

  const start = new Date(event.startTime);
  const timeStr = start.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = start.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Pressable
      style={cardStyles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={event.title}
    >
      {/* Cover image with date badge */}
      <View style={cardStyles.coverContainer}>
        <CoverImage uri={event.imageUrl} />
        <DateBadge dateStr={event.startTime} />
      </View>

      <View style={cardStyles.body}>
        {/* Joined indicator */}
        {rsvpStatus === 'going' ? <JoinedIndicator /> : null}

        {/* Category + time row */}
        <View style={cardStyles.metaRow}>
          <CategoryBadge category={event.category} />
          <Text style={cardStyles.timeText}>{timeStr}</Text>
        </View>

        {/* Title */}
        <Text style={cardStyles.title} numberOfLines={2}>{event.title}</Text>

        {/* Date full */}
        <Text style={cardStyles.dateText}>{dateStr}</Text>

        {/* Location */}
        <LocationRow address={event.address} distanceKm={distanceKm} />

        {/* Attendees */}
        {localCount > 0 ? (
          <View style={cardStyles.attendeeRow}>
            <AttendeeAvatars
              names={attendeeNames.length > 0 ? attendeeNames : ['A', 'M', 'I']}
              totalCount={localCount}
            />
          </View>
        ) : null}

        {/* RSVP */}
        <View style={cardStyles.rsvpRow}>
          <RsvpButtons status={rsvpStatus} onSelect={handleRsvp} isFull={isFull && rsvpStatus === 'none'} />
          {event.maxAttendees != null ? (
            <Text style={cardStyles.capacityText}>
              {localCount}/{event.maxAttendees}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
  },
  coverContainer: {
    position: 'relative',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
    lineHeight: 24,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'auto',
  },
  attendeeRow: {
    marginTop: 2,
  },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  capacityText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});

// Re-export shared for convenience
export type { DiscoverEventType };
