import { useState, useEffect, useCallback } from 'react';
import { api, type Provider } from '../api';
import { FlashBanner, PageHeader } from '../components/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type QueueTab = 'pending' | 'approved' | 'rejected';

interface AuditEntry {
  action: string;
  actorUserId: string;
  reason: string | null;
  at: string;
}

interface ProviderDetail extends Provider {
  category?: string;
  documents?: string[];
  audit?: AuditEntry[];
  suspensionReason?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الانتظار',
  verified: 'موثَّق',
  suspended: 'موقوف',
  draft: 'مسودة',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#b45309',
  verified: '#166534',
  suspended: '#991b1b',
  draft: '#555',
};

const STATUS_BG: Record<string, string> = {
  pending: '#fffbeb',
  verified: '#f0fdf4',
  suspended: '#fef2f2',
  draft: '#f5f5f5',
};

const CATEGORY_LABEL: Record<string, string> = {
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
  pharmacy: 'صيدلية',
};

const ACTION_LABEL: Record<string, string> = {
  submitted: 'أُرسل للمراجعة',
  verified: 'تم التوثيق',
  suspended: 'تم الإيقاف',
  rejected: 'تم الرفض',
};

function formatDate(iso: string): string {
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

// ─── Reject / Request more info modal ────────────────────────────────────────

interface RejectModalProps {
  title: string;
  placeholder: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function ReasonModal({ title, placeholder, onConfirm, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div style={s.modalOverlay}>
      <div style={s.modalBox}>
        <h3 style={{ margin: '0 0 14px', fontSize: 17, color: '#111' }}>{title}</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={s.textarea}
        />
        <div style={s.modalBtns}>
          <button style={s.btnSecondary} onClick={onCancel}>
            إلغاء
          </button>
          <button
            style={{ ...s.btnPrimary, opacity: reason.trim() ? 1 : 0.5 }}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            تأكيد
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Provider detail panel ────────────────────────────────────────────────────

interface DetailPanelProps {
  provider: ProviderDetail;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRequestInfo: (id: string, reason: string) => void;
  onClose: () => void;
  busy: boolean;
}

function DetailPanel({
  provider,
  onApprove,
  onReject,
  onRequestInfo,
  onClose,
  busy,
}: DetailPanelProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const isPending = provider.status === 'pending';

  return (
    <>
      <div style={s.detailPanel}>
        {/* Header */}
        <div style={s.panelHeader}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#111' }}>{provider.nameAr}</h2>
            <span
              style={{
                display: 'inline-block',
                marginTop: 4,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                color: STATUS_COLOR[provider.status] ?? '#555',
                background: STATUS_BG[provider.status] ?? '#f5f5f5',
              }}
            >
              {STATUS_LABEL[provider.status] ?? provider.status}
            </span>
          </div>
          <button onClick={onClose} style={s.closeBtn} aria-label="إغلاق">
            ✕
          </button>
        </div>

        {/* Info grid */}
        <div style={s.infoGrid}>
          <InfoRow label="الهاتف" value={provider.phone || '—'} />
          <InfoRow
            label="الفئة"
            value={CATEGORY_LABEL[provider.category ?? ''] ?? provider.category ?? '—'}
          />
          <InfoRow label="تاريخ الإرسال" value={provider.submittedAt ? formatDate(provider.submittedAt) : '—'} />
          {provider.suspensionReason && (
            <InfoRow label="سبب الإيقاف" value={provider.suspensionReason} highlight />
          )}
        </div>

        {/* Documents stub */}
        <div style={s.section}>
          <h4 style={s.sectionTitle}>المستندات المُرفقة</h4>
          {provider.documents && provider.documents.length > 0 ? (
            <div style={s.docList}>
              {provider.documents.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.docLink}
                >
                  📄 مستند {i + 1}
                </a>
              ))}
            </div>
          ) : (
            <p style={s.noData}>لم يتم رفع أي مستندات بعد</p>
          )}
        </div>

        {/* Audit log */}
        {provider.audit && provider.audit.length > 0 && (
          <div style={s.section}>
            <h4 style={s.sectionTitle}>سجل الإجراءات</h4>
            {provider.audit.map((entry, i) => (
              <div key={i} style={s.auditRow}>
                <span style={s.auditAction}>{ACTION_LABEL[entry.action] ?? entry.action}</span>
                {entry.reason && <span style={s.auditReason}> — {entry.reason}</span>}
                <span style={s.auditDate}>{formatDate(entry.at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div style={s.actionBar}>
            <button
              style={{ ...s.btnDanger, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => setShowRejectModal(true)}
            >
              رفض
            </button>
            <button
              style={{ ...s.btnWarning, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => setShowInfoModal(true)}
            >
              طلب معلومات إضافية
            </button>
            <button
              style={{ ...s.btnSuccess, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => onApprove(provider.id)}
            >
              ✓ موافقة
            </button>
          </div>
        )}

        {!isPending && (
          <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            لا يمكن اتخاذ إجراء على هذا الطلب (الحالة: {STATUS_LABEL[provider.status] ?? provider.status})
          </p>
        )}
      </div>

      {showRejectModal && (
        <ReasonModal
          title="سبب الرفض"
          placeholder="اكتب سبب الرفض بوضوح ليتمكن صاحب النشاط من تصحيح الوضع…"
          onConfirm={(reason) => {
            setShowRejectModal(false);
            onReject(provider.id, reason);
          }}
          onCancel={() => setShowRejectModal(false)}
        />
      )}

      {showInfoModal && (
        <ReasonModal
          title="طلب معلومات إضافية"
          placeholder="حدد المعلومات أو المستندات الإضافية المطلوبة…"
          onConfirm={(reason) => {
            setShowInfoModal(false);
            onRequestInfo(provider.id, reason);
          }}
          onCancel={() => setShowInfoModal(false)}
        />
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, color: highlight ? '#991b1b' : '#222' }}>{value}</span>
    </div>
  );
}

// ─── Queue list ────────────────────────────────────────────────────────────────

interface QueueListProps {
  providers: ProviderDetail[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (p: ProviderDetail) => void;
}

function QueueList({ providers, loading, selectedId, onSelect }: QueueListProps) {
  if (loading) {
    return <div style={s.loadingMsg}>جارٍ التحميل…</div>;
  }
  if (providers.length === 0) {
    return <div style={s.emptyMsg}>لا توجد نتائج</div>;
  }

  return (
    <div style={s.list}>
      {providers.map((p) => (
        <div
          key={p.id}
          style={{
            ...s.listRow,
            background: selectedId === p.id ? '#eff6ff' : '#fff',
            borderInlineStartWidth: selectedId === p.id ? 3 : 1,
            borderInlineStartColor: selectedId === p.id ? '#1565c0' : '#e5e7eb',
          }}
          onClick={() => onSelect(p)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelect(p)}
        >
          <div style={s.listMain}>
            <span style={s.listName}>{p.nameAr}</span>
            <span style={s.listPhone}>{p.phone || '—'}</span>
          </div>
          <div style={s.listMeta}>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                color: STATUS_COLOR[p.status] ?? '#555',
                background: STATUS_BG[p.status] ?? '#f5f5f5',
              }}
            >
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
            {p.submittedAt && (
              <span style={s.listDate}>{formatDate(p.submittedAt)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminProviderVerificationPage() {
  const [tab, setTab] = useState<QueueTab>('pending');
  const [providers, setProviders] = useState<ProviderDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<ProviderDetail | null>(null);
  const [search, setSearch] = useState('');

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  const load = useCallback(
    async (p: number, status: QueueTab) => {
      setLoading(true);
      try {
        const statusMap: Record<QueueTab, string> = {
          pending: 'pending',
          approved: 'verified',
          rejected: 'suspended',
        };
        const res = await api.getPendingProviders(p);
        // Filter by mapped status (api returns all statuses mixed)
        const filtered = (res.items as ProviderDetail[]).filter(
          (item) => !status || item.status === statusMap[status],
        );
        setProviders(filtered);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(page, tab);
    setSelected(null);
  }, [load, page, tab]);

  const handleApprove = async (id: string) => {
    setBusy(true);
    try {
      await api.verifyProvider(id);
      flash('تم التوثيق بنجاح ✓');
      setSelected(null);
      void load(page, tab);
    } catch {
      flash('فشل تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    setBusy(true);
    try {
      await api.rejectProvider(id, reason);
      flash('تم رفض الطلب');
      setSelected(null);
      void load(page, tab);
    } catch {
      flash('فشل تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestInfo = async (id: string, reason: string) => {
    setBusy(true);
    try {
      // Suspend temporarily with a "need more info" reason
      await api.suspendProvider(id);
      flash(`تم طلب معلومات إضافية: ${reason}`);
      setSelected(null);
      void load(page, tab);
    } catch {
      flash('فشل تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  const TAB_LABELS: Record<QueueTab, string> = {
    pending: 'قيد الانتظار',
    approved: 'موثَّقة',
    rejected: 'مرفوضة / موقوفة',
  };

  const filtered = search.trim()
    ? providers.filter(
        (p) =>
          p.nameAr.toLowerCase().includes(search.toLowerCase()) ||
          (p.phone && p.phone.includes(search)),
      )
    : providers;

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader
        title="طابور توثيق المزودين"
        meta={`${total} طلب إجمالاً`}
      />
      <FlashBanner msg={msg} />

      {/* Tabs */}
      <div style={s.tabs}>
        {(Object.keys(TAB_LABELS) as QueueTab[]).map((t) => (
          <button
            key={t}
            style={{
              ...s.tab,
              borderBottom: tab === t ? '3px solid #1565c0' : '3px solid transparent',
              color: tab === t ? '#1565c0' : '#555',
              fontWeight: tab === t ? 700 : 400,
            }}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={s.searchBar}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم النشاط أو رقم الهاتف…"
          style={s.searchInput}
          aria-label="بحث"
        />
      </div>

      {/* Content */}
      <div style={s.layout}>
        {/* List */}
        <div style={s.listPane}>
          <QueueList
            providers={filtered}
            loading={loading}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />

          {totalPages > 1 && (
            <div style={s.pagination}>
              <button
                style={s.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                السابق
              </button>
              <span style={s.pageLabel}>
                {page} / {totalPages}
              </span>
              <button
                style={s.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                التالي
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div style={s.detailPane}>
            <DetailPanel
              provider={selected}
              onApprove={(id) => void handleApprove(id)}
              onReject={(id, reason) => void handleReject(id, reason)}
              onRequestInfo={(id, reason) => void handleRequestInfo(id, reason)}
              onClose={() => setSelected(null)}
              busy={busy}
            />
          </div>
        ) : (
          <div style={s.detailPanePlaceholder}>
            <p style={{ color: '#aaa', fontSize: 14 }}>اختر طلباً من القائمة لعرض التفاصيل</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  tabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 16,
  },
  tab: {
    padding: '10px 20px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'color 0.15s',
  },
  searchBar: { marginBottom: 16 },
  searchInput: {
    width: '100%',
    maxWidth: 380,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    direction: 'rtl',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: 20,
    alignItems: 'flex-start',
  },
  listPane: { minWidth: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  listRow: {
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    transition: 'background 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  listMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  listName: { fontSize: 15, fontWeight: 700, color: '#111' },
  listPhone: { fontSize: 13, color: '#555', direction: 'ltr' },
  listMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  listDate: { fontSize: 12, color: '#888' },
  loadingMsg: { padding: 24, color: '#888', textAlign: 'center' },
  emptyMsg: { padding: 24, color: '#aaa', textAlign: 'center', fontSize: 14 },
  pagination: { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 },
  pageBtn: {
    padding: '6px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  pageLabel: { padding: '6px 14px', fontSize: 13, color: '#555' },

  detailPane: { minWidth: 0 },
  detailPanePlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    border: '1px dashed #d1d5db',
    borderRadius: 12,
  },

  detailPanel: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#888',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  infoRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: '#f9fafb',
    borderRadius: 8,
    padding: '8px 12px',
  },
  infoLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  infoValue: { fontSize: 14, fontWeight: 600 },

  section: {
    borderTop: '1px solid #f3f4f6',
    paddingTop: 12,
  },
  sectionTitle: { margin: '0 0 8px', fontSize: 14, color: '#333' },
  docList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  docLink: {
    padding: '6px 12px',
    background: '#eff6ff',
    borderRadius: 6,
    color: '#1565c0',
    fontSize: 13,
    textDecoration: 'none',
    border: '1px solid #bfdbfe',
  },
  noData: { fontSize: 13, color: '#aaa', margin: 0 },

  auditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: 13,
  },
  auditAction: { fontWeight: 600, color: '#111' },
  auditReason: { color: '#666', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  auditDate: { color: '#888', flexShrink: 0 },

  actionBar: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  btnPrimary: {
    padding: '9px 20px',
    background: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  btnSuccess: {
    padding: '9px 20px',
    background: '#15803d',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  btnDanger: {
    padding: '9px 20px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  btnWarning: {
    padding: '9px 20px',
    background: '#d97706',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  btnSecondary: {
    padding: '9px 20px',
    background: '#fff',
    color: '#555',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalBox: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    direction: 'rtl',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    direction: 'rtl',
    outline: 'none',
    boxSizing: 'border-box',
  },
  modalBtns: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
};
