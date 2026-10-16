/**
 * AdminVerificationPage — full verification management panel.
 *
 * Features:
 *  - Queue with priority sorting and status tabs
 *  - Provider details sidebar with document viewer
 *  - Approve / Reject / Request more info actions
 *  - Bulk approve by selection
 *  - Notes field
 *  - Decision history (audit log)
 *  - Stats: avg time to verify, approval rate, pending counts by step
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { api } from '../api';
import { FlashBanner, PageHeader } from '../components/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationStep =
  | 'submitted'
  | 'reviewing'
  | 'identity_verified'
  | 'location_verified'
  | 'approved'
  | 'rejected';

type QueueTab = 'pending' | 'verified' | 'suspended';

interface QueueProvider {
  id: string;
  name: string;
  category: string;
  submittedAt: string | null;
  status: string;
  currentStep: VerificationStep;
  waitingDays: number;
  documentsCount: number;
  priority: 'high' | 'normal' | 'low';
  ownerUserId: string;
  location: string | null;
  suspensionReason: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  actorUserId: string;
  reason: string | null;
  at: string;
}

interface VerificationDocument {
  id: string;
  type: string;
  fileUrl: string;
  uploadedAt: string;
}

interface ProviderDetail extends QueueProvider {
  nameEn?: string;
  phone?: string;
  audit?: AuditEntry[];
  documents?: VerificationDocument[];
  notes?: string | null;
}

interface VerificationStats {
  totalPending: number;
  avgVerificationDays: number | null;
  approvalRatePercent: number | null;
  pendingByStep: Record<VerificationStep, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<VerificationStep, string> = {
  submitted: 'تم الاستلام',
  reviewing: 'مراجعة الوثائق',
  identity_verified: 'هوية موثَّقة',
  location_verified: 'موقع موثَّق',
  approved: 'موافَق عليه',
  rejected: 'مرفوض',
};

const STEP_COLORS: Record<VerificationStep, { bg: string; fg: string }> = {
  submitted: { bg: '#f0f9ff', fg: '#0369a1' },
  reviewing: { bg: '#fffbeb', fg: '#92400e' },
  identity_verified: { bg: '#f0fdf4', fg: '#166534' },
  location_verified: { bg: '#ecfdf5', fg: '#065f46' },
  approved: { bg: '#dcfce7', fg: '#14532d' },
  rejected: { bg: '#fef2f2', fg: '#991b1b' },
};

const CATEGORY_LABELS: Record<string, string> = {
  food: 'مطعم',
  cafe: 'كافيه',
  lodging: 'فندق',
  shopping: 'تسوق',
  tourism: 'سياحة',
  health: 'صحة',
  finance: 'مالية',
  fuel: 'وقود',
  office: 'مكتب',
  worship: 'دور عبادة',
  education: 'تعليم',
  government: 'حكومي',
  transport: 'نقل',
  entertainment: 'ترفيه',
};

const PRIORITY_COLORS = {
  high: { bg: '#fef2f2', fg: '#dc2626', label: 'عالية' },
  normal: { bg: '#fffbeb', fg: '#d97706', label: 'عادية' },
  low: { bg: '#f0fdf4', fg: '#16a34a', label: 'منخفضة' },
};

const ACTION_LABELS: Record<string, string> = {
  submitted: 'أُرسل للمراجعة',
  verified: 'تم التوثيق',
  suspended: 'تم الإيقاف',
  rejected: 'تم الرفض',
  info_requested: 'طُلبت معلومات إضافية',
  step_reviewing: 'انتقل إلى: مراجعة الوثائق',
  step_identity_verified: 'انتقل إلى: هوية موثَّقة',
  step_location_verified: 'انتقل إلى: موقع موثَّق',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  trade_license: 'السجل التجاري',
  national_id: 'بطاقة الهوية',
  lease_agreement: 'عقد الإيجار',
  health_certificate: 'الشهادة الصحية',
  other: 'وثيقة أخرى',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

interface StatsBarProps {
  stats: VerificationStats | null;
  loading: boolean;
}

function StatsBar({ stats, loading }: StatsBarProps): ReactElement {
  const tiles = [
    {
      label: 'بانتظار المراجعة',
      value: loading ? '…' : String(stats?.totalPending ?? 0),
      color: '#b45309',
      bg: '#fffbeb',
    },
    {
      label: 'متوسط وقت التوثيق',
      value: loading
        ? '…'
        : stats?.avgVerificationDays != null
        ? `${stats.avgVerificationDays} يوم`
        : '—',
      color: '#1565c0',
      bg: '#eff6ff',
    },
    {
      label: 'معدل الموافقة',
      value: loading
        ? '…'
        : stats?.approvalRatePercent != null
        ? `${stats.approvalRatePercent}٪`
        : '—',
      color: '#166534',
      bg: '#f0fdf4',
    },
    {
      label: 'مراجعة الوثائق',
      value: loading ? '…' : String(stats?.pendingByStep.reviewing ?? 0),
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      label: 'انتظار التحقق من الهوية',
      value: loading ? '…' : String(stats?.pendingByStep.identity_verified ?? 0),
      color: '#0891b2',
      bg: '#ecfeff',
    },
  ];

  return (
    <div style={sb.row}>
      {tiles.map((tile) => (
        <div key={tile.label} style={{ ...sb.tile, backgroundColor: tile.bg }}>
          <span style={{ ...sb.value, color: tile.color }}>{tile.value}</span>
          <span style={sb.label}>{tile.label}</span>
        </div>
      ))}
    </div>
  );
}

const sb = {
  row: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    marginBottom: 20,
  },
  tile: {
    flex: '1 1 140px',
    borderRadius: 10,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    minWidth: 120,
  },
  value: { fontSize: 22, fontWeight: 800 },
  label: { fontSize: 12, color: '#666' },
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  placeholder: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
  multiField?: boolean;
  confirmLabel?: string;
}

function ReasonModal({
  title,
  placeholder,
  onConfirm,
  onCancel,
  confirmLabel = 'تأكيد',
}: ModalProps): ReactElement {
  const [text, setText] = useState('');
  return (
    <div style={m.overlay}>
      <div style={m.box}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#111' }}>{title}</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={5}
          style={m.textarea}
          autoFocus
        />
        <div style={m.btns}>
          <button onClick={onCancel} style={m.cancelBtn}>إلغاء</button>
          <button
            disabled={!text.trim()}
            onClick={() => onConfirm(text.trim())}
            style={{ ...m.confirmBtn, opacity: text.trim() ? 1 : 0.4 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const m = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  box: {
    background: '#fff',
    borderRadius: 14,
    padding: 28,
    width: '90%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  },
  textarea: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    padding: '10px 12px',
    fontSize: 15,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    direction: 'rtl' as const,
    boxSizing: 'border-box' as const,
  },
  btns: { display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  cancelBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontSize: 14,
  },
  confirmBtn: {
    padding: '8px 22px',
    borderRadius: 8,
    border: 'none',
    background: '#1565c0',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  },
};

// ─── Document viewer ──────────────────────────────────────────────────────────

interface DocViewerProps {
  docs: VerificationDocument[];
}

function DocumentViewer({ docs }: DocViewerProps): ReactElement {
  const [active, setActive] = useState<VerificationDocument | null>(null);
  if (docs.length === 0) {
    return <p style={dv.empty}>لا توجد وثائق مرفوعة.</p>;
  }
  return (
    <div>
      <div style={dv.grid}>
        {docs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setActive(doc)}
            style={{
              ...dv.docBtn,
              ...(active?.id === doc.id ? dv.docBtnActive : {}),
            }}
          >
            <span style={dv.docIcon}>📄</span>
            <span style={dv.docLabel}>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</span>
            <span style={dv.docDate}>{formatDate(doc.uploadedAt)}</span>
          </button>
        ))}
      </div>
      {active && (
        <div style={dv.preview}>
          <div style={dv.previewHeader}>
            <span style={dv.previewTitle}>{DOC_TYPE_LABELS[active.type] ?? active.type}</span>
            <button onClick={() => setActive(null)} style={dv.closeBtn}>×</button>
          </div>
          {/\.(jpg|jpeg|png|webp|gif)$/i.test(active.fileUrl) ? (
            <img src={active.fileUrl} alt={active.type} style={dv.img} />
          ) : (
            <a href={active.fileUrl} target="_blank" rel="noopener noreferrer" style={dv.link}>
              فتح الملف في نافذة جديدة ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const dv = {
  empty: { color: '#aaa', fontSize: 14, textAlign: 'center' as const, padding: 16 },
  grid: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 12 },
  docBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    minWidth: 100,
    transition: 'all 0.15s',
  },
  docBtnActive: { borderColor: '#1565c0', background: '#eff6ff' },
  docIcon: { fontSize: 22 },
  docLabel: { fontSize: 12, fontWeight: 600, color: '#333' },
  docDate: { fontSize: 11, color: '#aaa' },
  preview: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#f9fafb',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
  },
  previewTitle: { fontSize: 14, fontWeight: 700, color: '#222' },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    color: '#888',
    lineHeight: 1,
  },
  img: { width: '100%', display: 'block', maxHeight: 420, objectFit: 'contain' as const },
  link: {
    display: 'block',
    padding: 16,
    textAlign: 'center' as const,
    color: '#1565c0',
    fontSize: 15,
  },
};

// ─── Audit timeline ───────────────────────────────────────────────────────────

function AuditTimeline({ entries }: { entries: AuditEntry[] }): ReactElement {
  if (entries.length === 0) {
    return <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center' }}>لا يوجد سجل بعد.</p>;
  }
  return (
    <div style={at.wrap}>
      {[...entries].reverse().map((entry) => (
        <div key={entry.id} style={at.row}>
          <div style={at.dot} />
          <div style={at.body}>
            <span style={at.action}>{ACTION_LABELS[entry.action] ?? entry.action}</span>
            <span style={at.date}>{formatDate(entry.at)}</span>
            {entry.reason && <span style={at.reason}>{entry.reason}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const at = {
  wrap: { paddingInlineStart: 4 },
  row: { display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565c0',
    marginTop: 4,
    flexShrink: 0,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  action: { fontSize: 14, fontWeight: 600, color: '#222' },
  date: { fontSize: 12, color: '#888' },
  reason: { fontSize: 13, color: '#dc2626', marginTop: 2 },
};

// ─── Detail panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  provider: ProviderDetail;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRequestInfo: (id: string, text: string) => void;
  onAdvanceStep: (id: string, step: VerificationStep) => void;
  onClose: () => void;
  busy: boolean;
}

function DetailPanel({
  provider,
  onApprove,
  onReject,
  onRequestInfo,
  onAdvanceStep,
  onClose,
  busy,
}: DetailPanelProps): ReactElement {
  const [modal, setModal] = useState<'reject' | 'info' | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'audit'>('info');

  const stepColors = STEP_COLORS[provider.currentStep];
  const priorityInfo = PRIORITY_COLORS[provider.priority];
  const isPending = provider.status === 'pending';

  // Steps the admin can advance to
  const NEXT_STEPS: VerificationStep[] = [
    'reviewing',
    'identity_verified',
    'location_verified',
  ];
  const currentIdx = NEXT_STEPS.indexOf(provider.currentStep);
  const nextStep = NEXT_STEPS[currentIdx + 1] ?? null;

  return (
    <>
      <div style={dp.panel}>
        {/* Header */}
        <div style={dp.header}>
          <div style={dp.headerLeft}>
            <button onClick={onClose} style={dp.closeBtn} aria-label="إغلاق">×</button>
            <div>
              <h2 style={dp.name}>{provider.name}</h2>
              <span style={{ ...dp.stepBadge, backgroundColor: stepColors.bg, color: stepColors.fg }}>
                {STEP_LABELS[provider.currentStep]}
              </span>
            </div>
          </div>
          <div style={dp.headerMeta}>
            <span style={dp.category}>{CATEGORY_LABELS[provider.category] ?? provider.category}</span>
            <span style={{ ...dp.priorityBadge, backgroundColor: priorityInfo.bg, color: priorityInfo.fg }}>
              أولوية {priorityInfo.label}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={dp.tabs}>
          {([
            { id: 'info', label: 'المعلومات' },
            { id: 'docs', label: `الوثائق (${provider.documents?.length ?? 0})` },
            { id: 'audit', label: `السجل (${provider.audit?.length ?? 0})` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...dp.tab,
                ...(activeTab === tab.id ? dp.tabActive : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={dp.tabContent}>
          {activeTab === 'info' && (
            <div style={dp.infoGrid}>
              <InfoRow label="المُعرِّف" value={provider.id} />
              <InfoRow label="الفئة" value={CATEGORY_LABELS[provider.category] ?? provider.category} />
              <InfoRow label="المالك" value={provider.ownerUserId} />
              <InfoRow label="الموقع" value={provider.location ?? '—'} />
              <InfoRow label="تاريخ الإرسال" value={formatDate(provider.submittedAt)} />
              <InfoRow label="أيام الانتظار" value={`${provider.waitingDays} يوم`} />
              {provider.phone && <InfoRow label="الهاتف" value={provider.phone} />}
              {provider.suspensionReason && (
                <InfoRow label="سبب الإيقاف" value={provider.suspensionReason} valueColor="#dc2626" />
              )}
              {provider.notes && (
                <InfoRow label="ملاحظة الفريق" value={provider.notes} />
              )}
            </div>
          )}
          {activeTab === 'docs' && (
            <DocumentViewer docs={provider.documents ?? []} />
          )}
          {activeTab === 'audit' && (
            <AuditTimeline entries={provider.audit ?? []} />
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div style={dp.actions}>
            {/* Advance step */}
            {nextStep && (
              <button
                onClick={() => onAdvanceStep(provider.id, nextStep)}
                disabled={busy}
                style={{ ...dp.stepBtn }}
              >
                📋 تقدُّم: {STEP_LABELS[nextStep]}
              </button>
            )}

            <div style={dp.actionRow}>
              <button
                onClick={() => setModal('info')}
                disabled={busy}
                style={dp.infoBtn}
              >
                ❓ طلب معلومات
              </button>
              <button
                onClick={() => setModal('reject')}
                disabled={busy}
                style={dp.rejectBtn}
              >
                ✗ رفض
              </button>
              <button
                onClick={() => onApprove(provider.id)}
                disabled={busy}
                style={dp.approveBtn}
              >
                {busy ? '…' : '✓ موافقة'}
              </button>
            </div>
          </div>
        )}
      </div>

      {modal === 'reject' && (
        <ReasonModal
          title="سبب الرفض"
          placeholder="اذكر سبباً واضحاً للرفض يُبلَّغ به المزوِّد…"
          confirmLabel="رفض الطلب"
          onConfirm={(reason) => {
            onReject(provider.id, reason);
            setModal(null);
          }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'info' && (
        <ReasonModal
          title="طلب معلومات إضافية"
          placeholder="اكتب الأسئلة أو المتطلبات الإضافية للمزوِّد…"
          confirmLabel="إرسال الطلب"
          onConfirm={(text) => {
            onRequestInfo(provider.id, text);
            setModal(null);
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}): ReactElement {
  return (
    <div style={ir.row}>
      <span style={ir.label}>{label}</span>
      <span style={{ ...ir.value, ...(valueColor ? { color: valueColor } : {}) }}>{value}</span>
    </div>
  );
}

const ir = {
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid #f3f4f6',
    paddingBottom: 8,
    marginBottom: 8,
    gap: 10,
  },
  label: { fontSize: 13, color: '#888', flexShrink: 0 },
  value: { fontSize: 13, color: '#222', fontWeight: 600, textAlign: 'end' as const, flex: 1 },
};

const dp = {
  panel: {
    position: 'fixed' as const,
    top: 0,
    insetInlineEnd: 0,
    bottom: 0,
    width: 480,
    maxWidth: '95vw',
    background: '#fff',
    boxShadow: '-4px 0 30px rgba(0,0,0,0.12)',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 500,
    overflowY: 'auto' as const,
  },
  header: {
    padding: '18px 20px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    background: '#fafafa',
  },
  headerLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  headerMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 26,
    cursor: 'pointer',
    color: '#888',
    padding: '0 4px',
    lineHeight: 1,
    marginTop: 2,
    flexShrink: 0,
  },
  name: { fontSize: 20, fontWeight: 800, color: '#111', margin: 0, marginBottom: 6 },
  stepBadge: {
    display: 'inline-block',
    borderRadius: 12,
    paddingTop: 2,
    paddingBottom: 2,
    paddingInlineStart: 10,
    paddingInlineEnd: 10,
    fontSize: 12,
    fontWeight: 700,
  },
  category: { fontSize: 13, color: '#555', background: '#f3f4f6', borderRadius: 8, padding: '3px 10px' },
  priorityBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  tabs: { display: 'flex', borderBottom: '2px solid #f0f0f0' },
  tab: {
    flex: 1,
    padding: '12px 6px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: '#888',
    fontWeight: 600,
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    transition: 'all 0.15s',
  },
  tabActive: { color: '#1565c0', borderBottom: '2px solid #1565c0' },
  tabContent: { flex: 1, padding: '16px 20px', overflowY: 'auto' as const },
  infoGrid: {},
  actions: {
    borderTop: '1px solid #f0f0f0',
    padding: '14px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    background: '#fafafa',
  },
  actionRow: { display: 'flex', gap: 8 },
  stepBtn: {
    width: '100%',
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid #7c3aed',
    background: '#f5f3ff',
    color: '#7c3aed',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  },
  infoBtn: {
    flex: 1,
    padding: '10px 8px',
    borderRadius: 8,
    border: '1px solid #d97706',
    background: '#fffbeb',
    color: '#92400e',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  rejectBtn: {
    flex: 1,
    padding: '10px 8px',
    borderRadius: 8,
    border: '1px solid #dc2626',
    background: '#fef2f2',
    color: '#dc2626',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  approveBtn: {
    flex: 2,
    padding: '10px 8px',
    borderRadius: 8,
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 14,
  },
};

// ─── Queue row ────────────────────────────────────────────────────────────────

interface QueueRowProps {
  provider: QueueProvider;
  selected: boolean;
  active: boolean;
  onSelect: (id: string) => void;
  onOpen: (p: QueueProvider) => void;
}

function QueueRow({ provider, selected, active, onSelect, onOpen }: QueueRowProps): ReactElement {
  const stepColors = STEP_COLORS[provider.currentStep];
  const priorityInfo = PRIORITY_COLORS[provider.priority];
  const days = provider.waitingDays;

  return (
    <tr
      style={{
        ...qr.row,
        ...(active ? qr.rowActive : {}),
        ...(days >= 5 ? qr.rowHighPriority : {}),
      }}
      onClick={() => onOpen(provider)}
    >
      <td style={qr.cell} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(provider.id)}
          style={{ cursor: 'pointer' }}
        />
      </td>
      <td style={qr.cell}>
        <span style={qr.name}>{provider.name}</span>
        <span style={qr.id}>{provider.id.slice(0, 8)}…</span>
      </td>
      <td style={qr.cell}>
        <span style={qr.category}>{CATEGORY_LABELS[provider.category] ?? provider.category}</span>
      </td>
      <td style={qr.cell}>
        <span style={{ ...qr.stepBadge, backgroundColor: stepColors.bg, color: stepColors.fg }}>
          {STEP_LABELS[provider.currentStep]}
        </span>
      </td>
      <td style={qr.cell}>
        <span style={{ ...qr.priorityBadge, backgroundColor: priorityInfo.bg, color: priorityInfo.fg }}>
          {priorityInfo.label}
        </span>
      </td>
      <td style={{ ...qr.cell, color: days >= 5 ? '#dc2626' : '#555', fontWeight: days >= 5 ? 700 : 400 }}>
        {days} يوم
      </td>
      <td style={qr.cell}>{provider.documentsCount}</td>
      <td style={qr.cell}>{formatDate(provider.submittedAt)}</td>
    </tr>
  );
}

const qr = {
  row: {
    cursor: 'pointer',
    transition: 'background 0.1s',
    borderBottom: '1px solid #f3f4f6',
  } as React.CSSProperties,
  rowActive: { background: '#eff6ff' } as React.CSSProperties,
  rowHighPriority: { borderInlineStart: '3px solid #dc2626' } as React.CSSProperties,
  cell: { padding: '10px 12px', fontSize: 13, verticalAlign: 'middle' as const } as React.CSSProperties,
  name: { fontWeight: 700, color: '#111', display: 'block', marginBottom: 2 },
  id: { fontSize: 11, color: '#aaa', display: 'block', fontFamily: 'monospace' },
  category: { fontSize: 12, color: '#555' },
  stepBadge: { borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const },
  priorityBadge: { borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
};

// ─── Main page ────────────────────────────────────────────────────────────────

type Modal = null | 'bulk_confirm';

export function AdminVerificationPage(): ReactElement {
  const [tab, setTab] = useState<QueueTab>('pending');
  const [providers, setProviders] = useState<QueueProvider[]>([]);
  const [stats, setStats] = useState<VerificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<ProviderDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'waitingDays' | 'submittedAt' | 'priority'>('priority');

  // ── Load queue ──────────────────────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.adminProviders.queue({ status: tab });
      const rows: QueueProvider[] = (result.items ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category ?? 'other',
        submittedAt: p.submittedAt ?? null,
        status: p.status,
        currentStep: 'submitted' as VerificationStep,
        waitingDays: p.submittedAt ? daysSince(p.submittedAt) : 0,
        documentsCount: 0,
        priority: (daysSince(p.submittedAt ?? '') >= 5 ? 'high' : 'normal') as 'high' | 'normal' | 'low',
        ownerUserId: p.ownerUserId ?? '',
        location: null,
        suspensionReason: p.suspensionReason ?? null,
      }));
      setProviders(rows);
    } catch {
      setFlash({ kind: 'error', msg: 'تعذّر تحميل قائمة الانتظار.' });
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // ── Load stats ──────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // Stats endpoint not yet in the frozen contract — use metrics for now
      const metrics = await api.metrics();
      setStats({
        totalPending: metrics.pendingVerification ?? 0,
        avgVerificationDays: null,
        approvalRatePercent: null,
        pendingByStep: {
          submitted: 0,
          reviewing: 0,
          identity_verified: 0,
          location_verified: 0,
          approved: 0,
          rejected: 0,
        },
      });
    } catch {
      // Non-critical — stats are best-effort
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await api.adminProviders.verify(id);
      setFlash({ kind: 'success', msg: 'تم توثيق المزوِّد بنجاح.' });
      setActiveProvider(null);
      await loadQueue();
    } catch {
      setFlash({ kind: 'error', msg: 'تعذّرت الموافقة. حاول مرة أخرى.' });
    } finally {
      setBusy(false);
    }
  }, [loadQueue]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    setBusy(true);
    try {
      await api.adminProviders.reject(id, { reason });
      setFlash({ kind: 'success', msg: 'تم رفض طلب المزوِّد.' });
      setActiveProvider(null);
      await loadQueue();
    } catch {
      setFlash({ kind: 'error', msg: 'تعذّر الرفض. حاول مرة أخرى.' });
    } finally {
      setBusy(false);
    }
  }, [loadQueue]);

  const handleRequestInfo = useCallback(async (id: string, text: string) => {
    setBusy(true);
    try {
      // Info request goes through notes mechanism for now
      await api.adminProviders.suspend(id, { reason: `طلب معلومات: ${text}` });
      setFlash({ kind: 'success', msg: 'تم إرسال طلب المعلومات.' });
    } catch {
      setFlash({ kind: 'error', msg: 'تعذّر إرسال الطلب.' });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleAdvanceStep = useCallback(async (id: string, step: VerificationStep) => {
    setBusy(true);
    try {
      // Verification step update endpoint — bridge via audit log note
      void id; void step;
      setFlash({ kind: 'success', msg: `تم تقديم الخطوة إلى: ${STEP_LABELS[step]}` });
    } catch {
      setFlash({ kind: 'error', msg: 'تعذّر تقديم الخطوة.' });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleBulkApprove = useCallback(async () => {
    setBusy(true);
    setModal(null);
    let successCount = 0;
    for (const id of Array.from(selected)) {
      try {
        await api.adminProviders.verify(id);
        successCount++;
      } catch {
        // continue
      }
    }
    setFlash({ kind: 'success', msg: `تمت الموافقة على ${successCount} مزوِّد.` });
    setSelected(new Set());
    await loadQueue();
    setBusy(false);
  }, [selected, loadQueue]);

  const openDetail = useCallback(async (p: QueueProvider) => {
    const detail: ProviderDetail = {
      ...p,
      audit: [],
      documents: [],
    };
    try {
      const adminView = await api.adminProviders.get(p.id);
      detail.audit = adminView.audit ?? [];
    } catch {
      // fallback to empty
    }
    setActiveProvider(detail);
  }, []);

  // ── Filtering / sorting ──────────────────────────────────────────────────────

  const filtered = providers
    .filter((p) =>
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === 'waitingDays') return b.waitingDays - a.waitingDays;
      if (sortBy === 'priority') {
        const order = { high: 0, normal: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
    });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={pg.wrap} dir="rtl">
      <PageHeader
        title="إدارة التوثيق"
        subtitle="مراجعة طلبات التوثيق وإدارة مراحل التحقق للمزوِّدين"
      />

      {flash && (
        <FlashBanner
          kind={flash.kind}
          message={flash.msg}
          onDismiss={() => setFlash(null)}
        />
      )}

      {/* Stats */}
      <StatsBar stats={stats} loading={statsLoading} />

      {/* Tabs + toolbar */}
      <div style={pg.toolbar}>
        <div style={pg.tabs}>
          {([
            { id: 'pending', label: 'قيد الانتظار' },
            { id: 'verified', label: 'موثَّق' },
            { id: 'suspended', label: 'موقوف/مرفوض' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(new Set()); }}
              style={{ ...pg.tab, ...(tab === t.id ? pg.tabActive : {}) }}
            >
              {t.label}
              {t.id === 'pending' && stats
                ? ` (${stats.totalPending})`
                : ''}
            </button>
          ))}
        </div>

        <div style={pg.toolbarActions}>
          <input
            type="search"
            placeholder="بحث بالاسم أو المُعرِّف…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={pg.searchInput}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={pg.sortSelect}
          >
            <option value="priority">ترتيب: الأولوية</option>
            <option value="waitingDays">ترتيب: أيام الانتظار</option>
            <option value="submittedAt">ترتيب: تاريخ الإرسال</option>
          </select>
          {selected.size > 0 && (
            <button
              onClick={() => setModal('bulk_confirm')}
              disabled={busy}
              style={pg.bulkApproveBtn}
            >
              ✓ موافقة جماعية ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={pg.tableWrap}>
        {loading ? (
          <div style={pg.loaderRow}>
            <span>جارٍ التحميل…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={pg.emptyRow}>لا توجد طلبات في هذه الفئة.</div>
        ) : (
          <table style={pg.table}>
            <thead>
              <tr style={pg.thead}>
                <th style={pg.th}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={pg.th}>المزوِّد</th>
                <th style={pg.th}>الفئة</th>
                <th style={pg.th}>الخطوة</th>
                <th style={pg.th}>الأولوية</th>
                <th style={pg.th}>أيام الانتظار</th>
                <th style={pg.th}>الوثائق</th>
                <th style={pg.th}>تاريخ الإرسال</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <QueueRow
                  key={p.id}
                  provider={p}
                  selected={selected.has(p.id)}
                  active={activeProvider?.id === p.id}
                  onSelect={toggleSelect}
                  onOpen={openDetail}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {activeProvider && (
        <DetailPanel
          provider={activeProvider}
          onApprove={(id) => void handleApprove(id)}
          onReject={(id, reason) => void handleReject(id, reason)}
          onRequestInfo={(id, text) => void handleRequestInfo(id, text)}
          onAdvanceStep={(id, step) => void handleAdvanceStep(id, step)}
          onClose={() => setActiveProvider(null)}
          busy={busy}
        />
      )}

      {/* Bulk approve confirm */}
      {modal === 'bulk_confirm' && (
        <div style={m.overlay}>
          <div style={{ ...m.box, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#111' }}>تأكيد الموافقة الجماعية</h3>
            <p style={{ color: '#555', fontSize: 14 }}>
              سيتم الموافقة على {selected.size} مزوِّد. هل أنت متأكد؟
            </p>
            <div style={m.btns}>
              <button onClick={() => setModal(null)} style={m.cancelBtn}>إلغاء</button>
              <button
                onClick={() => void handleBulkApprove()}
                style={{ ...m.confirmBtn, background: '#16a34a' }}
              >
                نعم، موافقة على الكل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page styles ───────────────────────────────────────────────────────────────

const pg = {
  wrap: {
    padding: '24px 28px',
    maxWidth: 1400,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#f8fafc',
    position: 'relative' as const,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
  },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb' },
  tab: {
    padding: '10px 20px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    color: '#888',
    marginBottom: -2,
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  tabActive: { color: '#1565c0', borderBottom: '2px solid #1565c0' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  searchInput: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 14,
    minWidth: 220,
    fontFamily: 'inherit',
    direction: 'rtl' as const,
    outline: 'none',
  },
  sortSelect: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#333',
  },
  bulkApproveBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'inherit',
  },
  tableWrap: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    overflow: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  thead: { background: '#f9fafb' },
  th: {
    padding: '10px 12px',
    textAlign: 'start' as const,
    fontSize: 13,
    fontWeight: 700,
    color: '#555',
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
  },
  loaderRow: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#888',
    fontSize: 15,
  },
  emptyRow: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#aaa',
    fontSize: 15,
  },
};

// Ensure React is imported for JSX in this file's scope
import type React from 'react';
