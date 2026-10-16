/* eslint-disable no-restricted-syntax, i18next/no-literal-string, @typescript-eslint/no-unused-vars */
/**
 * PricingScreen — subscription plans for providers.
 *
 * Plans: Free / Basic / Pro / Enterprise
 * Feature comparison table, plan highlights, "Contact us" for Enterprise.
 * Upgrade flow is a stub — no real payment processing.
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 */

import { type ReactElement, useState } from 'react';
import {
  Alert,
  I18nManager,
  Linking,
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
  primaryDark:  '#1565C0',
  primaryLight: '#E3F2FD',
  success:      '#10B981',
  successBg:    '#ECFDF5',
  warning:      '#F59E0B',
  warningBg:    '#FFFBEB',
  purple:       '#7C3AED',
  purpleBg:     '#F5F3FF',
  gold:         '#D97706',
  goldBg:       '#FFFBEB',
  bg:           '#F5F7FA',
  card:         '#FFFFFF',
  text:         '#1A202C',
  textMuted:    '#718096',
  border:       '#E2E8F0',
  dark:         '#111827',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanId = 'free' | 'basic' | 'pro' | 'enterprise';

interface PlanFeature {
  key: string;
  labelKey: string;
  free: string | boolean;
  basic: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

interface Plan {
  id: PlanId;
  labelKey: string;
  taglineKey: string;
  priceMonthly: number | null; // null = contact us
  currency: string;
  accentColor: string;
  accentBg: string;
  icon: string;
  popular: boolean;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: 'free',
    labelKey: 'pricing.planFree',
    taglineKey: 'pricing.planFreeTagline',
    priceMonthly: 0,
    currency: 'د.ع',
    accentColor: C.textMuted,
    accentBg: C.bg,
    icon: '🆓',
    popular: false,
  },
  {
    id: 'basic',
    labelKey: 'pricing.planBasic',
    taglineKey: 'pricing.planBasicTagline',
    priceMonthly: 15_000,
    currency: 'د.ع',
    accentColor: C.primary,
    accentBg: C.primaryLight,
    icon: '⚡',
    popular: false,
  },
  {
    id: 'pro',
    labelKey: 'pricing.planPro',
    taglineKey: 'pricing.planProTagline',
    priceMonthly: 45_000,
    currency: 'د.ع',
    accentColor: C.purple,
    accentBg: C.purpleBg,
    icon: '🚀',
    popular: true,
  },
  {
    id: 'enterprise',
    labelKey: 'pricing.planEnterprise',
    taglineKey: 'pricing.planEnterpriseTagline',
    priceMonthly: null,
    currency: 'د.ع',
    accentColor: C.gold,
    accentBg: C.goldBg,
    icon: '🏢',
    popular: false,
  },
];

const FEATURES: PlanFeature[] = [
  { key: 'listing', labelKey: 'pricing.featureListing', free: true, basic: true, pro: true, enterprise: true },
  { key: 'photos_count', labelKey: 'pricing.featurePhotos', free: '10', basic: '50', pro: 'غير محدود', enterprise: 'غير محدود' },
  { key: 'analytics', labelKey: 'pricing.featureAnalytics', free: false, basic: true, pro: true, enterprise: true },
  { key: 'featured_search', labelKey: 'pricing.featureFeaturedSearch', free: false, basic: true, pro: true, enterprise: true },
  { key: 'promotions', labelKey: 'pricing.featurePromotions', free: false, basic: false, pro: true, enterprise: true },
  { key: 'booking', labelKey: 'pricing.featureBooking', free: false, basic: false, pro: true, enterprise: true },
  { key: 'priority_support', labelKey: 'pricing.featurePrioritySupport', free: false, basic: false, pro: true, enterprise: true },
  { key: 'api_access', labelKey: 'pricing.featureApiAccess', free: false, basic: false, pro: false, enterprise: true },
  { key: 'multi_location', labelKey: 'pricing.featureMultiLocation', free: false, basic: false, pro: false, enterprise: true },
  { key: 'account_manager', labelKey: 'pricing.featureAccountManager', free: false, basic: false, pro: false, enterprise: true },
  { key: 'staff_count', labelKey: 'pricing.featureStaff', free: '1', basic: '3', pro: '10', enterprise: 'غير محدود' },
  { key: 'customer_blast', labelKey: 'pricing.featureCustomerBlast', free: false, basic: false, pro: true, enterprise: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function featureCell(value: string | boolean, accentColor: string): ReactElement {
  if (typeof value === 'boolean') {
    return value
      ? <Text style={[ss.featureCheck, { color: C.success }]}>✓</Text>
      : <Text style={[ss.featureCheck, { color: C.border }]}>—</Text>;
  }
  return <Text style={[ss.featureCellText, { color: accentColor }]}>{value}</Text>;
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isActive,
  onSelect,
  currentPlan,
}: {
  plan: Plan;
  isActive: boolean;
  onSelect: (id: PlanId) => void;
  currentPlan: PlanId;
}): ReactElement {
  const isCurrent = plan.id === currentPlan;
  const planHighlights: Record<PlanId, string[]> = {
    free:       ['pricing.highlightFree1', 'pricing.highlightFree2', 'pricing.highlightFree3'],
    basic:      ['pricing.highlightBasic1', 'pricing.highlightBasic2', 'pricing.highlightBasic3'],
    pro:        ['pricing.highlightPro1', 'pricing.highlightPro2', 'pricing.highlightPro3', 'pricing.highlightPro4'],
    enterprise: ['pricing.highlightEnt1', 'pricing.highlightEnt2', 'pricing.highlightEnt3', 'pricing.highlightEnt4'],
  };

  return (
    <TouchableOpacity
      style={[
        ss.planCard,
        isActive && { borderColor: plan.accentColor, borderWidth: 2 },
        plan.popular && ss.planCardPopular,
      ]}
      onPress={() => onSelect(plan.id)}
      activeOpacity={0.85}
    >
      {plan.popular && (
        <View style={[ss.popularBadge, { backgroundColor: plan.accentColor }]}>
          <Text style={ss.popularBadgeText}>{t('pricing.mostPopular')}</Text>
        </View>
      )}
      {isCurrent && (
        <View style={[ss.currentBadge, { backgroundColor: C.successBg }]}>
          <Text style={[ss.currentBadgeText, { color: C.success }]}>{t('pricing.currentPlan')}</Text>
        </View>
      )}

      <View style={ss.planHeader}>
        <Text style={ss.planIcon}>{plan.icon}</Text>
        <View>
          <Text style={[ss.planName, { color: plan.accentColor }]}>
            {t(plan.labelKey as Parameters<typeof t>[0])}
          </Text>
          <Text style={ss.planTagline}>
            {t(plan.taglineKey as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>

      <View style={ss.priceRow}>
        {plan.priceMonthly === null ? (
          <Text style={[ss.priceContact, { color: plan.accentColor }]}>
            {t('pricing.contactUs')}
          </Text>
        ) : plan.priceMonthly === 0 ? (
          <Text style={[ss.priceFree, { color: plan.accentColor }]}>
            {t('pricing.free')}
          </Text>
        ) : (
          <>
            <Text style={[ss.priceAmount, { color: plan.accentColor }]}>
              {plan.priceMonthly.toLocaleString('ar-IQ')}
            </Text>
            <Text style={ss.priceCurrency}> {plan.currency}</Text>
            <Text style={ss.pricePerMonth}> / {t('pricing.month')}</Text>
          </>
        )}
      </View>

      <View style={ss.highlightsList}>
        {planHighlights[plan.id].map(key => (
          <View key={key} style={ss.highlightRow}>
            <Text style={[ss.highlightCheck, { color: plan.accentColor }]}>✓</Text>
            <Text style={ss.highlightText}>
              {t(key as Parameters<typeof t>[0])}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[
          ss.planCta,
          { backgroundColor: isCurrent ? C.bg : plan.accentColor },
        ]}
        onPress={() => {
          if (plan.id === 'enterprise') {
            void Linking.openURL('mailto:enterprise@iraqmaps.com');
          } else if (!isCurrent) {
            onSelect(plan.id);
          }
        }}
        activeOpacity={0.8}
      >
        <Text style={[ss.planCtaText, { color: isCurrent ? C.textMuted : '#FFF' }]}>
          {isCurrent
            ? t('pricing.currentPlan')
            : plan.id === 'enterprise'
              ? t('pricing.contactUsBtn')
              : t('pricing.upgradeBtn')}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable({ selectedPlan }: { selectedPlan: PlanId }): ReactElement {
  const planOrder: PlanId[] = ['free', 'basic', 'pro', 'enterprise'];
  const planColors: Record<PlanId, string> = {
    free:       C.textMuted,
    basic:      C.primary,
    pro:        C.purple,
    enterprise: C.gold,
  };

  return (
    <View style={ss.tableCard}>
      <Text style={ss.tableTitle}>{t('pricing.compareTitle')}</Text>
      {/* Header */}
      <View style={ss.tableHeader}>
        <View style={ss.tableFeatureCol}>
          <Text style={ss.tableHeaderEmpty} />
        </View>
        {planOrder.map(pid => (
          <View key={pid} style={[ss.tablePlanCol, pid === selectedPlan && { backgroundColor: planColors[pid] + '18' }]}>
            <Text style={[ss.tablePlanLabel, { color: planColors[pid] }]}>
              {t(PLANS.find(p => p.id === pid)!.labelKey as Parameters<typeof t>[0])}
            </Text>
          </View>
        ))}
      </View>

      {FEATURES.map((feat, idx) => (
        <View
          key={feat.key}
          style={[ss.tableRow, { backgroundColor: idx % 2 === 0 ? C.card : C.bg }]}
        >
          <View style={ss.tableFeatureCol}>
            <Text style={ss.featureLabel}>
              {t(feat.labelKey as Parameters<typeof t>[0])}
            </Text>
          </View>
          {planOrder.map(pid => (
            <View
              key={pid}
              style={[ss.tablePlanCol, pid === selectedPlan && { backgroundColor: planColors[pid] + '18' }]}
            >
              {featureCell(
                pid === 'free' ? feat.free
                  : pid === 'basic' ? feat.basic
                  : pid === 'pro' ? feat.pro
                  : feat.enterprise,
                planColors[pid],
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

interface FaqItem { q: string; a: string }

function FaqSection(): ReactElement {
  const [expanded, setExpanded] = useState<number | null>(null);
  const items: FaqItem[] = [
    { q: t('pricing.faq1q'), a: t('pricing.faq1a') },
    { q: t('pricing.faq2q'), a: t('pricing.faq2a') },
    { q: t('pricing.faq3q'), a: t('pricing.faq3a') },
    { q: t('pricing.faq4q'), a: t('pricing.faq4a') },
  ];

  return (
    <View style={ss.faqCard}>
      <Text style={ss.tableTitle}>{t('pricing.faqTitle')}</Text>
      {items.map((item, i) => (
        <View key={i}>
          <TouchableOpacity
            style={ss.faqRow}
            onPress={() => setExpanded(expanded === i ? null : i)}
            activeOpacity={0.7}
          >
            <Text style={ss.faqQuestion}>{item.q}</Text>
            <Text style={ss.faqChevron}>{expanded === i ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {expanded === i && (
            <Text style={ss.faqAnswer}>{item.a}</Text>
          )}
          {i < items.length - 1 && <View style={ss.faqDivider} />}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface PricingScreenProps {
  currentPlan?: PlanId;
  onClose?: () => void;
}

export function PricingScreen({
  currentPlan = 'free',
  onClose,
}: PricingScreenProps): ReactElement {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(currentPlan);

  const handleSelectPlan = (id: PlanId) => {
    if (id === 'enterprise') {
      Alert.alert(
        t('pricing.enterpriseTitle'),
        t('pricing.enterpriseBody'),
        [
          { text: t('pricing.cancel'), style: 'cancel' },
          { text: t('pricing.contactUsBtn'), onPress: () => void Linking.openURL('mailto:enterprise@iraqmaps.com') },
        ],
      );
      return;
    }
    setSelectedPlan(id);
    Alert.alert(
      t('pricing.upgradeTitle'),
      t('pricing.upgradeBody'),
    );
  };

  return (
    <SafeAreaView style={ss.safeArea}>
      <View style={ss.titleBar}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={ss.closeBtn}>
            <Text style={ss.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={ss.screenTitle}>{t('pricing.title')}</Text>
        <View style={{ width: onClose ? 32 : 0 }} />
      </View>

      <ScrollView
        contentContainerStyle={ss.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={ss.hero}>
          <Text style={ss.heroTitle}>{t('pricing.heroTitle')}</Text>
          <Text style={ss.heroBody}>{t('pricing.heroBody')}</Text>
        </View>

        {/* Stub notice */}
        <View style={ss.stubNotice}>
          <Text style={ss.stubIcon}>🔧</Text>
          <Text style={ss.stubText}>{t('pricing.stubNotice')}</Text>
        </View>

        {/* Plan cards */}
        {PLANS.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isActive={selectedPlan === plan.id}
            onSelect={handleSelectPlan}
            currentPlan={currentPlan}
          />
        ))}

        {/* Comparison table */}
        <ComparisonTable selectedPlan={selectedPlan} />

        {/* FAQ */}
        <FaqSection />

        {/* Enterprise CTA */}
        <View style={ss.enterpriseCta}>
          <Text style={ss.enterpriseCtaIcon}>🏢</Text>
          <Text style={ss.enterpriseCtaTitle}>{t('pricing.enterpriseCtaTitle')}</Text>
          <Text style={ss.enterpriseCtaBody}>{t('pricing.enterpriseCtaBody')}</Text>
          <TouchableOpacity
            style={ss.enterpriseCtaBtn}
            onPress={() => void Linking.openURL('mailto:enterprise@iraqmaps.com')}
            activeOpacity={0.8}
          >
            <Text style={ss.enterpriseCtaBtnText}>{t('pricing.contactUsBtn')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safeArea:             { flex: 1, backgroundColor: C.bg },
  scroll:               { paddingHorizontal: 16 },
  titleBar:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  screenTitle:          { fontSize: 18, fontWeight: '700', color: C.text },
  closeBtn:             { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:         { fontSize: 16, color: C.textMuted },

  hero:                 { paddingVertical: 20, alignItems: 'center' },
  heroTitle:            { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  heroBody:             { fontSize: 14, color: C.textMuted, textAlign: 'center', maxWidth: 300 },

  stubNotice:           { flexDirection: 'row', backgroundColor: C.warningBg, borderRadius: 10, padding: 12, marginBottom: 16, gap: 8, alignItems: 'flex-start' },
  stubIcon:             { fontSize: 18 },
  stubText:             { fontSize: 13, color: C.warning, flex: 1 },

  // Plan card
  planCard:             { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, position: 'relative' },
  planCardPopular:      { shadowColor: C.purple, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 },
  popularBadge:         { position: 'absolute', top: -1, end: 14, paddingHorizontal: 10, paddingVertical: 4, borderBottomStartRadius: 8, borderBottomEndRadius: 8 },
  popularBadgeText:     { fontSize: 11, color: '#FFF', fontWeight: '700' },
  currentBadge:         { position: 'absolute', top: 12, end: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  currentBadgeText:     { fontSize: 11, fontWeight: '600' },
  planHeader:           { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  planIcon:             { fontSize: 28 },
  planName:             { fontSize: 18, fontWeight: '800' },
  planTagline:          { fontSize: 12, color: C.textMuted, marginTop: 2 },
  priceRow:             { flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 },
  priceAmount:          { fontSize: 28, fontWeight: '800' },
  priceCurrency:        { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  pricePerMonth:        { fontSize: 13, color: C.textMuted },
  priceFree:            { fontSize: 24, fontWeight: '800' },
  priceContact:         { fontSize: 18, fontWeight: '700' },
  highlightsList:       { gap: 6, marginBottom: 14 },
  highlightRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  highlightCheck:       { fontSize: 14, fontWeight: '700', marginTop: 1 },
  highlightText:        { fontSize: 13, color: C.text, flex: 1 },
  planCta:              { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  planCtaText:          { fontSize: 15, fontWeight: '700' },

  // Comparison table
  tableCard:            { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  tableTitle:           { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 14 },
  tableHeader:          { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tableFeatureCol:      { flex: 2 },
  tablePlanCol:         { flex: 1, alignItems: 'center', borderRadius: 6 },
  tableHeaderEmpty:     { height: 20 },
  tablePlanLabel:       { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tableRow:             { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 6 },
  featureLabel:         { fontSize: 12, color: C.text },
  featureCheck:         { fontSize: 14, textAlign: 'center', fontWeight: '700' },
  featureCellText:      { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // FAQ
  faqCard:              { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  faqRow:               { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  faqQuestion:          { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },
  faqChevron:           { fontSize: 12, color: C.textMuted, marginStart: 8 },
  faqAnswer:            { fontSize: 13, color: C.textMuted, paddingBottom: 10, lineHeight: 20 },
  faqDivider:           { height: 1, backgroundColor: C.border },

  // Enterprise CTA
  enterpriseCta:        { backgroundColor: C.dark, borderRadius: 16, padding: 22, alignItems: 'center', marginBottom: 14 },
  enterpriseCtaIcon:    { fontSize: 36, marginBottom: 10 },
  enterpriseCtaTitle:   { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  enterpriseCtaBody:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 16 },
  enterpriseCtaBtn:     { backgroundColor: C.gold, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  enterpriseCtaBtnText: { fontSize: 15, color: '#FFF', fontWeight: '700' },
});
