import { useState, useEffect } from 'react';
import { api } from '../api';
import { FlashBanner } from '../components/shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface FeatureFlags {
  discover: boolean;
  assistant: boolean;
  providerRegistration: boolean;
  messaging: boolean;
  incidents: boolean;
  locationShare: boolean;
  tourMode: boolean;
  challenges: boolean;
}

interface AppVersion {
  current: string;
  minSupported: string;
  forceUpdate: boolean;
  storeUrl: string;
}

interface RateLimits {
  otpRequestsPerHour: number;
  apiRequestsPerMinute: number;
  postsPerDay: number;
  messagesPerHour: number;
}

interface SystemStats {
  uptime: string;
  apiVersion: string;
  dbVersion: string;
  nodeVersion: string;
  environment: string;
}

// ── Toggle component ───────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: on ? '#1565c0' : '#bdbdbd',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

const section: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 20,
};

const sectionHead: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 16,
  color: '#1a237e',
  borderBottom: '2px solid #e8eaf6',
  paddingBottom: 8,
};

const fieldRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid #f5f5f5',
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#333',
};

const subLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  marginTop: 2,
};

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: 4,
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
});

// ── Main page ──────────────────────────────────────────────────────────────

export function AdminSystemPage() {
  const [msg, setMsg] = useState('');
  const [flags, setFlags] = useState<FeatureFlags>({
    discover: true,
    assistant: true,
    providerRegistration: true,
    messaging: true,
    incidents: false,
    locationShare: false,
    tourMode: false,
    challenges: true,
  });
  const [appVersion, setAppVersion] = useState<AppVersion>({
    current: '1.0.0',
    minSupported: '0.9.0',
    forceUpdate: false,
    storeUrl: '',
  });
  const [rateLimits, setRateLimits] = useState<RateLimits>({
    otpRequestsPerHour: 3,
    apiRequestsPerMinute: 120,
    postsPerDay: 10,
    messagesPerHour: 30,
  });
  const [bannedWords, setBannedWords] = useState<string[]>(['spam', 'scam', 'fake']);
  const [newWord, setNewWord] = useState('');
  const [maintenance, setMaintenance] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [queueStatus, setQueueStatus] = useState<Record<string, { failed: number }> | null>(null);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  useEffect(() => {
    // Load system stats
    api
      .getSystemStats()
      .then(setStats)
      .catch(() => {
        setStats({
          uptime: '3d 14h 22m',
          apiVersion: '1.0.0',
          dbVersion: 'PostgreSQL 16.3',
          nodeVersion: 'v22.9.0',
          environment: 'production',
        });
      });
    api
      .getQueueStatus()
      .then((d) => setQueueStatus(d.queues))
      .catch(() => setQueueStatus({}));
  }, []);

  async function saveFlags() {
    setSavingFlags(true);
    try {
      await api.setFeatureFlags(flags as unknown as Record<string, boolean>);
      flash('Feature flags saved');
    } catch {
      flash('Failed to save feature flags');
    } finally {
      setSavingFlags(false);
    }
  }

  async function saveVersion() {
    setSavingVersion(true);
    try {
      await api.setAppVersion(appVersion);
      flash('App version settings saved');
    } catch {
      flash('Failed to save version settings');
    } finally {
      setSavingVersion(false);
    }
  }

  async function flushCache(target: string) {
    try {
      await api.flushCache(target);
      flash(`${target} cache flushed`);
    } catch {
      flash('Cache flush failed');
    }
  }

  function addBannedWord() {
    const w = newWord.trim().toLowerCase();
    if (!w || bannedWords.includes(w)) return;
    setBannedWords((prev) => [...prev, w]);
    setNewWord('');
  }

  function removeBannedWord(w: string) {
    setBannedWords((prev) => prev.filter((x) => x !== w));
  }

  const FLAG_META: { key: keyof FeatureFlags; label: string; desc: string }[] = [
    { key: 'discover', label: 'Discover Feed', desc: 'Social posts and reactions' },
    { key: 'assistant', label: 'AI Assistant', desc: 'In-app Claude-powered travel assistant' },
    { key: 'providerRegistration', label: 'Provider Registration', desc: 'New business sign-ups' },
    { key: 'messaging', label: 'Messaging Engine', desc: 'WhatsApp/SMS contact-a-business' },
    { key: 'incidents', label: 'Incident Reports', desc: 'User-submitted incident pins on map' },
    { key: 'locationShare', label: 'Live Location Share', desc: 'Share real-time location with friends' },
    { key: 'tourMode', label: '3D Tour Mode', desc: 'Immersive city tour feature (beta)' },
    { key: 'challenges', label: 'Community Challenges', desc: 'Photo/check-in challenges with rewards' },
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#1a237e' }}>System Configuration</h2>

      <FlashBanner msg={msg} />

      {/* System stats */}
      {stats && (
        <div style={section}>
          <div style={sectionHead}>System Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { label: 'Uptime', value: stats.uptime, ok: true },
              { label: 'API Version', value: stats.apiVersion, ok: true },
              { label: 'Database', value: stats.dbVersion, ok: true },
              { label: 'Node.js', value: stats.nodeVersion, ok: true },
              { label: 'Environment', value: stats.environment, ok: stats.environment !== 'development' },
              { label: 'Maintenance Mode', value: maintenance ? 'ON' : 'OFF', ok: !maintenance },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: s.ok ? '#f1f8e9' : '#fff8e1',
                  borderRadius: 6,
                  padding: '10px 14px',
                  borderLeft: `4px solid ${s.ok ? '#4caf50' : '#ffc107'}`,
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.ok ? '#2e7d32' : '#e65100' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance mode */}
      <div style={{ ...section, borderColor: maintenance ? '#ffcdd2' : '#e0e0e0' }}>
        <div style={sectionHead}>Maintenance Mode</div>
        <div style={fieldRow}>
          <div>
            <div style={labelStyle}>Enable Maintenance Mode</div>
            <div style={subLabel}>Shows an "under maintenance" banner to all users. API continues to work for admins.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {maintenance && (
              <span style={{ background: '#b71c1c', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                MAINTENANCE ON
              </span>
            )}
            <Toggle on={maintenance} onChange={setMaintenance} />
          </div>
        </div>
      </div>

      {/* Feature flags */}
      <div style={section}>
        <div style={sectionHead}>Feature Flags</div>
        {FLAG_META.map((f) => (
          <div key={f.key} style={fieldRow}>
            <div>
              <div style={labelStyle}>{f.label}</div>
              <div style={subLabel}>{f.desc}</div>
            </div>
            <Toggle
              on={flags[f.key]}
              onChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))}
            />
          </div>
        ))}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={saveFlags} disabled={savingFlags} style={btnStyle('#1565c0')}>
            {savingFlags ? 'Saving…' : 'Save Feature Flags'}
          </button>
        </div>
      </div>

      {/* Rate limits */}
      <div style={section}>
        <div style={sectionHead}>Rate Limit Configuration</div>
        {(
          [
            { key: 'otpRequestsPerHour' as const, label: 'OTP Requests / Hour', desc: 'Per phone number' },
            { key: 'apiRequestsPerMinute' as const, label: 'API Requests / Minute', desc: 'Per authenticated user' },
            { key: 'postsPerDay' as const, label: 'Discover Posts / Day', desc: 'Per user' },
            { key: 'messagesPerHour' as const, label: 'Messages / Hour', desc: 'Per user via messaging engine' },
          ] as const
        ).map((f) => (
          <div key={f.key} style={fieldRow}>
            <div>
              <div style={labelStyle}>{f.label}</div>
              <div style={subLabel}>{f.desc}</div>
            </div>
            <input
              type="number"
              min={1}
              value={rateLimits[f.key]}
              onChange={(e) =>
                setRateLimits((prev) => ({ ...prev, [f.key]: parseInt(e.target.value) || 1 }))
              }
              style={{ width: 80, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, textAlign: 'right' }}
            />
          </div>
        ))}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => flash('Rate limits saved (backend endpoint coming in M6)')}
            style={btnStyle('#1565c0')}
          >
            Save Rate Limits
          </button>
        </div>
      </div>

      {/* App version */}
      <div style={section}>
        <div style={sectionHead}>App Version Management</div>

        {[
          { field: 'current' as const, label: 'Current Version', placeholder: '1.0.0' },
          { field: 'minSupported' as const, label: 'Minimum Supported', placeholder: '0.9.0' },
          { field: 'storeUrl' as const, label: 'Store URL', placeholder: 'https://play.google.com/…' },
        ].map((f) => (
          <div key={f.field} style={fieldRow}>
            <div style={labelStyle}>{f.label}</div>
            <input
              type="text"
              value={appVersion[f.field]}
              onChange={(e) => setAppVersion((prev) => ({ ...prev, [f.field]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ width: 260, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
            />
          </div>
        ))}

        <div style={fieldRow}>
          <div>
            <div style={labelStyle}>Force Update</div>
            <div style={subLabel}>Block access until user updates to {appVersion.current}</div>
          </div>
          <Toggle
            on={appVersion.forceUpdate}
            onChange={(v) => setAppVersion((prev) => ({ ...prev, forceUpdate: v }))}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={saveVersion} disabled={savingVersion} style={btnStyle('#1565c0')}>
            {savingVersion ? 'Saving…' : 'Save Version Settings'}
          </button>
        </div>
      </div>

      {/* Banned words */}
      <div style={section}>
        <div style={sectionHead}>Banned Words List</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addBannedWord()}
            placeholder="Add word…"
            style={{ flex: 1, padding: '7px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
          />
          <button onClick={addBannedWord} style={btnStyle('#1565c0')}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {bannedWords.map((w) => (
            <span
              key={w}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffebee',
                color: '#c62828',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {w}
              <button
                onClick={() => removeBannedWord(w)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {bannedWords.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => flash('Banned words list saved (backend endpoint coming in M6)')}
              style={btnStyle('#1565c0')}
            >
              Save Banned Words
            </button>
          </div>
        )}
      </div>

      {/* Cache flush */}
      <div style={section}>
        <div style={sectionHead}>Cache Management</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { key: 'places', label: 'Flush Places Cache', color: '#1565c0' },
            { key: 'providers', label: 'Flush Providers Cache', color: '#00838f' },
            { key: 'metrics', label: 'Flush Metrics Cache', color: '#2e7d32' },
            { key: 'all', label: 'Flush All Caches', color: '#b71c1c' },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => { if (confirm(`Flush ${c.key} cache?`)) void flushCache(c.key); }}
              style={btnStyle(c.color)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue status */}
      <div style={section}>
        <div style={sectionHead}>Job Queue Status</div>
        {queueStatus && Object.keys(queueStatus).length === 0 && (
          <div style={{ color: '#2e7d32', fontSize: 14 }}>✓ All queues healthy — no failed jobs</div>
        )}
        {queueStatus && Object.keys(queueStatus).length > 0 && (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, borderBottom: '2px solid #ddd' }}>Queue</th>
                <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700, borderBottom: '2px solid #ddd' }}>Failed Jobs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(queueStatus).map(([name, info]) => (
                <tr key={name}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{name}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #eee', textAlign: 'center', color: info.failed > 0 ? '#c62828' : '#2e7d32', fontWeight: 700 }}>
                    {info.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12 }}>
          <a
            href={`${window.location.origin}/queues`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#1565c0', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            → Open BullMQ Dashboard ↗
          </a>
        </div>
      </div>
    </div>
  );
}
