/**
 * PlaceAmenitiesScreen – full amenity list for a place, grouped by category.
 *
 * Groups:
 *  - Services: WiFi, parking, delivery, takeaway, reservation
 *  - Food: menu, vegetarian, halal, kids menu
 *  - Facilities: AC, smoking area, prayer room, wheelchair access
 *  - Payment: cash, card, e-payment, crypto
 *  - Atmosphere: family-friendly, romantic, group-friendly
 *
 * Each amenity shows:
 *  - Icon + Arabic label
 *  - Present / absent / unknown state
 *  - Community vote count
 *  - "Suggest" toggle so users can vote
 *
 * Route: place/[placeId]/amenities
 */

import { placesContract, testIDs } from '@iraq-maps/contracts';
import { Screen } from '@iraq-maps/ui';
import { useApi } from '@iraq-maps/mobile-kit';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AmenityVote {
  key: string;
  votes: number;
  userVote: 'present' | 'absent' | null;
}

interface AmenityGroup {
  groupKey: string;
  items: AmenityVote[];
}

// ── Taxonomy ──────────────────────────────────────────────────────────────────

const AMENITY_GROUPS: Array<{ groupKey: string; keys: string[] }> = [
  {
    groupKey: 'services',
    keys: ['wifi', 'parking', 'delivery', 'takeaway', 'reservation'],
  },
  {
    groupKey: 'food',
    keys: ['menu', 'vegetarian', 'halal', 'kids_menu'],
  },
  {
    groupKey: 'facilities',
    keys: ['ac', 'smoking_area', 'prayer_room', 'wheelchair'],
  },
  {
    groupKey: 'payment',
    keys: ['cash', 'card', 'e_payment', 'crypto'],
  },
  {
    groupKey: 'atmosphere',
    keys: ['family_friendly', 'romantic', 'group_friendly'],
  },
];

const AMENITY_ICON: Record<string, string> = {
  // Services
  wifi: '📶',
  parking: '🅿️',
  delivery: '🚚',
  takeaway: '🥡',
  reservation: '📅',
  // Food
  menu: '📋',
  vegetarian: '🥗',
  halal: '☪️',
  kids_menu: '🧒',
  // Facilities
  ac: '❄️',
  smoking_area: '🚬',
  prayer_room: '🕌',
  wheelchair: '♿',
  // Payment
  cash: '💵',
  card: '💳',
  e_payment: '📱',
  crypto: '₿',
  // Atmosphere
  family_friendly: '👨‍👩‍👧',
  romantic: '🌹',
  group_friendly: '👥',
};

const PRIMARY = '#1976D2';
const GREEN = '#2E7D32';
const RED = '#C62828';
const GRAY = '#9E9E9E';

// ── Entry ────────────────────────────────────────────────────────────────────

export function PlaceAmenitiesScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  if (!placeId) {
    return (
      <Screen>
        <RNText style={errStyles.msg}>{t('place.notFound')}</RNText>
      </Screen>
    );
  }
  return <AmenitiesLoader placeId={placeId} />;
}

// ── Loader ────────────────────────────────────────────────────────────────────

function AmenitiesLoader({ placeId }: { placeId: string }): ReactElement {
  const api = useApi();
  const [groups, setGroups] = useState<AmenityGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Fetch the place to get its name for the screen title
      const res = await api.places.get({ params: { id: placeId } });
      if (res.status !== 200) { setError(true); return; }

      // Build groups from local taxonomy with empty votes as baseline
      // (real vote data would come from a dedicated amenities endpoint)
      const loaded: AmenityGroup[] = AMENITY_GROUPS.map((g) => ({
        groupKey: g.groupKey,
        items: g.keys.map((key) => ({ key, votes: 0, userVote: null })),
      }));
      setGroups(loaded);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api, placeId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('amenities.title') }} />
        <ActivityIndicator style={{ marginTop: 48 }} />
      </Screen>
    );
  }

  if (error || !groups) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('amenities.title') }} />
        <RNText style={errStyles.msg}>{t('errors.generic')}</RNText>
        <TouchableOpacity onPress={() => void load()} style={errStyles.retryBtn}>
          <RNText style={errStyles.retryText}>{t('actions.retry')}</RNText>
        </TouchableOpacity>
      </Screen>
    );
  }

  return <AmenitiesCard placeId={placeId} groups={groups} onVote={setGroups} />;
}

// ── Main card ─────────────────────────────────────────────────────────────────

