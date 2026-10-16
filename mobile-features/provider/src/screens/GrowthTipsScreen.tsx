/**
 * GrowthTipsScreen — personalised growth tips for providers.
 *
 * Sections:
 *   • Profile score summary ("Your profile vs top 20%")
 *   • Personalised tips sorted by impact
 *   • Success stories (anonymous benchmarks)
 *   • Action buttons: "Go fix it"
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 */

import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  primary:      '#1976D2',
  primaryLight: '#E3F2FD',
  success:      '#10B981',
  successBg:    '#ECFDF5',
  warning:      '#F59E0B',
  warningBg:    '#FFFBEB',
  danger:       '#EF4444',
  dangerBg:     '#FEF2F2',
  purple:       '#7C3AED',
  purpleBg:     '#F5F3FF',
  gold:         '#D97706',
  goldBg:       '#FFFBEB',
  bg:           '#F5F7FA',
  card:         '#FFFFFF',
  text:         '#1A202C',
  textMuted:    '#718096',
  border:       '#E2E8F0',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type TipPriority = 'high' | 'medium' | 'low';
type TipStatus   = 'pending' | 'done' | 'dismissed';

interface GrowthTip {
  id: string;
  icon: string;
  titleKey: string;
  bodyKey: string;
  impact: number;       // 1–10
  priority: TipPriority;
  status: TipStatus;
  screen?: string;      // where to navigate to fix it
  estimatedGain: string; // e.g. "+25% views"
}

interface ProfileScore {
  overall: number;       // 0–100
  top20pct: number;      // benchmark for top 20% in category
  breakdown: Array<{
    label: string;
    yours: number;
    top20: number;
    icon: string;
  }>;
}

