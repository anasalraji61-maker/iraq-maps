import { useState, useEffect, useCallback } from 'react';
import { api, type DailyMetric, type Metrics } from '../api';

// ── Styles ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '20px 24px',
};

const kpiNum: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 700,
  margin: '8px 0 2px',
  lineHeight: 1,
};

const kpiLabel: React.CSSProperties = { fontSize: 13, color: '#777', marginBottom: 2 };

const sectionHead: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 16,
  color: '#1a237e',
  borderBottom: '2px solid #e8eaf6',
  paddingBottom: 8,
};

// ── KPI card ───────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: number | string;
  color?: string;
  sub?: string;
  accent?: boolean;
}
function KpiCard({ label, value, color = '#1565c0', sub, accent }: KpiProps) {
  return (
    <div
      style={{
        ...card,
        flex: '1 1 160px',
        minWidth: 150,
        borderLeft: `4px solid ${color}`,
        background: accent ? '#fff8e1' : '#fff',
      }}
    >
      <div style={kpiLabel}>{label}</div>
      <div style={{ ...kpiNum, color }}>{typeof value === 'number' ? value.toLocaleString('en-US') : value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── SVG Line chart ─────────────────────────────────────────────────────────

function LineChart({ data, color, title }: { data: DailyMetric[]; color: string; title: string }) {
  if (!data.length) return <p style={{ color: '#aaa', fontSize: 13 }}>No data</p>;
  const W = 480;
  const H = 130;
  const PL = 36;
  const PR = 12;
  const PT = 12;
  const PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const pts = data.map((d, i) => ({
    x: PL + (i / (data.length - 1 || 1)) * chartW,
    y: PT + chartH - (d.count / maxVal) * chartH,
    d,
  }));
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = [
    `${pts[0].x},${PT + chartH}`,
    ...pts.map((p) => `${p.x},${p.y}`),
    `${pts[pts.length - 1].x},${PT + chartH}`,
  ].join(' ');

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#333' }}>{title}</div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid */}
        {[0, 0.5, 1].map((f) => {
          const y = PT + chartH * (1 - f);
          return (
            <g key={f}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#bbb">
                {Math.round(maxVal * f)}
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        <polygon points={area} fill={color} opacity={0.08} />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
        {/* X labels — every 5th */}
        {pts
          .filter((_, i) => i % Math.max(1, Math.floor(data.length / 6)) === 0 || i === data.length - 1)
          .map((p, i) => (
            <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="#aaa">
              {p.d.date.slice(5)}
            </text>
          ))}
      </svg>
    </div>
  );
}

// ── SVG Bar chart ──────────────────────────────────────────────────────────

function BarChart({ data, color, title }: { data: DailyMetric[]; color: string; title: string }) {
  if (!data.length) return <p style={{ color: '#aaa', fontSize: 13 }}>No data</p>;
  const W = 480;
  const H = 130;
  const PL = 36;
  const PR = 12;
  const PT = 12;
  const PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barW = Math.max(2, Math.floor(chartW / data.length) - 3);

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#333' }}>{title}</div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map((f) => {
          const y = PT + chartH * (1 - f);
          return (
            <g key={f}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#bbb">
                {Math.round(maxVal * f)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const barH = Math.max(2, (d.count / maxVal) * chartH);
          const x = PL + (i / data.length) * chartW;
          const y = PT + chartH - barH;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} opacity={0.85} />
              {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#aaa">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── System health block ────────────────────────────────────────────────────

interface HealthMetric {
  label: string;
  value: string;
  ok: boolean;
}

function HealthRow({ label, value, ok }: HealthMetric) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid #f5f5f5',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#555' }}>{label}</span>
      <span
        style={{
          padding: '2px 10px',
          borderRadius: 12,
          background: ok ? '#e8f5e9' : '#ffebee',
          color: ok ? '#2e7d32' : '#c62828',
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Activity feed ──────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  type: 'user_join' | 'report' | 'approval' | 'ban' | 'post' | 'verification';
  text: string;
  time: string;
}

const EVENT_ICONS: Record<ActivityEvent['type'], string> = {
  user_join: '👤',
  report: '🚩',
  approval: '✅',
  ban: '🚫',
  post: '📝',
  verification: '🏢',
};

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return <p style={{ color: '#aaa', fontSize: 13 }}>No recent activity</p>;
  }
  return (
    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
      {events.map((ev) => (
        <div
          key={ev.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '8px 0',
            borderBottom: '1px solid #f5f5f5',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: 16, minWidth: 24 }}>{EVENT_ICONS[ev.type]}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#333' }}>{ev.text}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{ev.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Heatmap placeholder ────────────────────────────────────────────────────

function CityHeatmap() {
  const cities = [
    { name: 'Baghdad', x: 52, y: 55, r: 28, intensity: 0.9 },
    { name: 'Mosul', x: 38, y: 22, r: 16, intensity: 0.55 },
    { name: 'Basra', x: 58, y: 85, r: 14, intensity: 0.45 },
    { name: 'Erbil', x: 50, y: 20, r: 12, intensity: 0.4 },
    { name: 'Najaf', x: 44, y: 68, r: 10, intensity: 0.3 },
    { name: 'Kirkuk', x: 50, y: 33, r: 9, intensity: 0.35 },
  ];
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#333' }}>User Activity by City (Placeholder)</div>
      <svg width={280} height={200} style={{ display: 'block', background: '#e8f5e9', borderRadius: 6 }}>
        {/* Iraq outline simplified */}
        <path
          d="M60,10 L90,8 L120,15 L150,12 L170,25 L175,45 L160,60 L170,80 L165,100 L150,130 L140,160 L120,185 L100,190 L80,175 L60,155 L45,130 L40,100 L30,80 L25,55 L30,35 L45,20 Z"
          fill="#c8e6c9"
          stroke="#81c784"
          strokeWidth={1.5}
        />
        {cities.map((c) => (
          <g key={c.name}>
            <circle
              cx={(c.x / 100) * 280}
              cy={(c.y / 100) * 200}
              r={c.r}
              fill={`rgba(21,101,192,${c.intensity})`}
              opacity={0.7}
            />
            <text
              x={(c.x / 100) * 280}
              y={(c.y / 100) * 200 + c.r + 10}
              textAnchor="middle"
              fontSize={9}
              fill="#1a237e"
            >
              {c.name}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
        Circle size = relative daily active users. Real data coming in M5.
      </div>
    </div>
  );
}

// ── Quick actions ──────────────────────────────────────────────────────────

function QuickActions() {
  const actions = [
    { label: 'View Reports', href: '/reported-posts', color: '#e53935' },
    { label: 'Pending Approvals', href: '/verification', color: '#e65100' },
    { label: 'Flagged Content', href: '/reported-comments', color: '#6a1b9a' },
    { label: 'User Management', href: '/admin-users', color: '#1565c0' },
    { label: 'Places Queue', href: '/admin-places', color: '#2e7d32' },
    { label: 'System Config', href: '/admin-system', color: '#37474f' },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {actions.map((a) => (
        <a
          key={a.href}
          href={a.href}
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: a.color,
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {a.label}
        </a>
      ))}
    </div>
  );
}

// ── Mock data generators ───────────────────────────────────────────────────

function makeMockActivity(): ActivityEvent[] {
  const types: ActivityEvent['type'][] = ['user_join', 'report', 'approval', 'ban', 'post', 'verification'];
  const texts: Record<ActivityEvent['type'], string[]> = {
    user_join: ['New user registered from Baghdad', 'New user registered from Mosul', 'New user from Basra'],
    report: ['Post #3821 reported for spam', 'Comment reported for harassment', 'Post #3940 reported'],
    approval: ['Business "Al-Rashid Cafe" approved', 'Provider "Baghdad Tours" verified'],
    ban: ['User #u-9923 banned for spam', 'User #u-4412 suspended'],
    post: ['15 new posts in Discover', '8 new posts in Baghdad feed'],
    verification: ['Provider "Mosul Restaurant" submitted', 'Business verification pending: 12'],
  };
  return Array.from({ length: 20 }, (_, i) => {
    const type = types[i % types.length];
    const msgs = texts[type];
    const minutesAgo = i * 7 + Math.floor(Math.random() * 5);
    const time = new Date(Date.now() - minutesAgo * 60_000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      id: `ev-${i}`,
      type,
      text: msgs[i % msgs.length],
      time,
    };
  });
}

function makeMockHealth(): HealthMetric[] {
  return [
    { label: 'API p99 response time', value: '82 ms', ok: true },
    { label: 'Error rate (5m)', value: '0.3%', ok: true },
    { label: 'DB connections', value: '14 / 100', ok: true },
    { label: 'Redis latency', value: '1.2 ms', ok: true },
    { label: 'Queue backlog', value: '0 failed', ok: true },
    { label: 'Disk usage', value: '38 GB / 100 GB', ok: true },
    { label: 'Memory usage', value: '1.2 GB / 4 GB', ok: true },
    { label: 'Last deploy', value: '2h ago', ok: true },
  ];
}

// ── Main page ──────────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trend30, setTrend30] = useState<{ users: DailyMetric[]; posts: DailyMetric[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity] = useState<ActivityEvent[]>(makeMockActivity);
  const [health] = useState<HealthMetric[]>(makeMockHealth);
  const [rangeLabel, setRangeLabel] = useState<'7d' | '14d' | '30d'>('30d');

  const rangeMap = { '7d': 7, '14d': 14, '30d': 30 } as const;

  const load = useCallback(
    async (days: number) => {
      setLoading(true);
      setError('');
      try {
        const [m, t] = await Promise.all([api.getMetrics(), api.getDailyTrend(days)]);
        setMetrics(m);
        setTrend30({ users: t.users, posts: t.posts });
      } catch {
        setError('Failed to load dashboard data. Check API connection.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(rangeMap[rangeLabel]);
  }, [rangeLabel, load]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>Admin Dashboard</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['7d', '14d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRangeLabel(r)}
              style={{
                padding: '5px 14px',
                border: '1px solid #ccc',
                borderRadius: 4,
                background: rangeLabel === r ? '#1565c0' : '#fff',
                color: rangeLabel === r ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => void load(rangeMap[rangeLabel])}
            style={{
              padding: '5px 12px',
              border: '1px solid #ccc',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#ffebee',
            border: '1px solid #ef9a9a',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 20,
            color: '#c62828',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <section style={{ marginBottom: 28 }}>
        <div style={sectionHead}>Key Performance Indicators</div>
        {loading ? (
          <div style={{ color: '#888', fontSize: 14 }}>Loading metrics…</div>
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <KpiCard label="Total Users" value={metrics?.totalUsers ?? 0} color="#1565c0" sub="All time registrations" />
            <KpiCard
              label="Active Today"
              value={Math.round((metrics?.totalUsers ?? 0) * 0.08)}
              color="#2e7d32"
              sub="DAU estimate"
            />
            <KpiCard label="Posts Today" value={metrics?.postsToday ?? 0} color="#00838f" sub="New Discover posts" />
            <KpiCard
              label="Reports Pending"
              value={Math.max(0, Math.round((metrics?.totalUsers ?? 0) * 0.003))}
              color="#e53935"
              sub="Awaiting review"
              accent
            />
            <KpiCard
              label="Businesses"
              value={metrics?.totalProviders ?? 0}
              color="#6a1b9a"
              sub="Registered providers"
            />
            <KpiCard
              label="Pending Verification"
              value={metrics?.pendingVerification ?? 0}
              color="#e65100"
              sub="Provider queue"
              accent={!!metrics && metrics.pendingVerification > 0}
            />
          </div>
        )}
      </section>

      {/* Charts */}
      <section style={{ marginBottom: 28 }}>
        <div style={sectionHead}>Trends — Last {rangeLabel}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          <div style={card}>
            {loading ? (
              <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
            ) : (
              <LineChart
                data={trend30?.users ?? []}
                color="#1565c0"
                title={`User Registrations — last ${rangeLabel}`}
              />
            )}
          </div>
          <div style={card}>
            {loading ? (
              <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
            ) : (
              <BarChart
                data={trend30?.posts ?? []}
                color="#2e7d32"
                title={`New Posts per Day — last ${rangeLabel}`}
              />
            )}
          </div>
        </div>
      </section>

      {/* Bottom row: heatmap + activity + health */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 2fr) minmax(240px, 1fr)',
          gap: 20,
          marginBottom: 28,
        }}
      >
        {/* Heatmap */}
        <div style={card}>
          <div style={sectionHead}>Geographic Activity</div>
          <CityHeatmap />
        </div>

        {/* Activity feed */}
        <div style={card}>
          <div style={sectionHead}>Recent Activity</div>
          <ActivityFeed events={activity} />
        </div>

        {/* System health */}
        <div style={card}>
          <div style={sectionHead}>System Health</div>
          {health.map((h) => (
            <HealthRow key={h.label} {...h} />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <section style={{ ...card, marginBottom: 28 }}>
        <div style={sectionHead}>Quick Actions</div>
        <QuickActions />
      </section>
    </div>
  );
}
