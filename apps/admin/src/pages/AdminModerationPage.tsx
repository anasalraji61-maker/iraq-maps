/**
 * AdminModerationPage — full content-moderation queue for admins.
 *
 * Tabs:
 *  1. Reports     — pending reports with content preview + action buttons
 *  2. Actions     — log of all moderation actions
 *  3. Users       — users with reports count, suspension status
 *  4. Word Filters — per-locale banned word management
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportStatus = 'pending' | 'approved' | 'removed' | 'warned' | 'suspended' | 'banned' | 'dismissed';
type ReportReason = 'spam' | 'inappropriate' | 'violence' | 'hate_speech' | 'misinformation' | 'copyright' | 'other';
type ModerationAction = 'approve' | 'remove' | 'warn' | 'suspend' | 'ban' | 'dismiss';

interface Report {
  id: string;
  reporterId: string;
  contentId: string;
  contentType: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
}

interface ActionLog {
  id: string;
  reportId: string;
  moderatorId: string;
  action: ModerationAction;
  note: string | null;
  createdAt: string;
}

interface UserEntry {
  userId: string;
  reportCount: number;
  suspension: { type: string; expiresAt: string | null } | null;
}

interface _WordFilterEntry {
  id: string;
  word: string;
  locale: string;
  createdAt: string;
}

type Tab = 'reports' | 'actions' | 'users' | 'words';

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending:   '#F57C00',
  approved:  '#388E3C',
  removed:   '#C62828',
  warned:    '#1565C0',
  suspended: '#6A1B9A',
  banned:    '#B71C1C',
  dismissed: '#9E9E9E',
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending:   'قيد المراجعة',
  approved:  'مقبول',
  removed:   'مُزال',
  warned:    'تحذير',
  suspended: 'موقوف',
  banned:    'محظور',
  dismissed: 'مرفوض',
};

const REASON_LABELS: Record<ReportReason, string> = {
  spam:           'سبام',
  inappropriate:  'غير لائق',
  violence:       'عنف',
  hate_speech:    'خطاب كراهية',
  misinformation: 'معلومات مضللة',
  copyright:      'حقوق نشر',
  other:          'أخرى',
};

const ACTION_LABELS: Record<ModerationAction, string> = {
  approve:  'قبول',
  remove:   'إزالة',
  warn:     'تحذير',
  suspend:  'إيقاف 24h',
  ban:      'حظر دائم',
  dismiss:  'رفض',
};

const ACTION_COLORS: Record<ModerationAction, string> = {
  approve:  '#2e7d32',
  remove:   '#c62828',
  warn:     '#1565c0',
  suspend:  '#6a1b9a',
  ban:      '#b71c1c',
  dismiss:  '#757575',
};

const LOCALES = ['ar', 'ckb', 'en'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReportStatus }): ReactElement {
  const color = STATUS_COLORS[status] ?? '#9e9e9e';
  return (
    <span style={{
      padding: '3px 8px',
      borderRadius: 4,
      fontSize: 12,
      background: `${color}22`,
      color,
      fontWeight: 600,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function SensitiveText({ text }: { text: string }): ReactElement {
  const [revealed, setRevealed] = useState(false);
  if (!revealed) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          filter: 'blur(4px)',
          userSelect: 'none',
          fontSize: 13,
          color: '#555',
          maxWidth: 200,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}>
          {text}
        </span>
        <button
          style={{ ...btnStyle('#666'), fontSize: 11, padding: '2px 6px', marginInlineStart: 0 }}
          onClick={() => setRevealed(true)}
          title="كشف المحتوى"
        >
          عرض
        </button>
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13, color: '#222', maxWidth: 280, overflow: 'hidden', display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// ─── Reports tab ─────────────────────────────────────────────────────────────

function ReportsTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [acting, setActing] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/moderation/reports?status=${statusFilter}&limit=100`,
        { headers: { 'x-admin-key': api.getAdminKey?.() ?? '' } },
      );
      if (res.ok) {
        const data = (await res.json()) as { items: Report[] };
        setReports(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function act(reportId: string, action: ModerationAction) {
    setActing(reportId);
    try {
      const res = await fetch(`/api/moderation/reports/${reportId}/act`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': api.getAdminKey?.() ?? '',
        },
        body: JSON.stringify({ moderatorId: 'admin', action, note: noteText || undefined }),
      });
      if (res.ok) {
        flash(`تم تنفيذ: ${ACTION_LABELS[action]}`);
        setNoteFor(null);
        setNoteText('');
        void load();
      }
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'removed', 'warned', 'suspended', 'banned', 'dismissed'] as ReportStatus[]).map((s) => (
          <button
            key={s}
            style={{
              padding: '6px 14px',
              borderRadius: 4,
              border: '1.5px solid',
              borderColor: statusFilter === s ? STATUS_COLORS[s] : '#ddd',
              background: statusFilter === s ? `${STATUS_COLORS[s]}18` : '#fff',
              color: statusFilter === s ? STATUS_COLORS[s] : '#555',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: statusFilter === s ? 600 : 400,
            }}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? <LoadingRow /> : reports.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد بلاغات بهذه الحالة.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>المحتوى</th>
              <th style={thStyle}>النوع</th>
              <th style={thStyle}>السبب</th>
              <th style={thStyle}>المُبلِّغ</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <>
                <tr key={r.id} style={{ background: noteFor === r.id ? '#f0f7ff' : undefined }}>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    <SensitiveText text={r.details ?? r.contentId.slice(0, 16)} />
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      ID: {r.contentId.slice(0, 12)}…
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: '#555', background: '#f0f0f0', padding: '2px 6px', borderRadius: 3 }}>
                      {r.contentType}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#777' }}>
                    {r.reporterId.slice(0, 12)}…
                  </td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                    {new Date(r.createdAt).toLocaleString('ar-IQ')}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {(['approve', 'remove', 'warn', 'suspend', 'ban', 'dismiss'] as ModerationAction[]).map((action) => (
                      <button
                        key={action}
                        style={{ ...btnStyle(ACTION_COLORS[action]), fontSize: 11, padding: '3px 7px' }}
                        disabled={acting === r.id}
                        onClick={() => {
                          if (action === 'warn' || action === 'suspend' || action === 'ban') {
                            setNoteFor(noteFor === r.id ? null : r.id);
                          } else {
                            void act(r.id, action);
                          }
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ))}
                  </td>
                </tr>
                {noteFor === r.id && (
                  <tr key={`${r.id}-note`}>
                    <td colSpan={7} style={{ ...tdStyle, background: '#f0f7ff', paddingTop: 8, paddingBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="ملاحظة (اختياري)"
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #bbb', fontSize: 13 }}
                          dir="rtl"
                        />
                        <button style={btnStyle(ACTION_COLORS['warn'])} onClick={() => void act(r.id, 'warn')}>تحذير</button>
                        <button style={btnStyle(ACTION_COLORS['suspend'])} onClick={() => void act(r.id, 'suspend')}>إيقاف</button>
                        <button style={btnStyle(ACTION_COLORS['ban'])} onClick={() => void act(r.id, 'ban')}>حظر</button>
                        <button style={btnStyle('#999')} onClick={() => { setNoteFor(null); setNoteText(''); }}>إلغاء</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Actions tab ──────────────────────────────────────────────────────────────

function ActionsTab(): ReactElement {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        // Fetch all reports and their actions
        const res = await fetch('/api/moderation/reports?limit=200', {
          headers: { 'x-admin-key': api.getAdminKey?.() ?? '' },
        });
        if (res.ok) {
          // For now show a placeholder — real impl would have a /actions endpoint
          setActions([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;

  return (
    <div>
      {actions.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد إجراءات مسجلة بعد.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>الإجراء</th>
              <th style={thStyle}>رقم البلاغ</th>
              <th style={thStyle}>المشرف</th>
              <th style={thStyle}>الملاحظة</th>
              <th style={thStyle}>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: ACTION_COLORS[a.action],
                    background: `${ACTION_COLORS[a.action]}18`,
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>
                    {ACTION_LABELS[a.action]}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#777' }}>{a.reportId.slice(0, 12)}…</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{a.moderatorId.slice(0, 12)}…</td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#555' }}>{a.note ?? '—'}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                  {new Date(a.createdAt).toLocaleString('ar-IQ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, bannedRes] = await Promise.all([
        fetch('/api/moderation/reports?limit=500', { headers: { 'x-admin-key': api.getAdminKey?.() ?? '' } }),
        fetch('/api/moderation/users/banned', { headers: { 'x-admin-key': api.getAdminKey?.() ?? '' } }),
      ]);

      const reportCountMap = new Map<string, number>();
      if (reportsRes.ok) {
        const data = (await reportsRes.json()) as { items: Report[] };
        for (const r of data.items) {
          reportCountMap.set(r.reporterId, (reportCountMap.get(r.reporterId) ?? 0) + 1);
        }
      }

      const suspensionMap = new Map<string, { type: string; expiresAt: string | null }>();
      if (bannedRes.ok) {
        const banned = (await bannedRes.json()) as Array<{ userId: string; type: string; expiresAt: string | null }>;
        for (const b of banned) suspensionMap.set(b.userId, { type: b.type, expiresAt: b.expiresAt });
      }

      // Merge
      const allUsers = new Set([...reportCountMap.keys(), ...suspensionMap.keys()]);
      const entries: UserEntry[] = [...allUsers].map((uid) => ({
        userId:       uid,
        reportCount:  reportCountMap.get(uid) ?? 0,
        suspension:   suspensionMap.get(uid) ?? null,
      }));

      entries.sort((a, b) => b.reportCount - a.reportCount);
      setUsers(entries);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function liftSuspension(userId: string) {
    const res = await fetch(`/api/moderation/users/${userId}/suspension`, {
      method: 'DELETE',
      headers: { 'x-admin-key': api.getAdminKey?.() ?? '' },
    });
    if (res.ok) {
      flash('تم رفع الإيقاف');
      void load();
    }
  }

  async function directAction(userId: string, type: 'suspend' | 'ban') {
    const reason = window.prompt(type === 'suspend' ? 'سبب الإيقاف:' : 'سبب الحظر:');
    if (!reason) return;
    const res = await fetch(`/api/moderation/users/${userId}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': api.getAdminKey?.() ?? '',
      },
      body: JSON.stringify({ moderatorId: 'admin', type, reason }),
    });
    if (res.ok) {
      flash(type === 'suspend' ? 'تم إيقاف المستخدم' : 'تم حظر المستخدم');
      void load();
    }
  }

  if (loading) return <LoadingRow />;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>المستخدم</th>
          <th style={thStyle}>عدد البلاغات</th>
          <th style={thStyle}>الحالة</th>
          <th style={thStyle}>ينتهي في</th>
          <th style={thStyle}>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {users.length === 0 ? (
          <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>لا يوجد مستخدمون.</td></tr>
        ) : users.map((u) => (
          <tr key={u.userId}>
            <td style={{ ...tdStyle, fontSize: 12 }}>{u.userId.slice(0, 16)}…</td>
            <td style={tdStyle}>
              <span style={{
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 12,
                background: u.reportCount >= 5 ? '#ffebee' : '#fff8e1',
                color: u.reportCount >= 5 ? '#c62828' : '#e65100',
                fontWeight: 600,
              }}>
                {u.reportCount}
              </span>
            </td>
            <td style={tdStyle}>
              {u.suspension ? (
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: u.suspension.type === 'ban' ? '#b71c1c' : '#6a1b9a',
                  background: u.suspension.type === 'ban' ? '#ffebee' : '#f3e5f5',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}>
                  {u.suspension.type === 'ban' ? 'محظور' : 'موقوف'}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#388e3c' }}>نشط</span>
              )}
            </td>
            <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
              {u.suspension?.expiresAt
                ? new Date(u.suspension.expiresAt).toLocaleString('ar-IQ')
                : u.suspension ? 'دائم' : '—'}
            </td>
            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
              {u.suspension ? (
                <button
                  style={btnStyle('#2e7d32')}
                  onClick={() => void liftSuspension(u.userId)}
                >
                  رفع الإيقاف
                </button>
              ) : (
                <>
                  <button style={btnStyle('#6a1b9a')} onClick={() => void directAction(u.userId, 'suspend')}>
                    إيقاف
                  </button>
                  <button style={btnStyle('#b71c1c')} onClick={() => void directAction(u.userId, 'ban')}>
                    حظر
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Word filter tab ──────────────────────────────────────────────────────────

function WordFiltersTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [locale, setLocale] = useState('ar');
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWord, setNewWord] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/moderation/word-filter?locale=${locale}`, {
        headers: { 'x-admin-key': api.getAdminKey?.() ?? '' },
      });
      if (res.ok) {
        const data = (await res.json()) as { words: string[] };
        setWords(data.words);
      }
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  async function addWords() {
    const trimmed = newWord.trim();
    if (!trimmed) return;
    const wordsToAdd = trimmed.split(/[\s,،]+/).filter(Boolean);
    setSaving(true);
    try {
      const res = await fetch('/api/moderation/word-filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': api.getAdminKey?.() ?? '',
        },
        body: JSON.stringify({ words: wordsToAdd, action: 'add', locale }),
      });
      if (res.ok) {
        flash(`أُضيف ${wordsToAdd.length} كلمة`);
        setNewWord('');
        void load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeWord(word: string) {
    const res = await fetch('/api/moderation/word-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': api.getAdminKey?.() ?? '',
      },
      body: JSON.stringify({ words: [word], action: 'remove', locale }),
    });
    if (res.ok) {
      flash(`حُذفت: ${word}`);
      void load();
    }
  }

  return (
    <div>
      {/* Locale tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {LOCALES.map((loc) => (
          <button
            key={loc}
            style={{
              padding: '6px 18px',
              borderRadius: 4,
              border: '1.5px solid',
              borderColor: locale === loc ? '#1565c0' : '#ddd',
              background: locale === loc ? '#e3f2fd' : '#fff',
              color: locale === loc ? '#1565c0' : '#555',
              fontWeight: locale === loc ? 700 : 400,
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => setLocale(loc)}
          >
            {loc === 'ar' ? 'عربي' : loc === 'ckb' ? 'کوردی' : 'English'}
          </button>
        ))}
      </div>

      {/* Add words */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addWords(); }}
          placeholder="أدخل كلمة أو عدة كلمات مفصولة بمسافة أو فاصلة"
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1.5px solid #ddd',
            fontSize: 14,
            direction: locale === 'en' ? 'ltr' : 'rtl',
          }}
          dir={locale === 'en' ? 'ltr' : 'rtl'}
        />
        <button
          style={{ ...btnStyle('#1565c0'), padding: '8px 20px', fontSize: 14 }}
          onClick={() => void addWords()}
          disabled={saving || !newWord.trim()}
        >
          إضافة
        </button>
      </div>

      {/* Word list */}
      {loading ? <LoadingRow /> : words.length === 0 ? (
        <p style={{ color: '#888' }}>لا توجد كلمات محظورة لهذه اللغة.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {words.map((word) => (
            <span
              key={word}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffebee',
                color: '#c62828',
                padding: '4px 10px',
                borderRadius: 16,
                fontSize: 14,
                fontWeight: 500,
                direction: locale === 'en' ? 'ltr' : 'rtl',
              }}
            >
              {word}
              <button
                onClick={() => void removeWord(word)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#c62828',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="حذف"
                aria-label={`حذف ${word}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
        المجموع: {words.length} كلمة
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<Tab, string> = {
  reports: 'البلاغات',
  actions: 'سجل الإجراءات',
  users:   'المستخدمون',
  words:   'الكلمات المحظورة',
};

export function AdminModerationPage(): ReactElement {
  const [tab, setTab] = useState<Tab>('reports');
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  return (
    <div>
      <PageHeader title="إدارة المحتوى والسلامة" />
      <FlashBanner msg={msg} />

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: 20 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #1565c0' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1565c0' : '#555',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'reports' && <ReportsTab flash={flash} />}
      {tab === 'actions' && <ActionsTab />}
      {tab === 'users'   && <UsersTab flash={flash} />}
      {tab === 'words'   && <WordFiltersTab flash={flash} />}
    </div>
  );
}
