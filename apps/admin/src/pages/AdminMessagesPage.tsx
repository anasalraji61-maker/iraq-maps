/**
 * AdminMessagesPage — message monitoring:
 * aggregate stats, flagged conversations, read-only thread viewer,
 * block user from messaging, report analysis.
 */
import { useState } from 'react';
import { btnStyle, FlashBanner, PageHeader } from '../components/shared';
import { AdminStatCard, StatCardRow } from '../components/AdminStatCard';
import { AdminChartLine } from '../components/AdminChartLine';
import { AdminDataTable, type Column } from '../components/AdminDataTable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageStats {
  totalToday: number;
  totalWeek: number;
  spamFlagged: number;
  blockedUsers: number;
  avgResponseTime: number; // seconds
  deliveryRate: number; // 0–1
}

interface Conversation {
  id: string;
  userId: string;
  userName: string | null;
  providerId: string;
  providerName: string;
  messageCount: number;
  flagCount: number;
  flagReason?: string;
  lastMessageAt: string;
  status: 'active' | 'flagged' | 'blocked';
  city?: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  direction: 'user_to_provider' | 'provider_to_user';
  body: string;
  sentAt: string;
  flagged?: boolean;
  flagReason?: string;
}

interface ReportedUser {
  userId: string;
  userName: string | null;
  reportCount: number;
  lastReportAt: string;
  blocked: boolean;
}

type ViewTab = 'overview' | 'conversations' | 'reported';

// ── Mock data ──────────────────────────────────────────────────────────────────

function mockStats(): MessageStats {
  return {
    totalToday: 842,
    totalWeek: 5630,
    spamFlagged: 23,
    blockedUsers: 7,
    avgResponseTime: 180,
    deliveryRate: 0.97,
  };
}

function mockConversations(): Conversation[] {
  return [
    { id: 'c1', userId: 'u1', userName: 'Ahmed Ali', providerId: 'p1', providerName: 'مطعم البغدادي', messageCount: 14, flagCount: 3, flagReason: 'Suspected spam', lastMessageAt: new Date(Date.now() - 3600_000).toISOString(), status: 'flagged', city: 'Baghdad' },
    { id: 'c2', userId: 'u2', userName: 'Sara Hassan', providerId: 'p2', providerName: 'فندق الرشيد', messageCount: 4, flagCount: 0, lastMessageAt: new Date(Date.now() - 7200_000).toISOString(), status: 'active', city: 'Baghdad' },
    { id: 'c3', userId: 'u3', userName: null, providerId: 'p3', providerName: 'صيدلية النور', messageCount: 2, flagCount: 1, flagReason: 'Abusive language', lastMessageAt: new Date(Date.now() - 86400_000).toISOString(), status: 'flagged', city: 'Basra' },
    { id: 'c4', userId: 'u4', userName: 'Omar Khaled', providerId: 'p1', providerName: 'مطعم البغدادي', messageCount: 1, flagCount: 0, lastMessageAt: new Date(Date.now() - 172800_000).toISOString(), status: 'blocked', city: 'Erbil' },
    { id: 'c5', userId: 'u5', userName: 'Fatima Al-Zahra', providerId: 'p4', providerName: 'كافيه الأمل', messageCount: 8, flagCount: 2, flagReason: 'Spam links', lastMessageAt: new Date(Date.now() - 1800_000).toISOString(), status: 'flagged', city: 'Baghdad' },
  ];
}

