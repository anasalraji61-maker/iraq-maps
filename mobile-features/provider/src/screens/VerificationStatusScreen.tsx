/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * VerificationStatusScreen — displays the provider's verification journey
 * with a step-by-step tracker, real-time updates via WebSocket, and
 * contextual Arabic descriptions for each stage.
 */

import { useApi } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  View,
  Text as RNText,
} from 'react-native';
import { expectStatus } from '../request';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationStep =
  | 'submitted'
  | 'reviewing'
  | 'identity_verified'
  | 'location_verified'
  | 'approved'
  | 'rejected';

type StepState = 'done' | 'active' | 'pending' | 'failed';

interface VerificationStepDef {
  id: VerificationStep;
  titleKey: string;
  descKey: string;
  etaKey?: string;
  icon: string;
}

interface VerificationData {
  providerId: string;
  status: string;
  name: string;
  submittedAt: string | null;
  suspensionReason: string | null;
  currentStep: VerificationStep;
  notes: string | null;
  audit: AuditEntry[];
}

interface AuditEntry {
  action: string;
  actorUserId: string;
  reason: string | null;
  at: string;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const VERIFICATION_STEPS: VerificationStepDef[] = [
  {
    id: 'submitted',
    titleKey: 'vstep.submitted_title',
    descKey: 'vstep.submitted_desc',
    icon: '📤',
  },
  {
    id: 'reviewing',
    titleKey: 'vstep.reviewing_title',
    descKey: 'vstep.reviewing_desc',
    etaKey: 'vstep.reviewing_eta',
    icon: '🔍',
  },
  {
    id: 'identity_verified',
    titleKey: 'vstep.identity_title',
    descKey: 'vstep.identity_desc',
    icon: '🪪',
  },
  {
    id: 'location_verified',
    titleKey: 'vstep.location_title',
    descKey: 'vstep.location_desc',
    icon: '📍',
  },
  {
    id: 'approved',
    titleKey: 'vstep.approved_title',
    descKey: 'vstep.approved_desc',
    icon: '✅',
  },
];

const STEP_ORDER: VerificationStep[] = [
  'submitted',
  'reviewing',
  'identity_verified',
  'location_verified',
  'approved',
];

const STEP_FALLBACK_LABELS: Record<VerificationStep, string> = {
  submitted: 'استلام الطلب',
  reviewing: 'مراجعة الوثائق',
  identity_verified: 'التحقق من الهوية',
  location_verified: 'التحقق من الموقع',
  approved: 'الموافقة النهائية',
  rejected: 'مرفوض',
};

const STEP_FALLBACK_DESCS: Record<VerificationStep, string> = {
  submitted: 'تم استلام طلبك بنجاح. سيراجع فريقنا طلبك قريباً.',
  reviewing: 'فريقنا يراجع الوثائق المقدمة. المدة المتوقعة ١–٢ يوم عمل.',
  identity_verified: 'تم التحقق من هويتك بنجاح.',
  location_verified: 'تم التحقق من موقع النشاط التجاري بنجاح.',
  approved: 'تهانينا! نشاطك التجاري موثَّق ويظهر للمستخدمين الآن.',
  rejected: 'تم رفض الطلب. يرجى الاطلاع على سبب الرفض واتخاذ الإجراء المناسب.',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function stepStateOf(step: VerificationStep, current: VerificationStep, isRejected: boolean): StepState {
  if (isRejected && step === 'approved') return 'failed';
  const currentIdx = STEP_ORDER.indexOf(current);
  const stepIdx = STEP_ORDER.indexOf(step);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Animated step indicator ──────────────────────────────────────────────────

interface StepNodeProps {
  state: StepState;
  icon: string;
  isLast: boolean;
}

function StepNode({ state, icon, isLast }: StepNodeProps): ReactElement {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== 'active') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const bgColor =
    state === 'done'
      ? '#16a34a'
      : state === 'active'
      ? '#1565c0'
      : state === 'failed'
      ? '#dc2626'
      : '#d1d5db';

  return (
    <View style={snStyles.col}>
      <Animated.View
        style={[
          snStyles.node,
          { backgroundColor: bgColor },
          state === 'active' && { transform: [{ scale: pulse }] },
        ]}
      >
        <RNText style={snStyles.nodeIcon}>{icon}</RNText>
      </Animated.View>
      {!isLast && (
        <View
          style={[
            snStyles.connector,
            state === 'done' && snStyles.connectorDone,
          ]}
        />
      )}
    </View>
  );
}

const snStyles = StyleSheet.create({
  col: { alignItems: 'center', width: 50 },
  node: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeIcon: { fontSize: 20 },
  connector: { width: 3, flex: 1, minHeight: 28, backgroundColor: '#e5e7eb', marginVertical: 2 },
  connectorDone: { backgroundColor: '#16a34a' },
});

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  def: VerificationStepDef;
  state: StepState;
  isLast: boolean;
  notes?: string | null;
  rejectionReason?: string | null;
}

function StepCard({ def, state, isLast, notes, rejectionReason }: StepCardProps): ReactElement {
  const isTryKey = (key: string): key is Parameters<typeof t>[0] => {
    try {
      const result = t(key as Parameters<typeof t>[0]);
      return result !== key;
    } catch {
      return false;
    }
  };

  const title = isTryKey(def.titleKey as Parameters<typeof t>[0])
    ? t(def.titleKey as Parameters<typeof t>[0])
    : STEP_FALLBACK_LABELS[def.id];

  const desc = isTryKey(def.descKey as Parameters<typeof t>[0])
    ? t(def.descKey as Parameters<typeof t>[0])
    : STEP_FALLBACK_DESCS[def.id];

  const textColor =
    state === 'pending' ? '#aaa' : state === 'failed' ? '#dc2626' : '#111';

  const descColor =
    state === 'pending' ? '#bbb' : state === 'failed' ? '#dc2626' : '#555';

  return (
    <View style={scStyles.row}>
      <StepNode state={state} icon={def.icon} isLast={isLast} />
      <View style={[scStyles.card, state === 'active' && scStyles.cardActive, state === 'failed' && scStyles.cardFailed]}>
        <View style={scStyles.cardHeader}>
          <RNText style={[scStyles.cardTitle, { color: textColor }]}>{title}</RNText>
          {state === 'done' && <RNText style={scStyles.doneBadge}>تم ✓</RNText>}
          {state === 'active' && <RNText style={scStyles.activeBadge}>جارٍ الآن</RNText>}
          {state === 'failed' && <RNText style={scStyles.failBadge}>مرفوض</RNText>}
        </View>
        <RNText style={[scStyles.cardDesc, { color: descColor }]}>{desc}</RNText>
        {state === 'active' && def.etaKey && (
          <RNText style={scStyles.eta}>
            {isTryKey(def.etaKey as Parameters<typeof t>[0])
              ? t(def.etaKey as Parameters<typeof t>[0])
              : 'المدة المتوقعة: ١–٢ يوم عمل'}
          </RNText>
        )}
        {state === 'active' && notes && (
          <View style={scStyles.notesBox}>
            <RNText style={scStyles.notesTitle}>ملاحظة من الفريق:</RNText>
            <RNText style={scStyles.notesText}>{notes}</RNText>
          </View>
        )}
        {state === 'failed' && rejectionReason && (
          <View style={scStyles.rejectionBox}>
            <RNText style={scStyles.rejectionTitle}>{t('verification.rejection_reason')}</RNText>
            <RNText style={scStyles.rejectionText}>{rejectionReason}</RNText>
          </View>
        )}
      </View>
    </View>
  );
}

const scStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  cardActive: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  cardFailed: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  doneBadge: {
    fontSize: 11,
    color: '#166534',
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  activeBadge: {
    fontSize: 11,
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  failBadge: {
    fontSize: 11,
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  cardDesc: { fontSize: 13, lineHeight: 20 },
  eta: { fontSize: 12, color: '#1565c0', marginTop: 4 },
  notesBox: {
    backgroundColor: '#fefce8',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  notesTitle: { fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 3 },
  notesText: { fontSize: 13, color: '#78350f', lineHeight: 18 },
  rejectionBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  rejectionTitle: { fontSize: 12, fontWeight: '700', color: '#991b1b', marginBottom: 3 },
  rejectionText: { fontSize: 13, color: '#7f1d1d', lineHeight: 18 },
});

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  data: VerificationData;
}

function SummaryCard({ data }: SummaryCardProps): ReactElement {
  const statusColors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: '#f5f5f5', fg: '#555' },
    pending: { bg: '#fffbeb', fg: '#92400e' },
    verified: { bg: '#f0fdf4', fg: '#166534' },
    suspended: { bg: '#fef2f2', fg: '#991b1b' },
  };
  const colors = statusColors[data.status] ?? { bg: '#f5f5f5', fg: '#555' };

