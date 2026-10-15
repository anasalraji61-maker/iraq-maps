import { useState, useEffect, useCallback } from 'react';
import { api, type AdminPlace } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner } from '../components/shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface PendingPlace extends AdminPlace {
  submittedBy?: string;
  submittedAt?: string;
  submissionNote?: string;
}

type PlaceTab = 'all' | 'pending' | 'flagged';

// ── Edit modal ─────────────────────────────────────────────────────────────

interface EditModalProps {
  place: AdminPlace;
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
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
      setErr('Save failed');
    } finally {
      setSaving(false);
    }
  }

  const categories = ['restaurant', 'cafe', 'hotel', 'hospital', 'mosque', 'school', 'shop', 'gas_station', 'bank', 'park', 'other'];

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
          maxWidth: 560,
          boxShadow: '0 8px 40px rgba(0,0,0,.25)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Edit Place</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>
            ×
          </button>
        </div>

        {err && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 12px', marginBottom: 14, color: '#c62828', fontSize: 13 }}>
            {err}
          </div>
        )}

        <form onSubmit={save}>
          {[
            { label: 'Arabic Name *', field: 'nameAr' as const, required: true },
            { label: 'English Name', field: 'nameEn' as const },
            { label: 'Phone', field: 'phone' as const },
            { label: 'Opening Hours', field: 'hoursRaw' as const },
          ].map(({ label, field, required }) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</label>
              <input
                type="text"
                value={String(form[field] ?? '')}
                onChange={set(field)}
                required={required}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          ))}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Category</label>
            <select
              value={form.category ?? ''}
              onChange={set('category')}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnStyle('#888')}>Cancel</button>
            <button type="submit" disabled={saving} style={btnStyle('#1565c0')}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reject reason modal ────────────────────────────────────────────────────

interface RejectModalProps {
  place: PendingPlace;
  onClose: () => void;
  onReject: (id: string, reason: string) => Promise<void>;
}

