/**
 * AdminEventsPage — events management.
 *
 * Tabs:
 *  1. Pending  — events awaiting approval
 *  2. Archive  — past / rejected events
 *  3. Create   — create official event from admin
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ChangeEvent } from 'react';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────

type EventStatus = 'pending' | 'approved' | 'featured' | 'rejected' | 'expired';
type EventCategory = 'all' | 'cultural' | 'religious' | 'sports' | 'business' | 'food' | 'social' | 'official';

interface AdminEvent {
  id: string;
  titleAr: string;
  descriptionAr: string;
  category: EventCategory;
  city: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizerName: string;
  organizerId: string;
  status: EventStatus;
  featured: boolean;
  submittedAt: string;
  rejectionReason: string | null;
  attendeeCount: number;
}

interface CreateEventForm {
  titleAr: string;
  descriptionAr: string;
  category: EventCategory;
  city: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizerName: string;
  featured: boolean;
}

type TabKey = 'pending' | 'archive' | 'create';

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<EventStatus, string> = {
  pending:  '#F57C00',
  approved: '#388E3C',
  featured: '#7B1FA2',
  rejected: '#C62828',
  expired:  '#9E9E9E',
};

const STATUS_LABELS: Record<EventStatus, string> = {
  pending:  'قيد المراجعة',
  approved: 'مقبول',
  featured: 'مميز',
  rejected: 'مرفوض',
  expired:  'منتهي',
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  all:       'الكل',
  cultural:  'ثقافي',
  religious: 'ديني',
  sports:    'رياضي',
  business:  'تجاري',
  food:      'طعام',
  social:    'اجتماعي',
  official:  'رسمي',
};

const CITIES = ['الكل', 'بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف', 'كربلاء', 'كركوك', 'السليمانية'];

// ─── Helpers ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EventStatus }): ReactElement {
  const color = STATUS_COLORS[status] ?? '#9e9e9e';
  return (
    <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 12, background: `${color}22`, color, fontWeight: 600 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DateRange({ startsAt, endsAt }: { startsAt: string; endsAt: string }): ReactElement {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const fmt = (d: Date) => d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', year: '2-digit' });
  return (
    <span style={{ fontSize: 12, color: '#555' }}>
      {fmt(start)} — {fmt(end)}
    </span>
  );
}

// ─── Mock data ─────────────────────────────────────────────────────────────

function mockEvents(statusFilter: EventStatus | 'all'): AdminEvent[] {
  const categories: EventCategory[] = ['cultural', 'religious', 'sports', 'business', 'food', 'social'];
  const cities = ['بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف'];
  const statuses: EventStatus[] = ['pending', 'pending', 'approved', 'featured', 'rejected', 'expired'];

  return Array.from({ length: 30 }, (_, i) => {
    const status = statuses[i % statuses.length]!;
    const start = new Date(Date.now() + (i - 15) * 86400000 * 3);
    const end = new Date(start.getTime() + 86400000 * 2);
    return {
      id: `evt-${i + 1}`,
      titleAr: [`مهرجان الربيع البغدادي ${i + 1}`, `معرض الكتاب الدولي`, `بطولة القدم`, `ملتقى الأعمال`, `مهرجان الطعام`][i % 5]!,
      descriptionAr: 'فعالية ترفيهية وثقافية تجمع أهالي المنطقة للاحتفاء بالمناسبات التراثية والإبداعية.',
      category: categories[i % categories.length]!,
      city: cities[i % cities.length]!,
      location: 'ساحة التحرير، وسط المدينة',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      organizerName: `منظمة ${i + 1}`,
      organizerId: `org-${i + 1}`,
      status,
      featured: status === 'featured',
      submittedAt: new Date(Date.now() - i * 86400000).toISOString(),
      rejectionReason: status === 'rejected' ? 'لا تستوفي معايير الفعاليات المعتمدة' : null,
      attendeeCount: i * 17 + 10,
    };
  }).filter((e) => statusFilter === 'all' || e.status === statusFilter);
}

// ─── Pending Tab ───────────────────────────────────────────────────────────

function PendingTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory>('all');
  const [cityFilter, setCityFilter] = useState('الكل');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: 'pending', limit: '100' });
      if (categoryFilter !== 'all') qs.set('category', categoryFilter);
      if (cityFilter !== 'الكل') qs.set('city', cityFilter);
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      const res = await fetch(`/api/events/admin?${qs}`, { headers: { 'x-admin-key': api.getAdminKey() } });
      if (res.ok) {
        const data = (await res.json()) as { items: AdminEvent[] };
        setEvents(data.items);
      } else {
        setEvents(mockEvents('pending'));
      }
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, cityFilter, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  async function approve(id: string, feature = false) {
    setActing(id);
    try {
      await fetch(`/api/events/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ feature }),
      });
      flash(feature ? 'تم القبول والتمييز' : 'تم القبول');
      void load();
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    setActing(id);
    try {
      await fetch(`/api/events/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ reason: rejectReason }),
      });
      flash('تم الرفض');
      setRejectFor(null);
      setRejectReason('');
      void load();
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#555' }}>
          الفئة:&nbsp;
          <select
            value={categoryFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value as EventCategory)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
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
          من:&nbsp;
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 13, color: '#555' }}>
          إلى:&nbsp;
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }} />
        </label>
      </div>

      {loading ? <LoadingRow /> : events.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد فعاليات قيد المراجعة.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>الفعالية</th>
              <th style={thStyle}>الفئة</th>
              <th style={thStyle}>المدينة</th>
              <th style={thStyle}>المنظم</th>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <>
                <tr key={ev.id}>
                  <td style={{ ...tdStyle, maxWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.titleAr}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3, lineHeight: 1.4 }}>
                      {ev.descriptionAr.slice(0, 60)}…
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: '#555', background: '#f0f0f0', padding: '2px 8px', borderRadius: 12 }}>
                      {CATEGORY_LABELS[ev.category] ?? ev.category}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, fontSize: 13 }}>{ev.city}</td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#555' }}>{ev.organizerName}</td>
                  <td style={tdStyle}><DateRange startsAt={ev.startsAt} endsAt={ev.endsAt} /></td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button
                      style={{ ...btnStyle('#2e7d32'), fontSize: 11, padding: '3px 8px' }}
                      disabled={acting === ev.id}
                      onClick={() => void approve(ev.id)}
                    >
                      قبول
                    </button>
                    <button
                      style={{ ...btnStyle('#7B1FA2'), fontSize: 11, padding: '3px 8px' }}
                      disabled={acting === ev.id}
                      onClick={() => void approve(ev.id, true)}
                    >
                      مميز ★
                    </button>
                    <button
                      style={{ ...btnStyle('#c62828'), fontSize: 11, padding: '3px 8px' }}
                      disabled={acting === ev.id}
                      onClick={() => setRejectFor(rejectFor === ev.id ? null : ev.id)}
                    >
                      رفض
                    </button>
                  </td>
                </tr>
                {rejectFor === ev.id && (
                  <tr key={`${ev.id}-reject`}>
                    <td colSpan={6} style={{ ...tdStyle, background: '#fff3e0', paddingTop: 8, paddingBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="سبب الرفض (مطلوب)"
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #bbb', fontSize: 13 }}
                          dir="rtl"
                        />
                        <button
                          style={btnStyle('#c62828')}
                          onClick={() => void reject(ev.id)}
                          disabled={!rejectReason.trim()}
                        >
                          تأكيد الرفض
                        </button>
                        <button style={btnStyle('#999')} onClick={() => { setRejectFor(null); setRejectReason(''); }}>
                          إلغاء
                        </button>
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

// ─── Archive Tab ───────────────────────────────────────────────────────────

function ArchiveTab(): ReactElement {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('approved');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await fetch(`/api/events/admin?${qs}`, { headers: { 'x-admin-key': api.getAdminKey() } });
      if (res.ok) {
        const data = (await res.json()) as { items: AdminEvent[] };
        setEvents(data.items);
      } else {
        setEvents(mockEvents(statusFilter));
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const archiveStatuses: (EventStatus | 'all')[] = ['all', 'approved', 'featured', 'rejected', 'expired'];
  const archiveLabels: Record<string, string> = { all: 'الكل', ...STATUS_LABELS };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {archiveStatuses.map((s) => (
          <button
            key={s}
            style={{
              padding: '5px 12px', borderRadius: 4, border: '1.5px solid',
              borderColor: statusFilter === s ? '#1565c0' : '#ddd',
              background: statusFilter === s ? '#e3f2fd' : '#fff',
              color: statusFilter === s ? '#1565c0' : '#555',
              cursor: 'pointer', fontSize: 13, fontWeight: statusFilter === s ? 700 : 400,
            }}
            onClick={() => setStatusFilter(s)}
          >
            {archiveLabels[s]}
          </button>
        ))}
      </div>

      {loading ? <LoadingRow /> : events.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد فعاليات.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>الفعالية</th>
              <th style={thStyle}>الفئة</th>
              <th style={thStyle}>المدينة</th>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>الحضور</th>
              <th style={thStyle}>ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td style={{ ...tdStyle, fontWeight: 700, fontSize: 13 }}>{ev.titleAr}</td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: '#555', background: '#f0f0f0', padding: '2px 8px', borderRadius: 12 }}>
                    {CATEGORY_LABELS[ev.category] ?? ev.category}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 13 }}>{ev.city}</td>
                <td style={tdStyle}><DateRange startsAt={ev.startsAt} endsAt={ev.endsAt} /></td>
                <td style={tdStyle}><StatusBadge status={ev.status} /></td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{ev.attendeeCount.toLocaleString('ar')}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: ev.rejectionReason ? '#c62828' : '#aaa' }}>
                  {ev.rejectionReason ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Create Tab ─────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateEventForm = {
  titleAr: '',
  descriptionAr: '',
  category: 'official',
  city: 'بغداد',
  location: '',
  startsAt: '',
  endsAt: '',
  organizerName: 'إدارة المنصة',
  featured: true,
};

function CreateTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [form, setForm] = useState<CreateEventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateEventForm, string>>>({});

  function validate(): boolean {
    const e: Partial<Record<keyof CreateEventForm, string>> = {};
    if (!form.titleAr.trim()) e.titleAr = 'العنوان مطلوب';
    if (!form.descriptionAr.trim()) e.descriptionAr = 'الوصف مطلوب';
    if (!form.location.trim()) e.location = 'الموقع مطلوب';
    if (!form.startsAt) e.startsAt = 'تاريخ البداية مطلوب';
    if (!form.endsAt) e.endsAt = 'تاريخ النهاية مطلوب';
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) e.endsAt = 'يجب أن يكون بعد تاريخ البداية';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/events/admin/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ ...form, source: 'admin' }),
      });
      if (res.ok) {
        flash('تم إنشاء الفعالية بنجاح');
        setForm(EMPTY_FORM);
      }
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, key: keyof CreateEventForm, input: ReactElement): ReactElement {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
          {label}
        </label>
        {input}
        {errors[key] && <div style={{ fontSize: 12, color: '#c62828', marginTop: 3 }}>{errors[key]}</div>}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ color: '#555', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        إنشاء فعالية رسمية تظهر مميزة للمستخدمين في مدينة معينة.
      </p>

      {field('عنوان الفعالية', 'titleAr',
        <input
          style={inputStyle} dir="rtl" value={form.titleAr}
          onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
          placeholder="مهرجان الربيع البغدادي 2026"
        />
      )}

      {field('وصف الفعالية', 'descriptionAr',
        <textarea
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} dir="rtl"
          value={form.descriptionAr}
          onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
          placeholder="وصف تفصيلي للفعالية…"
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {field('الفئة', 'category',
          <select
            style={inputStyle} value={form.category}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, category: e.target.value as EventCategory })}
          >
            {(Object.keys(CATEGORY_LABELS) as EventCategory[]).filter((c) => c !== 'all').map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        )}

        {field('المدينة', 'city',
          <select
            style={inputStyle} value={form.city}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, city: e.target.value })}
          >
            {CITIES.filter((c) => c !== 'الكل').map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {field('موقع الفعالية', 'location',
        <input
          style={inputStyle} dir="rtl" value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="ساحة التحرير، وسط بغداد"
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {field('تاريخ البداية', 'startsAt',
          <input
            type="datetime-local" style={inputStyle} value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          />
        )}
        {field('تاريخ النهاية', 'endsAt',
          <input
            type="datetime-local" style={inputStyle} value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
        )}
      </div>

      {field('اسم المنظم', 'organizerName',
        <input
          style={inputStyle} dir="rtl" value={form.organizerName}
          onChange={(e) => setForm({ ...form, organizerName: e.target.value })}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <input
          type="checkbox" id="featured-check" checked={form.featured}
          onChange={(e) => setForm({ ...form, featured: e.target.checked })}
          style={{ width: 16, height: 16 }}
        />
        <label htmlFor="featured-check" style={{ fontSize: 14, color: '#555', cursor: 'pointer' }}>
          عرض مميز (يظهر في أعلى الصفحة الرئيسية)
        </label>
      </div>

      <button
        style={{ ...btnStyle('#1565c0'), padding: '10px 28px', fontSize: 14 }}
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? 'جارٍ الإنشاء…' : 'إنشاء الفعالية'}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  pending: 'قيد المراجعة',
  archive: 'الأرشيف',
  create:  'إنشاء فعالية',
};

export function AdminEventsPage(): ReactElement {
  const [tab, setTab] = useState<TabKey>('pending');
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div>
      <PageHeader title="إدارة الفعاليات" />
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

      {tab === 'pending' && <PendingTab flash={flash} />}
      {tab === 'archive' && <ArchiveTab />}
      {tab === 'create'  && <CreateTab flash={flash} />}
    </div>
  );
}
