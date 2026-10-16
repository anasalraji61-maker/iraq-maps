/**
 * AdminOsmImportPage — OSM import management panel.
 *
 * Features:
 *   - Import status: last import, next scheduled
 *   - Per-city import controls
 *   - Import log with error details
 *   - Stats: total places, new/updated/failed per import
 *   - Manual trigger per city
 *   - Dry-run preview
 *   - Place diff viewer (what changed)
 */
import { useState, useMemo } from 'react';
import { btnStyle, FlashBanner, thStyle, tdStyle } from '../components/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportStatus = 'idle' | 'running' | 'completed' | 'failed';

interface CityImportState {
  cityId: string;
  cityName: string;
  status: ImportStatus;
  lastImportAt: string | null;
  nextScheduledAt: string | null;
  totalPlaces: number;
  lastNewPlaces: number;
  lastUpdatedPlaces: number;
  lastFailedPlaces: number;
  osmFileSize: string;
  lastDuration: string | null;
  progress: number; // 0–100 while running
}

interface ImportLogEntry {
  id: string;
  cityId: string;
  cityName: string;
  startedAt: string;
  completedAt: string | null;
  status: ImportStatus;
  newPlaces: number;
  updatedPlaces: number;
  failedPlaces: number;
  errorSummary: string | null;
  errors: ImportError[];
}

interface ImportError {
  osmId: string;
  type: 'parse_error' | 'schema_validation' | 'geometry_invalid' | 'duplicate_key' | 'missing_required';
  message: string;
  rawTags?: string;
}

