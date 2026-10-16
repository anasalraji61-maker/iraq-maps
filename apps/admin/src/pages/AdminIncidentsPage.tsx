/**
 * AdminIncidentsPage — incident / traffic report management.
 *
 * Tabs:
 *  1. List  — filter/sort/action table
 *  2. Map   — live incidents grid map (SVG)
 *  3. Stats — incidents by type / city / hour
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ChangeEvent } from 'react';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────

type IncidentType = 'accident' | 'traffic' | 'road_closure' | 'flood' | 'protest' | 'security' | 'other';
type IncidentStatus = 'active' | 'expired' | 'removed' | 'false_report';
type TabKey = 'list' | 'map' | 'stats';

interface Incident {
  id: string;
  type: IncidentType;
  city: string;
  lat: number;
  lon: number;
  description: string;
  reporterId: string;
  reporterName: string | null;
  status: IncidentStatus;
  reportCount: number;
  confirmedCount: number;
  createdAt: string;
  expiresAt: string;
  removedAt: string | null;
}

interface IncidentStats {
  totalActive: number;
  totalToday: number;
  falseReports: number;
  byType: { type: IncidentType; count: number }[];
  byCity: { city: string; count: number }[];
  byHour: { hour: number; count: number }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<IncidentType, string> = {
  accident:     '#C62828',
  traffic:      '#F57C00',
  road_closure: '#795548',
  flood:        '#0288D1',
  protest:      '#6A1B9A',
  security:     '#B71C1C',
  other:        '#9E9E9E',
};

const TYPE_LABELS: Record<IncidentType, string> = {
  accident:     'حادث',
  traffic:      'ازدحام',
  road_closure: 'إغلاق طريق',
  flood:        'فيضان',
  protest:      'تظاهرة',
  security:     'أمني',
  other:        'أخرى',
};

const TYPE_ICONS: Record<IncidentType, string> = {
  accident:     '🚨',
  traffic:      '🚗',
  road_closure: '🚧',
  flood:        '🌊',
  protest:      '📢',
  security:     '🔒',
  other:        '⚠️',
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  active:       '#2e7d32',
  expired:      '#9E9E9E',
  removed:      '#C62828',
  false_report: '#AD1457',
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  active:       'نشط',
  expired:      'منتهي',
  removed:      'مُزال',
  false_report: 'بلاغ كاذب',
};

// ─── Mock data ─────────────────────────────────────────────────────────────

function mockIncidents(): Incident[] {
  const types: IncidentType[] = ['accident', 'traffic', 'road_closure', 'flood', 'protest', 'security', 'other'];
  const cities = ['بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف'];
  const statuses: IncidentStatus[] = ['active', 'active', 'active', 'expired', 'removed', 'false_report'];
  const coordMap: Record<string, [number, number]> = {
    'بغداد':  [33.3152, 44.3661],
    'البصرة': [30.5085, 47.7804],
    'أربيل':  [36.1901, 44.0091],
    'الموصل': [36.3566, 43.1568],
    'النجف':  [31.9927, 44.3345],
  };

  return Array.from({ length: 35 }, (_, i) => {
    const type = types[i % types.length]!;
    const city = cities[i % cities.length]!;
    const [lat, lon] = coordMap[city]!;
    const status = statuses[i % statuses.length]!;
    const created = new Date(Date.now() - i * 3600000 * 2);
    return {
      id: `inc-${i + 1}`,
      type,
      city,
      lat: lat + (Math.sin(i) * 0.05),
      lon: lon + (Math.cos(i) * 0.05),
      description: [
        'حادث سير على الطريق الرئيسي',
        'ازدحام مروري شديد',
        'إغلاق طريق بسبب الصيانة',
        'فيضان جزئي في الشوارع الفرعية',
        'تجمع كبير يعيق الحركة',
      ][i % 5]!,
      reporterId: `user-${i % 20}`,
      reporterName: i % 4 === 0 ? null : `مستخدم ${i + 1}`,
      status,
      reportCount: (i % 8) + 1,
      confirmedCount: Math.floor((i % 8) / 2),
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + 7200000).toISOString(),
      removedAt: status === 'removed' ? new Date(created.getTime() + 3600000).toISOString() : null,
    };
  });
}

function mockStats(): IncidentStats {
  const types: IncidentType[] = ['accident', 'traffic', 'road_closure', 'flood', 'protest', 'security', 'other'];
  return {
    totalActive: 18,
    totalToday: 34,
    falseReports: 7,
    byType: types.map((t, i) => ({ type: t, count: [12, 45, 8, 3, 5, 2, 9][i]! })),
    byCity: [
      { city: 'بغداد', count: 51 },
      { city: 'البصرة', count: 18 },
      { city: 'أربيل', count: 9 },
      { city: 'الموصل', count: 6 },
    ],
    byHour: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: [2, 1, 0, 0, 1, 2, 5, 8, 12, 15, 10, 9, 11, 13, 12, 14, 17, 18, 15, 10, 8, 6, 5, 3][h]!,
    })),
  };
}

// ─── List Tab ──────────────────────────────────────────────────────────────

function ListTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('active');
  const [cityFilter, setCityFilter] = useState('الكل');
  const [sortKey, setSortKey] = useState<'date' | 'reports'>('date');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100', sort: sortKey });
      if (typeFilter !== 'all') qs.set('type', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (cityFilter !== 'الكل') qs.set('city', cityFilter);
      const res = await fetch(`/api/incidents/admin?${qs}`, { headers: { 'x-admin-key': api.getAdminKey() } });
      if (res.ok) {
        const data = (await res.json()) as { items: Incident[] };
        setIncidents(data.items);
      } else {
        let data = mockIncidents();
        if (typeFilter !== 'all') data = data.filter((i) => i.type === typeFilter);
        if (statusFilter !== 'all') data = data.filter((i) => i.status === statusFilter);
        if (cityFilter !== 'الكل') data = data.filter((i) => i.city === cityFilter);
        if (sortKey === 'reports') data.sort((a, b) => b.reportCount - a.reportCount);
        setIncidents(data);
      }
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, cityFilter, sortKey]);

  useEffect(() => { void load(); }, [load]);

  async function expire(id: string) {
    setActing(id);
    try {
      await fetch(`/api/incidents/${id}/expire`, { method: 'POST', headers: { 'x-admin-key': api.getAdminKey() } });
      flash('تم انتهاء صلاحية الحادث');
      void load();
    } finally {
      setActing(null);
    }
  }

  async function markFalse(id: string) {
    setActing(id);
    try {
      await fetch(`/api/incidents/${id}/false-report`, { method: 'POST', headers: { 'x-admin-key': api.getAdminKey() } });
      flash('تم تحديد البلاغ كاذب');
      void load();
    } finally {
      setActing(null);
    }
  }

  async function remove(id: string) {
    setActing(id);
    try {
      await fetch(`/api/incidents/${id}`, { method: 'DELETE', headers: { 'x-admin-key': api.getAdminKey() } });
      flash('تم حذف الحادث');
      void load();
    } finally {
      setActing(null);
    }
  }

  async function banReporter(reporterId: string) {
    const reason = window.prompt('سبب الحظر:');
    if (!reason) return;
    await fetch(`/api/moderation/users/${reporterId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
      body: JSON.stringify({ moderatorId: 'admin', type: 'ban', reason }),
    });
    flash('تم حظر المُبلِّغ');
  }

  const types: IncidentType[] = ['accident', 'traffic', 'road_closure', 'flood', 'protest', 'security', 'other'];
  const statuses: IncidentStatus[] = ['active', 'expired', 'removed', 'false_report'];
  const CITIES = ['الكل', 'بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف'];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          style={{
            padding: '5px 12px', borderRadius: 4, border: '1.5px solid',
            borderColor: typeFilter === 'all' ? '#1565c0' : '#ddd',
            background: typeFilter === 'all' ? '#e3f2fd' : '#fff',
            color: typeFilter === 'all' ? '#1565c0' : '#555',
            cursor: 'pointer', fontSize: 13, fontWeight: typeFilter === 'all' ? 700 : 400,
          }}
          onClick={() => setTypeFilter('all')}
        >
          كل الأنواع
        </button>
        {types.map((t) => (
          <button
            key={t}
            style={{
              padding: '5px 12px', borderRadius: 4, border: '1.5px solid',
              borderColor: typeFilter === t ? TYPE_COLORS[t] : '#ddd',
              background: typeFilter === t ? `${TYPE_COLORS[t]}18` : '#fff',
              color: typeFilter === t ? TYPE_COLORS[t] : '#555',
              cursor: 'pointer', fontSize: 13, fontWeight: typeFilter === t ? 700 : 400,
            }}
            onClick={() => setTypeFilter(t)}
          >
            {TYPE_ICONS[t]} {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#555' }}>
          الحالة:&nbsp;
          <select
            value={statusFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as IncidentStatus | 'all')}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            <option value="all">الكل</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#555' }}>
          المدينة:&nbsp;
          <select
            value={cityFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCityFilter(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#555' }}>
          ترتيب:&nbsp;
          <select
            value={sortKey}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortKey(e.target.value as 'date' | 'reports')}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            <option value="date">التاريخ</option>
            <option value="reports">عدد البلاغات</option>
          </select>
        </label>
      </div>

      {loading ? <LoadingRow /> : incidents.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد حوادث.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>النوع</th>
              <th style={thStyle}>المدينة</th>
              <th style={thStyle}>الوصف</th>
              <th style={thStyle}>البلاغات</th>
              <th style={thStyle}>المُبلِّغ</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>ينتهي في</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => {
              const isExpired = new Date(inc.expiresAt) < new Date();
              return (
                <tr key={inc.id} style={{ opacity: inc.status !== 'active' ? 0.7 : 1 }}>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 700,
                      color: TYPE_COLORS[inc.type],
                      background: `${TYPE_COLORS[inc.type]}18`,
                      padding: '3px 8px', borderRadius: 4,
                    }}>
                      {TYPE_ICONS[inc.type]} {TYPE_LABELS[inc.type]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{inc.city}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, fontSize: 13 }}>
                    {inc.description.slice(0, 70)}{inc.description.length > 70 ? '…' : ''}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 700, color: inc.reportCount >= 5 ? '#c62828' : '#333' }}>
                      {inc.reportCount}
                    </span>
                    {inc.confirmedCount > 0 && (
                      <span style={{ fontSize: 11, color: '#2e7d32', marginInlineStart: 4 }}>
                        ✓{inc.confirmedCount}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                    {inc.reporterName ?? inc.reporterId.slice(0, 10) + '…'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: STATUS_COLORS[inc.status],
                      background: `${STATUS_COLORS[inc.status]}18`,
                      padding: '2px 7px', borderRadius: 4,
                    }}>
                      {STATUS_LABELS[inc.status]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: isExpired ? '#c62828' : '#666' }}>
                    {isExpired
                      ? 'منتهي'
                      : new Date(inc.expiresAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {inc.status === 'active' && (
                      <button
                        style={{ ...btnStyle('#F57C00'), fontSize: 11, padding: '3px 7px' }}
                        disabled={acting === inc.id}
                        onClick={() => void expire(inc.id)}
                      >
                        إنهاء
                      </button>
                    )}
                    <button
                      style={{ ...btnStyle('#AD1457'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === inc.id}
                      onClick={() => void markFalse(inc.id)}
                    >
                      كاذب
                    </button>
                    <button
                      style={{ ...btnStyle('#c62828'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === inc.id}
                      onClick={() => void remove(inc.id)}
                    >
                      حذف
                    </button>
                    <button
                      style={{ ...btnStyle('#6a1b9a'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === inc.id}
                      onClick={() => void banReporter(inc.reporterId)}
                    >
                      حظر
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Map Tab ───────────────────────────────────────────────────────────────

function MapTab(): ReactElement {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Incident | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/incidents/admin?status=active&limit=200', {
          headers: { 'x-admin-key': api.getAdminKey() },
        });
        if (res.ok) {
          const data = (await res.json()) as { items: Incident[] };
          setIncidents(data.items);
        } else {
          setIncidents(mockIncidents().filter((i) => i.status === 'active'));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;

  // Iraq bounding box approx: lat 29.06–37.38, lon 38.79–48.57
  const LAT_MIN = 29.06, LAT_MAX = 37.38;
  const LON_MIN = 38.79, LON_MAX = 48.57;
  const W = 560, H = 400;

  function project(lat: number, lon: number): [number, number] {
    const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W;
    const y = H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * H;
    return [x, y];
  }

  const cityMarkers: { name: string; lat: number; lon: number }[] = [
    { name: 'بغداد', lat: 33.3152, lon: 44.3661 },
    { name: 'البصرة', lat: 30.5085, lon: 47.7804 },
    { name: 'أربيل', lat: 36.1901, lon: 44.0091 },
    { name: 'الموصل', lat: 36.3566, lon: 43.1568 },
    { name: 'النجف', lat: 31.9927, lon: 44.3345 },
    { name: 'كربلاء', lat: 32.6158, lon: 44.0243 },
  ];

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        الحوادث النشطة حالياً ({incidents.length} حادث) — اضغط على النقطة للتفاصيل
      </p>
      <div style={{ position: 'relative', display: 'inline-block', border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
        <svg width={W} height={H} style={{ background: '#e8f4e8', display: 'block' }}>
          {/* Iraq outline (simplified rectangle for admin purposes) */}
          <rect x={0} y={0} width={W} height={H} fill="#e8f4e8" />
          {/* Grid lines */}
          {Array.from({ length: 6 }, (_, i) => (
            <line key={`vl-${i}`} x1={(i * W) / 5} y1={0} x2={(i * W) / 5} y2={H} stroke="#ccc" strokeWidth={0.5} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`hl-${i}`} x1={0} y1={(i * H) / 4} x2={W} y2={(i * H) / 4} stroke="#ccc" strokeWidth={0.5} />
          ))}

          {/* City markers */}
          {cityMarkers.map((cm) => {
            const [cx, cy] = project(cm.lat, cm.lon);
            return (
              <g key={cm.name}>
                <circle cx={cx} cy={cy} r={5} fill="#1565c0" opacity={0.6} />
                <text x={cx + 7} y={cy + 4} fontSize={11} fill="#1565c0" fontWeight="bold">{cm.name}</text>
              </g>
            );
          })}

          {/* Incidents */}
          {incidents.map((inc) => {
            const [cx, cy] = project(inc.lat, inc.lon);
            const color = TYPE_COLORS[inc.type];
            return (
              <circle
                key={inc.id}
                cx={cx} cy={cy} r={8}
                fill={color} opacity={0.85}
                stroke="#fff" strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(inc)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && (() => {
          const [cx, cy] = project(hovered.lat, hovered.lon);
          const tipLeft = cx + 15;
          const tipTop = cy - 10;
          return (
            <div style={{
              position: 'absolute',
              left: tipLeft, top: tipTop,
              background: 'rgba(0,0,0,.85)', color: '#fff',
              padding: '8px 12px', borderRadius: 6, fontSize: 12,
              pointerEvents: 'none', maxWidth: 200, zIndex: 10,
              whiteSpace: 'nowrap',
            }}>
              <div style={{ fontWeight: 700 }}>{TYPE_ICONS[hovered.type]} {TYPE_LABELS[hovered.type]}</div>
              <div style={{ color: '#bbb', marginTop: 2 }}>{hovered.city}</div>
              <div style={{ marginTop: 3 }}>{hovered.description.slice(0, 60)}</div>
              <div style={{ color: '#aaa', marginTop: 2 }}>{hovered.reportCount} بلاغ</div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        {(Object.keys(TYPE_LABELS) as IncidentType[]).map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{
              display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
              background: TYPE_COLORS[t],
            }} />
            {TYPE_ICONS[t]} {TYPE_LABELS[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────────────────

function StatsTab(): ReactElement {
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/incidents/stats', { headers: { 'x-admin-key': api.getAdminKey() } });
        if (res.ok) {
          setStats((await res.json()) as IncidentStats);
        } else {
          setStats(mockStats());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;
  if (!stats) return <p style={{ color: '#888' }}>تعذر تحميل الإحصاءات.</p>;

  const maxByHour = Math.max(...stats.byHour.map((h) => h.count), 1);
  const maxByType = Math.max(...stats.byType.map((t) => t.count), 1);
  const maxByCity = Math.max(...stats.byCity.map((c) => c.count), 1);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'نشطة الآن', value: stats.totalActive, color: '#2e7d32' },
          { label: 'اليوم', value: stats.totalToday, color: '#F57C00' },
          { label: 'بلاغات كاذبة', value: stats.falseReports, color: '#AD1457' },
        ].map((c) => (
          <div key={c.label} style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* By type */}
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#333' }}>حسب النوع</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.byType.sort((a, b) => b.count - a.count).map((row) => (
              <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 80, fontSize: 12, color: '#555', flexShrink: 0, textAlign: 'right' }}>
                  {TYPE_ICONS[row.type]} {TYPE_LABELS[row.type]}
                </span>
                <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(row.count / maxByType) * 100}%`,
                    background: TYPE_COLORS[row.type],
                    height: '100%', borderRadius: 4,
                    transition: 'width .3s',
                  }} />
                </div>
                <span style={{ width: 30, fontSize: 13, fontWeight: 700, color: TYPE_COLORS[row.type], flexShrink: 0 }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* By city */}
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#333' }}>حسب المدينة</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.byCity.sort((a, b) => b.count - a.count).map((row) => (
              <div key={row.city} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 60, fontSize: 12, color: '#555', flexShrink: 0, textAlign: 'right' }}>
                  {row.city}
                </span>
                <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(row.count / maxByCity) * 100}%`,
                    background: '#1565c0',
                    height: '100%', borderRadius: 4,
                    transition: 'width .3s',
                  }} />
                </div>
                <span style={{ width: 30, fontSize: 13, fontWeight: 700, color: '#1565c0', flexShrink: 0 }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By hour chart */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 12, color: '#333' }}>
        الحوادث حسب الساعة (اليوم)
      </h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, padding: '0 4px' }}>
        {stats.byHour.map((row) => (
          <div key={row.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{
              width: '100%',
              height: `${(row.count / maxByHour) * 64}px`,
              background: row.count === 0 ? '#eee' : '#1565c0',
              borderRadius: '2px 2px 0 0',
              minHeight: 2,
              transition: 'height .2s',
            }} title={`${row.hour}:00 — ${row.count}`} />
            <span style={{ fontSize: 9, color: '#999', writingMode: 'vertical-lr' }}>{row.hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  list:  'القائمة',
  map:   'الخريطة',
  stats: 'الإحصاءات',
};

export function AdminIncidentsPage(): ReactElement {
  const [tab, setTab] = useState<TabKey>('list');
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div>
      <PageHeader title="إدارة الحوادث والبلاغات" />
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

      {tab === 'list'  && <ListTab flash={flash} />}
      {tab === 'map'   && <MapTab />}
      {tab === 'stats' && <StatsTab />}
    </div>
  );
}
