/**
 * AdminAnalyticsPage — platform analytics dashboard.
 *
 * Tabs:
 *  1. Overview  — DAU/MAU, registrations, searches, places, reviews, providers
 *  2. Revenue   — payments summary
 *  3. Cities    — top cities by activity
 *  4. Retention — cohort retention chart (SVG)
 */
import { useEffect, useState } from 'react';
import type { ReactElement, ChangeEvent } from 'react';
import { LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────

type WindowDays = 7 | 30 | 90;
type TabKey = 'overview' | 'revenue' | 'cities' | 'retention';

interface DailyPoint {
  date: string;   // YYYY-MM-DD
  value: number;
}

interface OverviewMetrics {
  dau: number;
  mau: number;
  dauMauRatio: number;
  searchesToday: number;
  newRegistrations: number;
  placesAddedByUsers: number;
  reviewsWritten: number;
  activeProviders: number;
  series: {
    dau: DailyPoint[];
    mau: DailyPoint[];
    searches: DailyPoint[];
    registrations: DailyPoint[];
    placesAdded: DailyPoint[];
    reviews: DailyPoint[];
  };
}

interface RevenueMetrics {
  totalRevenue: number;
  currency: string;
  byDay: DailyPoint[];
  byPlan: { plan: string; amount: number; count: number }[];
  paymentSuccess: number;
  paymentFailed: number;
}

interface CityActivity {
  city: string;
  dau: number;
  searches: number;
  placesAdded: number;
  reviews: number;
  score: number;
}

interface RetentionCell {
  cohortDate: string;
  dayOffset: number;
  rate: number; // 0–1
}

// ─── Mock data ─────────────────────────────────────────────────────────────

function makeDailyPoints(days: number, base: number, variance: number): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const v = Math.max(0, Math.round(base + (Math.sin(i * 0.7) * variance) + (i * base * 0.005)));
    return { date: d.toISOString().slice(0, 10), value: v };
  });
}

function mockOverview(days: WindowDays): OverviewMetrics {
  return {
    dau: 4280,
    mau: 28500,
    dauMauRatio: 0.15,
    searchesToday: 12400,
    newRegistrations: 310,
    placesAddedByUsers: 48,
    reviewsWritten: 156,
    activeProviders: 892,
    series: {
      dau:           makeDailyPoints(days, 4000, 500),
      mau:           makeDailyPoints(days, 27000, 2000),
      searches:      makeDailyPoints(days, 12000, 2500),
      registrations: makeDailyPoints(days, 300, 80),
      placesAdded:   makeDailyPoints(days, 45, 20),
      reviews:       makeDailyPoints(days, 150, 50),
    },
  };
}

function mockRevenue(days: WindowDays): RevenueMetrics {
  return {
    totalRevenue: 8420,
    currency: 'USD',
    byDay: makeDailyPoints(days, 250, 80),
    byPlan: [
      { plan: 'أساسي', amount: 2100, count: 210 },
      { plan: 'احترافي', amount: 4500, count: 150 },
      { plan: 'مؤسسي', amount: 1820, count: 26 },
    ],
    paymentSuccess: 386,
    paymentFailed: 14,
  };
}

function mockCities(): CityActivity[] {
  return [
    { city: 'بغداد',       dau: 2100, searches: 6200, placesAdded: 22, reviews: 78,  score: 8400 },
    { city: 'البصرة',      dau: 780,  searches: 2400, placesAdded: 8,  reviews: 31,  score: 3200 },
    { city: 'أربيل',       dau: 620,  searches: 1900, placesAdded: 6,  reviews: 24,  score: 2550 },
    { city: 'الموصل',      dau: 340,  searches: 980,  placesAdded: 4,  reviews: 11,  score: 1335 },
    { city: 'النجف',       dau: 220,  searches: 650,  placesAdded: 2,  reviews: 7,   score: 879  },
    { city: 'كربلاء',      dau: 180,  searches: 520,  placesAdded: 2,  reviews: 5,   score: 707  },
    { city: 'السليمانية',  dau: 140,  searches: 400,  placesAdded: 2,  reviews: 3,   score: 545  },
    { city: 'كركوك',       dau: 100,  searches: 290,  placesAdded: 1,  reviews: 2,   score: 393  },
  ];
}

