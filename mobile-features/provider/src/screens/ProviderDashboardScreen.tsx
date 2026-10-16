/**
 * ProviderDashboardScreen — main provider home screen.
 *
 * Sections:
 *   • Today's overview card: appointments, messages, views
 *   • Quick actions: Add menu item, Post update, View messages
 *   • Revenue this week
 *   • Review alerts: new reviews needing response
 *   • Promotion status: active promos with expiry
 *   • Staff on duty today
 *   • "What's new" platform news
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 */

import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SkeletonBlock } from '../skeleton';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  primary:     '#1976D2',
  primaryDark: '#1565C0',
  primaryLight:'#E3F2FD',
  success:     '#10B981',
  successBg:   '#ECFDF5',
  warning:     '#F59E0B',
  warningBg:   '#FFFBEB',
  danger:      '#EF4444',
  dangerBg:    '#FEF2F2',
  purple:      '#7C3AED',
  purpleBg:    '#F5F3FF',
  orange:      '#EA580C',
  orangeBg:    '#FFF7ED',
  bg:          '#F5F7FA',
  card:        '#FFFFFF',
  text:        '#1A202C',
  textMuted:   '#718096',
  border:      '#E2E8F0',
  gold:        '#D97706',
  goldBg:      '#FFFBEB',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodayOverview {
  appointmentsToday: number;
  pendingAppointments: number;
  unreadMessages: number;
  profileViewsToday: number;
  viewsDelta: number; // % vs yesterday
}

interface WeekRevenue {
  total: number;
  currency: string;
  byDay: Array<{ label: string; amount: number }>;
  vsLastWeek: number; // % change
}

interface ReviewAlert {
  id: string;
  authorInitial: string;
  rating: number;
  snippet: string;
  daysAgo: number;
  hasResponse: boolean;
}

interface ActivePromotion {
  id: string;
  title: string;
  discountPct: number;
  expiresInHours: number;
  redemptions: number;
}

interface StaffMember {
  id: string;
  nameInitial: string;
  role: string;
  onDuty: boolean;
  dutyUntil?: string;
}

interface WhatsNew {
  id: string;
  icon: string;
  titleKey: string;
  bodyKey: string;
  isNew: boolean;
}

