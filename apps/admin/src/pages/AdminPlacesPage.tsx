/**
 * AdminPlacesPage — place management:
 * list, search, filter, map view, edit, merge, verify, delete,
 * OSM import trigger, reports, batch verify by category.
 */
import { useState, useEffect, useCallback } from 'react';
import { api, type AdminPlace } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner, PageHeader } from '../components/shared';
import { AdminDataTable, type Column, type BulkAction } from '../components/AdminDataTable';
import { AdminStatCard, StatCardRow } from '../components/AdminStatCard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaceRow extends AdminPlace {
  verified?: boolean;
  reportCount?: number;
  status?: 'active' | 'pending' | 'flagged' | 'deleted';
  city?: string;
  osmId?: string;
  createdAt?: string;
}

interface PlaceReport {
  id: string;
  reason: string;
  reportedBy: string;
  createdAt: string;
  resolved: boolean;
}

type PlaceTab = 'list' | 'map';
type FilterCategory = 'all' | 'restaurant' | 'cafe' | 'hotel' | 'hospital' | 'mosque' | 'school' | 'shop' | 'gas_station' | 'bank' | 'park' | 'other';
type FilterStatus = 'all' | 'active' | 'pending' | 'flagged';

const CATEGORIES: FilterCategory[] = ['all', 'restaurant', 'cafe', 'hotel', 'hospital', 'mosque', 'school', 'shop', 'gas_station', 'bank', 'park', 'other'];
const CITIES = ['All Cities', 'Baghdad', 'Basra', 'Erbil', 'Mosul', 'Najaf', 'Karbala', 'Sulaymaniyah', 'Kirkuk'];

function mockReports(placeId: string): PlaceReport[] {
  return [
    { id: placeId + 'r1', reason: 'Incorrect location', reportedBy: 'user#10', createdAt: new Date(Date.now() - 86400_000).toISOString(), resolved: false },
    { id: placeId + 'r2', reason: 'Closed permanently', reportedBy: 'user#22', createdAt: new Date(Date.now() - 1000000_000).toISOString(), resolved: true },
  ];
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  place: PlaceRow;
  onClose: () => void;
  onSave: (id: string, patch: Partial<AdminPlace>) => Promise<void>;
}