  return (
    <View style={sumStyles.card}>
      <RNText style={sumStyles.name}>{data.name}</RNText>
      <View style={[sumStyles.badge, { backgroundColor: colors.bg }]}>
        <RNText style={[sumStyles.badgeLabel, { color: colors.fg }]}>
          {t(`verification.status_${data.status}` as Parameters<typeof t>[0])}
        </RNText>
      </View>
      {data.submittedAt && (
        <RNText style={sumStyles.submitted}>
          {t('verification.submitted_at', { date: formatDate(data.submittedAt) })}
        </RNText>
      )}
    </View>
  );
}

const sumStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  name: { fontSize: 20, fontWeight: '800', color: '#111' },
  badge: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 16 },
  badgeLabel: { fontSize: 14, fontWeight: '700' },
  submitted: { fontSize: 13, color: '#888' },
});

// ─── Audit log ────────────────────────────────────────────────────────────────

interface AuditLogProps {
  entries: AuditEntry[];
}

const AUDIT_LABEL: Record<string, string> = {
  submitted: 'أُرسل الطلب للمراجعة',
  verified: 'تم توثيق النشاط',
  suspended: 'تم إيقاف النشاط',
  rejected: 'تم رفض الطلب',
};

function AuditLog({ entries }: AuditLogProps): ReactElement {
  if (entries.length === 0) return <></>;
  return (
    <View style={alStyles.wrap}>
      <RNText style={alStyles.title}>{t('verification.history')}</RNText>
      {[...entries].reverse().map((entry, idx) => (
        <View key={idx} style={alStyles.entry}>
          <View style={alStyles.dot} />
          <View style={alStyles.body}>
            <RNText style={alStyles.action}>
              {AUDIT_LABEL[entry.action] ?? entry.action}
            </RNText>
            <RNText style={alStyles.date}>{formatDate(entry.at)}</RNText>
            {entry.reason && (
              <RNText style={alStyles.reason}>{entry.reason}</RNText>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const alStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  entry: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1565c0', marginTop: 4 },
  body: { flex: 1 },
  action: { fontSize: 14, fontWeight: '600', color: '#222' },
  date: { fontSize: 12, color: '#888', marginTop: 2 },
  reason: { fontSize: 13, color: '#dc2626', marginTop: 4 },
});

// ─── Support section ──────────────────────────────────────────────────────────

function SupportSection(): ReactElement {
  const openSupport = () => {
    void Linking.openURL('https://iraq-maps.app/support');
  };

  return (
    <View style={suppStyles.wrap}>
      <RNText style={suppStyles.title}>{t('verification.support_title')}</RNText>
      <RNText style={suppStyles.body}>{t('verification.support_body')}</RNText>
      <Pressable onPress={openSupport} style={suppStyles.btn}>
        <RNText style={suppStyles.btnLabel}>{t('verification.contact_support')}</RNText>
      </Pressable>
    </View>
  );
}

const suppStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    marginBottom: 32,
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#1e3a5f' },
  body: { fontSize: 13, color: '#1e40af', textAlign: 'center', lineHeight: 20 },
  btn: {
    backgroundColor: '#1565c0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  btnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ─── WebSocket hook ───────────────────────────────────────────────────────────

interface WsMessage {
  type: 'verification.step_updated' | 'verification.approved' | 'verification.rejected';
  step?: VerificationStep;
  notes?: string;
  reason?: string;
}

function useVerificationWs(
  providerId: string | undefined,
  onUpdate: (msg: WsMessage) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!providerId) return;
    // In production: replace with real WS URL from env/config
    const url = `wss://api.iraq-maps.app/v1/ws/providers/${providerId}/verification`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          onUpdateRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Silently fall back to polling
      };

      return () => {
        ws.close();
        wsRef.current = null;
      };
    } catch {
      // WS not available in test env
      return () => undefined;
    }
  }, [providerId]);
}

// ─── Derive current step from provider status ──────────────────────────────────

function deriveStep(status: string): VerificationStep {
  switch (status) {
    case 'verified': return 'approved';
    case 'suspended': return 'rejected';
    case 'pending': return 'reviewing';
    default: return 'submitted';
  }
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export function VerificationStatusScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();

  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const me = expectStatus(await api.providers.me(), 200);
      const step = deriveStep(me.status);
      setData({
        providerId: me.id,
        status: me.status,
        name: me.name,
        submittedAt: null, // full AdminProviderView not available here
        suspensionReason: me.suspensionReason,
        currentStep: step,
        notes: null,
        audit: [],
      });
    } catch {
      setError('تعذّر تحميل حالة التوثيق. تحقق من اتصالك بالإنترنت.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time updates
  useVerificationWs(data?.providerId, (msg) => {
    if (!data) return;
    if (msg.type === 'verification.step_updated' && msg.step) {
      setData((prev) => prev ? { ...prev, currentStep: msg.step!, notes: msg.notes ?? prev.notes } : prev);
    } else if (msg.type === 'verification.approved') {
      setData((prev) => prev ? { ...prev, status: 'verified', currentStep: 'approved' } : prev);
    } else if (msg.type === 'verification.rejected') {
      setData((prev) => prev ? {
        ...prev,
        status: 'suspended',
        currentStep: 'rejected',
        suspensionReason: msg.reason ?? null,
      } : prev);
    }
  });

  if (loading) {
    return (
      <View style={vs.loader}>
        <ActivityIndicator size="large" color="#1565c0" />
        <RNText style={vs.loaderText}>جارٍ تحميل حالة التوثيق…</RNText>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={vs.errorWrap}>
        <RNText style={vs.errorMsg}>{error ?? 'لا توجد بيانات.'}</RNText>
        <Pressable onPress={() => void load()} style={vs.retryBtn}>
          <RNText style={vs.retryBtnLabel}>إعادة المحاولة</RNText>
        </Pressable>
      </View>
    );
  }

  const isRejected = data.status === 'suspended';
  const isApproved = data.status === 'verified';

  return (
    <Screen scroll>
      {/* Header */}
      <RNText style={vs.pageTitle}>{t('verification.title')}</RNText>

      {/* Summary card */}
      <SummaryCard data={data} />

      {/* Approved banner */}
      {isApproved && (
        <View style={vs.approvedBanner}>
          <RNText style={vs.approvedIcon}>🎉</RNText>
          <View style={vs.approvedText}>
            <RNText style={vs.approvedTitle}>نشاطك التجاري موثَّق!</RNText>
            <RNText style={vs.approvedBody}>
              يمكنك الآن إدارة ملفك التعريفي، ونشر المنشورات، واستقبال الرسائل.
            </RNText>
          </View>
        </View>
      )}

      {/* Step tracker */}
      <RNText style={vs.sectionTitle}>مراحل التوثيق</RNText>
      <View style={vs.stepsWrap}>
        {VERIFICATION_STEPS.map((def, idx) => {
          const state =
            isRejected && def.id === 'approved'
              ? ('failed' as StepState)
              : stepStateOf(def.id, data.currentStep, isRejected);
          const isLast = idx === VERIFICATION_STEPS.length - 1;
          return (
            <StepCard
              key={def.id}
              def={def}
              state={state}
              isLast={isLast}
              notes={state === 'active' ? data.notes : null}
              rejectionReason={isRejected ? data.suspensionReason : null}
            />
          );
        })}
      </View>

      {/* Refresh button */}
      <Pressable
        onPress={() => void load(true)}
        style={vs.refreshBtn}
        disabled={refreshing}
      >
        {refreshing
          ? <ActivityIndicator size="small" color="#1565c0" />
          : <RNText style={vs.refreshBtnLabel}>{t('verification.refresh')}</RNText>
        }
      </Pressable>

      {/* Resubmit hint for rejected */}
      {isRejected && (
        <View style={vs.resubmitBox}>
          <RNText style={vs.resubmitHint}>{t('verification.resubmit_hint')}</RNText>
          <Pressable
            onPress={() => router.push('/provider/registration-wizard' as never)}
            style={vs.resubmitBtn}
          >
            <RNText style={vs.resubmitBtnLabel}>{t('verification.resubmit')}</RNText>
          </Pressable>
        </View>
      )}

      {/* Go to dashboard */}
      {isApproved && (
        <Pressable
          onPress={() => router.replace('/provider/dashboard' as never)}
          style={vs.dashBtn}
        >
          <RNText style={vs.dashBtnLabel}>{t('verification.go_dashboard')}</RNText>
        </Pressable>
      )}

      {/* Audit log */}
      <AuditLog entries={data.audit} />

      {/* Support */}
      <SupportSection />
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const vs = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loaderText: { fontSize: 15, color: '#666' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorMsg: { fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 20,
  },
  approvedBanner: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 16,
    gap: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  approvedIcon: { fontSize: 28 },
  approvedText: { flex: 1, gap: 4 },
  approvedTitle: { fontSize: 16, fontWeight: '700', color: '#166534' },
  approvedBody: { fontSize: 13, color: '#166534', lineHeight: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 14,
  },
  stepsWrap: { marginBottom: 16 },
  refreshBtn: {
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 40,
    justifyContent: 'center',
  },
  refreshBtnLabel: { color: '#1565c0', fontSize: 14, fontWeight: '600' },
  resubmitBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 16,
    marginBottom: 16,
    gap: 12,
    alignItems: 'center',
  },
  resubmitHint: { fontSize: 14, color: '#92400e', textAlign: 'center', lineHeight: 22 },
  resubmitBtn: {
    backgroundColor: '#ea580c',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  resubmitBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dashBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  dashBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
