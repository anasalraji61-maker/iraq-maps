/**
 * AdminReviewsPage — reviews moderation queue.
 *
 * Tabs:
 *  1. Queue    — reported / pending / flagged reviews
 *  2. History  — past moderation decisions
 *  3. Stats    — totals, avg rating per city
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ChangeEvent } from 'react';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'approved' | 'flagged' | 'removed' | 'warned';
type PlaceCategory = 'all' | 'restaurant' | 'hotel' | 'shop' | 'service' | 'attraction' | 'medical';
type SortKey = 'reportCount' | 'date' | 'rating';
type ModerationDecision = 'approve' | 'remove' | 'warn';
type TabKey = 'queue' | 'history' | 'stats';

interface Review {
  id: string;
  placeId: string;
  placeNameAr: string;
  placeCategory: string;
  authorId: string;
  authorName: string | null;
  rating: number; // 1–5
  body: string;
  reportCount: number;
  status: ReviewStatus;
  createdAt: string;
  city: string;
}

interface ModerationHistoryEntry {
  id: string;
  reviewId: string;
  placeNameAr: string;
  rating: number;
  decision: ModerationDecision;
  moderatorId: string;
  note: string | null;
  decidedAt: string;
}

interface CityStats {
  city: string;
  totalReviews: number;
  avgRating: number;
  reportedCount: number;
  removedCount: number;
}

interface ReviewStats {
  totalReviews: number;
  pendingCount: number;
  flaggedCount: number;
  removedCount: number;
  byCity: CityStats[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ReviewStatus, string> = {
  pending:  '#F57C00',
  approved: '#388E3C',
  flagged:  '#AD1457',
  removed:  '#C62828',
  warned:   '#1565C0',
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending:  'قيد المراجعة',
  approved: 'مقبول',
  flagged:  'مُبلَّغ عنه',
  removed:  'مُزال',
  warned:   'تحذير',
};

const DECISION_COLORS: Record<ModerationDecision, string> = {
  approve: '#2e7d32',
  remove:  '#c62828',
  warn:    '#1565c0',
};

const DECISION_LABELS: Record<ModerationDecision, string> = {
  approve: 'قبول',
  remove:  'إزالة',
  warn:    'تحذير',
};

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  all:        'الكل',
  restaurant: 'مطعم',
  hotel:      'فندق',
  shop:       'متجر',
  service:    'خدمة',
  attraction: 'معلم',
  medical:    'طبي',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewStatus }): ReactElement {
  const color = STATUS_COLORS[status] ?? '#9e9e9e';
  return (
    <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 12, background: `${color}22`, color, fontWeight: 600 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StarRating({ value }: { value: number }): ReactElement {
  return (
    <span style={{ color: '#F9A825', fontSize: 15, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (i < value ? '★' : '☆')).join('')}
      <span style={{ color: '#888', fontSize: 12, marginInlineStart: 4 }}>({value})</span>
    </span>
  );
}

function ReviewBodyPreview({ text }: { text: string }): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const MAX = 80;
  if (text.length <= MAX) return <span style={{ fontSize: 13 }}>{text}</span>;
  return (
    <span style={{ fontSize: 13 }}>
      {expanded ? text : `${text.slice(0, MAX)}…`}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
      >
        {expanded ? 'أقل' : 'المزيد'}
      </button>
    </span>
  );
}

function FilterBar({
  statusFilter, setStatusFilter,
  categoryFilter, setCategoryFilter,
  sortKey, setSortKey,
  selectedCount, onBulkApprove, onBulkRemove,
}: {
  statusFilter: string; setStatusFilter: (v: string) => void;
  categoryFilter: PlaceCategory; setCategoryFilter: (v: PlaceCategory) => void;
  sortKey: SortKey; setSortKey: (v: SortKey) => void;
  selectedCount: number; onBulkApprove: () => void; onBulkRemove: () => void;
}): ReactElement {
  const statuses: ReviewStatus[] = ['pending', 'flagged', 'approved', 'warned', 'removed'];
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          style={{
            padding: '5px 12px', borderRadius: 4, border: '1.5px solid',
            borderColor: statusFilter === 'all' ? '#1565c0' : '#ddd',
            background: statusFilter === 'all' ? '#e3f2fd' : '#fff',
            color: statusFilter === 'all' ? '#1565c0' : '#555',
            cursor: 'pointer', fontSize: 13, fontWeight: statusFilter === 'all' ? 700 : 400,
          }}
          onClick={() => setStatusFilter('all')}
        >
          الكل
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            style={{
              padding: '5px 12px', borderRadius: 4, border: '1.5px solid',
              borderColor: statusFilter === s ? STATUS_COLORS[s] : '#ddd',
              background: statusFilter === s ? `${STATUS_COLORS[s]}18` : '#fff',
              color: statusFilter === s ? STATUS_COLORS[s] : '#555',
              cursor: 'pointer', fontSize: 13, fontWeight: statusFilter === s ? 700 : 400,
            }}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Category + sort + bulk */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#555' }}>
          الفئة:&nbsp;
          <select
            value={categoryFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value as PlaceCategory)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            {(Object.keys(CATEGORY_LABELS) as PlaceCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#555' }}>
          ترتيب:&nbsp;
          <select
            value={sortKey}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortKey(e.target.value as SortKey)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          >
            <option value="reportCount">عدد البلاغات</option>
            <option value="date">التاريخ</option>
            <option value="rating">التقييم</option>
          </select>
        </label>
        {selectedCount > 0 && (
          <div style={{ display: 'flex', gap: 6, marginInlineStart: 12 }}>
            <span style={{ fontSize: 13, color: '#555', alignSelf: 'center' }}>
              {selectedCount} محدد
            </span>
            <button style={btnStyle('#2e7d32')} onClick={onBulkApprove}>قبول جماعي</button>
            <button style={btnStyle('#c62828')} onClick={onBulkRemove}>إزالة جماعية</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mock data generator ───────────────────────────────────────────────────

function mockReviews(): Review[] {
  const places = [
    { id: 'p1', nameAr: 'مطعم البغدادي', category: 'restaurant', city: 'بغداد' },
    { id: 'p2', nameAr: 'فندق دجلة', category: 'hotel', city: 'بغداد' },
    { id: 'p3', nameAr: 'متجر الرافدين', category: 'shop', city: 'البصرة' },
    { id: 'p4', nameAr: 'مستشفى ابن سينا', category: 'medical', city: 'أربيل' },
    { id: 'p5', nameAr: 'معلم الكاظمية', category: 'attraction', city: 'بغداد' },
  ];
  const statuses: ReviewStatus[] = ['pending', 'pending', 'flagged', 'approved', 'removed'];
  const bodies = [
    'الخدمة ممتازة والطعام لذيذ جداً، أنصح بزيارته',
    'سيء جداً، لن أعود مرة أخرى',
    'محتوى غير لائق ويجب إزالته',
    'مكان رائع وموقعه ممتاز وسط المدينة',
    'الأسعار مرتفعة نسبياً لكن الجودة جيدة',
  ];
  return Array.from({ length: 40 }, (_, i) => {
    const place = places[i % places.length]!;
    return {
      id: `rev-${i + 1}`,
      placeId: place.id,
      placeNameAr: place.nameAr,
      placeCategory: place.category,
      authorId: `user-${(i * 7 + 3) % 20}`,
      authorName: i % 4 === 0 ? null : `مستخدم ${i + 1}`,
      rating: (i % 5) + 1,
      body: bodies[i % bodies.length]!,
      reportCount: i % 7,
      status: statuses[i % statuses.length]!,
      createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
      city: place.city,
    };
  });
}

function mockHistory(): ModerationHistoryEntry[] {
  const decisions: ModerationDecision[] = ['approve', 'remove', 'warn'];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `hist-${i + 1}`,
    reviewId: `rev-${i + 41}`,
    placeNameAr: ['مطعم الأمير', 'فندق النخيل', 'متجر الزيتون'][i % 3]!,
    rating: (i % 5) + 1,
    decision: decisions[i % decisions.length]!,
    moderatorId: 'admin',
    note: i % 3 === 0 ? 'محتوى مسيء' : null,
    decidedAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
  }));
}

function mockStats(): ReviewStats {
  return {
    totalReviews: 1284,
    pendingCount: 47,
    flaggedCount: 12,
    removedCount: 89,
    byCity: [
      { city: 'بغداد', totalReviews: 712, avgRating: 3.8, reportedCount: 34, removedCount: 51 },
      { city: 'البصرة', totalReviews: 298, avgRating: 4.1, reportedCount: 11, removedCount: 18 },
      { city: 'أربيل', totalReviews: 189, avgRating: 4.4, reportedCount: 7, removedCount: 12 },
      { city: 'الموصل', totalReviews: 85, avgRating: 3.6, reportedCount: 5, removedCount: 8 },
    ],
  };
}

// ─── Queue Tab ─────────────────────────────────────────────────────────────

function QueueTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory>('all');
  const [sortKey, setSortKey] = useState<SortKey>('reportCount');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (categoryFilter !== 'all') qs.set('category', categoryFilter);
      qs.set('sort', sortKey);
      qs.set('limit', '100');
      const res = await fetch(`/api/reviews/moderation?${qs.toString()}`, {
        headers: { 'x-admin-key': api.getAdminKey() },
      });
      if (res.ok) {
        const data = (await res.json()) as { items: Review[] };
        setReviews(data.items);
      } else {
        // fallback mock
        let data = mockReviews();
        if (statusFilter !== 'all') data = data.filter((r) => r.status === statusFilter);
        if (categoryFilter !== 'all') data = data.filter((r) => r.placeCategory === categoryFilter);
        if (sortKey === 'reportCount') data.sort((a, b) => b.reportCount - a.reportCount);
        else if (sortKey === 'date') data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        else data.sort((a, b) => a.rating - b.rating);
        setReviews(data);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, sortKey]);

  useEffect(() => { void load(); setSelected(new Set()); }, [load]);

  async function act(reviewId: string, decision: ModerationDecision) {
    setActing(reviewId);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ decision, note: noteText || undefined }),
      });
      if (res.ok) {
        flash(`تم: ${DECISION_LABELS[decision]}`);
        setNoteFor(null);
        setNoteText('');
        void load();
      }
    } finally {
      setActing(null);
    }
  }

  async function bulkAct(decision: ModerationDecision) {
    const ids = [...selected];
    await fetch('/api/reviews/bulk-moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
      body: JSON.stringify({ ids, decision }),
    });
    flash(`تم ${DECISION_LABELS[decision]} لـ ${ids.length} تقييم`);
    setSelected(new Set());
    void load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === reviews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(reviews.map((r) => r.id)));
    }
  }

  if (loading) return <LoadingRow />;

  return (
    <div>
      <FilterBar
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        sortKey={sortKey} setSortKey={setSortKey}
        selectedCount={selected.size}
        onBulkApprove={() => void bulkAct('approve')}
        onBulkRemove={() => void bulkAct('remove')}
      />

      {reviews.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد تقييمات بهذه المعايير.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 32 }}>
                <input type="checkbox" checked={selected.size === reviews.length && reviews.length > 0} onChange={toggleAll} />
              </th>
              <th style={thStyle}>المكان</th>
              <th style={thStyle}>الكاتب</th>
              <th style={thStyle}>التقييم</th>
              <th style={thStyle}>المحتوى</th>
              <th style={thStyle}>البلاغات</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <>
                <tr key={r.id} style={{ background: selected.has(r.id) ? '#f0f7ff' : undefined }}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 160 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.placeNameAr}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{r.city} · {r.placeCategory}</div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                    {r.authorName ?? r.authorId.slice(0, 10) + '…'}
                  </td>
                  <td style={tdStyle}><StarRating value={r.rating} /></td>
                  <td style={{ ...tdStyle, maxWidth: 240 }}>
                    <ReviewBodyPreview text={r.body} />
                  </td>
                  <td style={tdStyle}>
                    {r.reportCount > 0 ? (
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 12,
                        background: r.reportCount >= 3 ? '#ffebee' : '#fff8e1',
                        color: r.reportCount >= 3 ? '#c62828' : '#e65100',
                        fontWeight: 700,
                      }}>
                        {r.reportCount}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#aaa' }}>0</span>
                    )}
                  </td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                    {new Date(r.createdAt).toLocaleDateString('ar-IQ')}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button
                      style={{ ...btnStyle('#2e7d32'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === r.id}
                      onClick={() => void act(r.id, 'approve')}
                    >
                      قبول
                    </button>
                    <button
                      style={{ ...btnStyle('#c62828'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === r.id}
                      onClick={() => void act(r.id, 'remove')}
                    >
                      إزالة
                    </button>
                    <button
                      style={{ ...btnStyle('#1565c0'), fontSize: 11, padding: '3px 7px' }}
                      disabled={acting === r.id}
                      onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}
                    >
                      تحذير
                    </button>
                  </td>
                </tr>
                {noteFor === r.id && (
                  <tr key={`${r.id}-note`}>
                    <td colSpan={9} style={{ ...tdStyle, background: '#e3f2fd', paddingTop: 8, paddingBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="سبب التحذير (اختياري)"
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #bbb', fontSize: 13 }}
                          dir="rtl"
                        />
                        <button style={btnStyle('#1565c0')} onClick={() => void act(r.id, 'warn')}>
                          إرسال التحذير
                        </button>
                        <button style={btnStyle('#999')} onClick={() => { setNoteFor(null); setNoteText(''); }}>
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

// ─── History Tab ───────────────────────────────────────────────────────────

function HistoryTab(): ReactElement {
  const [entries, setEntries] = useState<ModerationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/reviews/moderation/history?limit=100', {
          headers: { 'x-admin-key': api.getAdminKey() },
        });
        if (res.ok) {
          const data = (await res.json()) as { items: ModerationHistoryEntry[] };
          setEntries(data.items);
        } else {
          setEntries(mockHistory());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingRow />;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>المكان</th>
          <th style={thStyle}>التقييم</th>
          <th style={thStyle}>القرار</th>
          <th style={thStyle}>المشرف</th>
          <th style={thStyle}>الملاحظة</th>
          <th style={thStyle}>التاريخ</th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>لا يوجد سجل بعد.</td></tr>
        ) : entries.map((e) => (
          <tr key={e.id}>
            <td style={{ ...tdStyle, fontWeight: 600, fontSize: 13 }}>{e.placeNameAr}</td>
            <td style={tdStyle}><StarRating value={e.rating} /></td>
            <td style={tdStyle}>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: DECISION_COLORS[e.decision],
                background: `${DECISION_COLORS[e.decision]}18`,
                padding: '2px 8px', borderRadius: 4,
              }}>
                {DECISION_LABELS[e.decision]}
              </span>
            </td>
            <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>{e.moderatorId}</td>
            <td style={{ ...tdStyle, fontSize: 12, color: '#555' }}>{e.note ?? '—'}</td>
            <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
              {new Date(e.decidedAt).toLocaleString('ar-IQ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────────────────

function StatsTab(): ReactElement {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/reviews/stats', { headers: { 'x-admin-key': api.getAdminKey() } });
        if (res.ok) {
          setStats((await res.json()) as ReviewStats);
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

  const cards: { label: string; value: number | string; color: string }[] = [
    { label: 'إجمالي التقييمات', value: stats.totalReviews.toLocaleString('ar'), color: '#1565c0' },
    { label: 'قيد المراجعة', value: stats.pendingCount, color: '#F57C00' },
    { label: 'مُبلَّغ عنها', value: stats.flaggedCount, color: '#AD1457' },
    { label: 'مُزالة', value: stats.removedCount, color: '#C62828' },
  ];

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {cards.map((c) => (
          <div key={c.label} style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* By city */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#333' }}>متوسط التقييمات حسب المدينة</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>المدينة</th>
            <th style={thStyle}>إجمالي التقييمات</th>
            <th style={thStyle}>متوسط التقييم</th>
            <th style={thStyle}>البلاغات</th>
            <th style={thStyle}>المُزالة</th>
            <th style={thStyle}>نسبة الإزالة</th>
          </tr>
        </thead>
        <tbody>
          {stats.byCity.map((row) => {
            const removalRate = row.totalReviews > 0
              ? ((row.removedCount / row.totalReviews) * 100).toFixed(1)
              : '0.0';
            return (
              <tr key={row.city}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.city}</td>
                <td style={tdStyle}>{row.totalReviews.toLocaleString('ar')}</td>
                <td style={tdStyle}>
                  <StarRating value={Math.round(row.avgRating)} />
                  <span style={{ fontSize: 12, color: '#888', marginInlineStart: 4 }}>
                    ({row.avgRating.toFixed(1)})
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: '#AD1457', fontWeight: 600 }}>{row.reportedCount}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: '#C62828', fontWeight: 600 }}>{row.removedCount}</span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 8 }}>
                      <div style={{
                        width: `${removalRate}%`, background: '#C62828',
                        borderRadius: 4, height: 8,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#666', minWidth: 36 }}>{removalRate}%</span>
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

// ─── Main Page ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  queue:   'قائمة الانتظار',
  history: 'السجل',
  stats:   'الإحصاءات',
};

export function AdminReviewsPage(): ReactElement {
  const [tab, setTab] = useState<TabKey>('queue');
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div>
      <PageHeader title="إدارة التقييمات" />
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

      {tab === 'queue'   && <QueueTab flash={flash} />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'stats'   && <StatsTab />}
    </div>
  );
}
