/**
 * ReportScreen — user content-report flow.
 *
 * Steps:
 *  1. Select report reason
 *  2. Optional: add details text + evidence screenshot
 *  3. Confirm → submit
 *  4. Success screen
 *
 * Also shows the user's own report history when opened in 'history' mode.
 */
import { useCallback, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { t as tFn } from '../strings';
import { COLORS, LoadingIndicator } from './shared';
import { useDiscoverClient } from '../client';

// Type-safe wrapper — report keys are added to ar.json but TS inference may lag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = tFn as (key: any, params?: Record<string, string | number>) => string;

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'violence'
  | 'hate_speech'
  | 'misinformation'
  | 'copyright'
  | 'other';

type ReportStep = 'reason' | 'details' | 'confirm' | 'success' | 'history';

export interface ReportScreenProps {
  /** ID of the content being reported */
  contentId: string;
  /** Type: 'post' | 'comment' | 'listing' | 'story' | 'user' */
  contentType: string;
  /** Logged-in user's ID */
  reporterId: string;
  /** Start in history mode to show the user's own reports */
  mode?: 'report' | 'history';
  onClose: () => void;
}

interface PastReport {
  id: string;
  contentType: string;
  reason: ReportReason;
  status: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REASONS: { value: ReportReason; icon: string }[] = [
  { value: 'spam',           icon: '🚫' },
  { value: 'inappropriate',  icon: '⚠️' },
  { value: 'violence',       icon: '🔴' },
  { value: 'hate_speech',    icon: '💬' },
  { value: 'misinformation', icon: '❌' },
  { value: 'copyright',      icon: '©️' },
  { value: 'other',          icon: '•' },
];

const STATUS_COLORS: Record<string, string> = {
  pending:   '#F57C00',
  approved:  '#388E3C',
  removed:   '#C62828',
  dismissed: '#9E9E9E',
  warned:    '#1565C0',
  suspended: '#6A1B9A',
  banned:    '#B71C1C',
};

// ─── Sub-screens ──────────────────────────────────────────────────────────────

function ReasonSelector({
  selected,
  onSelect,
}: {
  selected: ReportReason | null;
  onSelect: (r: ReportReason) => void;
}): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('report.reasonTitle')}</Text>
      {REASONS.map(({ value, icon }) => (
        <Pressable
          key={value}
          style={[styles.reasonRow, selected === value && styles.reasonRowSelected]}
          onPress={() => onSelect(value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === value }}
        >
          <Text style={styles.reasonIcon}>{icon}</Text>
          <Text style={[styles.reasonLabel, selected === value && styles.reasonLabelSelected]}>
            {t(`report.reason.${value}` as Parameters<typeof t>[0])}
          </Text>
          {selected === value && (
            <View style={styles.radioActive} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

function DetailsEditor({
  details,
  onChangeDetails,
  evidenceUri,
  onPickEvidence,
  onRemoveEvidence,
}: {
  details: string;
  onChangeDetails: (v: string) => void;
  evidenceUri: string | null;
  onPickEvidence: () => void;
  onRemoveEvidence: () => void;
}): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('report.detailsTitle')}</Text>
      <TextInput
        style={styles.detailsInput}
        value={details}
        onChangeText={onChangeDetails}
        placeholder={t('report.detailsPlaceholder')}
        placeholderTextColor={COLORS.textMuted}
        multiline
        maxLength={500}
        accessibilityLabel={t('report.detailsTitle')}
      />
      <Text style={styles.charCount}>{details.length}/500</Text>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('report.evidenceTitle')}</Text>
      <Text style={styles.evidenceHint}>{t('report.evidenceHint')}</Text>

      {evidenceUri ? (
        <View style={styles.evidencePreview}>
          <Image
            source={{ uri: evidenceUri }}
            style={styles.evidenceImage}
            resizeMode="cover"
            accessibilityLabel={t('report.evidencePreviewA11y')}
          />
          <Pressable
            style={styles.removeEvidenceBtn}
            onPress={onRemoveEvidence}
            accessibilityRole="button"
            accessibilityLabel={t('report.removeEvidence')}
          >
            <Text style={styles.removeEvidenceText}>{t('report.removeEvidence')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.pickEvidenceBtn}
          onPress={onPickEvidence}
          accessibilityRole="button"
          accessibilityLabel={t('report.pickEvidence')}
        >
          <Text style={styles.pickEvidenceText}>{t('report.pickEvidence')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ConfirmScreen({
  reason,
  details,
  evidenceUri,
  submitting,
  onConfirm,
  onBack,
}: {
  reason: ReportReason;
  details: string;
  evidenceUri: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('report.confirmTitle')}</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('report.confirmReason')}</Text>
          <Text style={styles.summaryValue}>
            {t(`report.reason.${reason}` as Parameters<typeof t>[0])}
          </Text>
        </View>
        {details.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('report.confirmDetails')}</Text>
            <Text style={styles.summaryValue} numberOfLines={3}>{details}</Text>
          </View>
        )}
        {evidenceUri && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('report.confirmEvidence')}</Text>
            <Image
              source={{ uri: evidenceUri }}
              style={styles.confirmThumb}
              resizeMode="cover"
            />
          </View>
        )}
      </View>

      <Text style={styles.confirmNote}>{t('report.confirmNote')}</Text>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={onBack}
          disabled={submitting}
          accessibilityRole="button"
        >
          <Text style={styles.btnSecondaryText}>{t('report.back')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnDanger, submitting && styles.btnDisabled]}
          onPress={onConfirm}
          disabled={submitting}
          accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={styles.btnText}>{t('report.submit')}</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

function SuccessScreen({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <View style={[styles.section, styles.successContainer]}>
      <Text style={styles.successIcon}>✅</Text>
      <Text style={styles.successTitle}>{t('report.successTitle')}</Text>
      <Text style={styles.successBody}>{t('report.successBody')}</Text>
      <Pressable
        style={[styles.btn, styles.btnPrimary]}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>{t('report.close')}</Text>
      </Pressable>
    </View>
  );
}

function HistoryItem({ item }: { item: PastReport }): ReactElement {
  const statusColor = STATUS_COLORS[item.status] ?? COLORS.textSecondary;
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyReason}>
          {t(`report.reason.${item.reason}` as Parameters<typeof t>[0])}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {t(`report.status.${item.status}` as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>
      <Text style={styles.historyMeta}>
        {item.contentType} · {new Date(item.createdAt).toLocaleDateString('ar-IQ')}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReportScreen({
  contentId,
  contentType,
  reporterId,
  mode = 'report',
  onClose,
}: ReportScreenProps): ReactElement {
  const client = useDiscoverClient();

  const [step, setStep] = useState<ReportStep>(mode === 'history' ? 'history' : 'reason');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<PastReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load history on mount if in history mode
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      // Use the generic reports endpoint filtered by reporterId
      const res = await fetch(`/api/moderation/reports?reporterId=${reporterId}`);
      if (res.ok) {
        const data = (await res.json()) as { items: PastReport[] };
        setHistory(data.items);
      }
    } catch {
      // silently fail — history is optional
    } finally {
      setHistoryLoading(false);
    }
  }, [reporterId]);

  // Auto-load when in history mode
  useState(() => {
    if (mode === 'history') {
      void loadHistory();
    }
  });

  const handlePickEvidence = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('report.permissionDeniedTitle'), t('report.permissionDeniedBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setEvidenceUri(result.assets[0].uri);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      // Post via fetch to the moderation endpoint
      const body = {
        reporterId,
        contentId,
        contentType,
        reason,
        details: details.trim() || undefined,
      };
      const res = await fetch('/api/moderation/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('submit failed');
      setStep('success');
    } catch {
      Alert.alert(t('report.errorTitle'), t('report.errorBody'));
    } finally {
      setSubmitting(false);
    }
  }, [reason, details, evidenceUri, reporterId, contentId, contentType]);

  const handleReasonNext = useCallback(() => {
    if (!reason) return;
    setStep('details');
  }, [reason]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('report.close')}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {step === 'history' ? t('report.historyTitle') : t('report.title')}
        </Text>
        {mode === 'report' && step !== 'history' && (
          <Pressable
            style={styles.historyLink}
            onPress={() => { void loadHistory(); setStep('history'); }}
            accessibilityRole="button"
          >
            <Text style={styles.historyLinkText}>{t('report.myReports')}</Text>
          </Pressable>
        )}
        {step === 'history' && (
          <Pressable
            style={styles.historyLink}
            onPress={() => setStep('reason')}
            accessibilityRole="button"
          >
            <Text style={styles.historyLinkText}>{t('report.newReport')}</Text>
          </Pressable>
        )}
      </View>

      {/* Step indicator (not shown in history or success) */}
      {step !== 'history' && step !== 'success' && (
        <View style={styles.stepRow}>
          {(['reason', 'details', 'confirm'] as const).map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                step === s && styles.stepDotActive,
                (step === 'details' && i === 0) || (step === 'confirm' && i <= 1)
                  ? styles.stepDotDone
                  : null,
              ]}
            />
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 'reason' && (
          <>
            <ReasonSelector selected={reason} onSelect={setReason} />
            <Pressable
              style={[styles.btn, styles.btnPrimary, !reason && styles.btnDisabled]}
              onPress={handleReasonNext}
              disabled={!reason}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>{t('report.next')}</Text>
            </Pressable>
          </>
        )}

        {step === 'details' && (
          <>
            <DetailsEditor
              details={details}
              onChangeDetails={setDetails}
              evidenceUri={evidenceUri}
              onPickEvidence={() => { void handlePickEvidence(); }}
              onRemoveEvidence={() => setEvidenceUri(null)}
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => setStep('reason')}
                accessibilityRole="button"
              >
                <Text style={styles.btnSecondaryText}>{t('report.back')}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => setStep('confirm')}
                accessibilityRole="button"
              >
                <Text style={styles.btnText}>{t('report.next')}</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 'confirm' && reason && (
          <ConfirmScreen
            reason={reason}
            details={details}
            evidenceUri={evidenceUri}
            submitting={submitting}
            onConfirm={() => { void handleSubmit(); }}
            onBack={() => setStep('details')}
          />
        )}

        {step === 'success' && <SuccessScreen onClose={onClose} />}

        {step === 'history' && (
          <View style={styles.section}>
            {historyLoading ? (
              <LoadingIndicator />
            ) : history.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('report.historyEmpty')}</Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <HistoryItem item={item} />}
                scrollEnabled={false}
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  historyLink: {
    paddingHorizontal: 8,
  },
  historyLinkText: {
    color: 'rgba(255,255,255,.85)',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.border,
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
    borderRadius: 5,
  },
  stepDotDone: {
    backgroundColor: COLORS.primaryLight,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: 'auto',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 8,
    gap: 10,
  },
  reasonRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryXLight,
  },
  reasonIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  reasonLabelSelected: {
    color: COLORS.primaryDark,
    fontWeight: '600',
  },
  radioActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  detailsInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    textAlign: 'auto',
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right' as const,
    marginTop: 4,
  },
  evidenceHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
    textAlign: 'auto',
  },
  pickEvidenceBtn: {
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  pickEvidenceText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  evidencePreview: {
    gap: 8,
  },
  evidenceImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    // Blur is handled at display level — sensitive content
    opacity: 0.85,
  },
  removeEvidenceBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.errorBg,
  },
  removeEvidenceText: {
    fontSize: 13,
    color: COLORS.error,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  summaryLabel: {
    width: 90,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'auto',
  },
  summaryValue: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
    textAlign: 'auto',
  },
  confirmThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  confirmNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 20,
    textAlign: 'auto',
    lineHeight: 18,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  successIcon: {
    fontSize: 48,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.success,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  historyCard: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderStartWidth: 3,
    borderStartColor: COLORS.primary,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyReason: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'auto',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
  },
  btnDanger: {
    backgroundColor: COLORS.error,
  },
  btnSecondary: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondaryText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
