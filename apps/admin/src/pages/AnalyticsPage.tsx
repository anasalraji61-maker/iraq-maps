import { useState, useEffect, useCallback } from 'react';
import { api, type AnalyticsOverview, type FunnelStep, type RetentionRow } from '../api';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 20,
};

const statNum: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: '#1565c0',
  margin: '4px 0',
};

const label: React.CSSProperties = { fontSize: 13, color: '#666' };

/** Inline SVG bar chart for events-by-day data */
function EventsBarChart({ data }: { data: AnalyticsOverview['eventsByDay'] }) {
  if (data.length === 0) return <p style={label}>لا بيانات</p>;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const W = 500;
  const H = 120;
  const barW = Math.floor((W - 20) / data.length) - 2;
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = Math.max(4, Math.floor((d.count / maxVal) * (H - 30)));
        const x = 10 + i * (barW + 2);
        const y = H - 20 - barH;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} fill="#1565c0" rx={2} opacity={0.8} />
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#888">
              {d.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Geographic heatmap placeholder — shows top cities from event properties */
function GeoHeatmap() {
  return (
    <div
      style={{
        width: '100%',
        height: 180,
        background: '#e8f0fe',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: 13,
      }}
    >
      خريطة حرارة النشاط الجغرافي — تتطلب PostGIS ST_AsGeoJSON
    </div>
  );
}

/** Funnel chart: horizontal bars with dropoff rate labels */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) return <p style={label}>لا بيانات</p>;
  const maxCount = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div>
      {steps.map((step, i) => {
        const pct = Math.max(4, Math.round((step.count / maxCount) * 100));
        return (
          <div key={step.step} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{step.step}</span>
              <span style={{ fontSize: 12, color: '#666' }}>
                {step.count.toLocaleString()}
                {step.dropoffRate !== null && (
                  <span style={{ color: step.dropoffRate > 50 ? '#c62828' : '#388e3c', marginRight: 8 }}>
                    {' '}(تسرب {step.dropoffRate}%)
                  </span>
                )}
              </span>
            </div>
            <div style={{ background: '#e0e0e0', borderRadius: 4, height: 12 }}>
              <div
                style={{
                  width: `${pct}%`,
                  background: i === 0 ? '#1565c0' : '#42a5f5',
                  borderRadius: 4,
                  height: '100%',
                  transition: 'width 0.4s',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Retention table: rows = cohort, cols = day-offset */
function RetentionTable({ rows }: { rows: RetentionRow[] }) {
  if (rows.length === 0) return <p style={label}>لا بيانات</p>;
  const cohorts = [...new Set(rows.map((r) => r.cohortDate))].sort();
  const maxDay = Math.max(...rows.map((r) => r.dayOffset));
  const map = new Map(rows.map((r) => [`${r.cohortDate}:${r.dayOffset}`, r.retainedCount]));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>الكوهورت</th>
            {Array.from({ length: maxDay + 1 }, (_, i) => (
              <th key={i} style={{ padding: '4px 8px', borderBottom: '1px solid #ddd', color: '#555' }}>
                يوم {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort}>
              <td style={{ padding: '4px 8px', fontWeight: 500 }}>{cohort}</td>
              {Array.from({ length: maxDay + 1 }, (_, i) => {
                const val = map.get(`${cohort}:${i}`) ?? 0;
                const base = map.get(`${cohort}:0`) ?? 1;
                const pct = Math.round((val / base) * 100);
                return (
                  <td
                    key={i}
                    style={{
                      padding: '4px 8px',
                      textAlign: 'center',
                      background: val > 0 ? `rgba(21,101,192,${0.1 + (pct / 100) * 0.7})` : 'transparent',
                      color: pct > 50 ? '#fff' : '#333',
                    }}
                  >
                    {val > 0 ? `${pct}%` : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [retention, setRetention] = useState<RetentionRow[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, fn, ret] = await Promise.all([
        api.getAnalyticsOverview(days),
        api.getAnalyticsFunnel(),
        api.getAnalyticsRetention(7),
      ]);
      setOverview(ov);
      setFunnel(fn);
      setRetention(ret);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>تحليلات التطبيق</h1>
        <label style={{ fontSize: 13 }}>
          آخر{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ margin: '0 4px' }}>
            {[7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>{d} يوم</option>
            ))}
          </select>
        </label>
        <button onClick={load} disabled={loading} style={{ padding: '4px 12px', fontSize: 13 }}>
          {loading ? 'جارٍ التحميل...' : 'تحديث'}
        </button>
      </div>

      {error && <p style={{ color: '#c62828', background: '#ffebee', padding: 12, borderRadius: 6 }}>{error}</p>}

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 140px', minWidth: 140 }}>
          <p style={label}>المستخدمون النشطون يومياً</p>
          <p style={statNum}>{loading ? '…' : (overview?.dau ?? 0).toLocaleString()}</p>
        </div>
        <div style={{ ...card, flex: '1 1 140px', minWidth: 140 }}>
          <p style={label}>إجمالي الأحداث</p>
          <p style={statNum}>{loading ? '…' : (overview?.totalEvents ?? 0).toLocaleString()}</p>
        </div>
        <div style={{ ...card, flex: '1 1 140px', minWidth: 140 }}>
          <p style={label}>أنواع الأحداث</p>
          <p style={statNum}>{loading ? '…' : (overview?.topEventTypes.length ?? 0)}</p>
        </div>
      </div>

      {/* Events by day chart */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>الأحداث اليومية</h2>
        {overview && <EventsBarChart data={overview.eventsByDay} />}
      </div>

      {/* Top event types */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>أكثر الميزات استخداماً</h2>
        {overview?.topEventTypes.map((t) => (
          <div key={t.eventType} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
            <span style={{ fontSize: 13 }}>{t.eventType}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.count.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>قمع التحويل</h2>
        <FunnelChart steps={funnel} />
      </div>

      {/* Retention */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>منحنيات الاحتفاظ (7 أيام)</h2>
        <RetentionTable rows={retention} />
      </div>

      {/* Geo Heatmap */}
      <div style={card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>خريطة النشاط الجغرافي</h2>
        <GeoHeatmap />
      </div>
    </div>
  );
}
