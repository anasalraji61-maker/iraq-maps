import { type DiscoverEventType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';
import { EventCard, type RsvpStatus } from '../components/EventCard';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type EventTab = 'upcoming' | 'my';
type EventCategory = 'all' | 'cultural' | 'food' | 'sport' | 'business' | 'education' | 'entertainment' | 'social' | 'other';

// ─── Calendar strip ───────────────────────────────────────────────────────────

interface DayItem {
  date: Date;
  label: string;
  dayNum: string;
}

function buildCalendarDays(): DayItem[] {
  const days: DayItem[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push({
      date: d,
      label: d.toLocaleDateString('ar-IQ', { weekday: 'short' }),
      dayNum: d.toLocaleDateString('ar-IQ', { day: 'numeric' }),
    });
  }
  return days;
}

function CalendarStrip({
  selected,
  onSelect,
}: {
  selected: Date | null;
  onSelect: (d: Date | null) => void;
}): ReactElement {
  const days = buildCalendarDays();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={calStyles.strip}
      style={calStyles.container}
    >
      {days.map((day, i) => {
        const isSelected = selected
          ? selected.toDateString() === day.date.toDateString()
          : false;
        const isToday = i === 0;
        return (
          <Pressable
            key={day.date.toISOString()}
            style={[
              calStyles.day,
              isSelected && calStyles.daySelected,
              isToday && !isSelected && calStyles.dayToday,
            ]}
            onPress={() => onSelect(isSelected ? null : day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={day.label}
          >
            <Text style={[calStyles.dayLabel, isSelected && calStyles.dayLabelSelected]}>
              {day.label}
            </Text>
            <Text style={[calStyles.dayNum, isSelected && calStyles.dayNumSelected]}>
              {day.dayNum}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const calStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  strip: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  daySelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayToday: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  dayLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  dayLabelSelected: {
    color: '#FFF',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  dayNumSelected: {
    color: '#FFF',
  },
});

// ─── Category filter ──────────────────────────────────────────────────────────

const CATEGORIES: EventCategory[] = ['all', 'cultural', 'food', 'sport', 'business', 'education', 'entertainment', 'social', 'other'];

function CategoryFilter({
  selected,
  onSelect,
}: {
  selected: EventCategory;
  onSelect: (c: EventCategory) => void;
}): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={catFilterStyles.strip}
      style={catFilterStyles.container}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat}
          style={[catFilterStyles.chip, selected === cat && catFilterStyles.chipActive]}
          onPress={() => onSelect(cat)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === cat }}
        >
          <Text style={[catFilterStyles.chipText, selected === cat && catFilterStyles.chipTextActive]}>
            {cat === 'all'
              ? t('feed.typeFilter.all')
              : t(`events.categories.${cat}` as Parameters<typeof t>[0])}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const catFilterStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 50,
  },
  strip: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
  },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function EventTabs({
  active,
  onSelect,
}: {
  active: EventTab;
  onSelect: (tab: EventTab) => void;
}): ReactElement {
  const tabs: EventTab[] = ['upcoming', 'my'];
  return (
    <View style={tabStyles.container}>
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          style={[tabStyles.tab, active === tab && tabStyles.tabActive]}
          onPress={() => onSelect(tab)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab }}
        >
          <Text style={[tabStyles.text, active === tab && tabStyles.textActive]}>
            {t(`events.tab.${tab}` as Parameters<typeof t>[0])}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  textActive: {
    color: COLORS.primary,
  },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <View style={sharedStyles.emptyContainer}>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <Text style={emptyStyles.icon}>📅</Text>
      <Text style={emptyStyles.text}>{message}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  icon: { fontSize: 40, marginBottom: 12 },
  text: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
});

// ─── EventsScreen ─────────────────────────────────────────────────────────────

export function EventsScreen(): ReactElement {
  const router = useRouter();
  const client = useEventsClient();

  const [activeTab, setActiveTab] = useState<EventTab>('upcoming');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>('all');

  const [events, setEvents] = useState<DiscoverEventType[]>([]);
  const [myEvents, setMyEvents] = useState<DiscoverEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const loadUpcoming = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setError(false);
      cursorRef.current = undefined;
    } else {
      setLoadingMore(true);
    }
    try {
      const from = selectedDate ? (() => { const d = new Date(selectedDate); d.setHours(0, 0, 0, 0); return d.toISOString(); })() : undefined;
      const to = selectedDate ? (() => { const d = new Date(selectedDate); d.setHours(23, 59, 59, 999); return d.toISOString(); })() : undefined;
      const res = await client.listEvents({
        query: {
          limit: 10,
          cursor: cursorRef.current,
          ...(selectedCategory !== 'all' ? { category: selectedCategory as Exclude<EventCategory, 'all'> } : {}),
          ...(from ? { fromDate: from } : {}),
          ...(to ? { toDate: to } : {}),
        },
      });
      if (res.status === 200) {
        const { items, nextCursor: nc } = res.body;
        setEvents((prev) => (reset ? items : [...prev, ...items]));
        cursorRef.current = nc;
        setNextCursor(nc);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [client, selectedCategory, selectedDate]);

  const loadMyEvents = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // "my" events = attending ones; filter from upcoming
      const res = await client.listEvents({ query: { limit: 20 } });
      if (res.status === 200) {
        setMyEvents(res.body.items.filter((e) => e.isAttending));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'upcoming') {
      void loadUpcoming(true);
    } else {
      void loadMyEvents();
    }
  }, [activeTab, selectedCategory, selectedDate, loadUpcoming, loadMyEvents]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'upcoming') {
      void loadUpcoming(true);
    } else {
      void loadMyEvents();
    }
  }, [activeTab, loadUpcoming, loadMyEvents]);

  const handleEndReached = useCallback(() => {
    if (!loadingMore && nextCursor && activeTab === 'upcoming') {
      void loadUpcoming(false);
    }
  }, [loadingMore, nextCursor, activeTab, loadUpcoming]);

  const handleRsvp = useCallback(async (eventId: string, status: RsvpStatus) => {
    try {
      if (status === 'none') {
        await client.cancelRsvp({ params: { eventId } });
      } else {
        await client.rsvpEvent({ params: { eventId }, body: {} });
      }
    } catch {
      // silent — optimistic update already applied
    }
  }, [client]);

  const displayedEvents = activeTab === 'upcoming' ? events : myEvents;

  const renderItem = useCallback(({ item }: { item: DiscoverEventType }) => (
    <EventCard
      event={item}
      onPress={() => router.push(`/discover/events/${item.id}`)}
      onRsvp={handleRsvp}
    />
  ), [router, handleRsvp]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('profile.back')}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.backText}>{'‹'}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: '#FFF' }]}>{t('events.title')}</Text>
        <Pressable
          style={styles.createBtn}
          onPress={() => router.push('/discover/events/create')}
          accessibilityRole="button"
          accessibilityLabel={t('events.create')}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.createBtnText}>+</Text>
        </Pressable>
      </View>

      <EventTabs active={activeTab} onSelect={setActiveTab} />

      {activeTab === 'upcoming' ? (
        <>
          <CalendarStrip selected={selectedDate} onSelect={setSelectedDate} />
          <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
        </>
      ) : null}

      {loading && !refreshing ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : error ? (
        <View style={[sharedStyles.center, { flex: 1, padding: 20 }]}>
          <Text style={{ color: COLORS.error, textAlign: 'center', marginBottom: 12 }}>
            {t('events.loadError')}
          </Text>
          <Pressable style={styles.retryBtn} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayedEvents}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMore}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={
                activeTab === 'my'
                  ? t('events.myEmpty' as Parameters<typeof t>[0])
                  : t('events.empty')
              }
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#FFF',
    fontSize: 28,
    lineHeight: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  listContent: {
    paddingTop: 14,
    paddingBottom: 80,
  },
  loadMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