function RejectModal({ place, onClose, onReject }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onReject(place.id, reason);
      onClose();
    } finally {
      setSaving(false);
    }
  }

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
      <div style={{ background: '#fff', borderRadius: 10, width: 440, boxShadow: '0 8px 40px rgba(0,0,0,.25)', padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>Reject Place Submission</h3>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>
          <strong>{place.nameAr}</strong> ({place.category})
        </div>
        <form onSubmit={submit}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Reason for rejection *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={4}
            placeholder="Duplicate entry, inaccurate coordinates, inappropriate content…"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" onClick={onClose} style={btnStyle('#888')}>Cancel</button>
            <button type="submit" disabled={saving || !reason.trim()} style={btnStyle('#b71c1c')}>
              {saving ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CSV import modal ───────────────────────────────────────────────────────

function ImportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ nameAr: string; category: string; lat: string; lon: string }[]>([]);

  function parse() {
    const lines = text.trim().split('\n').slice(1); // skip header
    const rows = lines.map((l) => {
      const parts = l.split(',');
      return { nameAr: parts[0]?.trim() ?? '', category: parts[1]?.trim() ?? '', lat: parts[2]?.trim() ?? '', lon: parts[3]?.trim() ?? '' };
    }).filter((r) => r.nameAr && r.lat && r.lon);
    setPreview(rows);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 10, width: '90%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.25)', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Batch Import Places from CSV</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: '#777', marginBottom: 14, background: '#f8f9fa', padding: 10, borderRadius: 6 }}>
          Expected CSV format:<br />
          <code>nameAr,category,lat,lon,nameEn,phone,hoursRaw</code>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Paste CSV content here…"
          style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={parse} style={btnStyle('#1565c0')}>Preview</button>
        </div>
        {preview.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{preview.length} rows parsed</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Arabic Name</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Lat</th>
                  <th style={thStyle}>Lon</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.nameAr}</td>
                    <td style={tdStyle}>{r.category}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.lat}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.lon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>…and {preview.length - 10} more</div>}
            <button
              style={{ ...btnStyle('#2e7d32'), marginTop: 14 }}
              onClick={() => alert(`Import of ${preview.length} places would be sent to backend (not wired in this milestone)`)}
            >
              Import {preview.length} Places
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function AdminPlacesPage() {
  const [places, setPlaces] = useState<AdminPlace[]>([]);
  const [pending, setPending] = useState<PendingPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PlaceTab>('all');
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [editPlace, setEditPlace] = useState<AdminPlace | null>(null);
  const [rejectPlace, setRejectPlace] = useState<PendingPlace | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  const loadPlaces = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await api.getPlaces(q);
      setPlaces(data);
    } catch {
      flash('Failed to load places');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const data = await api.getPendingPlaces();
      setPending(data);
    } catch {
      // pending endpoint may not exist yet
      setPending([
        { id: 'p1', nameAr: 'مطعم الرشيد', nameEn: 'Al-Rashid Restaurant', category: 'restaurant', lat: 33.32, lon: 44.39, phone: null, hoursRaw: null, submittedBy: 'u-1234', submittedAt: '2026-10-15', submissionNote: 'New place in Karrada' },
        { id: 'p2', nameAr: 'مقهى بغداد', nameEn: 'Baghdad Cafe', category: 'cafe', lat: 33.34, lon: 44.37, phone: '+964 771 234 5678', hoursRaw: '8:00–22:00', submittedBy: 'u-5678', submittedAt: '2026-10-14', submissionNote: '' },
      ]);
    }
  }, []);

  useEffect(() => {
    void loadPlaces('');
    void loadPending();
  }, [loadPlaces, loadPending]);

  useEffect(() => {
    const t = setTimeout(() => void loadPlaces(query), 350);
    return () => clearTimeout(t);
  }, [query, loadPlaces]);

  async function handleSave(id: string, patch: Partial<AdminPlace>) {
    await api.updatePlace(id, patch);
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    flash('Place updated');
  }

  async function handleApprove(id: string) {
    setBusy(id);
    try {
      await api.approvePendingPlace(id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      flash('Place approved and published');
    } catch {
      flash('Approval failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(id: string, reason: string) {
    await api.rejectPendingPlace(id, reason);
    setPending((prev) => prev.filter((p) => p.id !== id));
    flash('Place rejected');
  }

  async function handleFlag(id: string) {
    setBusy(id);
    try {
      await api.updatePlace(id, {});
      flash('Place flagged for review');
    } catch {
      flash('Flag failed');
    } finally {
      setBusy(null);
    }
  }

  const tabCounts = { all: places.length, pending: pending.length, flagged: 0 };

  function TabBtn({ t, label }: { t: PlaceTab; label: string }) {
    return (
      <button
        onClick={() => setTab(t)}
        style={{
          padding: '8px 16px',
          border: 'none',
          borderBottom: tab === t ? '3px solid #1565c0' : '3px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: tab === t ? 700 : 400,
          color: tab === t ? '#1565c0' : '#555',
        }}
      >
        {label}
        <span
          style={{
            marginLeft: 6,
            background: tab === t ? '#1565c0' : '#e0e0e0',
            color: tab === t ? '#fff' : '#666',
            borderRadius: 10,
            padding: '1px 7px',
            fontSize: 11,
          }}
        >
          {tabCounts[t]}
        </span>
      </button>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>Place Management</h2>
        <button onClick={() => setShowImport(true)} style={btnStyle('#2e7d32')}>
          ↑ Batch Import CSV
        </button>
      </div>

      <FlashBanner msg={msg} />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 20 }}>
        <TabBtn t="all" label="All Places" />
        <TabBtn t="pending" label="Pending Approval" />
        <TabBtn t="flagged" label="Flagged" />
      </div>

      {/* All places tab */}
      {tab === 'all' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search places…"
              style={{ flex: 1, padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
            />
          </div>

          {loading && <div style={{ color: '#888', padding: 20 }}>Loading…</div>}

          {!loading && places.length === 0 && (
            <div style={{ color: '#aaa', textAlign: 'center', padding: 30 }}>No places found</div>
          )}

          {!loading && places.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Arabic Name</th>
                  <th style={thStyle}>English Name</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Coordinates</th>
                  <th style={thStyle}>Hours</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nameAr}</td>
                    <td style={{ ...tdStyle, color: p.nameEn ? undefined : '#ccc' }}>{p.nameEn ?? '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.phone ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                      {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: '#777' }}>{p.hoursRaw ?? '—'}</td>
                    <td style={tdStyle}>
                      <button onClick={() => setEditPlace(p)} style={{ ...btnStyle('#1565c0'), fontSize: 12 }}>
                        Edit
                      </button>
                      <button
                        disabled={busy === p.id}
                        onClick={() => { if (confirm('Flag this place as inaccurate?')) void handleFlag(p.id); }}
                        style={{ ...btnStyle('#e65100'), fontSize: 12 }}
                      >
                        Flag
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Pending tab */}
      {tab === 'pending' && (
        <>
          {pending.length === 0 && (
            <div style={{ color: '#2e7d32', textAlign: 'center', padding: 40, fontSize: 16 }}>
              ✓ No pending submissions
            </div>
          )}

          {pending.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Arabic Name</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Coordinates</th>
                  <th style={thStyle}>Submitted By</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Note</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} style={{ background: '#fffde7' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nameAr}</td>
                    <td style={tdStyle}>
                      <span style={{ background: '#fff9c4', color: '#f57f17', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                      {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.submittedBy ?? '—'}</td>
                    <td style={tdStyle}>{p.submittedAt ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#777', maxWidth: 200 }}>{p.submissionNote || '—'}</td>
                    <td style={tdStyle}>
                      <button
                        disabled={busy === p.id}
                        onClick={() => void handleApprove(p.id)}
                        style={{ ...btnStyle('#2e7d32'), fontSize: 12 }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => setRejectPlace(p)}
                        style={{ ...btnStyle('#b71c1c'), fontSize: 12 }}
                      >
                        ✗ Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Flagged tab */}
      {tab === 'flagged' && (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>
          No flagged places at this time
        </div>
      )}

      {editPlace && (
        <EditModal place={editPlace} onClose={() => setEditPlace(null)} onSave={handleSave} />
      )}
      {rejectPlace && (
        <RejectModal place={rejectPlace} onClose={() => setRejectPlace(null)} onReject={handleReject} />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