interface DashboardData {
  businessName: string;
  verificationStatus: 'draft' | 'pending' | 'verified' | 'suspended';
  profileCompleteness: number;
  todayOverview: TodayOverview;
  weekRevenue: WeekRevenue;
  reviewAlerts: ReviewAlert[];
  activePromotions: ActivePromotion[];
  staffOnDuty: StaffMember[];
  whatsNew: WhatsNew[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function buildMockData(): DashboardData {
  return {
    businessName: 'نشاطي التجاري',
    verificationStatus: 'verified',
    profileCompleteness: 78,
    todayOverview: {
      appointmentsToday: 4,
      pendingAppointments: 2,
      unreadMessages: 7,
      profileViewsToday: 42,
      viewsDelta: 15,
    },
    weekRevenue: {
      total: 1_250_000,
      currency: 'د.ع',
      byDay: [
        { label: 'سبت', amount: 180_000 },
        { label: 'أحد', amount: 220_000 },
        { label: 'اثنين', amount: 150_000 },
        { label: 'ثلاثاء', amount: 300_000 },
        { label: 'أربعاء', amount: 200_000 },
        { label: 'خميس', amount: 200_000 },
      ],
      vsLastWeek: 8,
    },
    reviewAlerts: [
      { id: 'r1', authorInitial: 'أ', rating: 2, snippet: 'الخدمة كانت بطيئة جداً', daysAgo: 0, hasResponse: false },
      { id: 'r2', authorInitial: 'م', rating: 5, snippet: 'ممتاز! سأعود بالتأكيد', daysAgo: 1, hasResponse: false },
      { id: 'r3', authorInitial: 'س', rating: 3, snippet: 'جيد لكن يمكن التحسين', daysAgo: 2, hasResponse: false },
    ],
    activePromotions: [
      { id: 'p1', title: 'خصم عيد الأضحى', discountPct: 20, expiresInHours: 18, redemptions: 14 },
      { id: 'p2', title: 'عرض الأسبوع', discountPct: 10, expiresInHours: 72, redemptions: 6 },
    ],
    staffOnDuty: [
      { id: 's1', nameInitial: 'أ', role: 'مدير', onDuty: true, dutyUntil: '22:00' },
      { id: 's2', nameInitial: 'م', role: 'موظف', onDuty: true, dutyUntil: '18:00' },
      { id: 's3', nameInitial: 'س', role: 'موظف', onDuty: false },
    ],
    whatsNew: [
      { id: 'w1', icon: '📊', titleKey: 'providerDash.newsAnalyticsTitle', bodyKey: 'providerDash.newsAnalyticsBody', isNew: true },
      { id: 'w2', icon: '📅', titleKey: 'providerDash.newsCalendarTitle', bodyKey: 'providerDash.newsCalendarBody', isNew: true },
      { id: 'w3', icon: '💬', titleKey: 'providerDash.newsBlastTitle', bodyKey: 'providerDash.newsBlastBody', isNew: false },
    ],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: DashboardData['verificationStatus'] }): ReactElement {
  const colors: Record<DashboardData['verificationStatus'], { bg: string; text: string }> = {
    draft:     { bg: C.border, text: C.textMuted },
    pending:   { bg: C.warningBg, text: C.warning },
    verified:  { bg: C.successBg, text: C.success },
    suspended: { bg: C.dangerBg, text: C.danger },
  };
  const labelKeys: Record<DashboardData['verificationStatus'], string> = {
    draft:     'dashboard.draft',
    pending:   'dashboard.pending',
    verified:  'dashboard.verified',
    suspended: 'dashboard.suspended',
  };
  const col = colors[status];
  return (
    <View style={[ss.pill, { backgroundColor: col.bg }]}>
      <Text style={[ss.pillText, { color: col.text }]}>
        {t(labelKeys[status] as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}

function OverviewCard({ data }: { data: TodayOverview }): ReactElement {
  return (
    <View style={ss.overviewCard}>
      <Text style={ss.sectionTitle}>{t('providerDash.todayTitle')}</Text>
      <View style={ss.overviewRow}>
        <OverviewTile
          icon="📅"
          value={String(data.appointmentsToday)}
          label={t('providerDash.todayAppointments')}
          badge={data.pendingAppointments > 0 ? String(data.pendingAppointments) : undefined}
          badgeColor={C.warning}
        />
        <OverviewTile
          icon="💬"
          value={String(data.unreadMessages)}
          label={t('providerDash.todayMessages')}
          badge={data.unreadMessages > 0 ? String(data.unreadMessages) : undefined}
          badgeColor={C.danger}
        />
        <OverviewTile
          icon="👁"
          value={String(data.profileViewsToday)}
          label={t('providerDash.todayViews')}
          delta={data.viewsDelta}
        />
      </View>
    </View>
  );
}

function OverviewTile({
  icon, value, label, badge, badgeColor, delta,
}: {
  icon: string;
  value: string;
  label: string;
  badge?: string;
  badgeColor?: string;
  delta?: number;
}): ReactElement {
  return (
    <View style={ss.overviewTile}>
      <Text style={ss.overviewIcon}>{icon}</Text>
      <View>
        <View style={ss.overviewValueRow}>
          <Text style={ss.overviewValue}>{value}</Text>
          {badge !== undefined && (
            <View style={[ss.badge, { backgroundColor: badgeColor ?? C.danger }]}>
              <Text style={ss.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        {delta !== undefined && (
          <Text style={[ss.overviewDelta, { color: delta >= 0 ? C.success : C.danger }]}>
            {delta >= 0 ? `▲ ${delta}%` : `▼ ${Math.abs(delta)}%`}
          </Text>
        )}
      </View>
      <Text style={ss.overviewLabel}>{label}</Text>
    </View>
  );
}

function QuickActions({
  onAddMenuItem,
  onPostUpdate,
  onViewMessages,
  onViewAppointments,
}: {
  onAddMenuItem: () => void;
  onPostUpdate: () => void;
  onViewMessages: () => void;
  onViewAppointments: () => void;
}): ReactElement {
  const actions = [
    { icon: '🍽', label: t('providerDash.qaAddMenuItem'), onPress: onAddMenuItem, color: C.primary },
    { icon: '📣', label: t('providerDash.qaPostUpdate'), onPress: onPostUpdate, color: C.purple },
    { icon: '💬', label: t('providerDash.qaMessages'), onPress: onViewMessages, color: C.success },
    { icon: '📅', label: t('providerDash.qaAppointments'), onPress: onViewAppointments, color: C.warning },
  ];
  return (
    <View style={ss.section}>
      <Text style={ss.sectionTitle}>{t('providerDash.quickActionsTitle')}</Text>
      <View style={ss.qaRow}>
        {actions.map(a => (
          <TouchableOpacity key={a.label} style={ss.qaBtn} onPress={a.onPress} activeOpacity={0.7}>
            <View style={[ss.qaIconWrap, { backgroundColor: a.color + '22' }]}>
              <Text style={ss.qaIcon}>{a.icon}</Text>
            </View>
            <Text style={ss.qaLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RevenueSection({ data }: { data: WeekRevenue }): ReactElement {
  const maxAmt = Math.max(...data.byDay.map(d => d.amount), 1);
  return (
    <View style={ss.section}>
      <View style={ss.sectionHeader}>
        <Text style={ss.sectionTitle}>{t('providerDash.revenueTitle')}</Text>
        <Text style={[ss.deltaLabel, { color: data.vsLastWeek >= 0 ? C.success : C.danger }]}>
          {data.vsLastWeek >= 0 ? `▲ ${data.vsLastWeek}%` : `▼ ${Math.abs(data.vsLastWeek)}%`}
          {' '}{t('providerDash.vsLastWeek')}
        </Text>
      </View>
      <Text style={ss.revenueTotal}>
        {data.total.toLocaleString('ar-IQ')} {data.currency}
      </Text>
      <View style={ss.revenueChart}>
        {data.byDay.map(d => (
          <View key={d.label} style={ss.revenueBarCol}>
            <View style={ss.revenueBarBg}>
              <View
                style={[
                  ss.revenueBar,
                  { height: `${Math.round((d.amount / maxAmt) * 100)}%` as unknown as number },
                ]}
              />
            </View>
            <Text style={ss.revenueBarLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
      <Text style={ss.revenueHint}>{t('providerDash.revenueHint')}</Text>
    </View>
  );
}

function ReviewAlertsSection({
  alerts,
  onRespond,
}: {
  alerts: ReviewAlert[];
  onRespond: (id: string) => void;
}): ReactElement {
  if (alerts.length === 0) return <View />;
  return (
    <View style={ss.section}>
      <View style={ss.sectionHeader}>
        <Text style={ss.sectionTitle}>{t('providerDash.reviewAlertsTitle')}</Text>
        <View style={[ss.badge, { backgroundColor: C.dangerBg }]}>
          <Text style={[ss.badgeText, { color: C.danger }]}>{alerts.length}</Text>
        </View>
      </View>
      {alerts.map(r => (
        <ReviewAlertRow key={r.id} review={r} onRespond={() => onRespond(r.id)} />
      ))}
    </View>
  );
}

function ReviewAlertRow({
  review,
  onRespond,
}: {
  review: ReviewAlert;
  onRespond: () => void;
}): ReactElement {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const starColor = review.rating <= 2 ? C.danger : review.rating === 3 ? C.warning : C.gold;
  return (
    <View style={ss.reviewRow}>
      <View style={[ss.authorAvatar, { backgroundColor: C.primaryLight }]}>
        <Text style={ss.authorInitial}>{review.authorInitial}</Text>
      </View>
      <View style={ss.reviewBody}>
        <View style={ss.reviewTopRow}>
          <Text style={[ss.reviewStars, { color: starColor }]}>{stars}</Text>
          <Text style={ss.reviewAge}>
            {review.daysAgo === 0
              ? t('inbox.timeJustNow')
              : t('inbox.timeDaysAgo', { n: review.daysAgo })}
          </Text>
        </View>
        <Text style={ss.reviewSnippet} numberOfLines={2}>{review.snippet}</Text>
      </View>
      <TouchableOpacity style={ss.respondBtn} onPress={onRespond} activeOpacity={0.7}>
        <Text style={ss.respondBtnText}>{t('providerDash.reviewRespond')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function PromotionsSection({ promotions }: { promotions: ActivePromotion[] }): ReactElement {
  if (promotions.length === 0) return <View />;
  return (
    <View style={ss.section}>
      <Text style={ss.sectionTitle}>{t('providerDash.promosTitle')}</Text>
      {promotions.map(p => <PromoRow key={p.id} promo={p} />)}
    </View>
  );
}

function PromoRow({ promo }: { promo: ActivePromotion }): ReactElement {
  const urgent = promo.expiresInHours < 24;
  return (
    <View style={[ss.promoRow, urgent && ss.promoRowUrgent]}>
      <View style={[ss.discountBadge, { backgroundColor: urgent ? C.dangerBg : C.primaryLight }]}>
        <Text style={[ss.discountBadgeText, { color: urgent ? C.danger : C.primary }]}>
          {promo.discountPct}%
        </Text>
      </View>
      <View style={ss.promoInfo}>
        <Text style={ss.promoTitle} numberOfLines={1}>{promo.title}</Text>
        <Text style={[ss.promoExpiry, { color: urgent ? C.danger : C.textMuted }]}>
          {promo.expiresInHours < 24
            ? t('providerDash.promoExpiresHours', { n: promo.expiresInHours })
            : t('providerDash.promoExpiresDays', { n: Math.floor(promo.expiresInHours / 24) })}
        </Text>
      </View>
      <Text style={ss.promoRedemptions}>
        {t('providerDash.promoRedemptions', { n: promo.redemptions })}
      </Text>
    </View>
  );
}

function StaffSection({ staff }: { staff: StaffMember[] }): ReactElement {
  const onDuty = staff.filter(s => s.onDuty);
  return (
    <View style={ss.section}>
      <View style={ss.sectionHeader}>
        <Text style={ss.sectionTitle}>{t('providerDash.staffTitle')}</Text>
        <Text style={ss.staffCount}>
          {t('providerDash.staffOnDutyCount', { n: onDuty.length, total: staff.length })}
        </Text>
      </View>
      <View style={ss.staffRow}>
        {staff.map(s => (
          <View key={s.id} style={ss.staffChip}>
            <View style={[ss.staffAvatar, { backgroundColor: s.onDuty ? C.successBg : C.border }]}>
              <Text style={[ss.staffInitial, { color: s.onDuty ? C.success : C.textMuted }]}>
                {s.nameInitial}
              </Text>
            </View>
            <Text style={ss.staffRole}>{s.role}</Text>
            {s.onDuty && s.dutyUntil ? (
              <Text style={ss.staffUntil}>
                {t('providerDash.staffUntil', { time: s.dutyUntil })}
              </Text>
            ) : (
              <Text style={[ss.staffUntil, { color: C.textMuted }]}>
                {t('providerDash.staffOff')}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function WhatsNewSection({ items }: { items: WhatsNew[] }): ReactElement {
  return (
    <View style={ss.section}>
      <Text style={ss.sectionTitle}>{t('providerDash.whatsNewTitle')}</Text>
      {items.map(item => (
        <View key={item.id} style={ss.newsRow}>
          <Text style={ss.newsIcon}>{item.icon}</Text>
          <View style={ss.newsBody}>
            <View style={ss.newsTitleRow}>
              <Text style={ss.newsTitle}>
                {t(item.titleKey as Parameters<typeof t>[0])}
              </Text>
              {item.isNew && (
                <View style={ss.newBadge}>
                  <Text style={ss.newBadgeText}>{t('providerDash.newBadge')}</Text>
                </View>
              )}
            </View>
            <Text style={ss.newsBody2} numberOfLines={2}>
              {t(item.bodyKey as Parameters<typeof t>[0])}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ProfileCompletenessBar({ pct }: { pct: number }): ReactElement {
  const barWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: pct,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [pct, barWidth]);

  const color = pct >= 80 ? C.success : pct >= 50 ? C.warning : C.danger;
  return (
    <View style={ss.completenessCard}>
      <View style={ss.completenessHeader}>
        <Text style={ss.completenessTitle}>{t('dashboard.completeness.title')}</Text>
        <Text style={[ss.completenessPct, { color }]}>
          {t('dashboard.completeness.percent', { pct })}
        </Text>
      </View>
      <View style={ss.progressBg}>
        <Animated.View
          style={[
            ss.progressFill,
            {
              backgroundColor: color,
              width: barWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
      {pct < 100 && (
        <Text style={ss.completenessHint}>{t('providerDash.completenessHint')}</Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface ProviderDashboardScreenProps {
  onNavigate?: (screen: string, params?: Record<string, unknown>) => void;
}

export function ProviderDashboardScreen({
  onNavigate,
}: ProviderDashboardScreenProps): ReactElement {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const apiBase = useApiBaseUrl();

  const load = useCallback(async () => {
    try {
      // In production this would call the provider dashboard API endpoint.
      // Stub: return mock data after a simulated network delay.
      await new Promise<void>(r => setTimeout(r, 600));
      setData(buildMockData());
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    void apiBase; // keep ref used
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const handleRespond = useCallback((reviewId: string) => {
    onNavigate?.('ReviewResponse', { reviewId });
  }, [onNavigate]);

  if (loading) {
    return (
      <SafeAreaView style={ss.safeArea}>
        <View style={ss.loadingWrap}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={ss.safeArea}>
        <View style={ss.loadingWrap}>
          <Text style={ss.errorText}>{t('errors.generic')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ss.safeArea}>
      <ScrollView
        contentContainerStyle={ss.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={ss.header}>
          <View>
            <Text style={ss.greeting}>{t('providerDash.greeting')}</Text>
            <Text style={ss.businessName}>{data.businessName}</Text>
          </View>
          <StatusPill status={data.verificationStatus} />
        </View>

        {/* Profile completeness */}
        <ProfileCompletenessBar pct={data.profileCompleteness} />

        {/* Today's overview */}
        <OverviewCard data={data.todayOverview} />

        {/* Quick actions */}
        <QuickActions
          onAddMenuItem={() => onNavigate?.('MenuManagement')}
          onPostUpdate={() => onNavigate?.('CreatePost')}
          onViewMessages={() => onNavigate?.('Inbox')}
          onViewAppointments={() => onNavigate?.('Appointments')}
        />

        {/* Revenue */}
        <RevenueSection data={data.weekRevenue} />

        {/* Review alerts */}
        <ReviewAlertsSection alerts={data.reviewAlerts} onRespond={handleRespond} />

        {/* Active promotions */}
        <PromotionsSection promotions={data.activePromotions} />

        {/* Staff on duty */}
        <StaffSection staff={data.staffOnDuty} />

        {/* What's new */}
        <WhatsNewSection items={data.whatsNew} />

        <View style={ss.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safeArea:           { flex: 1, backgroundColor: C.bg },
  scroll:             { paddingHorizontal: 16, paddingTop: 8 },
  loadingWrap:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:          { color: C.danger, fontSize: 15 },

  // Header
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting:           { fontSize: 13, color: C.textMuted },
  businessName:       { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'left' },

  // Pill
  pill:               { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText:           { fontSize: 12, fontWeight: '600' },

  // Completeness
  completenessCard:   { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  completenessHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  completenessTitle:  { fontSize: 14, fontWeight: '600', color: C.text },
  completenessPct:    { fontSize: 14, fontWeight: '700' },
  progressBg:         { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressFill:       { height: '100%', borderRadius: 4 },
  completenessHint:   { fontSize: 12, color: C.textMuted, marginTop: 6 },

  // Section
  section:            { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle:       { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },
  sectionHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  // Overview card
  overviewCard:       { backgroundColor: C.primary, borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  overviewRow:        { flexDirection: 'row', justifyContent: 'space-around' },
  overviewTile:       { alignItems: 'center', gap: 4 },
  overviewIcon:       { fontSize: 22 },
  overviewValueRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overviewValue:      { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  overviewDelta:      { fontSize: 11, fontWeight: '600' },
  overviewLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  badge:              { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText:          { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  // Quick actions
  qaRow:              { flexDirection: 'row', justifyContent: 'space-between' },
  qaBtn:              { alignItems: 'center', width: '23%' },
  qaIconWrap:         { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  qaIcon:             { fontSize: 22 },
  qaLabel:            { fontSize: 11, color: C.text, textAlign: 'center' },

  // Revenue
  deltaLabel:         { fontSize: 12, fontWeight: '600' },
  revenueTotal:       { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 12 },
  revenueChart:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80, marginBottom: 6 },
  revenueBarCol:      { alignItems: 'center', flex: 1 },
  revenueBarBg:       { width: 16, height: 70, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  revenueBar:         { width: '100%', backgroundColor: C.primary, borderRadius: 4 },
  revenueBarLabel:    { fontSize: 10, color: C.textMuted, marginTop: 3 },
  revenueHint:        { fontSize: 11, color: C.textMuted, textAlign: 'center' },

  // Reviews
  reviewRow:          { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  authorAvatar:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  authorInitial:      { fontSize: 14, fontWeight: '700', color: C.primary },
  reviewBody:         { flex: 1 },
  reviewTopRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  reviewStars:        { fontSize: 13 },
  reviewAge:          { fontSize: 11, color: C.textMuted },
  reviewSnippet:      { fontSize: 13, color: C.text },
  respondBtn:         { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.primaryLight, borderRadius: 8 },
  respondBtnText:     { fontSize: 12, color: C.primary, fontWeight: '600' },

  // Promotions
  promoRow:           { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: C.bg, marginBottom: 8, gap: 10 },
  promoRowUrgent:     { borderWidth: 1, borderColor: C.danger + '44', backgroundColor: C.dangerBg },
  discountBadge:      { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  discountBadgeText:  { fontSize: 14, fontWeight: '800' },
  promoInfo:          { flex: 1 },
  promoTitle:         { fontSize: 13, fontWeight: '600', color: C.text },
  promoExpiry:        { fontSize: 11, marginTop: 2 },
  promoRedemptions:   { fontSize: 12, color: C.textMuted },

  // Staff
  staffCount:         { fontSize: 12, color: C.textMuted },
  staffRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staffChip:          { alignItems: 'center', width: 70 },
  staffAvatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  staffInitial:       { fontSize: 16, fontWeight: '700' },
  staffRole:          { fontSize: 11, color: C.textMuted },
  staffUntil:         { fontSize: 10, color: C.text, textAlign: 'center' },

  // What's new
  newsRow:            { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  newsIcon:           { fontSize: 22, marginTop: 2 },
  newsBody:           { flex: 1 },
  newsTitleRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  newsTitle:          { fontSize: 14, fontWeight: '600', color: C.text },
  newsBody2:          { fontSize: 12, color: C.textMuted },
  newBadge:           { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.danger, borderRadius: 8 },
  newBadgeText:       { fontSize: 10, color: '#FFF', fontWeight: '700' },

  bottomPad:          { height: 32 },
});
