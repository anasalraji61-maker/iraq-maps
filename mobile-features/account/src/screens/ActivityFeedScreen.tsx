/**
 * ActivityFeedScreen — all my actions in one timeline.
 *
 * Features:
 *   - All my actions (reviews, posts, check-ins, follows)
 *   - Filter by type
 *   - Date range picker
 *   - Delete activity item
 *   - Privacy per activity type
 *   - Monthly summary card
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: account/activity-feed
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Icons ──────────────────────────────────────────────────────────────────────
const ICON_ARROW    = '←';
const ICON_REVIEW   = '⭐';
const ICON_POST     = '📝';
const ICON_CHECKIN  = '📍';
const ICON_FOLLOW   = '👤';
const ICON_LIKE     = '❤️';
const ICON_COMMENT  = '💬';
const ICON_SAVE     = '🔖';
const ICON_TRASH    = '🗑';
const ICON_FILTER   = '🔬';
const ICON_CALENDAR = '📅';
const ICON_GLOBE    = '🌍';
const ICON_FRIENDS  = '👥';
const ICON_LOCK     = '🔒';
const ICON_EDIT     = '✏';
const ICON_STATS    = '📊';
const ICON_CLOCK    = '⏳';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  primary:       '#1565C0',
  primaryLight:  '#E3F2FD',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A2E',
  textSecondary: '#546E7A',
  textHint:      '#90A4AE',
  border:        '#E0E0E0',
  success:       '#2E7D32',
  successLight:  '#E8F5E9',
  red:           '#C62828',
  orange:        '#E65100',
  orangeLight:   '#FFF3E0',
  gold:          '#F9A825',
  purple:        '#6A1B9A',
  purpleLight:   '#F3E5F5',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type ActivityType = 'review' | 'post' | 'checkin' | 'follow' | 'like' | 'comment' | 'save';
type PrivacyLevel = 'public' | 'friends' | 'only_me';

type ActivityItem = {
  id: string;
  type: ActivityType;
  description: string;
  targetName: string;
  targetId: string;
  createdAt: string;
  privacy: PrivacyLevel;
};

type MonthlySummary = {
  month: string;  // "2026-10"
  reviews: number;
  posts: number;
  checkins: number;
  follows: number;
  likes: number;
  comments: number;
};

type FilterType = 'all' | ActivityType;

// ── Activity type config ───────────────────────────────────────────────────────
const ACTIVITY_CONFIG: Record<ActivityType, { icon: string; color: string; labelKey: string }> = {
  review:  { icon: ICON_REVIEW,  color: C.gold,    labelKey: 'activity.typeReview'  },
  post:    { icon: ICON_POST,    color: C.primary,  labelKey: 'activity.typePost'    },
  checkin: { icon: ICON_CHECKIN, color: C.orange,   labelKey: 'activity.typeCheckin' },
  follow:  { icon: ICON_FOLLOW,  color: C.purple,   labelKey: 'activity.typeFollow'  },
  like:    { icon: ICON_LIKE,    color: C.red,      labelKey: 'activity.typeLike'    },
  comment: { icon: ICON_COMMENT, color: C.success,  labelKey: 'activity.typeComment' },
  save:    { icon: ICON_SAVE,    color: C.primary,  labelKey: 'activity.typeSave'    },
};

const PRIVACY_CONFIG: Record<PrivacyLevel, { icon: string; labelKey: string }> = {
  public:   { icon: ICON_GLOBE,   labelKey: 'activity.privPublic'  },
  friends:  { icon: ICON_FRIENDS, labelKey: 'activity.privFriends' },
  only_me:  { icon: ICON_LOCK,    labelKey: 'activity.privOnlyMe'  },
};

const FILTER_OPTIONS: { value: FilterType; labelKey: string }[] = [
  { value: 'all',     labelKey: 'activity.filterAll'      },
  { value: 'review',  labelKey: 'activity.filterReviews'  },
  { value: 'post',    labelKey: 'activity.filterPosts'    },
  { value: 'checkin', labelKey: 'activity.filterCheckins' },
  { value: 'follow',  labelKey: 'activity.filterFollows'  },
  { value: 'like',    labelKey: 'activity.filterLikes'    },
  { value: 'comment', labelKey: 'activity.filterComments' },
];

// ── Privacy Picker Modal ───────────────────────────────────────────────────────
function PrivacyPicker({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: PrivacyLevel;
  onSelect: (p: PrivacyLevel) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <View style={s.privacySheet}>
          <Text style={s.privacySheetTitle}>{t('activity.privacyTitle')}</Text>
          {(Object.keys(PRIVACY_CONFIG) as PrivacyLevel[]).map((level) => {
            const cfg = PRIVACY_CONFIG[level];
            return (
              <TouchableOpacity
                key={level}
                style={[s.privacyOption, current === level && s.privacyOptionActive]}
                onPress={() => { onSelect(level); onClose(); }}
              >
                <Text style={s.privacyOptionIcon}>{cfg.icon}</Text>
                <Text style={[s.privacyOptionLabel, current === level && s.privacyOptionLabelActive]}>
                  {t(cfg.labelKey as any)}
                </Text>
                {current === level && <Text style={s.privacyCheck}>{'✔'}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Monthly Summary ────────────────────────────────────────────────────────────
function MonthlySummaryCard({ summary }: { summary: MonthlySummary }): ReactElement {
  const [year, month] = summary.month.split('-');
  const monthName = new Date(parseInt(year!), parseInt(month!) - 1).toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' });
  const items = [
    { icon: ICON_REVIEW,  label: t('activity.typeReview'),  count: summary.reviews  },
    { icon: ICON_POST,    label: t('activity.typePost'),    count: summary.posts    },
    { icon: ICON_CHECKIN, label: t('activity.typeCheckin'), count: summary.checkins },
    { icon: ICON_LIKE,    label: t('activity.typeLike'),    count: summary.likes    },
    { icon: ICON_COMMENT, label: t('activity.typeComment'), count: summary.comments },
    { icon: ICON_FOLLOW,  label: t('activity.typeFollow'),  count: summary.follows  },
  ];
  return (
    <View style={s.summaryCard}>
      <View style={s.summaryHeader}>
        <Text style={s.summaryIcon}>{ICON_STATS}</Text>
        <Text style={s.summaryTitle}>{monthName}</Text>
      </View>
      <View style={s.summaryGrid}>
        {items.map((item, i) => (
          <View key={i} style={s.summaryItem}>
            <Text style={s.summaryItemIcon}>{item.icon}</Text>
            <Text style={s.summaryItemCount}>{item.count}</Text>
            <Text style={s.summaryItemLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Date Range Picker ──────────────────────────────────────────────────────────
type DateRange = { start: Date | null; end: Date | null };

const DATE_PRESETS: { labelKey: string; days: number }[] = [
  { labelKey: 'activity.preset7',  days: 7  },
  { labelKey: 'activity.preset30', days: 30 },
  { labelKey: 'activity.preset90', days: 90 },
];

function DateRangePicker({
  range,
  onChange,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
}): ReactElement {
  const setPreset = (days: number) => {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    onChange({ start, end });
  };

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' }) : '—';

  return (
    <View style={s.datePickerRow}>
      {DATE_PRESETS.map((preset) => (
        <TouchableOpacity
          key={preset.days}
          style={s.datePresetBtn}
          onPress={() => setPreset(preset.days)}
        >
          <Text style={s.datePresetText}>{t(preset.labelKey as any)}</Text>
        </TouchableOpacity>
      ))}
      <View style={s.dateRangeDisplay}>
        <Text style={s.dateRangeText}>{formatDate(range.start)} — {formatDate(range.end)}</Text>
        {(range.start || range.end) && (
          <TouchableOpacity onPress={() => onChange({ start: null, end: null })}>
            <Text style={s.dateRangeClear}>{'×'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Activity Row ───────────────────────────────────────────────────────────────
function ActivityRow({
  item,
  onDelete,
  onChangePrivacy,
}: {
  item: ActivityItem;
  onDelete: (id: string) => void;
  onChangePrivacy: (id: string, current: PrivacyLevel) => void;
}): ReactElement {
  const cfg     = ACTIVITY_CONFIG[item.type];
  const privCfg = PRIVACY_CONFIG[item.privacy];
  const date    = new Date(item.createdAt).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <View style={s.activityRow}>
      {/* Timeline line + dot */}
      <View style={s.timelineCol}>
        <View style={[s.timelineDot, { backgroundColor: cfg.color }]}>
          <Text style={s.timelineDotIcon}>{cfg.icon}</Text>
        </View>
        <View style={s.timelineLine} />
      </View>
      {/* Content */}
      <View style={s.activityContent}>
        <Text style={s.activityDate}>{date}</Text>
        <Text style={s.activityDescription}>{item.description}</Text>
        <Text style={s.activityTarget} numberOfLines={1}>{item.targetName}</Text>
        <View style={s.activityFooter}>
          <TouchableOpacity
            style={s.privacyBtn}
            onPress={() => onChangePrivacy(item.id, item.privacy)}
          >
            <Text style={s.privacyBtnIcon}>{privCfg.icon}</Text>
            <Text style={s.privacyBtnText}>{t(privCfg.labelKey as any)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteActivityBtn} onPress={() => onDelete(item.id)}>
            <Text style={{ fontSize: 14, color: C.red }}>{ICON_TRASH}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function ActivityFeedScreen(): ReactElement {
  const router = useRouter();

  const [activities, setActivities]   = useState<ActivityItem[]>([]);
  const [summary, setSummary]         = useState<MonthlySummary | null>(null);
  const [filter, setFilter]           = useState<FilterType>('all');
  const [dateRange, setDateRange]     = useState<DateRange>({ start: null, end: null });
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [privacyTarget, setPrivacyTarget] = useState<{ id: string; current: PrivacyLevel } | null>(null);

  useEffect(() => { void load(); }, []);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    try {
      const [actRes, sumRes] = await Promise.all([
        fetch('/v1/me/activity').then((r) => r.json() as Promise<ActivityItem[]>),
        fetch('/v1/me/activity/monthly-summary').then((r) => r.json() as Promise<MonthlySummary>),
      ]);
      setActivities(actRes);
      setSummary(sumRes);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('activity.deleteTitle'), t('activity.deleteBody'), [
      { text: t('activity.cancel'), style: 'cancel' },
      {
        text: t('activity.confirmDelete'), style: 'destructive',
        onPress: () => {
          setActivities((prev) => prev.filter((a) => a.id !== id));
          void fetch(`/v1/me/activity/${id}`, { method: 'DELETE' }).catch(() => {});
        },
      },
    ]);
  }, []);

  const handleChangePrivacy = useCallback((id: string, current: PrivacyLevel) => {
    setPrivacyTarget({ id, current });
  }, []);

  const applyPrivacyChange = useCallback(async (newPrivacy: PrivacyLevel) => {
    if (!privacyTarget) return;
    setActivities((prev) =>
      prev.map((a) => a.id === privacyTarget.id ? { ...a, privacy: newPrivacy } : a)
    );
    try {
      await fetch(`/v1/me/activity/${privacyTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy: newPrivacy }),
      });
    } catch {
      // revert on failure
      void load();
    }
  }, [privacyTarget, load]);

  const filtered = activities.filter((a) => {
    if (filter !== 'all' && a.type !== filter) return false;
    if (dateRange.start) {
      const d = new Date(a.createdAt);
      if (d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
    }
    return true;
  });

  const renderItem = useCallback(({ item }: { item: ActivityItem }) => (
    <ActivityRow item={item} onDelete={handleDelete} onChangePrivacy={handleChangePrivacy} />
  ), [handleDelete, handleChangePrivacy]);

  const ListHeader = (
    <View>
      {/* Summary */}
      {summary && <MonthlySummaryCard summary={summary} />}

      {/* Filter Controls */}
      <TouchableOpacity style={s.filterToggle} onPress={() => setShowFilters((v) => !v)}>
        <Text style={s.filterToggleIcon}>{ICON_FILTER}</Text>
        <Text style={s.filterToggleText}>{t('activity.filterTitle')}</Text>
        <Text style={s.filterToggleArrow}>{showFilters ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showFilters && (
        <View style={s.filterPanel}>
          {/* Type filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typeFilterRow}>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[s.typeFilterBtn, filter === opt.value && s.typeFilterBtnActive]}
                onPress={() => setFilter(opt.value)}
              >
                <Text style={[s.typeFilterText, filter === opt.value && s.typeFilterTextActive]}>
                  {opt.value !== 'all' && ACTIVITY_CONFIG[opt.value as ActivityType].icon + ' '}
                  {t(opt.labelKey as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Date range */}
          <DateRangePicker range={dateRange} onChange={setDateRange} />
        </View>
      )}

      <Text style={s.listCount}>
        {t('activity.count', { n: filtered.length })}
      </Text>
    </View>
  );

  const ListEmpty = (
    <View style={s.emptyBox}>
      <Text style={s.emptyIcon}>{ICON_CLOCK}</Text>
      <Text style={s.emptyTitle}>{t('activity.emptyTitle')}</Text>
      <Text style={s.emptyBody}>{t('activity.emptyBody')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>{ICON_ARROW}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('activity.title')}</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Privacy Picker */}
      <PrivacyPicker
        visible={privacyTarget !== null}
        current={privacyTarget?.current ?? 'public'}
        onSelect={applyPrivacyChange}
        onClose={() => setPrivacyTarget(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent:{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon:    { fontSize: 20, color: C.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },

  // Summary
  summaryCard:       { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  summaryHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  summaryIcon:       { fontSize: 20 },
  summaryTitle:      { fontSize: 15, fontWeight: '700', color: C.text },
  summaryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryItem:       { flexBasis: '30%', flexGrow: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, padding: 10 },
  summaryItemIcon:   { fontSize: 18, marginBottom: 4 },
  summaryItemCount:  { fontSize: 20, fontWeight: '900', color: C.primary },
  summaryItemLabel:  { fontSize: 10, color: C.textSecondary, textAlign: 'center', marginTop: 2 },

  // Filter toggle
  filterToggle:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, marginBottom: 4 },
  filterToggleIcon:  { fontSize: 18 },
  filterToggleText:  { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  filterToggleArrow: { fontSize: 12, color: C.textHint },

  // Filter panel
  filterPanel:       { backgroundColor: C.surface, borderRadius: 16, padding: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  typeFilterRow:     { gap: 8, paddingBottom: 12 },
  typeFilterBtn:     { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  typeFilterBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  typeFilterText:    { fontSize: 12, fontWeight: '500', color: C.textSecondary },
  typeFilterTextActive: { color: C.primary, fontWeight: '700' },

  // Date picker
  datePickerRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 4 },
  datePresetBtn:    { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.primaryLight },
  datePresetText:   { fontSize: 12, fontWeight: '600', color: C.primary },
  dateRangeDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bg, borderRadius: 10, padding: 8 },
  dateRangeText:    { fontSize: 12, color: C.textSecondary },
  dateRangeClear:   { fontSize: 16, color: C.red, fontWeight: '700' },

  // List count
  listCount:        { fontSize: 12, color: C.textHint, marginBottom: 8, textAlign: 'right' as const },

  // Activity row (timeline style)
  activityRow:      { flexDirection: 'row', marginBottom: 4 },
  timelineCol:      { width: 44, alignItems: 'center' },
  timelineDot:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelineDotIcon:  { fontSize: 16 },
  timelineLine:     { width: 2, flex: 1, backgroundColor: C.border, marginTop: 4, marginBottom: -4 },
  activityContent:  { flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 12, marginStart: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  activityDate:     { fontSize: 11, color: C.textHint, marginBottom: 4 },
  activityDescription: { fontSize: 14, color: C.text, fontWeight: '500', marginBottom: 2 },
  activityTarget:   { fontSize: 12, color: C.primary, marginBottom: 8 },
  activityFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privacyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  privacyBtnIcon:   { fontSize: 12 },
  privacyBtnText:   { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  deleteActivityBtn:{ padding: 4 },

  // Privacy sheet
  modalOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  privacySheet:        { backgroundColor: C.surface, borderTopStartRadius: 24, borderTopEndRadius: 24, padding: 24, paddingBottom: 40 },
  privacySheetTitle:   { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 16 },
  privacyOption:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border + '60' },
  privacyOptionActive: { backgroundColor: C.primaryLight, borderRadius: 12, paddingHorizontal: 8 },
  privacyOptionIcon:   { fontSize: 22 },
  privacyOptionLabel:  { flex: 1, fontSize: 15, color: C.text },
  privacyOptionLabelActive: { color: C.primary, fontWeight: '700' },
  privacyCheck:        { fontSize: 16, color: C.primary },

  // Empty
  emptyBox:    { alignItems: 'center', paddingTop: 60 },
  emptyIcon:   { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptyBody:   { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },
});