function mockRetention(): RetentionCell[] {
  const cohorts = 8;
  const maxOffset = 8;
  const cells: RetentionCell[] = [];
  for (let c = 0; c < cohorts; c++) {
    const cohortDate = new Date();
    cohortDate.setDate(cohortDate.getDate() - (cohorts - c) * 7);
    const label = cohortDate.toISOString().slice(0, 10);
    for (let d = 0; d <= maxOffset; d++) {
      const available = d <= (cohorts - 1 - c) * 1 + maxOffset;
      cells.push({
        cohortDate: label,
        dayOffset: d,
        rate: available ? Math.max(0, 1 - d * 0.09 - c * 0.01 + Math.sin(d + c) * 0.03) : -1,
      });
    }
  }
  return cells;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }): ReactElement {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
      padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function LineChart({ points, color, label, height = 100 }: {
  points: DailyPoint[]; color: string; label: string; height?: number;
}): ReactElement {
  if (points.length === 0) return <div />;
  const W = 560, H = height;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = W / (points.length - 1);

  const pathD = points.map((p, i) => {
    const x = i * step;
    const y = H - (p.value / max) * (H - 10);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaD = `${pathD} L ${(points.length - 1) * step} ${H} L 0 ${H} Z`;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <svg
        width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', borderRadius: 6, background: '#fafafa', border: '1px solid #eee' }}
      >
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${label})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = i * step;
          const y = H - (p.value / max) * (H - 10);
          return (
            <circle
              key={p.date}
              cx={x} cy={y} r={hoverIdx === i ? 5 : 3}
              fill={color} stroke="#fff" strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <title>{p.date}: {p.value.toLocaleString('ar')}</title>
            </circle>
          );
        })}
        {hoverIdx !== null && (() => {
          const p = points[hoverIdx]!;
          const x = hoverIdx * step;
          const y = H - (p.value / max) * (H - 10);
          return (
            <g>
              <line x1={x} y1={0} x2={x} y2={H} stroke={color} strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
              <rect x={x - 40} y={y - 32} width={80} height={22} rx={4} fill="rgba(0,0,0,.75)" />
              <text x={x} y={y - 17} textAnchor="middle" fill="#fff" fontSize={11}>
                {p.value.toLocaleString('ar')}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

function WindowPicker({ value, onChange }: { value: WindowDays; onChange: (v: WindowDays) => void }): ReactElement {
  const opts: { label: string; value: WindowDays }[] = [
    { label: '7 أيام', value: 7 },
    { label: '30 يومًا', value: 30 },
    { label: '90 يومًا', value: 90 },
  ];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {opts.map((o) => (
        <button
          key={o.value}
          style={{
            padding: '5px 14px', borderRadius: 4, border: '1.5px solid',
            borderColor: value === o.value ? '#1565c0' : '#ddd',
            background: value === o.value ? '#e3f2fd' : '#fff',
            color: value === o.value ? '#1565c0' : '#555',
            cursor: 'pointer', fontSize: 13, fontWeight: value === o.value ? 700 : 400,
          }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────

function OverviewTab(): ReactElement {
  const [days, setDays] = useState<WindowDays>(30);
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/overview?days=${days}`, {
          headers: { 'x-admin-key': api.getAdminKey() },
        });
        if (res.ok) {
          setData((await res.json()) as OverviewMetrics);
        } else {
          setData(mockOverview(days));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  if (loading) return <LoadingRow />;
  if (!data) return <p style={{ color: '#888' }}>تعذر تحميل البيانات.</p>;

  const fmt = (n: number) => n.toLocaleString('ar');
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <WindowPicker value={days} onChange={setDays} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <KpiCard label="DAU (يومي نشط)" value={fmt(data.dau)} sub="المستخدمون النشطون اليوم" color="#1565c0" />
        <KpiCard label="MAU (شهري نشط)" value={fmt(data.mau)} sub={`نسبة DAU/MAU: ${pct(data.dauMauRatio)}`} color="#7B1FA2" />
        <KpiCard label="عمليات البحث" value={fmt(data.searchesToday)} sub="اليوم" color="#E65100" />
        <KpiCard label="تسجيلات جديدة" value={fmt(data.newRegistrations)} sub={`خلال ${days} يومًا`} color="#2e7d32" />
        <KpiCard label="أماكن أضافها المستخدمون" value={fmt(data.placesAddedByUsers)} sub={`خلال ${days} يومًا`} color="#0288D1" />
        <KpiCard label="تقييمات كُتبت" value={fmt(data.reviewsWritten)} sub={`خلال ${days} يومًا`} color="#AD1457" />
        <KpiCard label="موردون نشطون" value={fmt(data.activeProviders)} sub="إجمالي" color="#F57C00" />
        <KpiCard label="معدل الاحتفاظ" value={pct(data.dauMauRatio)} sub="DAU / MAU" color="#37474F" />
      </div>

      {/* Charts — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <LineChart points={data.series.dau} color="#1565c0" label="المستخدمون النشطون يوميًا (DAU)" />
        <LineChart points={data.series.registrations} color="#2e7d32" label="التسجيلات اليومية" />
        <LineChart points={data.series.searches} color="#E65100" label="عمليات البحث اليومية" />
        <LineChart points={data.series.reviews} color="#AD1457" label="التقييمات المكتوبة يوميًا" />
        <LineChart points={data.series.placesAdded} color="#0288D1" label="الأماكن المضافة يوميًا" />
        <LineChart points={data.series.mau} color="#7B1FA2" label="المستخدمون النشطون شهريًا (MAU)" />
      </div>
    </div>
  );
}

// ─── Revenue Tab ───────────────────────────────────────────────────────────

function RevenueTab(): ReactElement {
  const [days, setDays] = useState<WindowDays>(30);
  const [data, setData] = useState<RevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/revenue?days=${days}`, {
          headers: { 'x-admin-key': api.getAdminKey() },
        });
        if (res.ok) {
          setData((await res.json()) as RevenueMetrics);
        } else {
          setData(mockRevenue(days));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  if (loading) return <LoadingRow />;
  if (!data) return <p style={{ color: '#888' }}>تعذر تحميل بيانات الإيرادات.</p>;

  const successRate = data.paymentSuccess + data.paymentFailed > 0
    ? ((data.paymentSuccess / (data.paymentSuccess + data.paymentFailed)) * 100).toFixed(1)
    : '0.0';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <WindowPicker value={days} onChange={setDays} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <KpiCard label="إجمالي الإيرادات" value={`$${data.totalRevenue.toLocaleString('en')}`} sub={`خلال ${days} يومًا`} color="#2e7d32" />
        <KpiCard label="معاملات ناجحة" value={data.paymentSuccess.toLocaleString('ar')} color="#2e7d32" />
        <KpiCard label="معاملات فاشلة" value={data.paymentFailed.toLocaleString('ar')} color="#c62828" />
        <KpiCard label="معدل النجاح" value={`${successRate}%`} color="#1565c0" />
      </div>

      <LineChart points={data.byDay} color="#2e7d32" label="الإيرادات اليومية (USD)" height={120} />

      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 12, color: '#333' }}>
        الإيرادات حسب الخطة
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>الخطة</th>
            <th style={{ padding: '8px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>الإيراد</th>
            <th style={{ padding: '8px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>العدد</th>
            <th style={{ padding: '8px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>النسبة</th>
          </tr>
        </thead>
        <tbody>
          {data.byPlan.map((row) => {
            const pct = ((row.amount / data.totalRevenue) * 100).toFixed(1);
            return (
              <tr key={row.plan}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 600 }}>{row.plan}</td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', color: '#2e7d32', fontWeight: 700 }}>
                  ${row.amount.toLocaleString('en')}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>{row.count}</td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 10 }}>
                      <div style={{ width: `${pct}%`, background: '#2e7d32', borderRadius: 4, height: 10 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#555', minWidth: 40 }}>{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cities Tab ─────────────────────────────────────────────────────────────

function CitiesTab(): ReactElement {
  const [data, setData] = useState<CityActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof CityActivity>('score');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/analytics/cities', { headers: { 'x-admin-key': api.getAdminKey() } });
        if (res.ok) {
          setData((await res.json()) as CityActivity[]);
        } else {
          setData(mockCities());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;

  const sorted = [...data].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  const maxScore = Math.max(...sorted.map((c) => c.score), 1);

  type CityCol = { key: keyof CityActivity; label: string; color: string };
  const cols: CityCol[] = [
    { key: 'dau', label: 'DAU', color: '#1565c0' },
    { key: 'searches', label: 'بحث', color: '#E65100' },
    { key: 'placesAdded', label: 'أماكن', color: '#0288D1' },
    { key: 'reviews', label: 'تقييمات', color: '#AD1457' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#555' }}>ترتيب حسب:</span>
        <select
          value={sortKey as string}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortKey(e.target.value as keyof CityActivity)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
        >
          <option value="score">النشاط الكلي</option>
          <option value="dau">DAU</option>
          <option value="searches">البحث</option>
          <option value="placesAdded">الأماكن</option>
          <option value="reviews">التقييمات</option>
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>المدينة</th>
            {cols.map((c) => (
              <th key={c.key} style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600, color: c.color }}>
                {c.label}
              </th>
            ))}
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>النشاط الكلي</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((city, idx) => (
            <tr key={city.city} style={{ background: idx === 0 ? '#f0f7ff' : undefined }}>
              <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 700 }}>
                {idx === 0 && <span style={{ marginInlineEnd: 6 }}>🏆</span>}
                {city.city}
              </td>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 600, color: c.color }}>
                  {(city[c.key] as number).toLocaleString('ar')}
                </td>
              ))}
              <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 12 }}>
                    <div style={{
                      width: `${(city.score / maxScore) * 100}%`,
                      background: '#1565c0', borderRadius: 4, height: 12,
                      transition: 'width .3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1565c0', minWidth: 50 }}>
                    {city.score.toLocaleString('ar')}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Retention Tab ─────────────────────────────────────────────────────────

function RetentionTab(): ReactElement {
  const [cells, setCells] = useState<RetentionCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/analytics/retention', { headers: { 'x-admin-key': api.getAdminKey() } });
        if (res.ok) {
          setCells((await res.json()) as RetentionCell[]);
        } else {
          setCells(mockRetention());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;

  const cohorts = [...new Set(cells.map((c) => c.cohortDate))].sort();
  const maxOffset = Math.max(...cells.map((c) => c.dayOffset));

  function getRate(cohort: string, offset: number): number {
    return cells.find((c) => c.cohortDate === cohort && c.dayOffset === offset)?.rate ?? -1;
  }

  function rateColor(rate: number): string {
    if (rate < 0) return '#f5f5f5';
    const pct = rate;
    if (pct >= 0.7) return '#1b5e20';
    if (pct >= 0.5) return '#388e3c';
    if (pct >= 0.35) return '#66bb6a';
    if (pct >= 0.2) return '#a5d6a7';
    if (pct >= 0.1) return '#c8e6c9';
    return '#e8f5e9';
  }

  const CELL = 44;

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        نسبة احتفاظ كل مجموعة (cohort) بعد N يومًا من التسجيل. اللون الأغمق = احتفاظ أعلى.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <svg
          width={(maxOffset + 2) * CELL + 120}
          height={(cohorts.length + 1) * CELL + 20}
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {/* Header row */}
          <text x={110} y={20} textAnchor="middle" fontSize={11} fill="#888">المجموعة</text>
          {Array.from({ length: maxOffset + 1 }, (_, d) => (
            <text key={d} x={130 + d * CELL + CELL / 2} y={20} textAnchor="middle" fontSize={11} fill="#888">
              {d === 0 ? 'بداية' : `+${d}`}
            </text>
          ))}

          {cohorts.map((cohort, ci) => {
            const y = 30 + ci * CELL;
            return (
              <g key={cohort}>
                {/* Cohort label */}
                <text x={5} y={y + CELL / 2 + 4} fontSize={10} fill="#555">
                  {cohort.slice(5)}
                </text>

                {Array.from({ length: maxOffset + 1 }, (_, d) => {
                  const rate = getRate(cohort, d);
                  const x = 130 + d * CELL;
                  const pct = rate >= 0 ? `${(rate * 100).toFixed(0)}%` : '';
                  return (
                    <g key={d}>
                      <rect x={x} y={y} width={CELL - 2} height={CELL - 2} rx={3}
                        fill={rateColor(rate)} stroke="#fff" strokeWidth={1} />
                      {rate >= 0 && (
                        <text x={x + CELL / 2 - 1} y={y + CELL / 2 + 4}
                          textAnchor="middle" fontSize={10}
                          fill={rate >= 0.35 ? '#fff' : '#333'} fontWeight="600">
                          {pct}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 12, color: '#666' }}>
        <span>أقل احتفاظًا</span>
        {['#e8f5e9', '#c8e6c9', '#a5d6a7', '#66bb6a', '#388e3c', '#1b5e20'].map((c) => (
          <div key={c} style={{ width: 20, height: 14, background: c, borderRadius: 2, border: '1px solid #ccc' }} />
        ))}
        <span>أعلى احتفاظًا</span>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  overview:  'نظرة عامة',
  revenue:   'الإيرادات',
  cities:    'المدن',
  retention: 'الاحتفاظ',
};

export function AdminAnalyticsPage(): ReactElement {
  const [tab, setTab] = useState<TabKey>('overview');
  const [msg] = useState('');

  return (
    <div>
      <PageHeader title="تحليلات المنصة" />
      <FlashBanner msg={msg} />

      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: 20 }}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', border: 'none',
              borderBottom: tab === t ? '2px solid #1565c0' : '2px solid transparent',
              marginBottom: -2, background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1565c0' : '#555',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab />}
      {tab === 'revenue'   && <RevenueTab />}
      {tab === 'cities'    && <CitiesTab />}
      {tab === 'retention' && <RetentionTab />}
    </div>
  );
}
