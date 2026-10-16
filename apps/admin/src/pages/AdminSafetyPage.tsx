/**
 * AdminSafetyPage — safety incident management with map view, filters,
 * incident detail panel, alert dispatch, and stats.
 */
import { useState, useMemo } from 'react';
import { thStyle, tdStyle, btnStyle, FlashBanner } from '../components/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type IncidentType =
  | 'traffic_accident'
  | 'road_closure'
  | 'flooding'
  | 'fire'
  | 'security_incident'
  | 'infrastructure_failure'
  | 'protest'
  | 'other';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type IncidentStatus = 'open' | 'verified' | 'dismissed' | 'resolved';

interface Coord {
  lat: number;
  lng: number;
}

interface SafetyIncident {
  id: string;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  description: string;
  city: string;
  coord: Coord;
  reportedAt: string;
  reportedBy: string;
  verifiedAt: string | null;
  resolvedAt: string | null;
  affectedRadius: number; // km
  userReportCount: number;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const ago = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

const MOCK_INCIDENTS: SafetyIncident[] = [
  {
    id: 'inc-001',
    type: 'traffic_accident',
    severity: 'high',
    status: 'open',
    title: 'Multi-vehicle accident on Highway 1',
    description: 'Three vehicles involved, one lane blocked. Emergency services on scene.',
    city: 'Baghdad',
    coord: { lat: 33.34, lng: 44.4 },
    reportedAt: ago(1),
    reportedBy: 'user_abc123',
    verifiedAt: null,
    resolvedAt: null,
    affectedRadius: 1,
    userReportCount: 8,
  },
  {
    id: 'inc-002',
    type: 'flooding',
    severity: 'critical',
    status: 'verified',
    title: 'Flash flooding in Karada district',
    description: 'Severe flooding affecting multiple streets. Do not attempt to drive through.',
    city: 'Baghdad',
    coord: { lat: 33.31, lng: 44.38 },
    reportedAt: ago(3),
    reportedBy: 'user_def456',
    verifiedAt: ago(2),
    resolvedAt: null,
    affectedRadius: 2.5,
    userReportCount: 24,
  },
  {
    id: 'inc-003',
    type: 'road_closure',
    severity: 'medium',
    status: 'verified',
    title: 'Road closure near Al-Rasheed Street',
    description: 'Planned maintenance closure. Expected duration: 6 hours.',
    city: 'Baghdad',
    coord: { lat: 33.34, lng: 44.39 },
    reportedAt: ago(5),
    reportedBy: 'admin_ops',
    verifiedAt: ago(4.5),
    resolvedAt: null,
    affectedRadius: 0.5,
    userReportCount: 5,
  },
  {
    id: 'inc-004',
    type: 'security_incident',
    severity: 'high',
    status: 'open',
    title: 'Security checkpoint established on Erbil road',
    description: 'Expect significant delays. Allow extra travel time.',
    city: 'Erbil',
    coord: { lat: 36.19, lng: 44.02 },
    reportedAt: ago(0.5),
    reportedBy: 'user_ghi789',
    verifiedAt: null,
    resolvedAt: null,
    affectedRadius: 0.8,
    userReportCount: 12,
  },
  {
    id: 'inc-005',
    type: 'fire',
    severity: 'critical',
    status: 'resolved',
    title: 'Structure fire contained in Basra industrial zone',
    description: 'Fire extinguished. Area safe to pass through, some smoke residue.',
    city: 'Basra',
    coord: { lat: 30.5, lng: 47.78 },
    reportedAt: ago(10),
    reportedBy: 'fire_dept',
    verifiedAt: ago(9),
    resolvedAt: ago(4),
    affectedRadius: 1.2,
    userReportCount: 30,
  },
  {
    id: 'inc-006',
    type: 'infrastructure_failure',
    severity: 'medium',
    status: 'open',
    title: 'Power outage affecting traffic signals in Mosul',
    description: 'Multiple intersections without working traffic lights. Exercise caution.',
    city: 'Mosul',
    coord: { lat: 36.34, lng: 43.13 },
    reportedAt: ago(2),
    reportedBy: 'user_jkl012',
    verifiedAt: null,
    resolvedAt: null,
    affectedRadius: 3,
    userReportCount: 7,
  },
  {
    id: 'inc-007',
    type: 'protest',
    severity: 'low',
    status: 'dismissed',
    title: 'Small gathering on Tahrir Square',
    description: 'Peaceful gathering, minor traffic impact only.',
    city: 'Baghdad',
    coord: { lat: 33.34, lng: 44.4 },
    reportedAt: ago(8),
    reportedBy: 'user_mno345',
    verifiedAt: null,
    resolvedAt: ago(6),
    affectedRadius: 0.3,
    userReportCount: 2,
  },
  {
    id: 'inc-008',
    type: 'traffic_accident',
    severity: 'low',
    status: 'resolved',
    title: 'Minor fender-bender on Sulaymaniyah ring road',
    description: 'Vehicles moved to shoulder. No injuries reported.',
    city: 'Sulaymaniyah',
    coord: { lat: 35.56, lng: 45.44 },
    reportedAt: ago(6),
    reportedBy: 'user_pqr678',
    verifiedAt: ago(5.5),
    resolvedAt: ago(4),
    affectedRadius: 0.2,
    userReportCount: 1,
  },
];

// ── Config maps ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<IncidentType, string> = {
  traffic_accident: 'Traffic Accident',
  road_closure: 'Road Closure',
  flooding: 'Flooding',
  fire: 'Fire',
  security_incident: 'Security',
  infrastructure_failure: 'Infrastructure',
  protest: 'Protest/Gathering',
  other: 'Other',
};

