/**
 * CustomerInsightsScreen — anonymized customer analytics for providers.
 * Visit frequency, sentiment analysis, top review quotes, issues to fix.
 */
import { Screen } from '@iraq-maps/ui';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from '../components/charts/BarChart';
import { SkeletonBlock } from '../skeleton';
import { t } from '../strings';

I18nManager.forceRTL(true);

const C = {
  primary: '#1976D2',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#7C3AED',
  bg: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#666666',
  muted: '#AAAAAA',
  border: '#E0E0E0',
};

interface RegularCustomer {
  id: string;
  visitCount: number;
  lastVisitDaysAgo: number;
  avgRating: number;
}

interface SentimentKeyword {
  word: string;
  count: number;
  positive: boolean;
}

interface ReviewQuote {
  text: string;
  rating: number;
  positive: boolean;
}

interface CustomerData {
  totalCustomers: number;
  regularCustomers: RegularCustomer[];
  visitFreqBuckets: Array<{ label: string; count: number }>;
  avgVisitsPerMonth: number;
  sentimentKeywords: SentimentKeyword[];
  positiveScore: number;  // 0..100
  topQuotes: ReviewQuote[];
  topIssues: ReviewQuote[];
}

function mockCustomerData(): CustomerData {
  return {
    totalCustomers: 284,
    regularCustomers: Array.from({ length: 8 }, (_, i) => ({
      id: `c${i + 1}`,
      visitCount: 12 - i * 1.2 | 0,
      lastVisitDaysAgo: (i + 1) * 3,
      avgRating: parseFloat((4.8 - i * 0.1).toFixed(1)),
    })),
    visitFreqBuckets: [
      { label: '1×', count: 140 },
      { label: '2–3×', count: 72 },
      { label: '4–6×', count: 41 },
      { label: '7–10×', count: 19 },
      { label: '10+×', count: 12 },
    ],
    avgVisitsPerMonth: 2.4,
    sentimentKeywords: [
      { word: 'سريع', count: 48, positive: true },
      { word: 'نظيف', count: 41, positive: true },
      { word: 'مميز', count: 37, positive: true },
      { word: 'رائع', count: 32, positive: true },
      { word: 'بطيء', count: 14, positive: false },
      { word: 'غالي', count: 11, positive: false },
      { word: 'ممتاز', count: 28, positive: true },
      { word: 'جيد', count: 22, positive: true },
      { word: 'مزدحم', count: 9, positive: false },
    ],
    positiveScore: 78,
    topQuotes: [
      { text: 'خدمة ممتازة وسرعة في التنفيذ، سأعود بالتأكيد!', rating: 5, positive: true },
      { text: 'النظافة عالية جداً والموظفون محترمون', rating: 5, positive: true },
      { text: 'أفضل مكان في المنطقة، ننصح به الجميع', rating: 5, positive: true },
    ],
    topIssues: [
      { text: 'الانتظار كان طويلاً في أوقات الذروة', rating: 2, positive: false },
      { text: 'الأسعار مرتفعة قليلاً مقارنة بالمنافسين', rating: 3, positive: false },
    ],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RegularCustomerRow({ customer }: { customer: RegularCustomer }): ReactElement {
  return (
    <View style={styles.customerRow}>
      <View style={styles.customerAvatar}>
        <Text style={styles.customerAvatarText}>👤</Text>
      </View>
      <View style={styles.customerInfo}>
        <Text style={styles.customerVisits}>
          {t('customers.visitCount', { n: String(customer.visitCount) })}
        </Text>
        <Text style={styles.customerLastSeen}>
          {t('customers.lastSeen', { n: String(customer.lastVisitDaysAgo) })}
        </Text>
      </View>
      <View style={styles.customerRating}>
        <Text style={styles.ratingText}>{'★'.repeat(Math.round(customer.avgRating))}</Text>
        <Text style={styles.ratingValue}>{customer.avgRating}</Text>
      </View>
    </View>
  );
}

function KeywordCloud({ keywords }: { keywords: SentimentKeyword[] }): ReactElement {
  const max = keywords.reduce((m, k) => Math.max(m, k.count), 1);
  return (
    <View style={styles.cloud}>
      {keywords.map((kw) => {
        const scale = 0.7 + (kw.count / max) * 0.8;
        return (
          <View
            key={kw.word}
            style={[
              styles.cloudChip,
              { backgroundColor: kw.positive ? '#E8F5E9' : '#FFEBEE' },
            ]}
          >
            <Text
              style={[
                styles.cloudWord,
                {
                  fontSize: Math.round(11 * scale),
                  color: kw.positive ? C.green : C.red,
                  fontWeight: kw.count > max * 0.6 ? '700' : '500',
                },
              ]}
            >
              {kw.word}
            </Text>
            <Text style={styles.cloudCount}>{kw.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SentimentMeter({ score }: { score: number }): ReactElement {
  const color = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
  const label = score >= 70
    ? t('customers.sentimentPositive')
    : score >= 40
    ? t('customers.sentimentNeutral')
    : t('customers.sentimentNegative');
  return (
    <View style={styles.sentimentMeter}>
      <View style={styles.sentimentTrack}>
        <View style={[styles.sentimentFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.sentimentLabelRow}>
        <Text style={[styles.sentimentScore, { color }]}>{score}%</Text>
        <Text style={[styles.sentimentLabel, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

function QuoteCard({ quote }: { quote: ReviewQuote }): ReactElement {
  const color = quote.positive ? C.green : C.red;
  const stars = '★'.repeat(quote.rating) + '☆'.repeat(5 - quote.rating);
  return (
    <View style={[styles.quoteCard, { borderStartColor: color }]}>
      <Text style={[styles.quoteStars, { color: C.amber }]}>{stars}</Text>
      <Text style={styles.quoteText}>"{quote.text}"</Text>
      <TouchableOpacity style={[styles.shareBtn, { borderColor: color }]}>
        <Text style={[styles.shareBtnText, { color }]}>
          {quote.positive ? t('customers.shareQuote') : t('customers.addressIssue')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function CustomerInsightsScreen({ providerId }: { providerId: string }): ReactElement {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<CustomerData | null>(null);
  const [showAllRegulars, setShowAllRegulars] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setData(mockCustomerData());
    if (refresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleRegulars = data
    ? showAllRegulars ? data.regularCustomers : data.regularCustomers.slice(0, 5)
    : [];

  return (
    <Screen>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <Text style={styles.screenTitle}>{t('customers.title')}</Text>

          {/* Summary stats */}
          {loading ? (
            <View style={styles.summaryRow}>
              {[1, 2, 3].map((k) => <SkeletonBlock key={k} width={90} height={56} />)}
            </View>
          ) : data ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{data.totalCustomers}</Text>
                <Text style={styles.summaryLabel}>{t('customers.totalCustomers')}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{data.avgVisitsPerMonth}</Text>
                <Text style={styles.summaryLabel}>{t('customers.avgVisits')}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: C.green }]}>{data.positiveScore}%</Text>
                <Text style={styles.summaryLabel}>{t('customers.positive')}</Text>
              </View>
            </View>
          ) : null}

          {/* Regular customers */}
          <SectionCard title={t('customers.regularCustomers')}>
            <>
              {loading ? (
                <View style={{ gap: 8 }}>
                  {[1, 2, 3].map((k) => <SkeletonBlock key={k} width="100%" height={52} />)}
                </View>
              ) : (
                <>
                  {visibleRegulars.map((c) => (
                    <RegularCustomerRow key={c.id} customer={c} />
                  ))}
                  {data && data.regularCustomers.length > 5 && (
                    <TouchableOpacity onPress={() => setShowAllRegulars((v) => !v)} style={styles.showMore}>
                      <Text style={styles.showMoreText}>
                        {showAllRegulars ? t('customers.showLess') : t('customers.showAll', { n: String(data.regularCustomers.length) })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          </SectionCard>

          {/* Visit frequency distribution */}
          <SectionCard title={t('customers.visitFrequency')}>
            <>
              {loading ? (
                <SkeletonBlock width="100%" height={140} />
              ) : data ? (
                <BarChart
                  data={data.visitFreqBuckets.map((b) => ({ label: b.label, value: b.count, color: C.primary }))}
                  width={320}
                  height={150}
                  loading={false}
                  showValues
                />
              ) : null}
            </>
          </SectionCard>

          {/* Sentiment analysis */}
          <SectionCard title={t('customers.sentimentAnalysis')}>
            <>
              {loading ? (
                <>
                  <SkeletonBlock width="100%" height={16} />
                  <SkeletonBlock width="100%" height={60} />
                </>
              ) : data ? (
                <>
                  <SentimentMeter score={data.positiveScore} />
                  <Text style={styles.cloudHeading}>{t('customers.keywordCloud')}</Text>
                  <KeywordCloud keywords={data.sentimentKeywords} />
                </>
              ) : null}
            </>
          </SectionCard>

          {/* Best review quotes */}
          <SectionCard title={t('customers.bestQuotes')}>
            <>
              {loading ? (
                <View style={{ gap: 8 }}>
                  {[1, 2].map((k) => <SkeletonBlock key={k} width="100%" height={72} />)}
                </View>
              ) : data ? (
                <View style={{ gap: 8 }}>
                  {data.topQuotes.map((q, i) => <QuoteCard key={i} quote={q} />)}
                </View>
              ) : null}
            </>
          </SectionCard>

          {/* Issues to fix */}
          <SectionCard title={t('customers.issuesToFix')}>
            <>
              {loading ? (
                <View style={{ gap: 8 }}>
                  {[1, 2].map((k) => <SkeletonBlock key={k} width="100%" height={72} />)}
                </View>
              ) : data ? (
                <View style={{ gap: 8 }}>
                  {data.topIssues.map((q, i) => <QuoteCard key={i} quote={q} />)}
                </View>
              ) : null}
            </>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: C.primary },
  summaryLabel: { fontSize: 11, color: C.sub, textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  customerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  customerAvatarText: { fontSize: 18 },
  customerInfo: { flex: 1, gap: 2 },
  customerVisits: { fontSize: 13, fontWeight: '600', color: C.text },
  customerLastSeen: { fontSize: 11, color: C.muted },
  customerRating: { alignItems: 'flex-end', gap: 2 },
  ratingText: { fontSize: 11, color: C.amber },
  ratingValue: { fontSize: 12, fontWeight: '700', color: C.text },
  showMore: { alignItems: 'center', paddingVertical: 8 },
  showMoreText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  sentimentMeter: { gap: 6 },
  sentimentTrack: { height: 14, backgroundColor: '#EEE', borderRadius: 7, overflow: 'hidden' },
  sentimentFill: { height: '100%', borderRadius: 7 },
  sentimentLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sentimentScore: { fontSize: 18, fontWeight: '800' },
  sentimentLabel: { fontSize: 13, fontWeight: '600' },
  cloudHeading: { fontSize: 12, color: C.sub, marginTop: 4 },
  cloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cloudChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  cloudWord: { fontWeight: '600' },
  cloudCount: { fontSize: 10, color: C.muted },
  quoteCard: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 12, borderStartWidth: 3, gap: 6 },
  quoteStars: { fontSize: 13 },
  quoteText: { fontSize: 13, color: C.text, lineHeight: 20, fontStyle: 'italic' },
  shareBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  shareBtnText: { fontSize: 12, fontWeight: '600' },
});
