/**
 * AdminModerationQueue — unified moderation queue:
 * all pending reports in one view (place/review/post/user/photo),
 * priority queue, keyboard shortcuts, assignment, resolution notes.
 */
import { useState, useEffect } from 'react';
import { btnStyle, FlashBanner, PageHeader } from '../components/shared';
import { AdminStatCard, StatCardRow } from '../components/AdminStatCard';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = 'place' | 'review' | 'post' | 'user' | 'photo';
type ReportStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'escalated';

interface Report {
  id: string;
  type: ReportType;
  targetId: string;
  targetSummary: string;
  reportCount: number;
  reasons: string[];
  reportedAt: string;
  status: ReportStatus;
  assignedTo?: string;
  resolutionNote?: string;
  resolvedAt?: string;
  priority: number; // 1-5, higher = more urgent
}

const MODERATORS = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];

// ── Mock data ──────────────────────────────────────────────────────────────────

function mockReports(): Report[] {
  const now = Date.now();
  return [
    { id: 'r001', type: 'post', targetId: 'p1', targetSummary: 'Post: "افضل مكان في بغداد بدون شك..." (15 reports)', reportCount: 15, reasons: ['Spam', 'Misleading'], reportedAt: new Date(now - 3600_000).toISOString(), status: 'pending', priority: 5 },
    { id: 'r002', type: 'user', targetId: 'u7', targetSummary: 'User: Spam Bot 7 (14 reports)', reportCount: 14, reasons: ['Spam', 'Fake account'], reportedAt: new Date(now - 7200_000).toISOString(), status: 'pending', priority: 5 },
    { id: 'r003', type: 'photo', targetId: 'img12', targetSummary: 'Photo on مطعم البغدادي (8 reports)', reportCount: 8, reasons: ['Inappropriate content'], reportedAt: new Date(now - 10800_000).toISOString(), status: 'pending', priority: 4 },
    { id: 'r004', type: 'review', targetId: 'rev5', targetSummary: 'Review: "هذا المكان فظيع ولا أنصح..." (6 reports)', reportCount: 6, reasons: ['Fake review'], reportedAt: new Date(now - 14400_000).toISOString(), status: 'reviewing', assignedTo: 'Alice', priority: 3 },
    { id: 'r005', type: 'place', targetId: 'pl9', targetSummary: 'Place: صيدلية القدس — incorrect location (5 reports)', reportCount: 5, reasons: ['Incorrect information'], reportedAt: new Date(now - 18000_000).toISOString(), status: 'pending', priority: 3 },
    { id: 'r006', type: 'post', targetId: 'p8', targetSummary: 'Post: "عرض خاص! خصم 90%.." (4 reports)', reportCount: 4, reasons: ['Spam'], reportedAt: new Date(now - 21600_000).toISOString(), status: 'pending', priority: 3 },
    { id: 'r007', type: 'user', targetId: 'u3', targetSummary: 'User: Anonymous (5 reports)', reportCount: 5, reasons: ['Abusive language', 'Harassment'], reportedAt: new Date(now - 86400_000).toISOString(), status: 'reviewing', assignedTo: 'Bob', priority: 4 },
    { id: 'r008', type: 'photo', targetId: 'img33', targetSummary: 'Photo on فندق الرشيد (2 reports)', reportCount: 2, reasons: ['Not relevant'], reportedAt: new Date(now - 172800_000).toISOString(), status: 'pending', priority: 2 },
    { id: 'r009', type: 'review', targetId: 'rev9', targetSummary: 'Review: "خدمة ممتازة..." (1 report)', reportCount: 1, reasons: ['Competitor'], reportedAt: new Date(now - 259200_000).toISOString(), status: 'pending', priority: 1 },
    { id: 'r010', type: 'place', targetId: 'pl15', targetSummary: 'Place: مطعم الحكمة — closed (3 reports)', reportCount: 3, reasons: ['Place closed'], reportedAt: new Date(now - 43200_000).toISOString(), status: 'pending', priority: 2 },
  ];
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ReportType }) {
  const map: Record<ReportType, [string, string]> = {
    place: ['#1565c0', '📍 Place'],
    review: ['#6a1b9a', '⭐ Review'],
    post: ['#2e7d32', '📝 Post'],
    user: ['#c62828', '👤 User'],
    photo: ['#e65100', '🖼 Photo'],
  };
  const [color, label] = map[type];
  return (
    <span style={{
      display: 'inline-block', background: color + '15', color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// ── Priority indicator ────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: number }) {
  const colors = ['', '#aaa', '#f57f17', '#e65100', '#c62828', '#b71c1c'];
  const labels = ['', 'Low', 'Medium', 'High', 'Critical', 'Emergency'];
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: colors[priority] ?? '#aaa',
      }} />
      {labels[priority] ?? 'Unknown'}
    </span>
  );
}

