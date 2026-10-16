import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Button, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  Text as RNText,
  Linking,
} from 'react-native';
import { expectStatus, useRequest } from '../request';
import { t } from '../strings';

// ─── Types ───────────────────────────────────────────────────────────────────

type VerificationStatus = 'draft' | 'pending' | 'under_review' | 'verified' | 'suspended';

interface AuditEntry {
  action: string;
  actorUserId: string;
  reason: string | null;
  at: string;
}

interface ProviderVerificationData {
  id: string;
  status: VerificationStatus;
  name: string;
  submittedAt: string | null;
  suspensionReason: string | null;
  audit: AuditEntry[];
}

type DocType = 'trade_license' | 'national_id' | 'lease_agreement' | 'health_certificate';

interface DocRequirement {
  type: DocType;
  label: string;
  description: string;
  required: boolean;
  uploaded: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORT_PHONE = '+9647801234567';

const DOC_REQUIREMENTS: Omit<DocRequirement, 'uploaded'>[] = [
  {
    type: 'trade_license',
    label: t('verification.doc_trade_license'),
    description: t('verification.doc_trade_license_desc'),
    required: true,
  },
  {
    type: 'national_id',
    label: t('verification.doc_national_id'),
    description: t('verification.doc_national_id_desc'),
    required: true,
  },
  {
    type: 'lease_agreement',
    label: t('verification.doc_lease'),
    description: t('verification.doc_lease_desc'),
    required: false,
  },
  {
    type: 'health_certificate',
    label: t('verification.doc_health_cert'),
    description: t('verification.doc_health_cert_desc'),
    required: false,
  },
];

// ─── Status card ─────────────────────────────────────────────────────────────

interface StatusCardProps {
  status: VerificationStatus;
  submittedAt: string | null;
  suspensionReason: string | null;
}

function StatusCard({ status, submittedAt, suspensionReason }: StatusCardProps): ReactElement {
  const config: Record<
    VerificationStatus,
    { icon: string; color: string; bg: string; title: string; body: string }
  > = {
    draft: {
      icon: '📝',
      color: '#555',
      bg: '#f5f5f5',
      title: t('verification.status_draft'),
      body: t('verification.status_draft_body'),
    },
    pending: {
      icon: '⏳',
      color: '#b45309',
      bg: '#fffbeb',
      title: t('verification.status_pending'),
      body: t('verification.status_pending_body'),
    },
    under_review: {
      icon: '🔍',
      color: '#1d4ed8',
      bg: '#eff6ff',
      title: t('verification.status_under_review'),
      body: t('verification.status_under_review_body'),
    },
    verified: {
      icon: '✅',
      color: '#166534',
      bg: '#f0fdf4',
      title: t('verification.status_verified'),
      body: t('verification.status_verified_body'),
    },
    suspended: {
      icon: '🚫',
      color: '#991b1b',
      bg: '#fef2f2',
      title: t('verification.status_suspended'),
      body: t('verification.status_suspended_body'),
    },
  };

  const cfg = config[status];

  return (
    <View style={[styles.statusCard, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
      <RNText style={styles.statusIcon}>{cfg.icon}</RNText>
      <View style={styles.statusTextWrap}>
        <RNText style={[styles.statusTitle, { color: cfg.color }]}>{cfg.title}</RNText>
        <RNText style={styles.statusBody}>{cfg.body}</RNText>

        {status === 'pending' && submittedAt && (
          <RNText style={styles.statusMeta}>
            {t('verification.submitted_at', {
              date: new Date(submittedAt).toLocaleDateString('ar-IQ'),
            })}
          </RNText>
        )}

        {status === 'suspended' && suspensionReason && (
          <View style={styles.rejectionBox}>
            <RNText style={styles.rejectionLabel}>{t('verification.rejection_reason')}</RNText>
            <RNText style={styles.rejectionText}>{suspensionReason}</RNText>
          </View>
        )}

        {(status === 'pending' || status === 'under_review') && (
          <RNText style={styles.etaText}>{t('verification.eta')}</RNText>
        )}
      </View>
    </View>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: DocRequirement;
  onUpload: (type: DocType) => void;
  uploading: boolean;
}

function DocRow({ doc, onUpload, uploading }: DocRowProps): ReactElement {
  return (
    <View style={styles.docRow}>
      <View style={styles.docInfo}>
        <View style={styles.docHeader}>
          <RNText style={styles.docLabel}>{doc.label}</RNText>
          {doc.required && (
            <View style={styles.requiredBadge}>
              <RNText style={styles.requiredBadgeText}>{t('verification.required')}</RNText>
            </View>
          )}
          {doc.uploaded && (
            <View style={styles.uploadedBadge}>
              <RNText style={styles.uploadedBadgeText}>{t('verification.uploaded')}</RNText>
            </View>
          )}
        </View>
        <RNText style={styles.docDesc}>{doc.description}</RNText>
      </View>
      <Pressable
        onPress={() => onUpload(doc.type)}
        disabled={uploading}
        style={[styles.uploadBtn, doc.uploaded && styles.uploadBtnDone]}
        accessibilityRole="button"
        accessibilityLabel={t('verification.upload_doc', { label: doc.label })}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <RNText style={styles.uploadBtnText}>
            {doc.uploaded ? t('verification.re_upload') : t('verification.upload')}
          </RNText>
        )}
      </Pressable>
    </View>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineProps {
  entries: AuditEntry[];
}

function Timeline({ entries }: TimelineProps): ReactElement {
  if (entries.length === 0) return <></>;

  const actionLabel: Record<string, string> = {
    submitted: t('verification.audit_submitted'),
    verified: t('verification.audit_verified'),
    suspended: t('verification.audit_suspended'),
    rejected: t('verification.audit_rejected'),
  };

  return (
    <View style={styles.timeline}>
      <RNText style={styles.sectionTitle}>{t('verification.history')}</RNText>
      {entries.map((entry, idx) => (
        <View key={idx} style={styles.timelineEntry}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <RNText style={styles.timelineAction}>
              {actionLabel[entry.action] ?? entry.action}
            </RNText>
            {entry.reason && (
              <RNText style={styles.timelineReason}>{entry.reason}</RNText>
            )}
            {/* eslint-disable i18next/no-literal-string */}
            <RNText style={styles.timelineDate}>
              {new Date(entry.at).toLocaleDateString('ar-IQ', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </RNText>
            {/* eslint-enable i18next/no-literal-string */}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProviderVerificationScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();
  const { busy, error, run } = useRequest();

  const [data, setData] = useState<ProviderVerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Set<DocType>>(new Set());
  const [flashMsg, setFlashMsg] = useState('');

  const flash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(''), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = expectStatus(await api.providers.me(), 200);
      setData({
        id: me.id,
        status: (me.status as VerificationStatus) ?? 'draft',
        name: me.name,
        submittedAt: null,
        suspensionReason: me.suspensionReason ?? null,
        audit: [],
      });
    } catch {
      // silently ignore — will show empty state
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUploadDoc = async (docType: DocType) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingDoc(docType);
    try {
      // In production this would upload to object storage and register the URL
      // For now we record locally that the doc was uploaded (stub)
      await new Promise((r) => setTimeout(r, 800));
      setUploadedDocs((prev) => new Set([...prev, docType]));
      flash(t('verification.upload_success'));
    } catch {
      flash(t('verification.upload_failed'));
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleResubmit = () =>
    run(async () => {
      if (!data) return;
      await api.providers.submit();
      flash(t('verification.resubmit_success'));
      await load();
    });

  const handleContactSupport = () => {
    void Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleGoToDashboard = () => {
    router.push('/provider/dashboard' as never);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
        </View>
      </Screen>
    );
  }

  const docs: DocRequirement[] = DOC_REQUIREMENTS.map((d) => ({
    ...d,
    uploaded: uploadedDocs.has(d.type),
  }));

  const canResubmit = data?.status === 'suspended';
  const isVerified = data?.status === 'verified';

  return (
    <Screen scroll>
      <Text variant="title">{t('verification.title')}</Text>

      {error && <Banner kind="error" message={error} />}
      {flashMsg ? <Banner kind="success" message={flashMsg} /> : null}

      {data && (
        <StatusCard
          status={data.status}
          submittedAt={data.submittedAt}
          suspensionReason={data.suspensionReason}
        />
      )}

      {/* Verified — go to dashboard */}
      {isVerified && (
        <Button
          variant="primary"
          label={t('verification.go_dashboard')}
          onPress={handleGoToDashboard}
        />
      )}

      {/* Documents section — shown unless already verified */}
      {!isVerified && (
        <>
          <RNText style={styles.sectionTitle}>{t('verification.docs_title')}</RNText>
          <RNText style={styles.sectionBody}>{t('verification.docs_body')}</RNText>

          {docs.map((doc) => (
            <DocRow
              key={doc.type}
              doc={doc}
              onUpload={(type) => void handleUploadDoc(type)}
              uploading={uploadingDoc === doc.type}
            />
          ))}
        </>
      )}

      {/* Re-submit after rejection */}
      {canResubmit && (
        <View style={styles.resubmitSection}>
          <RNText style={styles.resubmitHint}>{t('verification.resubmit_hint')}</RNText>
          <Button
            variant="primary"
            label={t('verification.resubmit')}
            onPress={handleResubmit}
            disabled={busy}
          />
        </View>
      )}

      {/* Audit history */}
      {data && data.audit.length > 0 && <Timeline entries={data.audit} />}

      {/* Support contact */}
      <View style={styles.supportSection}>
        <RNText style={styles.supportTitle}>{t('verification.support_title')}</RNText>
        <RNText style={styles.supportBody}>{t('verification.support_body')}</RNText>
        <Button
          variant="secondary"
          label={t('verification.contact_support')}
          onPress={handleContactSupport}
        />
      </View>

      {/* Refresh */}
      <View style={styles.refreshWrap}>
        <Pressable
          onPress={() => void load()}
          style={styles.refreshBtn}
          accessibilityRole="button"
        >
          <RNText style={styles.refreshText}>{t('verification.refresh')}</RNText>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },

  statusCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginVertical: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  statusIcon: { fontSize: 28, lineHeight: 34 },
  statusTextWrap: { flex: 1, gap: 4 },
  statusTitle: { fontSize: 17, fontWeight: '700' },
  statusBody: { fontSize: 14, color: '#444', lineHeight: 20 },
  statusMeta: { fontSize: 13, color: '#777', marginTop: 4 },
  etaText: { fontSize: 13, color: '#555', marginTop: 6, fontStyle: 'italic' },

  rejectionBox: {
    marginTop: 8,
    backgroundColor: '#fff1f1',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  rejectionLabel: { fontSize: 12, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  rejectionText: { fontSize: 14, color: '#7f1d1d' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 20, marginBottom: 6 },
  sectionBody: { fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 20 },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  docInfo: { flex: 1, gap: 4 },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  docLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  docDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
  requiredBadge: { backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  requiredBadgeText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  uploadedBadge: { backgroundColor: '#dcfce7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  uploadedBadgeText: { fontSize: 11, color: '#16a34a', fontWeight: '600' },

  uploadBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  uploadBtnDone: { backgroundColor: '#15803d' },
  uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  timeline: { marginTop: 24, gap: 0 },
  timelineEntry: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565c0',
    marginTop: 4,
    flexShrink: 0,
  },
  timelineContent: { flex: 1, gap: 2 },
  timelineAction: { fontSize: 14, fontWeight: '600', color: '#111' },
  timelineReason: { fontSize: 13, color: '#666' },
  timelineDate: { fontSize: 12, color: '#888', marginTop: 2 },

  resubmitSection: {
    marginTop: 20,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  resubmitHint: { fontSize: 14, color: '#92400e', lineHeight: 20 },

  supportSection: {
    marginTop: 28,
    backgroundColor: '#f8faff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  supportTitle: { fontSize: 15, fontWeight: '700', color: '#1e3a5f' },
  supportBody: { fontSize: 14, color: '#374151', lineHeight: 20 },

  refreshWrap: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
  refreshBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  refreshText: { fontSize: 14, color: '#1565c0', textDecorationLine: 'underline' },
});