const SEVERITY_CONFIG: Record<Severity, { bg: string; color: string; dot: string }> = {
  low:      { bg: '#e8f5e9', color: '#2e7d32', dot: '#4caf50' },
  medium:   { bg: '#fff9c4', color: '#f57f17', dot: '#fbc02d' },
  high:     { bg: '#fff3e0', color: '#e65100', dot: '#ff9800' },
  critical: { bg: '#ffebee', color: '#b71c1c', dot: '#f44336' },
};

const STATUS_CONFIG: Record<IncidentStatus, { bg: string; color: string; label: string }> = {
  open:      { bg: '#e3f2fd', color: '#1565c0', label: '● Open' },
  verified:  { bg: '#e8f5e9', color: '#2e7d32', label: '✓ Verified' },
  dismissed: { bg: '#f5f5f5', color: '#757575', label: '✕ Dismissed' },
  resolved:  { bg: '#ede7f6', color: '#4527a0', label: '✓ Resolved' },
};

const CITIES = ['All', 'Baghdad', 'Erbil', 'Basra', 'Mosul', 'Sulaymaniyah', 'Kirkuk', 'Najaf'];

// ── Iraq SVG Map ──────────────────────────────────────────────────────────────

// Simplified Iraq outline + city coords mapped to SVG viewport (0 0 400 400)
function projectCoord(lat: number, lng: number) {
  // Rough bounding box: lat 29.5–37.5, lng 38.5–48.5
  const x = ((lng - 38.5) / 10) * 340 + 30;
  const y = 370 - ((lat - 29.5) / 8) * 340;
  return { x, y };
}

const CITY_MARKERS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Baghdad', lat: 33.34, lng: 44.4 },
  { name: 'Basra', lat: 30.5, lng: 47.78 },
  { name: 'Mosul', lat: 36.34, lng: 43.13 },
  { name: 'Erbil', lat: 36.19, lng: 44.02 },
  { name: 'Sulaymaniyah', lat: 35.56, lng: 45.44 },
  { name: 'Kirkuk', lat: 35.47, lng: 44.39 },
  { name: 'Najaf', lat: 31.99, lng: 44.33 },
  { name: 'Karbala', lat: 32.6, lng: 44.02 },
];

