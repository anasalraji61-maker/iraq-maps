/**
 * TripPlannerScreen — multi-step AI trip planner
 * Steps: (1) destination + dates, (2) interests, (3) budget, (4) itinerary
 */
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAssistantClient } from '../client';
import { t } from '../strings';
import type { TripPlanResponseType } from '@iraq-maps/contracts';
import { TripInterest as TripInterestSchema, BudgetLevel as BudgetLevelSchema } from '@iraq-maps/contracts';
import { z } from 'zod';

type TripInterest = z.infer<typeof TripInterestSchema>;
type BudgetLevel = z.infer<typeof BudgetLevelSchema>;

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const SURFACE = '#F5F5F5';
const ACCENT = '#FF6F00';
const TEXT = '#212121';
const MUTED = '#757575';
const CHIP_BG = '#E3F2FD';
const CHIP_SELECTED = PRIMARY;

type Step = 0 | 1 | 2 | 3;

const INTERESTS: TripInterest[] = TripInterestSchema.options;
const BUDGETS: BudgetLevel[] = BudgetLevelSchema.options;

const INTEREST_KEY_MAP: Record<TripInterest, string> = {
  food: 'tripPlanner.interestFood',
  culture: 'tripPlanner.interestCulture',
  shopping: 'tripPlanner.interestShopping',
  nature: 'tripPlanner.interestNature',
  history: 'tripPlanner.interestHistory',
  religious: 'tripPlanner.interestReligious',
};