interface PlaceDiff {
  osmId: string;
  name: string;
  changeType: 'added' | 'updated' | 'removed';
  changes: Array<{ field: string; before: string; after: string }>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const MOCK_CITIES: CityImportState[] = [
  {
    cityId: 'baghdad',
    cityName: 'Baghdad',
    status: 'idle',
    lastImportAt: ago(24),
    nextScheduledAt: future(24),
    totalPlaces: 48_320,
    lastNewPlaces: 142,
    lastUpdatedPlaces: 890,
    lastFailedPlaces: 7,
    osmFileSize: '1.2 GB',
    lastDuration: '18m 24s',
    progress: 0,
  },
  {
    cityId: 'erbil',
    cityName: 'Erbil',
    status: 'completed',
    lastImportAt: ago(2),
    nextScheduledAt: future(46),
    totalPlaces: 12_840,
    lastNewPlaces: 38,
    lastUpdatedPlaces: 210,
    lastFailedPlaces: 2,
    osmFileSize: '340 MB',
    lastDuration: '4m 12s',
    progress: 100,
  },
  {
    cityId: 'basra',
    cityName: 'Basra',
    status: 'idle',
    lastImportAt: ago(48),
    nextScheduledAt: future(0),
    totalPlaces: 9_420,
    lastNewPlaces: 24,
    lastUpdatedPlaces: 156,
    lastFailedPlaces: 0,
    osmFileSize: '280 MB',
    lastDuration: '3m 05s',
    progress: 0,
  },
  {
    cityId: 'mosul',
    cityName: 'Mosul',
    status: 'idle',
    lastImportAt: ago(72),
    nextScheduledAt: future(72),
    totalPlaces: 6_140,
    lastNewPlaces: 15,
    lastUpdatedPlaces: 78,
    lastFailedPlaces: 1,
    osmFileSize: '190 MB',
    lastDuration: '2m 40s',
    progress: 0,
  },
  {
    cityId: 'sulaymaniyah',
    cityName: 'Sulaymaniyah',
    status: 'running',
    lastImportAt: ago(96),
    nextScheduledAt: null,
    totalPlaces: 4_280,
    lastNewPlaces: 0,
    lastUpdatedPlaces: 0,
    lastFailedPlaces: 0,
    osmFileSize: '145 MB',
    lastDuration: null,
    progress: 62,
  },
  {
    cityId: 'kirkuk',
    cityName: 'Kirkuk',
    status: 'failed',
    lastImportAt: ago(6),
    nextScheduledAt: future(18),
    totalPlaces: 3_120,
    lastNewPlaces: 0,
    lastUpdatedPlaces: 0,
    lastFailedPlaces: 45,
    osmFileSize: '112 MB',
    lastDuration: '1m 02s',
    progress: 0,
  },
];

const MOCK_LOG: ImportLogEntry[] = [
  {
    id: 'log-001',
    cityId: 'erbil',
    cityName: 'Erbil',
    startedAt: ago(2),
    completedAt: ago(1.93),
    status: 'completed',
    newPlaces: 38,
    updatedPlaces: 210,
    failedPlaces: 2,
    errorSummary: '2 geometry validation errors (skipped)',
    errors: [
      { osmId: 'way/987654321', type: 'geometry_invalid', message: 'Self-intersecting polygon', rawTags: '{"name":"Erbil Park","amenity":"park"}' },
      { osmId: 'node/123456789', type: 'missing_required', message: 'Missing required tag: name', rawTags: '{"shop":"bakery"}' },
    ],
  },
  {
    id: 'log-002',
    cityId: 'baghdad',
    cityName: 'Baghdad',
    startedAt: ago(24),
    completedAt: ago(23.7),
    status: 'completed',
    newPlaces: 142,
    updatedPlaces: 890,
    failedPlaces: 7,
    errorSummary: '7 records skipped (5 duplicate OSM IDs, 2 schema errors)',
    errors: [
      { osmId: 'way/111222333', type: 'duplicate_key', message: 'Duplicate OSM ID already in database' },
      { osmId: 'way/111222334', type: 'duplicate_key', message: 'Duplicate OSM ID already in database' },
      { osmId: 'node/555666777', type: 'schema_validation', message: 'Invalid category value: "unknown_type"' },
    ],
  },
  {
    id: 'log-003',
    cityId: 'kirkuk',
    cityName: 'Kirkuk',
    startedAt: ago(6),
    completedAt: ago(5.98),
    status: 'failed',
    newPlaces: 0,
    updatedPlaces: 0,
    failedPlaces: 45,
    errorSummary: 'Import aborted: PostGIS extension error during bulk insert. See errors for details.',
    errors: [
      { osmId: 'SYSTEM', type: 'parse_error', message: 'PostGIS ERROR: topology exception during ST_Union on ways batch #3. Transaction rolled back.' },
    ],
  },
  {
    id: 'log-004',
    cityId: 'basra',
    cityName: 'Basra',
    startedAt: ago(48),
    completedAt: ago(47.95),
    status: 'completed',
    newPlaces: 24,
    updatedPlaces: 156,
    failedPlaces: 0,
    errorSummary: null,
    errors: [],
  },
];

const MOCK_DIFFS: PlaceDiff[] = [
  {
    osmId: 'node/987654320',
    name: 'Al-Rasheed Café',
    changeType: 'updated',
    changes: [
      { field: 'opening_hours', before: 'Mo-Su 08:00-22:00', after: 'Mo-Su 08:00-24:00' },
      { field: 'phone', before: '+964-1-234-5678', after: '+964-1-234-5679' },
    ],
  },
  {
    osmId: 'way/111000222',
    name: 'New Baghdad Mall',
    changeType: 'added',
    changes: [
      { field: 'name', before: '—', after: 'New Baghdad Mall' },
      { field: 'shop', before: '—', after: 'mall' },
      { field: 'opening_hours', before: '—', after: 'Mo-Su 10:00-22:00' },
    ],
  },
  {
    osmId: 'node/333444555',
    name: 'Old Pharmacy on Nidhal St',
    changeType: 'removed',
    changes: [{ field: 'amenity', before: 'pharmacy', after: '—' }],
  },
  {
    osmId: 'node/666777888',
    name: 'Al-Karrada Restaurant',
    changeType: 'updated',
    changes: [
      { field: 'cuisine', before: 'iraqi', after: 'iraqi;grills' },
    ],
  },
  {
    osmId: 'way/999111222',
    name: 'Tigris Riverside Park',
    changeType: 'added',
    changes: [
      { field: 'leisure', before: '—', after: 'park' },
      { field: 'name', before: '—', after: 'Tigris Riverside Park' },
      { field: 'area', before: '—', after: '14200 m²' },
    ],
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImportStatus }) {
  const cfg: Record<ImportStatus, { bg: string; color: string; label: string }> = {
    idle:      { bg: '#f5f5f5', color: '#757575', label: '● Idle' },
    running:   { bg: '#e3f2fd', color: '#1565c0', label: '⟳ Running' },
    completed: { bg: '#e8f5e9', color: '#2e7d32', label: '✓ Completed' },
    failed:    { bg: '#ffebee', color: '#c62828', label: '✕ Failed' },
  };
  const c = cfg[status];
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {c.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#e0e0e0', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: 6, borderRadius: 3, width: `${value}%`, background: '#1565c0', transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Diff preview modal ────────────────────────────────────────────────────────

function DiffPreviewModal({ cityName, diffs, onClose }: { cityName: string; diffs: PlaceDiff[]; onClose: () => void }) {
  const added = diffs.filter((d) => d.changeType === 'added').length;
  const updated = diffs.filter((d) => d.changeType === 'updated').length;
  const removed = diffs.filter((d) => d.changeType === 'removed').length;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1a237e' }}>Dry-Run Preview: {cityName}</h3>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              <span style={{ color: '#2e7d32', fontWeight: 600 }}>+{added} added</span>
              {' · '}
              <span style={{ color: '#1565c0', fontWeight: 600 }}>{updated} updated</span>
              {' · '}
              <span style={{ color: '#c62828', fontWeight: 600 }}>{removed} removed</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#999' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {diffs.map((diff) => (
            <div key={diff.osmId} style={{
              border: `1px solid ${diff.changeType === 'added' ? '#a5d6a7' : diff.changeType === 'removed' ? '#ef9a9a' : '#90caf9'}`,
              borderRadius: 8,
              marginBottom: 10,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px',
                background: diff.changeType === 'added' ? '#e8f5e9' : diff.changeType === 'removed' ? '#ffebee' : '#e3f2fd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{diff.name}</span>
                  <code style={{ fontSize: 10, color: '#888', marginLeft: 8 }}>{diff.osmId}</code>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: diff.changeType === 'added' ? '#2e7d32' : diff.changeType === 'removed' ? '#c62828' : '#1565c0',
                }}>
                  {diff.changeType.toUpperCase()}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {diff.changes.map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '5px 12px', color: '#888', width: 120 }}>{c.field}</td>
                      <td style={{ padding: '5px 8px', color: '#c62828', background: '#fff5f5' }}>{c.before}</td>
                      <td style={{ padding: '5px 4px', color: '#999', textAlign: 'center' }}>→</td>
                      <td style={{ padding: '5px 8px', color: '#2e7d32', background: '#f5fff5' }}>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnStyle('#888')}>Close</button>
          <button onClick={onClose} style={btnStyle('#1565c0')}>Confirm & Import</button>
        </div>
      </div>
    </div>
  );
}