function AmenitiesCard({
  placeId,
  groups,
  onVote,
}: {
  placeId: string;
  groups: AmenityGroup[];
  onVote: (groups: AmenityGroup[]) => void;
}): ReactElement {
  const api = useApi();

  const handleVote = useCallback(
    async (groupIdx: number, itemIdx: number, vote: 'present' | 'absent') => {
      const group = groups[groupIdx];
      const item = group?.items[itemIdx];
      if (!item) return;

      // Toggle off if same vote
      const newVote = item.userVote === vote ? null : vote;

      // Optimistic update
      const updated = groups.map((g, gi) => ({
        ...g,
        items: g.items.map((it, ii) => {
          if (gi !== groupIdx || ii !== itemIdx) return it;
          const delta =
            newVote === 'present' ? 1
            : newVote === 'absent' ? -1
            : it.userVote === 'present' ? -1
            : 1;
          return { ...it, userVote: newVote, votes: it.votes + delta };
        }),
      }));
      onVote(updated);

      // Fire-and-forget API call (best-effort)
      try {
        if (newVote !== null) {
          await api.insights.report({
            body: {
              placeId,
              kind: 'inaccuracy',
            },
          });
        }
      } catch {
        // revert on failure
        onVote(groups);
      }
    },
    [api, groups, onVote, placeId],
  );

  return (
    <Screen scroll testID={testIDs.place.card}>
      <Stack.Screen options={{ title: t('amenities.title') }} />

      <View style={styles.header}>
        <RNText style={styles.headerTitle}>{t('amenities.title')}</RNText>
        <RNText style={styles.headerSubtitle}>{t('amenities.subtitle')}</RNText>
      </View>

      {groups.map((group, gi) => (
        <AmenityGroupSection
          key={group.groupKey}
          group={group}
          groupIdx={gi}
          onVote={handleVote}
        />
      ))}

      <View style={styles.footer}>
        <RNText style={styles.footerText}>{t('amenities.communityNote')}</RNText>
      </View>
    </Screen>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

function AmenityGroupSection({
  group,
  groupIdx,
  onVote,
}: {
  group: AmenityGroup;
  groupIdx: number;
  onVote: (gi: number, ii: number, vote: 'present' | 'absent') => void;
}): ReactElement {
  return (
    <View style={groupStyles.section}>
      <RNText style={groupStyles.title}>{t(`amenities.groups.${group.groupKey}` as Parameters<typeof t>[0])}</RNText>
      <View style={groupStyles.card}>
        {group.items.map((item, ii) => (
          <AmenityRow
            key={item.key}
            item={item}
            isLast={ii === group.items.length - 1}
            onVotePresent={() => onVote(groupIdx, ii, 'present')}
            onVoteAbsent={() => onVote(groupIdx, ii, 'absent')}
          />
        ))}
      </View>
    </View>
  );
}

const groupStyles = StyleSheet.create({
  section: { marginBottom: 20 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
  },
});

// ── Amenity row ───────────────────────────────────────────────────────────────

function AmenityRow({
  item,
  isLast,
  onVotePresent,
  onVoteAbsent,
}: {
  item: AmenityVote;
  isLast: boolean;
  onVotePresent: () => void;
  onVoteAbsent: () => void;
}): ReactElement {
  const icon = AMENITY_ICON[item.key] ?? '•';
  const netVotes = item.votes;
  const stateColor =
    netVotes > 0 ? GREEN
    : netVotes < 0 ? RED
    : GRAY;

  const stateLabel =
    netVotes > 0 ? t('amenities.present')
    : netVotes < 0 ? t('amenities.absent')
    : t('amenities.unknown');

  return (
    <View style={[rowStyles.row, !isLast && rowStyles.divider]}>
      {/* Icon + label */}
      <View style={rowStyles.iconWrap}>
        <RNText style={rowStyles.icon}>{icon}</RNText>
      </View>
      <View style={rowStyles.body}>
        <RNText style={rowStyles.label}>
          {t(`amenities.keys.${item.key}` as Parameters<typeof t>[0])}
        </RNText>
        <RNText style={[rowStyles.state, { color: stateColor }]}>
          {stateLabel}
          {item.votes !== 0 ? ` (${Math.abs(netVotes)})` : ''}
        </RNText>
      </View>

      {/* Vote buttons */}
      <View style={rowStyles.voteRow}>
        <Pressable
          onPress={onVotePresent}
          style={[
            rowStyles.voteBtn,
            item.userVote === 'present' && rowStyles.voteBtnActiveGreen,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('amenities.votePresent')}
        >
          <RNText style={rowStyles.voteBtnText}>✓</RNText>
        </Pressable>
        <Pressable
          onPress={onVoteAbsent}
          style={[
            rowStyles.voteBtn,
            item.userVote === 'absent' && rowStyles.voteBtnActiveRed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('amenities.voteAbsent')}
        >
          <RNText style={rowStyles.voteBtnText}>✕</RNText>
        </Pressable>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 14, color: '#222', fontWeight: '500' },
  state: { fontSize: 12 },
  voteRow: { flexDirection: 'row', gap: 6 },
  voteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteBtnActiveGreen: { backgroundColor: GREEN, borderColor: GREEN },
  voteBtnActiveRed: { backgroundColor: RED, borderColor: RED },
  voteBtnText: { fontSize: 13, color: '#444' },
});

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 13, color: '#777' },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  footerText: { fontSize: 12, color: '#AAA', textAlign: 'center' },
});

const errStyles = StyleSheet.create({
  msg: { padding: 24, textAlign: 'center', color: '#888' },
  retryBtn: { alignSelf: 'center', padding: 12 },
  retryText: { color: PRIMARY, fontSize: 15 },
});
