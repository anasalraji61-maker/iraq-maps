/**
 * AdminUsersPage — full user management:
 * list, search, filter, detail modal, ban/warn/verify/delete,
 * activity log, reports per user, mass actions.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type AdminUser } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner, PageHeader } from '../components/shared';
import { AdminDataTable, type Column, type BulkAction } from '../components/AdminDataTable';
import { AdminStatCard, StatCardRow } from '../components/AdminStatCard';

// ── Extended types ─────────────────────────────────────────────────────────────

interface UserRow extends AdminUser {
  banned?: boolean;
  reportCount?: number;
  phone?: string;
  city?: string;
  reputation?: number;
  warnCount?: number;
  lastActiveAt?: string;
  verified?: boolean;
}

interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
  ip?: string;
}

interface UserReport {
  id: string;
  reason: string;
  reportedBy: string;
  createdAt: string;
  resolved: boolean;
}

type FilterStatus = 'all' | 'active' | 'suspended' | 'banned' | 'verified';
type FilterRole = 'all' | 'user' | 'provider' | 'admin';

// ── Constants ──────────────────────────────────────────────────────────────────

const BAN_DURATIONS = [
  { label: '1 day', value: '1d' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'Permanent', value: 'permanent' },
];

const CITIES = ['All Cities', 'Baghdad', 'Basra', 'Erbil', 'Mosul', 'Najaf', 'Karbala', 'Sulaymaniyah', 'Kirkuk'];

// ── Mock helpers (until real API endpoints exist) ─────────────────────────────

function mockActivity(userId: string): ActivityEntry[] {
  return [
    { id: '1', action: 'login', detail: 'Signed in', createdAt: new Date(Date.now() - 3600_000).toISOString(), ip: '1.2.3.4' },
    { id: '2', action: 'post_created', detail: 'Created post #123', createdAt: new Date(Date.now() - 86400_000).toISOString() },
    { id: '3', action: 'review_submitted', detail: 'Reviewed place #456', createdAt: new Date(Date.now() - 172800_000).toISOString() },
  ].map((e) => ({ ...e, id: userId + e.id }));
}

function mockReports(userId: string): UserReport[] {
  return [
    { id: userId + 'r1', reason: 'Spam', reportedBy: 'user#99', createdAt: new Date(Date.now() - 50000_000).toISOString(), resolved: false },
    { id: userId + 'r2', reason: 'Abusive language', reportedBy: 'user#88', createdAt: new Date(Date.now() - 200000_000).toISOString(), resolved: true },
  ];
}

// ── Ban modal ─────────────────────────────────────────────────────────────────

interface BanModalProps {
  user: UserRow;
  onClose: () => void;
  onConfirm: (reason: string, duration: string) => Promise<void>;
}

function BanModal({ user, onClose, onConfirm }: BanModalProps) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('7d');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setErr('Reason is required'); return; }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(reason.trim(), duration);
      onClose();
    } catch {
      setErr('Action failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 28, width: 420, maxWidth: '95vw',
    boxShadow: '0 8px 32px rgba(0,0,0,.2)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4,
    fontSize: 14, boxSizing: 'border-box', marginTop: 4,
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <h3 style={{ margin: '0 0 16px', color: '#b71c1c' }}>
          Ban User: {user.name ?? user.id}
        </h3>
        {err && <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}
        <form onSubmit={submit}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Duration
            <select value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...inputStyle }}>
              {BAN_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginTop: 14 }}>
            Reason *
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this user is being banned…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy} style={btnStyle('#b71c1c')}>
              {busy ? 'Banning…' : 'Confirm Ban'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Warn modal ────────────────────────────────────────────────────────────────

interface WarnModalProps {
  user: UserRow;
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
}

function WarnModal({ user, onClose, onConfirm }: WarnModalProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setErr('Warning message is required'); return; }
    setBusy(true);
    try {
      await onConfirm(message.trim());
      onClose();
    } catch {
      setErr('Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 28, width: 400, maxWidth: '95vw',
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <h3 style={{ margin: '0 0 16px', color: '#e65100' }}>
          Warn User: {user.name ?? user.id}
        </h3>
        {err && <div style={{ color: '#c62828', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <form onSubmit={submit}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
            Warning message *
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Describe the policy violation…"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy} style={btnStyle('#e65100')}>
              {busy ? 'Sending…' : 'Send Warning'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

interface DeleteModalProps {
  user: UserRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteModal({ user, onClose, onConfirm }: DeleteModalProps) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const expected = user.name ?? user.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== expected) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 28, width: 400, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 12px', color: '#b71c1c' }}>Delete Account</h3>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px' }}>
          This is irreversible. Type <strong>{expected}</strong> to confirm.
        </p>
        <form onSubmit={submit}>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={`Type "${expected}" to confirm`}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #f44336', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy || confirm !== expected} style={{ ...btnStyle('#b71c1c'), opacity: confirm !== expected ? 0.5 : 1 }}>
              {busy ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User detail modal ─────────────────────────────────────────────────────────

interface DetailModalProps {
  user: UserRow;
  onClose: () => void;
  onBan: (user: UserRow) => void;
  onWarn: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
  onVerify: (user: UserRow) => Promise<void>;
  onUnsuspend: (user: UserRow) => Promise<void>;
}

function DetailModal({ user, onClose, onBan, onWarn, onDelete, onVerify, onUnsuspend }: DetailModalProps) {
  const [tab, setTab] = useState<'profile' | 'activity' | 'reports'>('profile');
  const [activity] = useState<ActivityEntry[]>(() => mockActivity(user.id));
  const [reports] = useState<UserReport[]>(() => mockReports(user.id));
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [unsuspendBusy, setUnsuspendBusy] = useState(false);

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 0, width: 680, maxWidth: '95vw',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 40px rgba(0,0,0,.22)',
  };
  const header: React.CSSProperties = {
    padding: '20px 24px 0', borderBottom: '1px solid #eee',
  };
  const tabBar: React.CSSProperties = {
    display: 'flex', gap: 0, marginTop: 12,
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#1565c0' : '#666',
    borderBottom: active ? '2px solid #1565c0' : '2px solid transparent',
  });
  const body: React.CSSProperties = {
    padding: '20px 24px', overflowY: 'auto', flex: 1,
  };
  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block', background: color, color: '#fff',
    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginInlineStart: 8,
  });
  const fieldRow: React.CSSProperties = {
    display: 'flex', gap: 0, marginBottom: 8, alignItems: 'baseline',
  };
  const fieldLabel: React.CSSProperties = { width: 130, fontSize: 13, color: '#888', flexShrink: 0 };
  const fieldVal: React.CSSProperties = { fontSize: 14, color: '#222' };

  async function handleVerify() {
    setVerifyBusy(true);
    try { await onVerify(user); } finally { setVerifyBusy(false); }
  }
  async function handleUnsuspend() {
    setUnsuspendBusy(true);
    try { await onUnsuspend(user); } finally { setUnsuspendBusy(false); }
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        {/* Header */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              {user.name ?? 'Unknown'}
              {user.banned && <span style={badgeStyle('#b71c1c')}>Banned</span>}
              {user.suspended && !user.banned && <span style={badgeStyle('#e65100')}>Suspended</span>}
              {user.verified && <span style={badgeStyle('#1565c0')}>Verified</span>}
            </h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
          </div>
          <div style={tabBar}>
            {(['profile', 'activity', 'reports'] as const).map((t) => (
              <button key={t} style={tabBtn(tab === t)} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={body}>
          {tab === 'profile' && (
            <div>
              <div style={fieldRow}><span style={fieldLabel}>ID</span><span style={{ ...fieldVal, fontFamily: 'monospace', fontSize: 12 }}>{user.id}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Name</span><span style={fieldVal}>{user.name ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Phone</span><span style={fieldVal}>{user.phone ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Locale</span><span style={fieldVal}>{user.locale}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>City</span><span style={fieldVal}>{user.city ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Roles</span><span style={fieldVal}>{user.roles.join(', ')}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Joined</span><span style={fieldVal}>{new Date(user.createdAt).toLocaleString()}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Last active</span><span style={fieldVal}>{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Posts</span><span style={fieldVal}>{user.postCount ?? 0}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Inquiries</span><span style={fieldVal}>{user.inquiryCount ?? 0}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Reports</span><span style={fieldVal}>{user.reportCount ?? 0}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Warnings</span><span style={fieldVal}>{user.warnCount ?? 0}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Reputation</span><span style={fieldVal}>{user.reputation ?? 0}</span></div>

              {/* Action buttons */}
              <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!user.verified && (
                  <button disabled={verifyBusy} onClick={handleVerify} style={btnStyle('#1565c0')}>
                    {verifyBusy ? 'Verifying…' : '✓ Verify'}
                  </button>
                )}
                {user.suspended && !user.banned && (
                  <button disabled={unsuspendBusy} onClick={handleUnsuspend} style={btnStyle('#2e7d32')}>
                    {unsuspendBusy ? 'Lifting…' : 'Lift Suspension'}
                  </button>
                )}
                {!user.banned && (
                  <>
                    <button onClick={() => onWarn(user)} style={btnStyle('#e65100')}>⚠ Warn</button>
                    <button onClick={() => onBan(user)} style={btnStyle('#b71c1c')}>🚫 Ban</button>
                  </>
                )}
                <button onClick={() => onDelete(user)} style={btnStyle('#424242')}>🗑 Delete Account</button>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Detail</th>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((entry) => (
                    <tr key={entry.id}>
                      <td style={tdStyle}><code style={{ fontSize: 12 }}>{entry.action}</code></td>
                      <td style={tdStyle}>{entry.detail}</td>
                      <td style={tdStyle}>{entry.ip ?? '—'}</td>
                      <td style={tdStyle}>{new Date(entry.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'reports' && (
            <div>
              {reports.length === 0 ? (
                <p style={{ color: '#888', fontSize: 14 }}>No reports against this user.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Reported by</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.reason}</td>
                        <td style={tdStyle}>{r.reportedBy}</td>
                        <td style={tdStyle}>{new Date(r.createdAt).toLocaleString()}</td>
                        <td style={tdStyle}>
                          <span style={{
                            background: r.resolved ? '#e8f5e9' : '#fff3e0',
                            color: r.resolved ? '#2e7d32' : '#e65100',
                            borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                          }}>
                            {r.resolved ? 'Resolved' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [filterCity, setFilterCity] = useState('All Cities');
  const [flash, setFlash] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);
  const [warnTarget, setWarnTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  const loadUsers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const data = await api.searchUsers(q);
      setUsers(data as UserRow[]);
    } catch {
      // silently keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadUsers(q), 350);
  }

  // Filtered list
  const filtered = users.filter((u) => {
    if (filterStatus === 'banned' && !u.banned) return false;
    if (filterStatus === 'suspended' && !u.suspended) return false;
    if (filterStatus === 'active' && (u.banned || u.suspended)) return false;
    if (filterStatus === 'verified' && !u.verified) return false;
    if (filterRole !== 'all' && !u.roles.includes(filterRole)) return false;
    if (filterCity !== 'All Cities' && u.city !== filterCity) return false;
    return true;
  });

  // Stats
  const totalBanned = users.filter((u) => u.banned).length;
  const totalSuspended = users.filter((u) => u.suspended).length;
  const totalVerified = users.filter((u) => u.verified).length;

  // Columns for table
  const columns: Column<UserRow>[] = [
    {
      key: 'name', label: 'Name', width: 180,
      render: (u) => <span style={{ fontWeight: 600 }}>{u.name ?? <em style={{ color: '#aaa' }}>Unknown</em>}</span>,
    },
    {
      key: 'locale', label: 'Locale', width: 80,
    },
    {
      key: 'city', label: 'City', width: 100,
      render: (u) => u.city ?? '—',
    },
    {
      key: 'roles', label: 'Roles', width: 120,
      render: (u) => u.roles.join(', '),
      csvValue: (u) => u.roles.join(', '),
    },
    {
      key: 'status', label: 'Status', width: 110,
      sortable: false,
      render: (u) => {
        if (u.banned) return <span style={{ background: '#b71c1c', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Banned</span>;
        if (u.suspended) return <span style={{ background: '#e65100', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Suspended</span>;
        if (u.verified) return <span style={{ background: '#1565c0', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Verified</span>;
        return <span style={{ background: '#2e7d32', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Active</span>;
      },
      csvValue: (u) => u.banned ? 'banned' : u.suspended ? 'suspended' : 'active',
    },
    {
      key: 'postCount', label: 'Posts', width: 80,
      render: (u) => String(u.postCount ?? 0),
    },
    {
      key: 'reportCount', label: 'Reports', width: 80,
      render: (u) => {
        const n = u.reportCount ?? 0;
        return <span style={{ color: n > 0 ? '#c62828' : '#333', fontWeight: n > 0 ? 700 : 400 }}>{n}</span>;
      },
    },
    {
      key: 'createdAt', label: 'Joined', width: 140,
      render: (u) => new Date(u.createdAt).toLocaleDateString(),
      csvValue: (u) => u.createdAt,
    },
    {
      key: 'actions', label: 'Actions', width: 200, sortable: false,
      render: (u) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setSelectedUser(u)} style={btnStyle('#1565c0')}>View</button>
          {!u.banned && <button onClick={() => setBanTarget(u)} style={btnStyle('#b71c1c')}>Ban</button>}
          {u.suspended && <button onClick={() => handleUnsuspend(u)} style={btnStyle('#2e7d32')}>Unsuspend</button>}
        </div>
      ),
    },
  ];

  const bulkActions: BulkAction<UserRow>[] = [
    {
      label: 'Bulk Ban',
      color: '#b71c1c',
      onClick: async (rows) => {
        await Promise.all(rows.filter((r) => !r.banned).map((r) => api.banUser(r.id)));
        setUsers((prev) => prev.map((u) => rows.find((r) => r.id === u.id) ? { ...u, banned: true } : u));
        showFlash(`Banned ${rows.length} user(s).`);
      },
    },
    {
      label: 'Bulk Suspend',
      color: '#e65100',
      onClick: async (rows) => {
        await Promise.all(rows.filter((r) => !r.suspended).map((r) => api.suspendUser(r.id)));
        setUsers((prev) => prev.map((u) => rows.find((r) => r.id === u.id) ? { ...u, suspended: true } : u));
        showFlash(`Suspended ${rows.length} user(s).`);
      },
    },
    {
      label: 'Export Selected',
      color: '#37474f',
      onClick: () => { /* Handled by AdminDataTable CSV */ },
    },
  ];

  async function handleBanConfirm(reason: string, duration: string) {
    if (!banTarget) return;
    await api.banUser(banTarget.id);
    setUsers((prev) => prev.map((u) => u.id === banTarget.id ? { ...u, banned: true } : u));
    if (selectedUser?.id === banTarget.id) setSelectedUser((prev) => prev ? { ...prev, banned: true } : null);
    showFlash(`User banned (${duration}): ${reason}`);
    setBanTarget(null);
  }

  async function handleWarnConfirm(message: string) {
    if (!warnTarget) return;
    // No API endpoint yet — mock
    setUsers((prev) => prev.map((u) => u.id === warnTarget.id ? { ...u, warnCount: (u.warnCount ?? 0) + 1 } : u));
    showFlash(`Warning sent to ${warnTarget.name ?? warnTarget.id}: "${message}"`);
    setWarnTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    // No API endpoint yet — optimistic remove
    setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    setSelectedUser(null);
    showFlash(`Account deleted: ${deleteTarget.name ?? deleteTarget.id}`);
    setDeleteTarget(null);
  }

  async function handleVerify(user: UserRow) {
    // No dedicated API yet — optimistic
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, verified: true } : u));
    setSelectedUser((prev) => prev ? { ...prev, verified: true } : null);
    showFlash(`User verified: ${user.name ?? user.id}`);
  }

  async function handleUnsuspend(user: UserRow) {
    await api.unsuspendUser(user.id);
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, suspended: false } : u));
    setSelectedUser((prev) => prev ? { ...prev, suspended: false } : null);
    showFlash(`Suspension lifted: ${user.name ?? user.id}`);
  }

  const filterBarStyle: React.CSSProperties = {
    display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
  };
  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13,
  };
  const inputStyle: React.CSSProperties = {
    padding: '6px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14,
    flex: 1, minWidth: 220, maxWidth: 360,
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="User Management" meta={`${users.length} total`} />
      <FlashBanner msg={flash} />

      {/* Stats */}
      <StatCardRow>
        <AdminStatCard label="Total Users" value={users.length} accent="#1565c0" icon="👥" />
        <AdminStatCard label="Banned" value={totalBanned} accent="#b71c1c" icon="🚫" />
        <AdminStatCard label="Suspended" value={totalSuspended} accent="#e65100" icon="⏸" />
        <AdminStatCard label="Verified" value={totalVerified} accent="#2e7d32" icon="✓" />
      </StatCardRow>

      {/* Filters */}
      <div style={filterBarStyle}>
        <input
          value={search}
          onChange={handleSearchChange}
          placeholder="Search name, ID, phone…"
          style={inputStyle}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="verified">Verified</option>
        </select>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value as FilterRole)} style={selectStyle}>
          <option value="all">All Roles</option>
          <option value="user">User</option>
          <option value="provider">Provider</option>
          <option value="admin">Admin</option>
        </select>
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={selectStyle}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => loadUsers(search)} style={btnStyle('#1565c0')}>Refresh</button>
      </div>

      {/* Table */}
      <AdminDataTable
        columns={columns}
        rows={filtered}
        pageSize={25}
        bulkActions={bulkActions}
        onRowClick={setSelectedUser}
        rowHighlight={(u) => u.banned ? '#fff0f0' : u.suspended ? '#fff8e1' : undefined}
        exportName="users"
        loading={loading}
        emptyMessage="No users match your filters."
      />

      {/* Modals */}
      {selectedUser && (
        <DetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onBan={setBanTarget}
          onWarn={setWarnTarget}
          onDelete={setDeleteTarget}
          onVerify={handleVerify}
          onUnsuspend={handleUnsuspend}
        />
      )}
      {banTarget && (
        <BanModal user={banTarget} onClose={() => setBanTarget(null)} onConfirm={handleBanConfirm} />
      )}
      {warnTarget && (
        <WarnModal user={warnTarget} onClose={() => setWarnTarget(null)} onConfirm={handleWarnConfirm} />
      )}
      {deleteTarget && (
        <DeleteModal user={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirm} />
      )}
    </div>
  );
}