interface SuccessStory {
  id: string;
  categoryKey: string;
  actionKey: string;
  gainKey: string;
  icon: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function buildMockScore(): ProfileScore {
  return {
    overall: 62,
    top20pct: 85,
    breakdown: [
      { label: 'التقييمات', yours: 70, top20: 90, icon: '⭐' },
      { label: 'سرعة الرد', yours: 50, top20: 92, icon: '⚡' },
      { label: 'الصور', yours: 60, top20: 88, icon: '📷' },
      { label: 'اكتمال الملف', yours: 78, top20: 95, icon: '📋' },
      { label: 'النشاط', yours: 55, top20: 82, icon: '🔥' },
    ],
  };
}

function buildMockTips(): GrowthTip[] {
  return [
    {
      id: 't1',
      icon: '⚡',
      titleKey: 'growthTips.tip1Title',
      bodyKey: 'growthTips.tip1Body',
      impact: 9,
      priority: 'high',
      status: 'pending',
      screen: 'Inbox',
      estimatedGain: '+18% ترتيب',
    },
    {
      id: 't2',
      icon: '📷',
      titleKey: 'growthTips.tip2Title',
      bodyKey: 'growthTips.tip2Body',
      impact: 8,
      priority: 'high',
      status: 'pending',
      screen: 'Gallery',
      estimatedGain: '+25% مشاهدات',
    },
    {
      id: 't3',
      icon: '🕐',
      titleKey: 'growthTips.tip3Title',
      bodyKey: 'growthTips.tip3Body',
      impact: 7,
      priority: 'high',
      status: 'pending',
      screen: 'BusinessHours',
      estimatedGain: '+12% ظهور',
    },
    {
      id: 't4',
      icon: '🍽',
      titleKey: 'growthTips.tip4Title',
      bodyKey: 'growthTips.tip4Body',
      impact: 7,
      priority: 'medium',
      status: 'pending',
      screen: 'MenuManagement',
      estimatedGain: '+30% استفسارات',
    },
    {
      id: 't5',
      icon: '⭐',
      titleKey: 'growthTips.tip5Title',
      bodyKey: 'growthTips.tip5Body',
      impact: 8,
      priority: 'high',
      status: 'pending',
      screen: 'ReviewResponse',
      estimatedGain: '+20% ثقة',
    },
    {
      id: 't6',
      icon: '🎁',
      titleKey: 'growthTips.tip6Title',
      bodyKey: 'growthTips.tip6Body',
      impact: 6,
      priority: 'medium',
      status: 'pending',
      screen: 'Promotions',
      estimatedGain: '+40% نقرات',
    },
    {
      id: 't7',
      icon: '📣',
      titleKey: 'growthTips.tip7Title',
      bodyKey: 'growthTips.tip7Body',
      impact: 5,
      priority: 'low',
      status: 'done',
      screen: 'CreatePost',
      estimatedGain: '+15% ظهور',
    },
  ];
}

function buildSuccessStories(): SuccessStory[] {
  return [
    { id: 's1', categoryKey: 'growthTips.storyCategory1', actionKey: 'growthTips.storyAction1', gainKey: 'growthTips.storyGain1', icon: '🍽' },
    { id: 's2', categoryKey: 'growthTips.storyCategory2', actionKey: 'growthTips.storyAction2', gainKey: 'growthTips.storyGain2', icon: '✂️' },
    { id: 's3', categoryKey: 'growthTips.storyCategory3', actionKey: 'growthTips.storyAction3', gainKey: 'growthTips.storyGain3', icon: '🛍' },
  ];
}

// ─── Profile Score section ────────────────────────────────────────────────────

function AnimatedBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }): ReactElement {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: value / maxValue,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [value, maxValue, anim]);
  return (
    <View style={ss.barBg}>
      <Animated.View
        style={[
          ss.barFill,
          {
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

function ProfileScoreSection({ score }: { score: ProfileScore }): ReactElement {
  const gap = score.top20pct - score.overall;
  const scoreColor = score.overall >= 80 ? C.success : score.overall >= 60 ? C.warning : C.danger;

  return (
    <View style={ss.scoreCard}>
      <View style={ss.scoreHeaderRow}>
        <View style={ss.scoreCircle}>
          <Text style={[ss.scoreNumber, { color: scoreColor }]}>{score.overall}</Text>
          <Text style={ss.scoreOutOf}>{t('growthTips.scoreOutOf')}</Text>
        </View>
        <View style={ss.scoreInfo}>
          <Text style={ss.scoreTitle}>{t('growthTips.scoreTitle')}</Text>
          <Text style={[ss.scoreBenchmark, { color: C.gold }]}>
            {t('growthTips.scoreBenchmark', { pct: score.top20pct })}
          </Text>
          {gap > 0 ? (
            <Text style={ss.scoreGap}>
              {t('growthTips.scoreGap', { n: gap })}
            </Text>
          ) : (
            <Text style={[ss.scoreGap, { color: C.success }]}>
              {t('growthTips.scoreTopTier')}
            </Text>
          )}
        </View>
      </View>

      <View style={ss.breakdownList}>
        {score.breakdown.map(item => (
          <View key={item.label} style={ss.breakdownRow}>
            <Text style={ss.breakdownIcon}>{item.icon}</Text>
            <Text style={ss.breakdownLabel}>{item.label}</Text>
            <View style={ss.breakdownBars}>
              <View style={ss.breakdownBarRow}>
                <Text style={ss.breakdownBarLabel}>{t('growthTips.youLabel')}</Text>
                <AnimatedBar value={item.yours} maxValue={100} color={C.primary} />
                <Text style={[ss.breakdownBarPct, { color: C.primary }]}>{item.yours}</Text>
              </View>
              <View style={ss.breakdownBarRow}>
                <Text style={ss.breakdownBarLabel}>{t('growthTips.top20Label')}</Text>
                <AnimatedBar value={item.top20} maxValue={100} color={C.gold} />
                <Text style={[ss.breakdownBarPct, { color: C.gold }]}>{item.top20}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Tip card ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TipPriority, { color: string; bg: string; labelKey: string }> = {
  high:   { color: C.danger, bg: C.dangerBg, labelKey: 'growthTips.priorityHigh' },
  medium: { color: C.warning, bg: C.warningBg, labelKey: 'growthTips.priorityMedium' },
  low:    { color: C.textMuted, bg: C.bg, labelKey: 'growthTips.priorityLow' },
};

function TipCard({
  tip,
  onFix,
  onDismiss,
  onMarkDone,
}: {
  tip: GrowthTip;
  onFix: (screen?: string) => void;
  onDismiss: (id: string) => void;
  onMarkDone: (id: string) => void;
}): ReactElement {
  const prio = PRIORITY_CONFIG[tip.priority];
  const isDone = tip.status === 'done';
  const isDismissed = tip.status === 'dismissed';

  if (isDismissed) return <View />;

  return (
    <View style={[ss.tipCard, isDone && ss.tipCardDone]}>
      <View style={ss.tipHeader}>
        <View style={[ss.tipIconWrap, { backgroundColor: isDone ? C.successBg : prio.bg }]}>
          <Text style={ss.tipIcon}>{isDone ? '✓' : tip.icon}</Text>
        </View>
        <View style={ss.tipHeaderInfo}>
          <View style={ss.tipTitleRow}>
            <Text style={[ss.tipTitle, isDone && { color: C.textMuted, textDecorationLine: 'line-through' }]}>
              {t(tip.titleKey as Parameters<typeof t>[0])}
            </Text>
            <View style={[ss.prioBadge, { backgroundColor: isDone ? C.successBg : prio.bg }]}>
              <Text style={[ss.prioBadgeText, { color: isDone ? C.success : prio.color }]}>
                {isDone ? t('growthTips.done') : t(prio.labelKey as Parameters<typeof t>[0])}
              </Text>
            </View>
          </View>
          <Text style={[ss.gainBadge, { color: isDone ? C.textMuted : C.success }]}>
            📈 {tip.estimatedGain}
          </Text>
        </View>
      </View>

      {!isDone && (
        <Text style={ss.tipBody}>
          {t(tip.bodyKey as Parameters<typeof t>[0])}
        </Text>
      )}

      {/* Impact bar */}
      <View style={ss.impactRow}>
        <Text style={ss.impactLabel}>{t('growthTips.impact')}</Text>
        <View style={ss.impactBarBg}>
          <View
            style={[
              ss.impactBarFill,
              { width: `${tip.impact * 10}%` as unknown as number, backgroundColor: isDone ? C.success : prio.color },
            ]}
          />
        </View>
        <Text style={[ss.impactPct, { color: isDone ? C.success : prio.color }]}>{tip.impact}/10</Text>
      </View>

      {!isDone && (
        <View style={ss.tipActions}>
          {tip.screen && (
            <TouchableOpacity
              style={[ss.tipActionBtn, { backgroundColor: C.primary }]}
              onPress={() => onFix(tip.screen)}
              activeOpacity={0.8}
            >
              <Text style={ss.tipActionBtnText}>🔧 {t('growthTips.goFix')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={ss.tipMarkDoneBtn}
            onPress={() => onMarkDone(tip.id)}
            activeOpacity={0.7}
          >
            <Text style={ss.tipMarkDoneText}>✓ {t('growthTips.markDone')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={ss.tipDismissBtn}
            onPress={() => onDismiss(tip.id)}
            activeOpacity={0.7}
          >
            <Text style={ss.tipDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Success stories ──────────────────────────────────────────────────────────

function SuccessStoriesSection({ stories }: { stories: SuccessStory[] }): ReactElement {
  return (
    <View style={ss.storiesSection}>
      <Text style={ss.storiesTitle}>{t('growthTips.storiesTitle')}</Text>
      <Text style={ss.storiesSubtitle}>{t('growthTips.storiesSubtitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.storiesRow}>
        {stories.map(story => (
          <View key={story.id} style={ss.storyCard}>
            <Text style={ss.storyIcon}>{story.icon}</Text>
            <Text style={ss.storyCategory}>
              {t(story.categoryKey as Parameters<typeof t>[0])}
            </Text>
            <Text style={ss.storyAction}>
              {t(story.actionKey as Parameters<typeof t>[0])}
            </Text>
            <View style={ss.storyGainBadge}>
              <Text style={ss.storyGainText}>
                📈 {t(story.gainKey as Parameters<typeof t>[0])}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Progress summary ─────────────────────────────────────────────────────────

function ProgressSummary({ tips }: { tips: GrowthTip[] }): ReactElement {
  const done  = tips.filter(t => t.status === 'done').length;
  const total = tips.filter(t => t.status !== 'dismissed').length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: pct / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [pct, barAnim]);

  return (
    <View style={ss.progressCard}>
      <View style={ss.progressHeader}>
        <Text style={ss.progressTitle}>{t('growthTips.progressTitle')}</Text>
        <Text style={ss.progressPct}>{done}/{total} {t('growthTips.progressDone')}</Text>
      </View>
      <View style={ss.progressBg}>
        <Animated.View
          style={[
            ss.progressFill,
            {
              backgroundColor: pct === 100 ? C.success : C.primary,
              width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface GrowthTipsScreenProps {
  onNavigate?: (screen: string, params?: Record<string, unknown>) => void;
}

export function GrowthTipsScreen({
  onNavigate,
}: GrowthTipsScreenProps): ReactElement {
  const [tips, setTips] = useState<GrowthTip[]>([]);
  const [score, setScore] = useState<ProfileScore | null>(null);
  const [stories, setStories] = useState<SuccessStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const load = useCallback(async () => {
    try {
      await new Promise<void>(r => setTimeout(r, 500));
      setTips(buildMockTips());
      setScore(buildMockScore());
      setStories(buildSuccessStories());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const handleFix = useCallback((screen?: string) => {
    if (screen) onNavigate?.(screen);
  }, [onNavigate]);

  const handleDismiss = useCallback((id: string) => {
    setTips(prev => prev.map(t => t.id === id ? { ...t, status: 'dismissed' } : t));
  }, []);

  const handleMarkDone = useCallback((id: string) => {
    setTips(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t));
  }, []);

  const filteredTips = tips.filter(tip => {
    if (filter === 'all') return tip.status !== 'dismissed';
    return tip.status === filter;
  }).sort((a, b) => b.impact - a.impact);

  const filterOptions: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: t('growthTips.filterAll') },
    { key: 'pending', label: t('growthTips.filterPending') },
    { key: 'done', label: t('growthTips.filterDone') },
  ];

  return (
    <SafeAreaView style={ss.safeArea}>
      <View style={ss.titleBar}>
        <Text style={ss.screenTitle}>{t('growthTips.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={ss.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Score section */}
        {score && <ProfileScoreSection score={score} />}

        {/* Progress */}
        {tips.length > 0 && <ProgressSummary tips={tips} />}

        {/* Filter tabs */}
        <View style={ss.filterRow}>
          {filterOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[ss.filterTab, filter === opt.key && ss.filterTabActive]}
              onPress={() => setFilter(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[ss.filterTabText, filter === opt.key && ss.filterTabTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tips */}
        <Text style={ss.tipsListTitle}>{t('growthTips.tipsTitle')}</Text>
        {filteredTips.map(tip => (
          <TipCard
            key={tip.id}
            tip={tip}
            onFix={handleFix}
            onDismiss={handleDismiss}
            onMarkDone={handleMarkDone}
          />
        ))}
        {filteredTips.length === 0 && (
          <View style={ss.emptyState}>
            <Text style={ss.emptyIcon}>🎉</Text>
            <Text style={ss.emptyTitle}>{t('growthTips.emptyTitle')}</Text>
            <Text style={ss.emptyBody}>{t('growthTips.emptyBody')}</Text>
          </View>
        )}

        {/* Success stories */}
        <SuccessStoriesSection stories={stories} />

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safeArea:           { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16 },
  titleBar:           { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  screenTitle:        { fontSize: 20, fontWeight: '700', color: C.text },

  // Score card
  scoreCard:          { backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  scoreHeaderRow:     { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  scoreCircle:        { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  scoreNumber:        { fontSize: 26, fontWeight: '800' },
  scoreOutOf:         { fontSize: 11, color: C.textMuted },
  scoreInfo:          { flex: 1 },
  scoreTitle:         { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  scoreBenchmark:     { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  scoreGap:           { fontSize: 12, color: C.textMuted },
  breakdownList:      { gap: 10 },
  breakdownRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownIcon:      { fontSize: 16, width: 22 },
  breakdownLabel:     { fontSize: 12, color: C.text, width: 60 },
  breakdownBars:      { flex: 1, gap: 3 },
  breakdownBarRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownBarLabel:  { fontSize: 10, color: C.textMuted, width: 22 },
  barBg:              { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill:            { height: '100%', borderRadius: 3 },
  breakdownBarPct:    { fontSize: 11, fontWeight: '700', width: 24 },

  // Progress
  progressCard:       { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  progressHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressTitle:      { fontSize: 14, fontWeight: '600', color: C.text },
  progressPct:        { fontSize: 13, color: C.primary, fontWeight: '600' },
  progressBg:         { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressFill:       { height: '100%', borderRadius: 4 },

  // Filter
  filterRow:          { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterTab:          { flex: 1, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  filterTabActive:    { backgroundColor: C.primary, borderColor: C.primary },
  filterTabText:      { fontSize: 13, color: C.textMuted },
  filterTabTextActive:{ color: '#FFF', fontWeight: '600' },

  tipsListTitle:      { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },

  // Tip card
  tipCard:            { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tipCardDone:        { opacity: 0.7 },
  tipHeader:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipIconWrap:        { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tipIcon:            { fontSize: 18 },
  tipHeaderInfo:      { flex: 1 },
  tipTitleRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  tipTitle:           { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  prioBadge:          { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  prioBadgeText:      { fontSize: 10, fontWeight: '700' },
  gainBadge:          { fontSize: 12, marginTop: 3 },
  tipBody:            { fontSize: 13, color: C.textMuted, lineHeight: 19, marginBottom: 10 },
  impactRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  impactLabel:        { fontSize: 12, color: C.textMuted, width: 50 },
  impactBarBg:        { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  impactBarFill:      { height: '100%', borderRadius: 3 },
  impactPct:          { fontSize: 12, fontWeight: '700', width: 32 },
  tipActions:         { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tipActionBtn:       { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tipActionBtnText:   { fontSize: 13, color: '#FFF', fontWeight: '600' },
  tipMarkDoneBtn:     { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: C.successBg },
  tipMarkDoneText:    { fontSize: 13, color: C.success, fontWeight: '600' },
  tipDismissBtn:      { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: C.bg },
  tipDismissText:     { fontSize: 14, color: C.textMuted },

  // Stories
  storiesSection:     { marginBottom: 16 },
  storiesTitle:       { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  storiesSubtitle:    { fontSize: 12, color: C.textMuted, marginBottom: 12 },
  storiesRow:         { gap: 10, paddingEnd: 16 },
  storyCard:          { backgroundColor: C.card, borderRadius: 14, padding: 16, width: 180, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  storyIcon:          { fontSize: 30, marginBottom: 8 },
  storyCategory:      { fontSize: 11, color: C.textMuted, marginBottom: 4 },
  storyAction:        { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 8, lineHeight: 18 },
  storyGainBadge:     { backgroundColor: C.successBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  storyGainText:      { fontSize: 12, color: C.success, fontWeight: '700' },

  // Empty
  emptyState:         { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:          { fontSize: 48, marginBottom: 12 },
  emptyTitle:         { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptyBody:          { fontSize: 14, color: C.textMuted, textAlign: 'center' },
});