function mockMessages(conversationId: string): Message[] {
  return [
    { id: 'm1' + conversationId, conversationId, senderId: 'u1', senderName: 'Ahmed Ali', direction: 'user_to_provider', body: 'هل لديكم طاولات متاحة الليلة؟', sentAt: new Date(Date.now() - 3700_000).toISOString() },
    { id: 'm2' + conversationId, conversationId, senderId: 'p1', senderName: 'مطعم البغدادي', direction: 'provider_to_user', body: 'نعم، لدينا طاولات متاحة. يرجى الحجز من خلال التطبيق.', sentAt: new Date(Date.now() - 3600_000).toISOString() },
    { id: 'm3' + conversationId, conversationId, senderId: 'u1', senderName: 'Ahmed Ali', direction: 'user_to_provider', body: 'شكراً. هل يمكن الحجز لـ 6 أشخاص؟', sentAt: new Date(Date.now() - 3500_000).toISOString() },
    { id: 'm4' + conversationId, conversationId, senderId: 'u1', senderName: 'Ahmed Ali', direction: 'user_to_provider', body: 'http://spam-link.example.com اضغط هنا للحصول على جوائز!', sentAt: new Date(Date.now() - 3400_000).toISOString(), flagged: true, flagReason: 'Contains spam URL' },
  ];
}

function mockReportedUsers(): ReportedUser[] {
  return [
    { userId: 'u1', userName: 'Ahmed Ali', reportCount: 8, lastReportAt: new Date(Date.now() - 3600_000).toISOString(), blocked: false },
    { userId: 'u3', userName: null, reportCount: 5, lastReportAt: new Date(Date.now() - 86400_000).toISOString(), blocked: false },
    { userId: 'u7', userName: 'Spam Bot 7', reportCount: 14, lastReportAt: new Date(Date.now() - 1800_000).toISOString(), blocked: true },
    { userId: 'u5', userName: 'Fatima Al-Zahra', reportCount: 3, lastReportAt: new Date(Date.now() - 172800_000).toISOString(), blocked: false },
  ];
}

function mockDailyVolume(): { x: string; y: number }[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { x: d.toISOString().slice(0, 10), y: Math.floor(400 + Math.random() * 600) };
  });
}

// ── Thread viewer modal ───────────────────────────────────────────────────────

interface ThreadViewerProps {
  conversation: Conversation;
  onClose: () => void;
  onBlock: (userId: string) => Promise<void>;
}