const BUDGET_KEY_MAP: Record<BudgetLevel, string> = {
  budget: 'tripPlanner.budgetBudget',
  mid: 'tripPlanner.budgetMid',
  luxury: 'tripPlanner.budgetLuxury',
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function TripPlannerScreen(): ReactElement {
  const router = useRouter();
  const client = useAssistantClient();

  const [step, setStep] = useState<Step>(0);
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(formatDate(addDays(new Date(), 7)));
  const [endDate, setEndDate] = useState(formatDate(addDays(new Date(), 9)));
  const [partySize, setPartySize] = useState('2');
  const [selectedInterests, setSelectedInterests] = useState<TripInterest[]>([]);
  const [budget, setBudget] = useState<BudgetLevel>('mid');
  const [plan, setPlan] = useState<TripPlanResponseType | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));

  const toggleInterest = (interest: TripInterest) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest],
    );
  };

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const canProceedStep0 = destination.trim().length > 0 && startDate <= endDate;
  const canProceedStep1 = selectedInterests.length > 0;

  const generatePlan = async () => {
    setLoading(true);
    try {
      const res = await client.planTrip({
        body: {
          destination: destination.trim(),
          startDate,
          endDate,
          interests: selectedInterests,
          budget,
          partySize: Math.max(1, Math.min(20, parseInt(partySize, 10) || 2)),
        },
      });
      if (res.status === 200) {
        setPlan(res.body);
        setStep(3);
      } else {
        Alert.alert(t('tripPlanner.error'));
      }
    } catch {
      Alert.alert(t('tripPlanner.error'));
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    if (!plan) return;
    try {
      const saved = await AsyncStorage.getItem('trip_plans');
      const plans: TripPlanResponseType[] = saved ? (JSON.parse(saved) as TripPlanResponseType[]) : [];
      plans.unshift(plan);
      await AsyncStorage.setItem('trip_plans', JSON.stringify(plans.slice(0, 20)));
      Alert.alert(t('tripPlanner.planSaved'));
    } catch {
      // non-critical
    }
  };

  const sharePlan = async () => {
    if (!plan) return;
    const text = [
      `${plan.destination} - ${t('tripPlanner.title')}`,
      plan.summary,
      '',
      ...plan.days.map(d =>
        [
          `== ${t('tripPlanner.day', { day: d.day })} — ${d.theme} ==`,
          ...d.activities.map(a => `${a.time} ${a.title}: ${a.description}`),
        ].join('\n')
      ),
      '',
      ...(plan.tips.length > 0 ? [t('tripPlanner.tips'), ...plan.tips.map(tip => `• ${tip}`)] : []),
    ].join('\n');
    await Share.share({ message: text });
  };

  // Step 0: Destination & Dates
  const renderStep0 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{t('tripPlanner.stepDestination')}</Text>

      <Text style={styles.label}>{t('tripPlanner.destinationLabel')}</Text>
      <TextInput
        style={styles.input}
        value={destination}
        onChangeText={setDestination}
        placeholder={t('tripPlanner.destinationPlaceholder')}
        placeholderTextColor={MUTED}
        textAlign={I18nManager.isRTL ? 'right' : 'left'}
        accessibilityLabel={t('tripPlanner.destinationLabel')}
      />

      <View style={styles.row}>
        <View style={styles.halfField}>
          <Text style={styles.label}>{t('tripPlanner.startDateLabel')}</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={MUTED}
            accessibilityLabel={t('tripPlanner.startDateLabel')}
          />
        </View>
        <View style={styles.halfField}>
          <Text style={styles.label}>{t('tripPlanner.endDateLabel')}</Text>
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={MUTED}
            accessibilityLabel={t('tripPlanner.endDateLabel')}
          />
        </View>
      </View>

      <Text style={styles.label}>{t('tripPlanner.partySizeLabel')}</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        value={partySize}
        onChangeText={setPartySize}
        keyboardType="number-pad"
        accessibilityLabel={t('tripPlanner.partySizeLabel')}
      />
    </View>
  );

  // Step 1: Interests
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{t('tripPlanner.stepInterests')}</Text>
      <View style={styles.chipGrid}>
        {INTERESTS.map(interest => {
          const selected = selectedInterests.includes(interest);
          return (
            <Pressable
              key={interest}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleInterest(interest)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(INTEREST_KEY_MAP[interest] as Parameters<typeof t>[0])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // Step 2: Budget
  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{t('tripPlanner.stepBudget')}</Text>
      {BUDGETS.map(b => (
        <Pressable
          key={b}
          style={[styles.budgetOption, budget === b && styles.budgetOptionSelected]}
          onPress={() => setBudget(b)}
          accessibilityRole="radio"
          accessibilityState={{ selected: budget === b }}
        >
          <Text style={[styles.budgetText, budget === b && styles.budgetTextSelected]}>
            {t(BUDGET_KEY_MAP[b] as Parameters<typeof t>[0])}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  // Step 3: Itinerary
  const renderItinerary = () => {
    if (!plan) return null;
    return (
      <ScrollView style={styles.itineraryScroll}>
        <Text style={styles.itineraryTitle}>{plan.destination}</Text>
        <Text style={styles.itinerarySummary}>{plan.summary}</Text>
        {plan.totalEstimatedCost != null && (
          <Text style={styles.totalCost}>{t('tripPlanner.totalCost', { cost: plan.totalEstimatedCost })}</Text>
        )}

        {plan.days.map(day => {
          const expanded = expandedDays.has(day.day);
          return (
            <View key={day.day} style={styles.dayCard}>
              <Pressable
                style={styles.dayHeader}
                onPress={() => toggleDay(day.day)}
                accessibilityRole="button"
                accessibilityLabel={expanded
                  ? t('tripPlanner.collapseDay', { day: day.day })
                  : t('tripPlanner.expandDay', { day: day.day })}
              >
                <Text style={styles.dayTitle}>
                  {t('tripPlanner.day', { day: day.day })} — {day.date}
                </Text>
                <Text style={styles.dayTheme}>{day.theme}</Text>
                <Text style={styles.chevron}>{expanded ? t('search.chevronCollapse') : t('search.chevronExpand')}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.activitiesContainer}>
                  {day.activities.length === 0 ? (
                    <Text style={styles.noActivities}>{t('tripPlanner.noActivities')}</Text>
                  ) : (
                    day.activities.map((activity, idx) => (
                      <View key={idx} style={styles.activityRow}>
                        <Text style={styles.activityTime}>{activity.time}</Text>
                        <View style={styles.activityContent}>
                          <Text style={styles.activityTitle}>{activity.title}</Text>
                          <Text style={styles.activityDesc}>{activity.description}</Text>
                          {activity.duration != null && (
                            <Text style={styles.activityMeta}>{activity.duration}</Text>
                          )}
                          {activity.estimatedCost != null && (
                            <Text style={styles.activityCost}>
                              {t('tripPlanner.estimatedCost', { cost: activity.estimatedCost })}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                  {day.totalEstimatedCost != null && (
                    <Text style={styles.dayCost}>
                      {t('tripPlanner.estimatedCost', { cost: day.totalEstimatedCost })}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {plan.tips.length > 0 && (
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>{t('tripPlanner.tips')}</Text>
            {plan.tips.map((tip, i) => (
              <Text key={i} style={styles.tipItem}>• {tip}</Text>
            ))}
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={savePlan}>
            <Text style={styles.actionBtnText}>{t('tripPlanner.savePlan')}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => void sharePlan()}>
            <Text style={styles.actionBtnText}>{t('tripPlanner.sharePlan')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  };

  const STEP_TITLES: Record<Step, string> = {
    0: t('tripPlanner.stepDestination'),
    1: t('tripPlanner.stepInterests'),
    2: t('tripPlanner.stepBudget'),
    3: t('tripPlanner.stepItinerary'),
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('tripPlanner.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress dots */}
      {step < 3 && (
        <View style={styles.progressRow}>
          {([0, 1, 2] as Step[]).map(s => (
            <View key={s} style={[styles.progressDot, step >= s && styles.progressDotActive]} />
          ))}
        </View>
      )}

      {/* Step label */}
      <Text style={styles.stepLabel}>{STEP_TITLES[step]}</Text>

      {/* Content */}
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderItinerary()}
      </ScrollView>

      {/* Navigation */}
      {step < 3 && (
        <View style={styles.navRow}>
          {step > 0 && (
            <Pressable style={styles.navBtnBack} onPress={() => setStep((step - 1) as Step)}>
              <Text style={styles.navBtnBackText}>{t('tripPlanner.back')}</Text>
            </Pressable>
          )}
          {step < 2 ? (
            <Pressable
              style={[styles.navBtn, (!canProceedStep0 && step === 0) || (!canProceedStep1 && step === 1) ? styles.navBtnDisabled : null]}
              onPress={() => setStep((step + 1) as Step)}
              disabled={(step === 0 && !canProceedStep0) || (step === 1 && !canProceedStep1)}
            >
              <Text style={styles.navBtnText}>{t('tripPlanner.next')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.navBtn, loading && styles.navBtnDisabled]}
              onPress={() => void generatePlan()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.navBtnText}>{t('tripPlanner.generate')}</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: PRIMARY },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontSize: 20 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 36 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#C5CAE9' },
  progressDotActive: { backgroundColor: PRIMARY },
  stepLabel: { textAlign: 'center', color: MUTED, fontSize: 13, marginBottom: 4 },
  content: { flex: 1 },
  stepContainer: { padding: 20 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: TEXT, marginBottom: 20, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  label: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 6, marginTop: 12, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  input: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 16, color: TEXT, backgroundColor: SURFACE, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  inputSmall: { width: 80 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: CHIP_BG },
  chipSelected: { backgroundColor: CHIP_SELECTED },
  chipText: { color: PRIMARY, fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  budgetOption: { padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#E0E0E0', marginBottom: 12, backgroundColor: SURFACE },
  budgetOptionSelected: { borderColor: PRIMARY, backgroundColor: CHIP_BG },
  budgetText: { fontSize: 16, color: TEXT, textAlign: 'center' },
  budgetTextSelected: { color: PRIMARY, fontWeight: '700' },
  navRow: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  navBtn: { flex: 1, backgroundColor: PRIMARY, borderRadius: 12, padding: 14, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  navBtnBack: { flex: 1, borderWidth: 2, borderColor: PRIMARY, borderRadius: 12, padding: 14, alignItems: 'center' },
  navBtnBackText: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
  itineraryScroll: { flex: 1, padding: 16 },
  itineraryTitle: { fontSize: 24, fontWeight: '800', color: TEXT, textAlign: I18nManager.isRTL ? 'right' : 'left', marginBottom: 8 },
  itinerarySummary: { fontSize: 15, color: MUTED, textAlign: I18nManager.isRTL ? 'right' : 'left', lineHeight: 22, marginBottom: 8 },
  totalCost: { fontSize: 15, color: ACCENT, fontWeight: '700', textAlign: I18nManager.isRTL ? 'right' : 'left', marginBottom: 16 },
  dayCard: { borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 12, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: SURFACE },
  dayTitle: { fontSize: 16, fontWeight: '700', color: TEXT, flex: 1, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  dayTheme: { fontSize: 13, color: MUTED, flexShrink: 1, marginHorizontal: 8 },
  chevron: { fontSize: 12, color: MUTED },
  activitiesContainer: { padding: 12 },
  activityRow: { flexDirection: 'row', marginBottom: 12, gap: 10 },
  activityTime: { width: 50, fontSize: 13, fontWeight: '700', color: PRIMARY, textAlign: 'center', paddingTop: 2 },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: '600', color: TEXT, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  activityDesc: { fontSize: 13, color: MUTED, marginTop: 2, textAlign: I18nManager.isRTL ? 'right' : 'left', lineHeight: 20 },
  activityMeta: { fontSize: 12, color: PRIMARY, marginTop: 2, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  activityCost: { fontSize: 12, color: ACCENT, marginTop: 2, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  dayCost: { fontSize: 13, color: ACCENT, fontWeight: '600', textAlign: I18nManager.isRTL ? 'right' : 'left', marginTop: 4 },
  noActivities: { color: MUTED, textAlign: 'center', padding: 12 },
  tipsCard: { borderRadius: 12, backgroundColor: '#FFF3E0', padding: 16, marginBottom: 16 },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: ACCENT, marginBottom: 8, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  tipItem: { fontSize: 14, color: TEXT, lineHeight: 22, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: { flex: 1, backgroundColor: PRIMARY, borderRadius: 10, padding: 14, alignItems: 'center' },
  actionBtnSecondary: { backgroundColor: '#388E3C' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
