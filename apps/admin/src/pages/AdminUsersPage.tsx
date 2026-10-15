import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type AdminUser } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner } from '../components/shared';

// ── Types ──────────────────────────────────────────────────────────────────

type UserStatus = 'all' | 'active' | 'suspended' | 'banned';
type SortKey = 'name' | 'createdAt' | 'postCount' | 'reportCount';
type SortDir = 'asc' | 'desc';

interface UserRow extends AdminUser {
  banned?: boolean;
  reportCount?: number;
  phone?: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const sectionHead: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 14,
  color: '#1a237e',
};

function StatusBadge({ user }: { user: UserRow }) {
  if (user.banned)
    return (
      <span
        style={{
          display: 'inline-block',
          background: '#b71c1c',
          color: '#fff',
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Banned
      </span>
    );
  if (user.suspended)
    return (
      <span
        style={{
          display: 'inline-block',
          background: '#e65100',
          color: '#fff',
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Suspended
      </span>
    );
  return (
    <span
      style={{
        display: 'inline-block',
        background: '#2e7d32',
        color: '#fff',
        borderRadius: 4,
        padding: '1px 8px',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      Active
    </span>
  );
}

// ── User detail modal ──────────────────────────────────────────────────────

interface ModalProps {
  user: UserRow;
  onClose: () => void;
  onSuspend: (id: string) => void;
  onUnsuspend: (id: string) => void;
  onBan: (id: string) => void;
}

function UserDetailModal({ user, onClose, onSuspend, onUnsuspend, onBan }: ModalProps) {
  const mockPosts = Array.from({ length: 6 }, (_, i) => ({
    id: `post-${i}`,
    body: `Sample post content #${i + 1} from this user…`,
    date: new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-US'),
  }));
  const mockLog = [
    { time: '2026-10-12 14:22', action: 'Signed in', detail: 'IP 185.x.x.x' },
    { time: '2026-10-11 09:10', action: 'Posted in Discover', detail: 'Post #3821' },
    { time: '2026-10-10 18:05', action: 'Filed report', detail: 'Against post #3712' },
    { time: '2026-10-08 11:30', action: 'Signed up', detail: 'Via phone OTP' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          width: '90%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,.25)',
          padding: 28,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{user.name ?? 'Anonymous User'}</h3>
            <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', marginTop: 4 }}>ID: {user.id}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}
          >
            ×
          </button>
        </div>

        {/* Info grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20,
            background: '#f8f9fa',
            borderRadius: 8,
            padding: 16,
          }}
        >
          {[
            { label: 'Phone', value: user.phone ?? '—' },
            { label: 'Locale', value: user.locale },
            { label: 'Joined', value: new Date(user.createdAt).toLocaleString('en-US') },
            { label: 'Roles', value: user.roles.join(', ') || 'user' },
            { label: 'Posts', value: String(user.postCount ?? 0) },
            { label: 'Reports Filed', value: String(user.reportCount ?? 0) },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Status + actions */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginBottom: 24,
            padding: '12px 16px',
            background: '#fff3e0',
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>Status:</span>
          <StatusBadge user={user} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {user.suspended ? (
              <button onClick={() => onUnsuspend(user.id)} style={btnStyle('#2e7d32')}>
                Lift Suspension
              </button>
            ) : (
              <button onClick={() => onSuspend(user.id)} style={btnStyle('#e65100')}>
                Suspend
              </button>
            )}
            {!user.banned && (
              <button
                onClick={() => {
                  if (confirm(`Ban user ${user.name ?? user.id}? This is permanent.`)) onBan(user.id);
                }}
                style={btnStyle('#b71c1c')}
              >
                Ban User
              </button>
            )}
          </div>
        </div>

        {/* Recent posts grid */}
        <div style={{ marginBottom: 20 }}>
          <div style={sectionHead}>Recent Posts</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {mockPosts.map((p) => (
              <div
                key={p.id}
                style={{
                  background: '#f5f5f5',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#444',
                }}
              >
                <div style={{ marginBottom: 4, color: '#888' }}>{p.date}</div>
                {p.body}
              </div>
            ))}
          </div>
        </div>

        {/* Activity log */}
        <div>
          <div style={sectionHead}>Activity Log</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {mockLog.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{l.time}</td>
                  <td style={tdStyle}>{l.action}</td>
                  <td style={{ ...tdStyle, color: '#777' }}>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────

function sortUsers(users: UserRow[], key: SortKey, dir: SortDir): UserRow[] {
  return [...users].sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    if (key === 'name') { av = a.name ?? ''; bv = b.name ?? ''; }
    if (key === 'createdAt') { av = a.createdAt; bv = b.createdAt; }
    if (key === 'postCount') { av = a.postCount ?? 0; bv = b.postCount ?? 0; }
    if (key === 'reportCount') { av = a.reportCount ?? 0; bv = b.reportCount ?? 0; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ── CSV export helper ──────────────────────────────────────────────────────

function exportCsv(users: UserRow[]) {
  const header = ['ID', 'Name', 'Phone', 'Locale', 'Joined', 'Posts', 'Reports', 'Status'];
  const rows = users.map((u) => [
    u.id,
    u.name ?? '',
    u.phone ?? '',
    u.locale,
    u.createdAt,
    u.postCount ?? 0,
    u.reportCount ?? 0,
    u.banned ? 'banned' : u.suspended ? 'suspended' : 'active',
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ──────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<UserStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(text: string, ms = 3000) {
    setMsg(text);
    setTimeout(() => setMsg(''), ms);
  }

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await api.searchUsers(q);
      // augment with fake fields for demo
      const rows: UserRow[] = data.map((u, i) => ({
        ...u,
        phone: `+964 7${String(70_000_000 + i).slice(1)}`,
        reportCount: Math.floor(Math.random() * 5),
        banned: false,
      }));
      setAllUsers(rows);
      setLoaded(true);
      setPage(1);
    } catch {
      flash('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    void search('');
  }, [search]);

  // debounced search on query change
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => void search(query), 350);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [query, search]);

  async function handleSuspend(id: string) {
    setBusy(id);
    try {
      await api.suspendUser(id);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? { ...u, suspended: true } : u)));
      if (modalUser?.id === id) setModalUser((m) => (m ? { ...m, suspended: true } : null));
      flash('User suspended');
    } catch {
      flash('Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleUnsuspend(id: string) {
    setBusy(id);
    try {
      await api.unsuspendUser(id);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? { ...u, suspended: false } : u)));
      if (modalUser?.id === id) setModalUser((m) => (m ? { ...m, suspended: false } : null));
      flash('Suspension lifted');
    } catch {
      flash('Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleBan(id: string) {
    setBusy(id);
    try {
      await api.banUser(id);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned: true, suspended: true } : u)));
      if (modalUser?.id === id) setModalUser((m) => (m ? { ...m, banned: true } : null));
      flash('User banned');
    } catch {
      flash('Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleBulkSuspend() {
    if (!selected.size) return;
    for (const id of selected) await handleSuspend(id);
    setSelected(new Set());
    flash(`${selected.size} users suspended`);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span style={{ color: '#ccc' }}> ↕</span>;
    return <span style={{ color: '#1565c0' }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>;
  }

  const filtered = allUsers.filter((u) => {
    if (statusFilter === 'active') return !u.suspended && !u.banned;
    if (statusFilter === 'suspended') return !!u.suspended && !u.banned;
    if (statusFilter === 'banned') return !!u.banned;
    return true;
  });
  const sorted = sortUsers(filtered, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map((u) => u.id)));
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>User Management</h2>
        <div style={{ fontSize: 14, color: '#888' }}>{filtered.length} users</div>
      </div>

      <FlashBanner msg={msg} />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ID…"
          style={{
            flex: '1 1 200px',
            padding: '8px 12px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 6,
          }}
        />

        {/* Status filter tabs */}
        {(['all', 'active', 'suspended', 'banned'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: '7px 14px',
              border: '1px solid #ccc',
              borderRadius: 6,
              background: statusFilter === s ? '#1565c0' : '#fff',
              color: statusFilter === s ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: statusFilter === s ? 700 : 400,
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div
          style={{
            background: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: '#1565c0', fontWeight: 600 }}>{selected.size} selected</span>
          <button onClick={handleBulkSuspend} style={btnStyle('#e65100')}>
            Suspend Selected
          </button>
          <button onClick={() => exportCsv(paginated.filter((u) => selected.has(u.id)))} style={btnStyle('#37474f')}>
            Export CSV
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ ...btnStyle('#888'), marginLeft: 'auto' }}
          >
            Clear
          </button>
        </div>
      )}

      {loading && <div style={{ color: '#888', padding: '20px 0' }}>Loading users…</div>}

      {!loading && loaded && filtered.length === 0 && (
        <div style={{ color: '#aaa', padding: '20px 0', textAlign: 'center' }}>No users match the filter</div>
      )}

      {!loading && paginated.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th style={thStyle}>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                    onClick={() => handleSort('name')}
                  >
                    Name <SortIcon k="name" />
                  </button>
                </th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                    onClick={() => handleSort('createdAt')}
                  >
                    Joined <SortIcon k="createdAt" />
                  </button>
                </th>
                <th style={thStyle}>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                    onClick={() => handleSort('postCount')}
                  >
                    Posts <SortIcon k="postCount" />
                  </button>
                </th>
                <th style={thStyle}>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                    onClick={() => handleSort('reportCount')}
                  >
                    Reports <SortIcon k="reportCount" />
                  </button>
                </th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    background: selected.has(u.id) ? '#e3f2fd' : u.banned ? '#ffebee' : u.suspended ? '#fff8e1' : undefined,
                  }}
                >
                  <td style={{ ...tdStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{u.name ?? <span style={{ color: '#aaa' }}>—</span>}</div>
                    <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', marginTop: 2 }}>{u.id}</div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{u.phone ?? '—'}</td>
                  <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString('en-US')}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{u.postCount ?? 0}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: (u.reportCount ?? 0) > 2 ? '#c62828' : undefined }}>
                    {u.reportCount ?? 0}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge user={u} />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setModalUser(u)}
                      style={{ ...btnStyle('#1565c0'), fontSize: 12 }}
                    >
                      View
                    </button>
                    {u.suspended && !u.banned ? (
                      <button
                        disabled={busy === u.id}
                        onClick={() => void handleUnsuspend(u.id)}
                        style={{ ...btnStyle('#2e7d32'), fontSize: 12 }}
                      >
                        Unsuspend
                      </button>
                    ) : !u.banned ? (
                      <button
                        disabled={busy === u.id}
                        onClick={() => void handleSuspend(u.id)}
                        style={{ ...btnStyle('#e65100'), fontSize: 12 }}
                      >
                        Suspend
                      </button>
                    ) : null}
                    {!u.banned && (
                      <button
                        disabled={busy === u.id}
                        onClick={() => { if (confirm(`Ban ${u.name ?? u.id}?`)) void handleBan(u.id); }}
                        style={{ ...btnStyle('#b71c1c'), fontSize: 12 }}
                      >
                        Ban
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 13, color: '#888' }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...btnStyle('#555'), opacity: page === 1 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ ...btnStyle('#555'), opacity: page === totalPages ? 0.4 : 1 }}
            >
              Next →
            </button>
            <button onClick={() => exportCsv(sorted)} style={btnStyle('#37474f')}>
              Export All CSV
            </button>
          </div>
        </>
      )}

      {modalUser && (
        <UserDetailModal
          user={modalUser}
          onClose={() => setModalUser(null)}
          onSuspend={(id) => void handleSuspend(id)}
          onUnsuspend={(id) => void handleUnsuspend(id)}
          onBan={(id) => void handleBan(id)}
        />
      )}
    </div>
  );
}
