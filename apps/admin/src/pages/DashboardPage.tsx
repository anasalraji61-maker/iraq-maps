import { useState, useEffect } from 'react';
import { api, type DailyMetric } from '../api';

interface Metrics {
  totalUsers: number;
  totalProviders: number;
  postsToday: number;
  pendingVerification: number;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '20px 24px',
  flex: '1 1 200px',
  minWidth: 180,
};

const metricNum: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: '#1565c0',
  margin: '8px 0 4px',
};

const metricLabel: React.CSSProperties = {
  fontSize: 14,
  color: '#666',
};

/** Simple SVG bar chart for 7-day data. width=480 height=160. */
function BarChart({
  data,
  color,
  title,
}: {
  data: DailyMetric[];
  color: string;
  title: string;
}) {
  if (data.length === 0) return <p style={{ color: '#aaa', fontSize: 13 }}>لا بيانات</p>;

  const W = 480;
  const H = 140;
  const PAD_TOP = 12;
  const PAD_BOT = 32;
  const PAD_H = 24;
  const chartW = W - PAD_H * 2;
  const chartH = H - PAD_TOP - PAD_BOT;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barW = Math.floor(chartW / data.length) - 4;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{title}</div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Y gridlines */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD_TOP + chartH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={PAD_H} y1={y} x2={W - PAD_H} y2={y} stroke="#eee" strokeWidth={1} />
              <text x={PAD_H - 4} y={y + 4} textAnchor="end" fontSize={10} fill="#aaa">
                {Math.round(maxVal * frac)}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const barH = Math.max(2, (d.count / maxVal) * chartH);
          const x = PAD_H + i * (chartW / data.length) + 2;
          const y = PAD_TOP + chartH - barH;
          const label = d.date.slice(5); // MM-DD
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} />
              <text x={x + barW / 2} y={H - PAD_BOT + 14} textAnchor="middle" fontSize={9} fill="#888">
                {label}
              </text>
              {d.count > 0 && (
                <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill={color} fontWeight={600}>
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trend, setTrend] = useState<{
    users: DailyMetric[];
    posts: DailyMetric[];
    inquiries: DailyMetric[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMetrics(), api.getDailyTrend(7)])
      .then(([m, t]) => {
        setMetrics(m);
        setTrend(t);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 24, color: '#888' }}>جارٍ التحميل…</p>;
  if (!metrics) return <p style={{ padding: 24, color: '#c00' }}>تعذّر تحميل الإحصاءات.</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>لوحة التحكم</h2>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <div style={cardStyle}>
          <div style={metricLabel}>إجمالي المستخدمين</div>
          <div style={metricNum}>{metrics.totalUsers.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={cardStyle}>
          <div style={metricLabel}>إجمالي مزودي الخدمة</div>
          <div style={metricNum}>{metrics.totalProviders.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={cardStyle}>
          <div style={metricLabel}>منشورات اليوم</div>
          <div style={metricNum}>{metrics.postsToday.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={{ ...cardStyle, borderColor: '#ffcc02' }}>
          <div style={metricLabel}>بانتظار التوثيق</div>
          <div style={{ ...metricNum, color: '#e65100' }}>
            {metrics.pendingVerification.toLocaleString('ar-IQ')}
          </div>
        </div>
      </div>

      {/* Charts */}
      {trend && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 24,
          }}
        >
          {[
            { data: trend.users, color: '#1565c0', title: 'مستخدمون جدد — آخر 7 أيام' },
            { data: trend.posts, color: '#2e7d32', title: 'منشورات — آخر 7 أيام' },
            { data: trend.inquiries, color: '#e65100', title: 'استفسارات — آخر 7 أيام' },
          ].map(({ data, color, title }) => (
            <div
              key={title}
              style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 20 }}
            >
              <BarChart data={data} color={color} title={title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