function IraqMap({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: SafetyIncident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13, fontWeight: 600, color: '#555' }}>
        Iraq Safety Map
      </div>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: 320, display: 'block' }}>
        {/* Background */}
        <rect width={400} height={400} fill="#e8f4f8" />

        {/* Simplified Iraq outline (rough polygon) */}
        <polygon
          points="180,30 220,25 260,35 290,55 310,80 320,120 310,150 295,160 300,185 280,200 270,230 250,260 240,290 220,310 200,320 180,310 155,280 140,250 130,220 120,195 110,170 115,140 105,120 115,95 130,70 150,50"
          fill="#d4e6c3"
          stroke="#8cb87a"
          strokeWidth={2}
        />

        {/* City labels */}
        {CITY_MARKERS.map((c) => {
          const { x, y } = projectCoord(c.lat, c.lng);
          return (
            <g key={c.name}>
              <circle cx={x} cy={y} r={4} fill="#bbb" opacity={0.5} />
              <text x={x + 6} y={y + 4} fontSize={9} fill="#666">{c.name}</text>
            </g>
          );
        })}

        {/* Incident dots */}
        {incidents.map((inc) => {
          const { x, y } = projectCoord(inc.coord.lat, inc.coord.lng);
          const cfg = SEVERITY_CONFIG[inc.severity];
          const isSelected = inc.id === selectedId;
          return (
            <g key={inc.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(inc.id)}>
              {isSelected && (
                <circle cx={x} cy={y} r={14} fill={cfg.dot} opacity={0.25} />
              )}
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 9 : 7}
                fill={cfg.dot}
                stroke="#fff"
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={inc.status === 'dismissed' || inc.status === 'resolved' ? 0.5 : 1}
              />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold">
                {inc.severity === 'critical' ? '!' : inc.severity === 'high' ? '▲' : '•'}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #eee', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
        {(Object.entries(SEVERITY_CONFIG) as [Severity, typeof SEVERITY_CONFIG[Severity]][]).map(([sev, cfg]) => (
          <span key={sev} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Incident detail panel ─────────────────────────────────────────────────────

function IncidentDetail({
  incident,
  onVerify,
  onDismiss,
  onResolve,
  onAlert,
  onClose,
}: {
  incident: SafetyIncident;
  onVerify: () => void;
  onDismiss: () => void;
  onResolve: () => void;
  onAlert: () => void;
  onClose: () => void;
}) {
  const sev = SEVERITY_CONFIG[incident.severity];
  const sts = STATUS_CONFIG[incident.status];

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fafafa',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1a237e' }}>Incident Detail</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999' }}>✕</button>
      </div>

      <div style={{ padding: 16 }}>
        {/* Title + badges */}
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#333' }}>{incident.title}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ background: sev.bg, color: sev.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              {incident.severity.toUpperCase()}
            </span>
            <span style={{ background: sts.bg, color: sts.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              {sts.label}
            </span>
            <span style={{ background: '#f3e5f5', color: '#6a1b9a', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
              {TYPE_LABELS[incident.type]}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5 }}>{incident.description}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#666', marginBottom: 14 }}>
          <div><strong>City:</strong> {incident.city}</div>
          <div><strong>Reports:</strong> {incident.userReportCount}</div>
          <div><strong>Affected radius:</strong> {incident.affectedRadius} km</div>
          <div><strong>Coordinates:</strong> {incident.coord.lat.toFixed(4)}, {incident.coord.lng.toFixed(4)}</div>
          <div><strong>Reported:</strong> {new Date(incident.reportedAt).toLocaleString()}</div>
          {incident.verifiedAt && <div><strong>Verified:</strong> {new Date(incident.verifiedAt).toLocaleString()}</div>}
          {incident.resolvedAt && <div><strong>Resolved:</strong> {new Date(incident.resolvedAt).toLocaleString()}</div>}
          <div style={{ gridColumn: '1/-1' }}><strong>Reporter ID:</strong> <code style={{ fontSize: 11 }}>{incident.reportedBy}</code></div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {incident.status === 'open' && (
            <>
              <button onClick={onVerify} style={{ ...btnStyle('#2e7d32'), fontSize: 12 }}>✓ Verify</button>
              <button onClick={onDismiss} style={{ ...btnStyle('#757575'), fontSize: 12 }}>✕ Dismiss</button>
            </>
          )}
          {(incident.status === 'open' || incident.status === 'verified') && (
            <button onClick={onResolve} style={{ ...btnStyle('#4527a0'), fontSize: 12 }}>Mark Resolved</button>
          )}
        </div>

        <button
          onClick={onAlert}
          disabled={incident.status === 'dismissed'}
          style={{
            ...btnStyle('#e65100'),
            fontSize: 12,
            width: '100%',
            padding: '8px 0',
            opacity: incident.status === 'dismissed' ? 0.5 : 1,
            marginInlineStart: 0,
          }}
        >
          📣 Send Alert to Users in Area ({incident.affectedRadius} km radius)
        </button>
      </div>
    </div>
  );
}

// ── Alert Modal ───────────────────────────────────────────────────────────────

const ALERT_TEMPLATES = [
  { id: 'avoid_area', label: 'Avoid the area', body: 'Safety alert: avoid the affected area. Check app for alternative routes.' },
  { id: 'use_caution', label: 'Use caution', body: 'Safety notice: exercise caution in this area. Stay informed via the app.' },
  { id: 'road_blocked', label: 'Road blocked', body: 'Road closure alert: the route is currently blocked. Use alternative roads.' },
  { id: 'emergency', label: 'Emergency in area', body: 'Emergency services are responding to an incident near you. Please stay clear of the area.' },
  { id: 'all_clear', label: 'All clear', body: 'The situation has been resolved. The area is now safe. Thank you for your patience.' },
];

function AlertModal({
  incident,
  onSend,
  onClose,
}: {
  incident: SafetyIncident;
  onSend: (message: string, radius: number) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(
    `Safety alert near ${incident.city}: ${incident.title}. Please exercise caution.`,
  );
  const [radius, setRadius] = useState(incident.affectedRadius);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 800));
    setBusy(false);
    onSend(message, radius);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 520, boxShadow: '0 8px 40px rgba(0,0,0,.25)', padding: 28 }}>
        <h3 style={{ marginTop: 0, color: '#e65100' }}>📣 Send Safety Alert</h3>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          Target: users within <strong>{radius} km</strong> of {incident.coord.lat.toFixed(3)}, {incident.coord.lng.toFixed(3)}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Template</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {ALERT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setMessage(t.body)}
              style={{ padding: '4px 10px', border: '1px solid #e65100', borderRadius: 12, background: '#fff3e0', color: '#e65100', fontSize: 11, cursor: 'pointer' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Alert Message *</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginTop: 12, marginBottom: 4 }}>
          Alert Radius (km): {radius}
        </label>
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999', marginBottom: 20 }}>
          <span>0.5 km</span><span>20 km</span>
        </div>

        <div style={{ background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#e65100', marginBottom: 16 }}>
          ⚠ This will send a push notification to all users currently within {radius} km of this incident.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#888')}>Cancel</button>
          <button
            disabled={!message.trim() || busy}
            onClick={() => void send()}
            style={{ ...btnStyle('#e65100'), opacity: message.trim() && !busy ? 1 : 0.5, marginInlineStart: 0 }}
          >
            {busy ? 'Sending…' : 'Send Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stats section ─────────────────────────────────────────────────────────────

function IncidentStats({ incidents }: { incidents: SafetyIncident[] }) {
  const total = incidents.length;
  const open = incidents.filter((i) => i.status === 'open').length;
  const critical = incidents.filter((i) => i.severity === 'critical').length;
  const resolved = incidents.filter((i) => i.status === 'resolved' || i.status === 'dismissed').length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const byType = Object.entries(TYPE_LABELS).map(([key, label]) => ({
    key,
    label,
    count: incidents.filter((i) => i.type === key).length,
  })).filter((t) => t.count > 0);

  const maxCount = Math.max(...byType.map((t) => t.count), 1);

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
      <h4 style={{ margin: '0 0 14px', fontSize: 14, color: '#1a237e' }}>Incident Statistics</h4>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total', value: total, color: '#1565c0' },
          { label: 'Open', value: open, color: '#e65100' },
          { label: 'Critical', value: critical, color: '#b71c1c' },
          { label: 'Resolution Rate', value: `${resolutionRate}%`, color: '#2e7d32' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px 12px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>By Type</div>
      {byType.map((t) => (
        <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, width: 130, color: '#555', flexShrink: 0 }}>{t.label}</span>
          <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: 8, width: `${(t.count / maxCount) * 100}%`, background: '#1565c0', borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1565c0', width: 20, textAlign: 'right' }}>{t.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminSafetyPage() {
  const [incidents, setIncidents] = useState<SafetyIncident[]>(MOCK_INCIDENTS);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertTarget, setAlertTarget] = useState<SafetyIncident | null>(null);
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  function updateStatus(id: string, status: IncidentStatus, extra?: Partial<SafetyIncident>) {
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              verifiedAt: status === 'verified' ? new Date().toISOString() : i.verifiedAt,
              resolvedAt: status === 'resolved' ? new Date().toISOString() : i.resolvedAt,
              ...extra,
            }
          : i,
      ),
    );
  }

  const selectedIncident = incidents.find((i) => i.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (filterType !== 'all' && i.type !== filterType) return false;
      if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
      if (filterCity !== 'All' && i.city !== filterCity) return false;
      if (filterStatus !== 'all' && i.status !== filterStatus) return false;
      return true;
    });
  }, [incidents, filterType, filterSeverity, filterCity, filterStatus]);

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: 12,
    background: '#fff',
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>🛡 Safety Incident Management</h2>
        <div style={{ fontSize: 13, color: '#666' }}>
          {incidents.filter((i) => i.status === 'open').length} open incidents
        </div>
      </div>

      <FlashBanner msg={msg} />

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Filter:</span>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="all">All Severities</option>
          {(['low', 'medium', 'high', 'critical'] as Severity[]).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={selectStyle}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          {(['open', 'verified', 'dismissed', 'resolved'] as IncidentStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        <span style={{ fontSize: 12, color: '#888' }}>{filtered.length} results</span>
      </div>

      {/* Main grid: map + detail | list + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Left column */}
        <div>
          {/* Map */}
          <div style={{ marginBottom: 16 }}>
            <IraqMap incidents={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {/* Incident Table */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>City</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Reports</th>
                  <th style={thStyle}>Reported</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#aaa', padding: 24 }}>No incidents match the current filters</td></tr>
                ) : filtered.map((inc) => {
                  const sev = SEVERITY_CONFIG[inc.severity];
                  const sts = STATUS_CONFIG[inc.status];
                  const isSelected = inc.id === selectedId;
                  return (
                    <tr
                      key={inc.id}
                      onClick={() => setSelectedId(isSelected ? null : inc.id)}
                      style={{ cursor: 'pointer', background: isSelected ? '#e3f2fd' : undefined }}
                    >
                      <td style={tdStyle}>
                        <span style={{ background: sev.bg, color: sev.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {inc.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 200 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: '#555' }}>{TYPE_LABELS[inc.type]}</span>
                      </td>
                      <td style={tdStyle}>{inc.city}</td>
                      <td style={tdStyle}>
                        <span style={{ background: sts.bg, color: sts.color, borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>{sts.label}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{inc.userReportCount}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>
                        {new Date(inc.reportedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {inc.status === 'open' && (
                            <>
                              <button onClick={() => { updateStatus(inc.id, 'verified'); flash('Incident verified'); }} style={{ ...btnStyle('#2e7d32'), fontSize: 10 }}>✓ Verify</button>
                              <button onClick={() => { updateStatus(inc.id, 'dismissed'); flash('Incident dismissed'); }} style={{ ...btnStyle('#757575'), fontSize: 10 }}>Dismiss</button>
                            </>
                          )}
                          {(inc.status === 'open' || inc.status === 'verified') && (
                            <button
                              onClick={() => setAlertTarget(inc)}
                              style={{ ...btnStyle('#e65100'), fontSize: 10 }}
                            >
                              📣 Alert
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedIncident ? (
            <IncidentDetail
              incident={selectedIncident}
              onVerify={() => { updateStatus(selectedIncident.id, 'verified'); flash('Incident verified'); }}
              onDismiss={() => { updateStatus(selectedIncident.id, 'dismissed'); flash('Incident dismissed'); setSelectedId(null); }}
              onResolve={() => { updateStatus(selectedIncident.id, 'resolved'); flash('Incident marked resolved'); }}
              onAlert={() => setAlertTarget(selectedIncident)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div style={{ background: '#f8f9fa', border: '1px dashed #ccc', borderRadius: 8, padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              Click an incident on the map or in the table to view details
            </div>
          )}

          <IncidentStats incidents={incidents} />
        </div>
      </div>

      {/* Alert modal */}
      {alertTarget && (
        <AlertModal
          incident={alertTarget}
          onSend={(message, radius) => {
            setAlertTarget(null);
            flash(`Alert sent to users within ${radius} km of ${alertTarget.city}`);
          }}
          onClose={() => setAlertTarget(null)}
        />
      )}
    </div>
  );
}