// ── Resolution modal ──────────────────────────────────────────────────────────

interface ResolveModalProps {
  report: Report;
  action: 'approve' | 'reject' | 'escalate';
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}

function ResolveModal({ report, action, onClose, onConfirm }: ResolveModalProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const actionConfig = {
    approve: { label: 'Approve (Remove Content)', color: '#c62828', verb: 'Approving…' },
    reject: { label: 'Reject Report (Keep Content)', color: '#2e7d32', verb: 'Rejecting…' },
    escalate: { label: 'Escalate to Senior', color: '#6a1b9a', verb: 'Escalating…' },
  };
  const cfg = actionConfig[action];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onConfirm(note); onClose(); } finally { setBusy(false); }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 28, width: 420, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 12px', color: cfg.color }}>{cfg.label}</h3>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px' }}>
          <strong>{report.targetSummary}</strong>
        </p>
        <form onSubmit={submit}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
            Resolution note (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add context for the record…"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy} style={btnStyle(cfg.color)}>
              {busy ? cfg.verb : cfg.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

interface ReportCardProps {
  report: Report;
  isActive: boolean;
  index: number;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEscalate: () => void;
  onAssign: (mod: string) => void;
}

function ReportCard({ report, isActive, index, onSelect, onApprove, onReject, onEscalate, onAssign }: ReportCardProps) {
  const cardStyle: React.CSSProperties = {
    border: `2px solid ${isActive ? '#1565c0' : '#e0e0e0'}`,
    borderRadius: 8,
    padding: '14px 16px',
    cursor: 'pointer',
    background: isActive ? '#e3f2fd' : '#fff',
    transition: 'border-color 0.15s, background 0.15s',
    position: 'relative',
  };
  const statusColor: Record<ReportStatus, string> = {
    pending: '#e65100', reviewing: '#1565c0', approved: '#c62828', rejected: '#2e7d32', escalated: '#6a1b9a',
  };

  return (
    <div style={cardStyle} onClick={onSelect} tabIndex={0}>
      {/* Index badge */}
      <span style={{
        position: 'absolute', top: 10, right: 12, background: '#f5f5f5',
        color: '#888', borderRadius: 4, padding: '1px 7px', fontSize: 11,
      }}>
        #{index + 1}
      </span>

      {/* Header row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <TypeBadge type={report.type} />
        <PriorityDot priority={report.priority} />
        <span style={{
          background: statusColor[report.status] + '15',
          color: statusColor[report.status],
          border: `1px solid ${statusColor[report.status]}40`,
          borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
        }}>
          {report.status}
        </span>
        <span style={{ fontSize: 12, color: '#c62828', fontWeight: 700, marginInlineStart: 'auto', marginInlineEnd: 32 }}>
          {report.reportCount} reports
        </span>
      </div>

      {/* Summary */}
      <div style={{ fontSize: 13, color: '#333', fontWeight: 500, marginBottom: 6 }}>
        {report.targetSummary}
      </div>

      {/* Reasons */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {report.reasons.map((r) => (
          <span key={r} style={{ background: '#fff3e0', color: '#e65100', borderRadius: 3, padding: '1px 7px', fontSize: 11 }}>
            {r}
          </span>
        ))}
      </div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: report.assignedTo ? 6 : 0 }}>
        Reported {new Date(report.reportedAt).toLocaleString()}
        {report.assignedTo && ` · Assigned to ${report.assignedTo}`}
        {report.resolutionNote && ` · Note: ${report.resolutionNote}`}
      </div>

      {/* Actions */}
      {isActive && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onApprove} style={btnStyle('#c62828')} title="Approve report (a)">✓ Approve</button>
          <button onClick={onReject} style={btnStyle('#2e7d32')} title="Reject report (r)">✗ Reject</button>
          <button onClick={onEscalate} style={btnStyle('#6a1b9a')} title="Escalate">↑ Escalate</button>
          <select
            onChange={(e) => { if (e.target.value) onAssign(e.target.value); e.target.value = ''; }}
            style={{ padding: '5px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
            defaultValue=""
          >
            <option value="" disabled>Assign to…</option>
            {MODERATORS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminModerationQueue() {
  const [reports, setReports] = useState<Report[]>(() =>
    mockReports().sort((a, b) => b.priority - a.priority || b.reportCount - a.reportCount),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [flash, setFlash] = useState('');
  const [filterType, setFilterType] = useState<ReportType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'all'>('pending');
  const [resolveModal, setResolveModal] = useState<{ action: 'approve' | 'reject' | 'escalate'; report: Report } | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  const filtered = reports.filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case 'j':
          setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
          break;
        case 'k':
          setActiveIdx((i) => Math.max(0, i - 1));
          break;
        case 'a': {
          const report = filtered[activeIdx];
          if (report && report.status === 'pending') {
            setResolveModal({ action: 'approve', report });
          }
          break;
        }
        case 'r': {
          const report = filtered[activeIdx];
          if (report && report.status === 'pending') {
            setResolveModal({ action: 'reject', report });
          }
          break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, activeIdx]);

  function resolveReport(id: string, status: ReportStatus, note: string) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, resolutionNote: note || undefined, resolvedAt: new Date().toISOString() }
          : r,
      ),
    );
  }

  async function handleResolve(note: string) {
    if (!resolveModal) return;
    const { action, report } = resolveModal;
    const statusMap: Record<typeof action, ReportStatus> = {
      approve: 'approved', reject: 'rejected', escalate: 'escalated',
    };
    resolveReport(report.id, statusMap[action], note);
    showFlash(`Report ${report.id} ${statusMap[action]}.`);
    setActiveIdx((i) => Math.min(filtered.length - 2, i));
  }

  function handleAssign(reportId: string, mod: string) {
    setReports((prev) =>
      prev.map((r) => r.id === reportId ? { ...r, assignedTo: mod, status: 'reviewing' } : r),
    );
    showFlash(`Assigned to ${mod}.`);
  }

  // Stats
  const pending = reports.filter((r) => r.status === 'pending').length;
  const reviewing = reports.filter((r) => r.status === 'reviewing').length;
  const resolved = reports.filter((r) => r.status === 'approved' || r.status === 'rejected').length;
  const escalated = reports.filter((r) => r.status === 'escalated').length;

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13,
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Moderation Queue" meta="j/k = navigate · a = approve · r = reject" />
      <FlashBanner msg={flash} />

      {/* Stats */}
      <StatCardRow>
        <AdminStatCard label="Pending" value={pending} accent="#e65100" icon="⏳" />
        <AdminStatCard label="In Review" value={reviewing} accent="#1565c0" icon="👁" />
        <AdminStatCard label="Resolved Today" value={resolved} accent="#2e7d32" icon="✓" />
        <AdminStatCard label="Escalated" value={escalated} accent="#6a1b9a" icon="↑" />
      </StatCardRow>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#555' }}>Filter:</span>
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value as typeof filterType); setActiveIdx(0); }} style={selectStyle}>
          <option value="all">All Types</option>
          <option value="place">Place</option>
          <option value="review">Review</option>
          <option value="post">Post</option>
          <option value="user">User</option>
          <option value="photo">Photo</option>
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setActiveIdx(0); }} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="reviewing">In Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="escalated">Escalated</option>
        </select>
        <span style={{ fontSize: 13, color: '#888' }}>
          {filtered.length} item(s)
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#aaa', background: '#f5f5f5', padding: '4px 10px', borderRadius: 4 }}>
          <kbd style={{ fontFamily: 'monospace', fontSize: 11 }}>J</kbd> next ·{' '}
          <kbd style={{ fontFamily: 'monospace', fontSize: 11 }}>K</kbd> prev ·{' '}
          <kbd style={{ fontFamily: 'monospace', fontSize: 11 }}>A</kbd> approve ·{' '}
          <kbd style={{ fontFamily: 'monospace', fontSize: 11 }}>R</kbd> reject
        </div>
      </div>

      {/* Queue */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#aaa', background: '#fafafa', borderRadius: 8, border: '1px dashed #e0e0e0' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Queue is empty</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>No reports match your current filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((report, idx) => (
            <ReportCard
              key={report.id}
              report={report}
              isActive={idx === activeIdx}
              index={idx}
              onSelect={() => setActiveIdx(idx)}
              onApprove={() => setResolveModal({ action: 'approve', report })}
              onReject={() => setResolveModal({ action: 'reject', report })}
              onEscalate={() => setResolveModal({ action: 'escalate', report })}
              onAssign={(mod) => handleAssign(report.id, mod)}
            />
          ))}
        </div>
      )}

      {/* Resolution modal */}
      {resolveModal && (
        <ResolveModal
          report={resolveModal.report}
          action={resolveModal.action}
          onClose={() => setResolveModal(null)}
          onConfirm={handleResolve}
        />
      )}
    </div>
  );
}