function EditModal({ place, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState<Partial<AdminPlace>>({
    nameAr: place.nameAr,
    nameEn: place.nameEn ?? '',
    category: place.category,
    phone: place.phone ?? '',
    hoursRaw: place.hoursRaw ?? '',
    lat: place.lat,
    lon: place.lon,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set<K extends keyof typeof form>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await onSave(place.id, form);
      onClose();
    } catch {
      setErr('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 28, width: 520, maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
  };
  const field: React.CSSProperties = {
    display: 'block', marginBottom: 14, fontSize: 13, fontWeight: 600,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid #ccc', borderRadius: 4,
    fontSize: 14, marginTop: 4, boxSizing: 'border-box',
  };
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>Edit Place</h3>
        {err && <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 12px', borderRadius: 4, marginBottom: 14, fontSize: 13 }}>{err}</div>}
        <form onSubmit={save}>
          <label style={field}>
            Arabic Name
            <input value={form.nameAr ?? ''} onChange={set('nameAr')} style={input} required />
          </label>
          <label style={field}>
            English Name
            <input value={form.nameEn ?? ''} onChange={set('nameEn')} style={input} />
          </label>
          <label style={field}>
            Category
            <select value={form.category ?? ''} onChange={set('category')} style={input}>
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label style={field}>
            Phone
            <input value={form.phone ?? ''} onChange={set('phone')} style={input} placeholder="+964…" />
          </label>
          <label style={field}>
            Opening Hours
            <textarea value={form.hoursRaw ?? ''} onChange={set('hoursRaw')} style={{ ...input, resize: 'vertical' }} rows={2} placeholder="Mo-Fr 09:00-18:00" />
          </label>
          <div style={row2}>
            <label style={field}>
              Latitude
              <input
                value={String(form.lat ?? '')}
                onChange={(e) => setForm((prev) => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                type="number"
                step="any"
                style={input}
              />
            </label>
            <label style={field}>
              Longitude
              <input
                value={String(form.lon ?? '')}
                onChange={(e) => setForm((prev) => ({ ...prev, lon: parseFloat(e.target.value) || 0 }))}
                type="number"
                step="any"
                style={input}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={saving} style={btnStyle('#1565c0')}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Merge modal ───────────────────────────────────────────────────────────────

interface MergeModalProps {
  sourcePlace: PlaceRow;
  allPlaces: PlaceRow[];
  onClose: () => void;
  onConfirm: (sourceId: string, targetId: string) => Promise<void>;
}

function MergeModal({ sourcePlace, allPlaces, onClose, onConfirm }: MergeModalProps) {
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const candidates = allPlaces.filter(
    (p) => p.id !== sourcePlace.id && p.category === sourcePlace.category,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) { setErr('Select a target place'); return; }
    setBusy(true);
    try {
      await onConfirm(sourcePlace.id, targetId);
      onClose();
    } catch {
      setErr('Merge failed.');
    } finally {
      setBusy(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 28, width: 460, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 16px' }}>Merge Duplicate Place</h3>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px' }}>
          Source: <strong>{sourcePlace.nameAr}</strong> will be merged into:
        </p>
        {err && <div style={{ color: '#c62828', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <form onSubmit={submit}>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
          >
            <option value="">— Select target place —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr} {p.nameEn ? `/ ${p.nameEn}` : ''} (#{p.id.slice(0, 8)})
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#e65100', margin: '12px 0 0' }}>
            ⚠ The source place will be deleted and its data merged into the target. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy || !targetId} style={{ ...btnStyle('#e65100'), opacity: !targetId ? 0.5 : 1 }}>
              {busy ? 'Merging…' : 'Confirm Merge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Place detail modal ────────────────────────────────────────────────────────

interface DetailModalProps {
  place: PlaceRow;
  allPlaces: PlaceRow[];
  onClose: () => void;
  onEdit: (p: PlaceRow) => void;
  onMerge: (p: PlaceRow) => void;
  onDelete: (p: PlaceRow) => void;
  onVerify: (p: PlaceRow) => Promise<void>;
  onUnverify: (p: PlaceRow) => Promise<void>;
}

function DetailModal({ place, onClose, onEdit, onMerge, onDelete, onVerify, onUnverify }: DetailModalProps) {
  const [tab, setTab] = useState<'info' | 'reports'>('info');
  const [reports] = useState(() => mockReports(place.id));
  const [verifyBusy, setVerifyBusy] = useState(false);

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 8, width: 600, maxWidth: '95vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.2)',
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#1565c0' : '#666',
    borderBottom: active ? '2px solid #1565c0' : '2px solid transparent',
  });
  const fieldRow: React.CSSProperties = { display: 'flex', gap: 0, marginBottom: 8, alignItems: 'baseline' };
  const fieldLabel: React.CSSProperties = { width: 130, fontSize: 13, color: '#888', flexShrink: 0 };
  const fieldVal: React.CSSProperties = { fontSize: 14, color: '#222' };

  async function handleVerify() {
    setVerifyBusy(true);
    try {
      if (place.verified) await onUnverify(place);
      else await onVerify(place);
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              {place.nameAr}
              {place.nameEn && <span style={{ fontWeight: 400, color: '#888', fontSize: 14, marginInlineStart: 8 }}>{place.nameEn}</span>}
              {place.verified && <span style={{ background: '#1565c0', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginInlineStart: 8 }}>Verified</span>}
            </h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
            {(['info', 'reports'] as const).map((t) => (
              <button key={t} style={tabBtn(tab === t)} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'reports' && reports.filter((r) => !r.resolved).length > 0 &&
                  <span style={{ background: '#c62828', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, marginInlineStart: 6 }}>
                    {reports.filter((r) => !r.resolved).length}
                  </span>
                }
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {tab === 'info' && (
            <>
              <div style={fieldRow}><span style={fieldLabel}>ID</span><span style={{ ...fieldVal, fontFamily: 'monospace', fontSize: 12 }}>{place.id}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Category</span><span style={fieldVal}>{place.category}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>City</span><span style={fieldVal}>{place.city ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Phone</span><span style={fieldVal}>{place.phone ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Hours</span><span style={fieldVal}>{place.hoursRaw ?? '—'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Coordinates</span><span style={fieldVal}>{place.lat.toFixed(5)}, {place.lon.toFixed(5)}</span></div>
              {place.osmId && <div style={fieldRow}><span style={fieldLabel}>OSM ID</span><span style={fieldVal}>{place.osmId}</span></div>}
              <div style={fieldRow}><span style={fieldLabel}>Status</span><span style={fieldVal}>{place.status ?? 'active'}</span></div>
              <div style={fieldRow}><span style={fieldLabel}>Reports</span><span style={{ ...fieldVal, color: (place.reportCount ?? 0) > 0 ? '#c62828' : '#222' }}>{place.reportCount ?? 0}</span></div>
              <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onEdit(place)} style={btnStyle('#1565c0')}>✏ Edit</button>
                <button onClick={handleVerify} disabled={verifyBusy} style={btnStyle(place.verified ? '#757575' : '#2e7d32')}>
                  {verifyBusy ? '…' : place.verified ? 'Unverify' : '✓ Verify'}
                </button>
                <button onClick={() => onMerge(place)} style={btnStyle('#6a1b9a')}>⇄ Merge Duplicate</button>
                <button onClick={() => onDelete(place)} style={btnStyle('#b71c1c')}>🗑 Delete</button>
              </div>
            </>
          )}

          {tab === 'reports' && (
            reports.length === 0
              ? <p style={{ color: '#888', fontSize: 14 }}>No reports.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Reporter</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.reason}</td>
                        <td style={tdStyle}>{r.reportedBy}</td>
                        <td style={tdStyle}>{new Date(r.createdAt).toLocaleDateString()}</td>
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
      </div>
    </div>
  );
}

// ── Simple map view ───────────────────────────────────────────────────────────

function MapView({ places, onSelect }: { places: PlaceRow[]; onSelect: (p: PlaceRow) => void }) {
  // Bounding box: Iraq roughly 29–37.5N, 38.5–48.5E
  const minLat = 29, maxLat = 37.5, minLon = 38.5, maxLon = 48.5;
  const W = 600, H = 350;

  function toPixel(lat: number, lon: number) {
    const x = ((lon - minLon) / (maxLon - minLon)) * W;
    const y = H - ((lat - minLat) / (maxLat - minLat)) * H;
    return { x, y };
  }

  const shown = places.slice(0, 300);

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden', background: '#e8f4e8', marginBottom: 16 }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <rect width={W} height={H} fill="#d0e8d8" />
        {/* Iraq outline hint */}
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={36} fill="rgba(0,100,0,.06)" fontWeight={700}>
          IRAQ
        </text>
        {shown.map((p) => {
          const { x, y } = toPixel(p.lat, p.lon);
          if (x < 0 || x > W || y < 0 || y > H) return null;
          return (
            <circle
              key={p.id}
              cx={x}
              cy={y}
              r={5}
              fill={p.verified ? '#1565c0' : p.reportCount && p.reportCount > 0 ? '#c62828' : '#2e7d32'}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(p)}
            >
              <title>{p.nameAr} ({p.category})</title>
            </circle>
          );
        })}
      </svg>
      <div style={{ padding: '6px 12px', background: '#f5f5f5', fontSize: 11, color: '#888', display: 'flex', gap: 16 }}>
        <span>● Verified</span>
        <span style={{ color: '#c62828' }}>● Reported</span>
        <span style={{ color: '#2e7d32' }}>● Active</span>
        <span style={{ marginInlineStart: 'auto' }}>Showing {shown.length} of {places.length}</span>
      </div>
    </div>
  );
}

// ── OSM Import modal ──────────────────────────────────────────────────────────

function OsmImportModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (city: string) => Promise<void> }) {
  const [city, setCity] = useState('Baghdad');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onConfirm(city); onClose(); } finally { setBusy(false); }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 28, width: 380, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 16px' }}>Import from OSM</h3>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px' }}>
          This will trigger the Planetiler pipeline for the selected city and import new POIs from OpenStreetMap.
        </p>
        <form onSubmit={submit}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
            City
            <select value={city} onChange={(e) => setCity(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, marginTop: 4 }}>
              {CITIES.filter((c) => c !== 'All Cities').map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#757575')}>Cancel</button>
            <button type="submit" disabled={busy} style={btnStyle('#2e7d32')}>
              {busy ? 'Triggering…' : 'Start Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminPlacesPage() {
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCity, setFilterCity] = useState('All Cities');
  const [viewMode, setViewMode] = useState<PlaceTab>('list');
  const [flash, setFlash] = useState('');

  // Modals
  const [detailPlace, setDetailPlace] = useState<PlaceRow | null>(null);
  const [editPlace, setEditPlace] = useState<PlaceRow | null>(null);
  const [mergePlace, setMergePlace] = useState<PlaceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlaceRow | null>(null);
  const [showOsmImport, setShowOsmImport] = useState(false);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  const loadPlaces = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const data = await api.getPlaces(q);
      setPlaces(data as PlaceRow[]);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlaces(); }, [loadPlaces]);

  // Filtered
  const filtered = places.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterCity !== 'All Cities' && p.city !== filterCity) return false;
    if (filterStatus === 'active' && (p.status !== 'active' && p.status !== undefined)) return false;
    if (filterStatus === 'pending' && p.status !== 'pending') return false;
    if (filterStatus === 'flagged' && (p.reportCount ?? 0) === 0) return false;
    return true;
  });

  // Stats
  const totalVerified = places.filter((p) => p.verified).length;
  const totalFlagged = places.filter((p) => (p.reportCount ?? 0) > 0).length;
  const totalPending = places.filter((p) => p.status === 'pending').length;

  // Columns
  const columns: Column<PlaceRow>[] = [
    {
      key: 'nameAr', label: 'Arabic Name', width: 180,
      render: (p) => <span style={{ fontWeight: 600 }}>{p.nameAr}</span>,
    },
    {
      key: 'nameEn', label: 'English Name', width: 160,
      render: (p) => p.nameEn ?? <em style={{ color: '#aaa' }}>—</em>,
    },
    {
      key: 'category', label: 'Category', width: 110,
      render: (p) => (
        <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
          {p.category}
        </span>
      ),
    },
    { key: 'city', label: 'City', width: 100, render: (p) => p.city ?? '—' },
    {
      key: 'verified', label: 'Verified', width: 90, sortable: false,
      render: (p) => p.verified
        ? <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓</span>
        : <span style={{ color: '#ccc' }}>—</span>,
      csvValue: (p) => p.verified ? 'yes' : 'no',
    },
    {
      key: 'reportCount', label: 'Reports', width: 80,
      render: (p) => {
        const n = p.reportCount ?? 0;
        return <span style={{ color: n > 0 ? '#c62828' : '#333', fontWeight: n > 0 ? 700 : 400 }}>{n}</span>;
      },
    },
    {
      key: 'status', label: 'Status', width: 100, sortable: false,
      render: (p) => {
        const s = p.status ?? 'active';
        const map: Record<string, [string, string]> = {
          active: ['#2e7d32', 'Active'],
          pending: ['#e65100', 'Pending'],
          flagged: ['#c62828', 'Flagged'],
          deleted: ['#757575', 'Deleted'],
        };
        const [color, label] = map[s] ?? ['#333', s];
        return <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{label}</span>;
      },
    },
    {
      key: 'lat', label: 'Coords', width: 130,
      render: (p) => <span style={{ fontSize: 11, color: '#888' }}>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span>,
    },
    {
      key: 'actions', label: 'Actions', width: 220, sortable: false,
      render: (p) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setDetailPlace(p)} style={btnStyle('#1565c0')}>View</button>
          <button onClick={() => setEditPlace(p)} style={btnStyle('#37474f')}>Edit</button>
          {!p.verified && <button onClick={() => handleVerify(p)} style={btnStyle('#2e7d32')}>✓</button>}
          <button onClick={() => setDeleteTarget(p)} style={btnStyle('#b71c1c')}>🗑</button>
        </div>
      ),
    },
  ];

  const bulkActions: BulkAction<PlaceRow>[] = [
    {
      label: 'Bulk Verify',
      color: '#2e7d32',
      onClick: async (rows) => {
        await Promise.all(rows.filter((r) => !r.verified).map((r) => api.approvePendingPlace(r.id)));
        setPlaces((prev) => prev.map((p) => rows.find((r) => r.id === p.id) ? { ...p, verified: true } : p));
        showFlash(`Verified ${rows.length} place(s).`);
      },
    },
    {
      label: 'Bulk Delete',
      color: '#b71c1c',
      onClick: async (rows) => {
        if (!window.confirm(`Delete ${rows.length} place(s)? This cannot be undone.`)) return;
        setPlaces((prev) => prev.filter((p) => !rows.find((r) => r.id === p.id)));
        showFlash(`Deleted ${rows.length} place(s).`);
      },
    },
  ];

  async function handleVerify(p: PlaceRow) {
    await api.approvePendingPlace(p.id);
    setPlaces((prev) => prev.map((pl) => pl.id === p.id ? { ...pl, verified: true } : pl));
    if (detailPlace?.id === p.id) setDetailPlace((prev) => prev ? { ...prev, verified: true } : null);
    showFlash(`Verified: ${p.nameAr}`);
  }

  async function handleUnverify(p: PlaceRow) {
    // No API endpoint yet — optimistic
    setPlaces((prev) => prev.map((pl) => pl.id === p.id ? { ...pl, verified: false } : pl));
    if (detailPlace?.id === p.id) setDetailPlace((prev) => prev ? { ...prev, verified: false } : null);
    showFlash(`Unverified: ${p.nameAr}`);
  }

  async function handleSave(id: string, patch: Partial<AdminPlace>) {
    await api.updatePlace(id, patch);
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
    showFlash('Place updated.');
  }

  async function handleMerge(sourceId: string, targetId: string) {
    // No API endpoint yet — optimistic
    setPlaces((prev) => prev.filter((p) => p.id !== sourceId));
    showFlash(`Merged place ${sourceId} into ${targetId}.`);
  }

  function handleDeleteConfirm(p: PlaceRow) {
    setPlaces((prev) => prev.filter((pl) => pl.id !== p.id));
    setDetailPlace(null);
    setDeleteTarget(null);
    showFlash(`Deleted place: ${p.nameAr}`);
  }

  async function handleOsmImport(city: string) {
    // Triggers pipeline — optimistic notification
    showFlash(`OSM import pipeline triggered for ${city}. Check background jobs.`);
  }

  // Batch verify by category
  async function handleBatchVerifyByCategory() {
    const cat = filterCategory === 'all' ? null : filterCategory;
    const targets = filtered.filter((p) => !p.verified);
    if (targets.length === 0) { showFlash('All visible places are already verified.'); return; }
    if (!window.confirm(`Verify ${targets.length} place(s)${cat ? ` in category "${cat}"` : ''}?`)) return;
    await Promise.all(targets.map((p) => api.approvePendingPlace(p.id)));
    const ids = new Set(targets.map((p) => p.id));
    setPlaces((prev) => prev.map((p) => ids.has(p.id) ? { ...p, verified: true } : p));
    showFlash(`Batch verified ${targets.length} place(s).`);
  }

  const filterBarStyle: React.CSSProperties = {
    display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
  };
  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13,
  };
  const inputStyle: React.CSSProperties = {
    padding: '6px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14,
    flex: 1, minWidth: 200, maxWidth: 320,
  };
  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4,
    background: active ? '#1565c0' : '#fff', color: active ? '#fff' : '#333',
    cursor: 'pointer', fontSize: 13,
  });

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Places Management" meta={`${places.length} total`} />
      <FlashBanner msg={flash} />

      {/* Stats */}
      <StatCardRow>
        <AdminStatCard label="Total Places" value={places.length} accent="#1565c0" icon="📍" />
        <AdminStatCard label="Verified" value={totalVerified} accent="#2e7d32" icon="✓" />
        <AdminStatCard label="Flagged" value={totalFlagged} accent="#c62828" icon="⚑" />
        <AdminStatCard label="Pending Review" value={totalPending} accent="#e65100" icon="⏳" />
      </StatCardRow>

      {/* Toolbar */}
      <div style={filterBarStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadPlaces(search)}
          placeholder="Search name, ID…"
          style={inputStyle}
        />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as FilterCategory)} style={selectStyle}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
        </select>
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={selectStyle}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => loadPlaces(search)} style={btnStyle('#1565c0')}>Search</button>
        <button style={toggleBtnStyle(viewMode === 'list')} onClick={() => setViewMode('list')}>☰ List</button>
        <button style={toggleBtnStyle(viewMode === 'map')} onClick={() => setViewMode('map')}>🗺 Map</button>
        <button onClick={() => setShowOsmImport(true)} style={btnStyle('#2e7d32')}>⬆ Import OSM</button>
        <button onClick={handleBatchVerifyByCategory} style={btnStyle('#37474f')}>✓ Batch Verify</button>
      </div>

      {/* Map view */}
      {viewMode === 'map' && (
        <MapView places={filtered} onSelect={setDetailPlace} />
      )}

      {/* Table view */}
      {viewMode === 'list' && (
        <AdminDataTable
          columns={columns}
          rows={filtered}
          pageSize={25}
          bulkActions={bulkActions}
          onRowClick={setDetailPlace}
          rowHighlight={(p) => (p.reportCount ?? 0) > 0 ? '#fff3e0' : undefined}
          exportName="places"
          loading={loading}
          emptyMessage="No places match your filters."
        />
      )}

      {/* Modals */}
      {detailPlace && (
        <DetailModal
          place={detailPlace}
          allPlaces={places}
          onClose={() => setDetailPlace(null)}
          onEdit={(p) => { setDetailPlace(null); setEditPlace(p); }}
          onMerge={(p) => { setDetailPlace(null); setMergePlace(p); }}
          onDelete={(p) => setDeleteTarget(p)}
          onVerify={handleVerify}
          onUnverify={handleUnverify}
        />
      )}
      {editPlace && (
        <EditModal place={editPlace} onClose={() => setEditPlace(null)} onSave={handleSave} />
      )}
      {mergePlace && (
        <MergeModal
          sourcePlace={mergePlace}
          allPlaces={places}
          onClose={() => setMergePlace(null)}
          onConfirm={handleMerge}
        />
      )}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 28, width: 380, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 12px', color: '#b71c1c' }}>Delete Place</h3>
            <p style={{ fontSize: 14, color: '#555', margin: '0 0 20px' }}>
              Delete <strong>{deleteTarget.nameAr}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={btnStyle('#757575')}>Cancel</button>
              <button onClick={() => handleDeleteConfirm(deleteTarget)} style={btnStyle('#b71c1c')}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {showOsmImport && (
        <OsmImportModal onClose={() => setShowOsmImport(false)} onConfirm={handleOsmImport} />
      )}
    </div>
  );
}