function ThreadViewer({ conversation, onClose, onBlock }: ThreadViewerProps) {
  const messages = mockMessages(conversation.id);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(conversation.status === 'blocked');

  async function handleBlock() {
    setBlocking(true);
    try {
      await onBlock(conversation.userId);
      setBlocked(true);
    } finally {
      setBlocking(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, width: 580, maxWidth: '95vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.2)',
  };
  const bubbleStyle = (dir: Message['direction'], flagged?: boolean): React.CSSProperties => ({
    maxWidth: '78%',
    padding: '10px 14px',
    borderRadius: dir === 'user_to_provider' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: flagged ? '#ffebee' : dir === 'user_to_provider' ? '#e3f2fd' : '#f3e5f5',
    border: flagged ? '1px solid #ef9a9a' : 'none',
    fontSize: 14,
    lineHeight: 1.5,
    color: '#1a1a1a',
    wordBreak: 'break-word',
  });

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {conversation.userName ?? 'Unknown User'} → {conversation.providerName}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {conversation.messageCount} messages · {conversation.flagCount} flagged
              {conversation.flagReason && ` · ${conversation.flagReason}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!blocked && (
              <button onClick={handleBlock} disabled={blocking} style={btnStyle('#b71c1c')}>
                {blocking ? '…' : '🚫 Block User'}
              </button>
            )}
            {blocked && (
              <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                User Blocked
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
          </div>
        </div>

        {/* Read-only thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
            Read-only view — moderation only
          </div>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: m.direction === 'user_to_provider' ? 'row' : 'row-reverse',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              <div style={bubbleStyle(m.direction, m.flagged)}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600 }}>
                  {m.senderName ?? 'Unknown'}
                  {m.flagged && (
                    <span style={{ background: '#ffcdd2', color: '#c62828', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700, marginInlineStart: 6 }}>
                      🚩 {m.flagReason}
                    </span>
                  )}
                </div>
                {m.body}
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' }}>
                  {new Date(m.sentAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AdminMessagesPage() {
  const [tab, setTab] = useState<ViewTab>('overview');
  const [stats] = useState<MessageStats>(mockStats);
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [reportedUsers, setReportedUsers] = useState<ReportedUser[]>(mockReportedUsers);
  const [flash, setFlash] = useState('');
  const [viewThread, setViewThread] = useState<Conversation | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'flagged' | 'blocked' | 'active'>('all');
  const [dailyVolume] = useState(() => mockDailyVolume());

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  async function handleBlockUser(userId: string) {
    setConversations((prev) =>
      prev.map((c) => c.userId === userId ? { ...c, status: 'blocked' as const } : c),
    );
    setReportedUsers((prev) =>
      prev.map((u) => u.userId === userId ? { ...u, blocked: true } : u),
    );
    showFlash(`User ${userId} blocked from messaging.`);
  }

  async function handleUnblockUser(userId: string) {
    setConversations((prev) =>
      prev.map((c) => c.userId === userId ? { ...c, status: 'active' as const } : c),
    );
    setReportedUsers((prev) =>
      prev.map((u) => u.userId === userId ? { ...u, blocked: false } : u),
    );
    showFlash(`User ${userId} unblocked.`);
  }

  const filteredConvos = conversations.filter((c) =>
    filterStatus === 'all' ? true : c.status === filterStatus,
  );

  // Conversation columns
  const convoColumns: Column<Conversation>[] = [
    {
      key: 'userName', label: 'User', width: 150,
      render: (c) => c.userName ?? <em style={{ color: '#aaa' }}>Unknown</em>,
    },
    { key: 'providerName', label: 'Provider', width: 160 },
    { key: 'city', label: 'City', width: 90, render: (c) => c.city ?? '—' },
    { key: 'messageCount', label: 'Messages', width: 90 },
    {
      key: 'flagCount', label: 'Flags', width: 70,
      render: (c) => (
        <span style={{ color: c.flagCount > 0 ? '#c62828' : '#333', fontWeight: c.flagCount > 0 ? 700 : 400 }}>
          {c.flagCount}
        </span>
      ),
    },
    { key: 'flagReason', label: 'Reason', width: 150, render: (c) => c.flagReason ?? '—' },
    {
      key: 'status', label: 'Status', width: 100, sortable: false,
      render: (c) => {
        const map = { flagged: ['#c62828', 'Flagged'], blocked: ['#37474f', 'Blocked'], active: ['#2e7d32', 'Active'] };
        const [color, label] = (map[c.status] ?? ['#333', c.status]) as [string, string];
        return <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{label}</span>;
      },
    },
    {
      key: 'lastMessageAt', label: 'Last Message', width: 140,
      render: (c) => new Date(c.lastMessageAt).toLocaleString(),
    },
    {
      key: 'actions', label: 'Actions', width: 160, sortable: false,
      render: (c) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setViewThread(c)} style={btnStyle('#1565c0')}>View</button>
          {c.status !== 'blocked'
            ? <button onClick={() => handleBlockUser(c.userId)} style={btnStyle('#b71c1c')}>Block</button>
            : <button onClick={() => handleUnblockUser(c.userId)} style={btnStyle('#2e7d32')}>Unblock</button>
          }
        </div>
      ),
    },
  ];

  // Reported users columns
  const reportedColumns: Column<ReportedUser & { id: string }>[] = [
    {
      key: 'userName', label: 'User', width: 180,
      render: (u) => u.userName ?? <em style={{ color: '#aaa' }}>Unknown ({u.userId.slice(0, 8)})</em>,
    },
    {
      key: 'reportCount', label: 'Reports', width: 90,
      render: (u) => (
        <span style={{ color: u.reportCount >= 5 ? '#c62828' : '#e65100', fontWeight: 700 }}>
          {u.reportCount}
        </span>
      ),
    },
    {
      key: 'lastReportAt', label: 'Last Report', width: 140,
      render: (u) => new Date(u.lastReportAt).toLocaleString(),
    },
    {
      key: 'blocked', label: 'Status', width: 90, sortable: false,
      render: (u) => u.blocked
        ? <span style={{ background: '#37474f', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Blocked</span>
        : <span style={{ background: '#2e7d32', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Active</span>,
    },
    {
      key: 'actions', label: 'Actions', width: 130, sortable: false,
      render: (u) => (
        <div onClick={(e) => e.stopPropagation()}>
          {!u.blocked
            ? <button onClick={() => handleBlockUser(u.userId)} style={btnStyle('#b71c1c')}>Block</button>
            : <button onClick={() => handleUnblockUser(u.userId)} style={btnStyle('#2e7d32')}>Unblock</button>
          }
        </div>
      ),
    },
  ];

  const reportedRows = reportedUsers.map((u) => ({ ...u, id: u.userId }));

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#1565c0' : '#666',
    borderBottom: active ? '2px solid #1565c0' : '2px solid transparent',
  });

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13,
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Message Monitoring" />
      <FlashBanner msg={flash} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        {(['overview', 'conversations', 'reported'] as const).map((t) => (
          <button key={t} style={tabBtnStyle(tab === t)} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'conversations' ? 'Flagged Conversations' : 'Reported Users'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div>
          <StatCardRow>
            <AdminStatCard label="Messages Today" value={stats.totalToday} accent="#1565c0" icon="✉" />
            <AdminStatCard label="This Week" value={stats.totalWeek} accent="#2e7d32" icon="📬" />
            <AdminStatCard label="Spam Flagged" value={stats.spamFlagged} accent="#c62828" icon="🚩" />
            <AdminStatCard label="Blocked Users" value={stats.blockedUsers} accent="#37474f" icon="🚫" />
            <AdminStatCard label="Avg Response" value={Math.round(stats.avgResponseTime / 60) + 'm'} accent="#6a1b9a" icon="⏱" />
            <AdminStatCard label="Delivery Rate" value={Math.round(stats.deliveryRate * 100) + '%'} accent="#00838f" icon="✓" />
          </StatCardRow>

          <div style={{ marginBottom: 24 }}>
            <AdminChartLine
              title="Daily Message Volume (last 14 days)"
              series={[{ label: 'Messages', data: dailyVolume, color: '#1565c0' }]}
              height={220}
            />
          </div>

          {/* Flagged summary */}
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Recent Flagged Conversations</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>User</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>Provider</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>Reason</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>Flags</th>
                <th style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '2px solid #ddd' }} />
              </tr>
            </thead>
            <tbody>
              {conversations.filter((c) => c.status === 'flagged').map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 14 }}>{c.userName ?? '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 14 }}>{c.providerName}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 13, color: '#c62828' }}>{c.flagReason ?? '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 14, fontWeight: 700, color: '#c62828' }}>{c.flagCount}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                    <button onClick={() => setViewThread(c)} style={btnStyle('#1565c0')}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flagged Conversations tab */}
      {tab === 'conversations' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555' }}>Filter:</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} style={selectStyle}>
              <option value="all">All</option>
              <option value="flagged">Flagged</option>
              <option value="blocked">Blocked</option>
              <option value="active">Active</option>
            </select>
            <span style={{ fontSize: 13, color: '#888', marginInlineStart: 8 }}>
              {filteredConvos.length} conversation(s)
            </span>
          </div>
          <AdminDataTable
            columns={convoColumns}
            rows={filteredConvos}
            pageSize={20}
            onRowClick={setViewThread}
            rowHighlight={(c) => c.status === 'flagged' ? '#fff3e0' : c.status === 'blocked' ? '#fafafa' : undefined}
            exportName="conversations"
            emptyMessage="No conversations match."
          />
        </div>
      )}

      {/* Reported Users tab */}
      {tab === 'reported' && (
        <div>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 14px' }}>
            Users ranked by number of message reports. Blocked users cannot send messages.
          </p>
          <AdminDataTable
            columns={reportedColumns}
            rows={reportedRows}
            pageSize={20}
            exportName="reported-users"
            emptyMessage="No reported users."
          />
        </div>
      )}

      {/* Thread viewer */}
      {viewThread && (
        <ThreadViewer
          conversation={viewThread}
          onClose={() => setViewThread(null)}
          onBlock={handleBlockUser}
        />
      )}
    </div>
  );
}