// ── Log error detail modal ────────────────────────────────────────────────────

function LogDetailModal({ entry, onClose }: { entry: ImportLogEntry; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 600, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1a237e' }}>Import Log: {entry.cityName}</h3>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{new Date(entry.startedAt).toLocaleString()}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#999' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'New', value: entry.newPlaces, color: '#2e7d32' },
              { label: 'Updated', value: entry.updatedPlaces, color: '#1565c0' },
              { label: 'Failed', value: entry.failedPlaces, color: '#c62828' },
            ].map((s) => (
              <div key={s.label} style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px', borderLeft: `3px solid ${s.color}` }}>
                <div style={{ fontSize: 10, color: '#888' }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {entry.errorSummary && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#f57f17', marginBottom: 14 }}>
              ⚠ {entry.errorSummary}
            </div>
          )}

          {entry.errors.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Error Details</div>
              {entry.errors.map((err, i) => (
                <div key={i} style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '10px 12px', marginBottom: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <code style={{ color: '#c62828', fontWeight: 600 }}>{err.osmId}</code>
                    <span style={{ background: '#ffcdd2', color: '#c62828', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{err.type}</span>
                  </div>
                  <div style={{ color: '#555' }}>{err.message}</div>
                  {err.rawTags && (
                    <pre style={{ margin: '6px 0 0', fontSize: 10, color: '#888', background: '#fff', padding: '4px 6px', borderRadius: 4, overflow: 'auto' }}>
                      {err.rawTags}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}

          {entry.errors.length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 20, fontSize: 13 }}>No errors recorded</div>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#888')}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminOsmImportPage() {
  const [cities, setCities] = useState<CityImportState[]>(MOCK_CITIES);
  const [log, setLog] = useState<ImportLogEntry[]>(MOCK_LOG);
  const [logDetail, setLogDetail] = useState<ImportLogEntry | null>(null);
  const [diffTarget, setDiffTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [dryRunCity, setDryRunCity] = useState<string | null>(null);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  function triggerImport(cityId: string) {
    setCities((prev) =>
      prev.map((c) => (c.cityId === cityId ? { ...c, status: 'running', progress: 0 } : c)),
    );
    flash(`Import started for ${cities.find((c) => c.cityId === cityId)?.cityName}`);

    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        const city = cities.find((c) => c.cityId === cityId);
        const newEntry: ImportLogEntry = {
          id: `log-${Date.now()}`,
          cityId,
          cityName: city?.cityName ?? cityId,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'completed',
          newPlaces: Math.floor(Math.random() * 80) + 10,
          updatedPlaces: Math.floor(Math.random() * 400) + 50,
          failedPlaces: Math.floor(Math.random() * 5),
          errorSummary: null,
          errors: [],
        };
        setCities((prev) =>
          prev.map((c) =>
            c.cityId === cityId
              ? {
                  ...c,
                  status: 'completed',
                  progress: 100,
                  lastImportAt: new Date().toISOString(),
                  lastNewPlaces: newEntry.newPlaces,
                  lastUpdatedPlaces: newEntry.updatedPlaces,
                  lastFailedPlaces: newEntry.failedPlaces,
                }
              : c,
          ),
        );
        setLog((prev) => [newEntry, ...prev]);
        flash(`Import completed for ${city?.cityName}`);
      } else {
        setCities((prev) =>
          prev.map((c) =>
            c.cityId === cityId ? { ...c, progress: Math.round(progress) } : c,
          ),
        );
      }
    }, 600);
  }

  const totalPlaces = useMemo(() => cities.reduce((a, c) => a + c.totalPlaces, 0), [cities]);
  const totalNew = useMemo(() => cities.reduce((a, c) => a + c.lastNewPlaces, 0), [cities]);
  const totalUpdated = useMemo(() => cities.reduce((a, c) => a + c.lastUpdatedPlaces, 0), [cities]);
  const totalFailed = useMemo(() => cities.reduce((a, c) => a + c.lastFailedPlaces, 0), [cities]);

  const diffCity = cities.find((c) => c.cityId === dryRunCity);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#1a237e' }}>🗺 OSM Import Management</h2>

      <FlashBanner msg={msg} />

      {/* Global stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Places', value: totalPlaces.toLocaleString(), color: '#1565c0' },
          { label: 'New (last import)', value: `+${totalNew.toLocaleString()}`, color: '#2e7d32' },
          { label: 'Updated (last)', value: totalUpdated.toLocaleString(), color: '#0277bd' },
          { label: 'Failed (last)', value: totalFailed.toString(), color: totalFailed > 0 ? '#c62828' : '#757575' },
          { label: 'Cities', value: cities.length.toString(), color: '#6a1b9a' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#fff',
              border: '1px solid #e0e0e0',
              borderLeft: `4px solid ${s.color}`,
              borderRadius: 8,
              padding: '14px 20px',
              flex: '1 1 130px',
            }}
          >
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Per-city cards */}
      <h3 style={{ fontSize: 15, color: '#1a237e', marginBottom: 12 }}>City Import Status</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cities.map((city) => (
          <div
            key={city.cityId}
            style={{
              background: '#fff',
              border: `1px solid ${city.status === 'failed' ? '#ef9a9a' : '#e0e0e0'}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div style={{
              padding: '12px 16px',
              background: city.status === 'failed' ? '#ffebee' : '#fafafa',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{city.cityName}</span>
                <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{city.osmFileSize} OSM file</span>
              </div>
              <StatusBadge status={city.status} />
            </div>

            {/* Running progress */}
            {city.status === 'running' && (
              <div style={{ padding: '8px 16px', background: '#e3f2fd' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1565c0', marginBottom: 4 }}>
                  <span>Importing…</span>
                  <span>{city.progress}%</span>
                </div>
                <ProgressBar value={city.progress} />
              </div>
            )}

            {/* Stats */}
            <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[
                { label: 'Places', value: city.totalPlaces.toLocaleString(), color: '#1565c0' },
                { label: 'New', value: `+${city.lastNewPlaces}`, color: '#2e7d32' },
                { label: 'Updated', value: city.lastUpdatedPlaces.toString(), color: '#0277bd' },
                { label: 'Failed', value: city.lastFailedPlaces.toString(), color: city.lastFailedPlaces > 0 ? '#c62828' : '#aaa' },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#aaa', marginBottom: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Timestamps */}
            <div style={{ padding: '4px 16px 10px', fontSize: 11, color: '#888' }}>
              {city.lastImportAt && (
                <div>Last: {new Date(city.lastImportAt).toLocaleString()} {city.lastDuration && `(${city.lastDuration})`}</div>
              )}
              {city.nextScheduledAt && (
                <div>Next: {new Date(city.nextScheduledAt).toLocaleString()}</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 6 }}>
              <button
                disabled={city.status === 'running'}
                onClick={() => triggerImport(city.cityId)}
                style={{
                  ...btnStyle('#1565c0'),
                  fontSize: 11,
                  marginInlineStart: 0,
                  opacity: city.status === 'running' ? 0.5 : 1,
                }}
              >
                ▶ Import Now
              </button>
              <button
                onClick={() => setDryRunCity(city.cityId)}
                style={{ ...btnStyle('#00838f'), fontSize: 11 }}
              >
                🔍 Dry Run
              </button>
              {city.status === 'failed' && (
                <button
                  onClick={() => triggerImport(city.cityId)}
                  style={{ ...btnStyle('#e65100'), fontSize: 11 }}
                >
                  ↺ Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Import log */}
      <h3 style={{ fontSize: 15, color: '#1a237e', marginBottom: 12 }}>Import Log</h3>
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>City</th>
              <th style={thStyle}>Started</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>New</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Updated</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Failed</th>
              <th style={thStyle}>Notes</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => {
              const duration = entry.completedAt
                ? (() => {
                    const ms = new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime();
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.floor((ms % 60000) / 1000);
                    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                  })()
                : '—';
              return (
                <tr key={entry.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{entry.cityName}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{new Date(entry.startedAt).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{duration}</td>
                  <td style={tdStyle}><StatusBadge status={entry.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#2e7d32', fontWeight: 700 }}>+{entry.newPlaces}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#1565c0', fontWeight: 700 }}>{entry.updatedPlaces}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: entry.failedPlaces > 0 ? '#c62828' : '#aaa', fontWeight: 700 }}>
                    {entry.failedPlaces}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: '#888', maxWidth: 200 }}>
                    {entry.errorSummary ?? <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setLogDetail(entry)}
                      style={{ ...btnStyle('#555'), fontSize: 11 }}
                    >
                      View Log
                    </button>
                    <button
                      onClick={() => setDiffTarget(entry.cityId)}
                      style={{ ...btnStyle('#1565c0'), fontSize: 11 }}
                    >
                      Place Diff
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {logDetail && (
        <LogDetailModal entry={logDetail} onClose={() => setLogDetail(null)} />
      )}

      {(dryRunCity || diffTarget) && (
        <DiffPreviewModal
          cityName={cities.find((c) => c.cityId === (dryRunCity ?? diffTarget))?.cityName ?? ''}
          diffs={MOCK_DIFFS}
          onClose={() => { setDryRunCity(null); setDiffTarget(null); }}
        />
      )}
    </div>
  );
}
