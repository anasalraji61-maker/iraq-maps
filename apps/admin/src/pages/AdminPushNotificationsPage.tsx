/**
 * AdminPushNotificationsPage — send, schedule and track push notifications.
 *
 * Features:
 *   - Segment targeting: all / city / role / radius
 *   - 10 pre-built notification templates
 *   - Schedule for later (date-time picker)
 *   - Send-to-self test
 *   - Sent history with delivery stats
 *   - Opt-out rate per segment
 */
import { useState, useMemo } from 'react';
import { btnStyle, FlashBanner } from '../components/shared';
import { AdminDataTable, type Column } from '../components/AdminDataTable';

// ── Types ─────────────────────────────────────────────────────────────────────

type TargetSegment = 'all' | 'city' | 'role' | 'radius';
type UserRole = 'user' | 'provider';
type NotifStatus = 'sent' | 'scheduled' | 'failed' | 'cancelled';

interface SentNotification {
  id: string;
  title: string;
  body: string;
  segment: TargetSegment;
  segmentValue: string;
  sentAt: string;
  status: NotifStatus;
  targetCount: number;
  deliveredCount: number;
  openedCount: number;
  optedOutCount: number;
  scheduledFor: string | null;
}

// ── Mock history ──────────────────────────────────────────────────────────────

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const MOCK_HISTORY: SentNotification[] = [
  {
    id: 'notif-001',
    title: 'New feature: 3D Tour Mode',
    body: 'Explore Baghdad in stunning 3D. Try the new tour mode in your app now!',
    segment: 'all',
    segmentValue: 'All users',
    sentAt: ago(48),
    status: 'sent',
    targetCount: 14820,
    deliveredCount: 13940,
    openedCount: 4122,
    optedOutCount: 87,
    scheduledFor: null,
  },
  {
    id: 'notif-002',
    title: 'Weekend events in Baghdad',
    body: 'Check out what\'s happening this weekend in your city — events updated!',
    segment: 'city',
    segmentValue: 'Baghdad',
    sentAt: ago(96),
    status: 'sent',
    targetCount: 8210,
    deliveredCount: 7870,
    openedCount: 2980,
    optedOutCount: 34,
    scheduledFor: null,
  },
  {
    id: 'notif-003',
    title: 'Verify your business listing',
    body: 'Complete your provider verification to unlock all features and reach more customers.',
    segment: 'role',
    segmentValue: 'Providers',
    sentAt: ago(120),
    status: 'sent',
    targetCount: 1840,
    deliveredCount: 1720,
    openedCount: 890,
    optedOutCount: 12,
    scheduledFor: null,
  },
  {
    id: 'notif-004',
    title: 'Safety alert near you',
    body: 'There is an active incident near your location. Tap for details.',
    segment: 'radius',
    segmentValue: '5 km from (33.34, 44.40)',
    sentAt: ago(2),
    status: 'sent',
    targetCount: 320,
    deliveredCount: 298,
    openedCount: 241,
    optedOutCount: 3,
    scheduledFor: null,
  },
  {
    id: 'notif-005',
    title: 'Erbil Food Festival this Friday',
    body: 'Join the biggest food festival in northern Iraq. Find it in the Events section.',
    segment: 'city',
    segmentValue: 'Erbil',
    sentAt: future(24),
    status: 'scheduled',
    targetCount: 2450,
    deliveredCount: 0,
    openedCount: 0,
    optedOutCount: 0,
    scheduledFor: future(24),
  },
  {
    id: 'notif-006',
    title: 'App update available',
    body: 'Version 2.1 is out with offline maps and improved routing. Update now!',
    segment: 'all',
    segmentValue: 'All users',
    sentAt: ago(200),
    status: 'failed',
    targetCount: 13100,
    deliveredCount: 0,
    openedCount: 0,
    optedOutCount: 0,
    scheduledFor: null,
  },
];

// ── Notification Templates ────────────────────────────────────────────────────

interface Template {
  id: string;
  category: string;
  title: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'tpl-001',
    category: 'Engagement',
    title: 'New places near you',
    body: 'We\'ve added {{count}} new places near you this week. Explore and share your reviews!',
  },
  {
    id: 'tpl-002',
    category: 'Engagement',
    title: 'You\'re on a streak!',
    body: 'Great job! You\'ve been active for {{days}} days in a row. Keep it up to earn your badge!',
  },
  {
    id: 'tpl-003',
    category: 'Safety',
    title: 'Safety alert in your area',
    body: 'A {{type}} has been reported near you. Tap to see details and alternative routes.',
  },
  {
    id: 'tpl-004',
    category: 'Safety',
    title: 'Road closure notice',
    body: 'A road closure is affecting routes near {{area}}. Open the app for alternative routes.',
  },
  {
    id: 'tpl-005',
    category: 'Events',
    title: 'Event starting soon',
    body: '{{event_name}} starts in {{time}}. Don\'t miss it! Find it in the Events section.',
  },
  {
    id: 'tpl-006',
    category: 'Events',
    title: 'Weekend highlights',
    body: 'Check out the best events happening in {{city}} this weekend. Tap to explore!',
  },
  {
    id: 'tpl-007',
    category: 'Provider',
    title: 'Your listing was viewed',
    body: '{{count}} people viewed your business listing this week. Keep your info up to date!',
  },
  {
    id: 'tpl-008',
    category: 'Provider',
    title: 'New review received',
    body: 'A customer just left a new review on your business. Tap to read and respond.',
  },
  {
    id: 'tpl-009',
    category: 'Feature',
    title: 'New feature available',
    body: 'Introducing {{feature_name}} — {{description}}. Update your app to try it now!',
  },
  {
    id: 'tpl-010',
    category: 'Retention',
    title: 'We miss you!',
    body: 'It\'s been a while since your last visit. Come back and discover what\'s new in {{city}}!',
  },
];

// ── Segment estimate (mock) ───────────────────────────────────────────────────

const CITY_USER_COUNTS: Record<string, number> = {
  Baghdad: 8210,
  Erbil: 2450,
  Basra: 1890,
  Mosul: 1340,
  Sulaymaniyah: 820,
  Kirkuk: 540,
  Najaf: 410,
  Karbala: 320,
};

function estimateReach(segment: TargetSegment, cityValue: string, roleValue: UserRole, radiusKm: number): number {
  if (segment === 'all') return 14820;
  if (segment === 'city') return CITY_USER_COUNTS[cityValue] ?? 0;
  if (segment === 'role') return roleValue === 'provider' ? 1840 : 12980;
  if (segment === 'radius') return Math.round(radiusKm * radiusKm * 3.14 * 2.4);
  return 0;
}

// ── Column config for history table ──────────────────────────────────────────

const historyColumns: Column<SentNotification>[] = [
  {
    key: 'title',
    label: 'Title',
    width: 200,
    render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.title}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{r.body}</div>
      </div>
    ),
  },
  {
    key: 'segment',
    label: 'Segment',
    width: 160,
    render: (r) => (
      <div>
        <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>
          {r.segment}
        </span>
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{r.segmentValue}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    width: 110,
    render: (r) => {
      const cfg: Record<NotifStatus, { bg: string; color: string }> = {
        sent: { bg: '#e8f5e9', color: '#2e7d32' },
        scheduled: { bg: '#e3f2fd', color: '#1565c0' },
        failed: { bg: '#ffebee', color: '#c62828' },
        cancelled: { bg: '#f5f5f5', color: '#757575' },
      };
      const c = cfg[r.status];
      return (
        <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
          {r.status.toUpperCase()}
        </span>
      );
    },
  },
  {
    key: 'sentAt',
    label: 'Sent / Scheduled',
    width: 150,
    render: (r) => (
      <span style={{ fontSize: 12 }}>
        {r.status === 'scheduled'
          ? `📅 ${new Date(r.scheduledFor!).toLocaleString()}`
          : new Date(r.sentAt).toLocaleString()}
      </span>
    ),
    csvValue: (r) => r.sentAt,
  },
  {
    key: 'targetCount',
    label: 'Targeted',
    width: 90,
    render: (r) => <span style={{ fontWeight: 600 }}>{r.targetCount.toLocaleString()}</span>,
  },
  {
    key: 'deliveryRate',
    label: 'Delivery',
    width: 90,
    render: (r) => {
      if (r.targetCount === 0) return <span style={{ color: '#aaa' }}>—</span>;
      const rate = r.status === 'sent' ? Math.round((r.deliveredCount / r.targetCount) * 100) : null;
      return rate !== null ? (
        <span style={{ color: rate > 90 ? '#2e7d32' : rate > 70 ? '#f57f17' : '#c62828', fontWeight: 600 }}>
          {rate}%
        </span>
      ) : <span style={{ color: '#aaa' }}>—</span>;
    },
    csvValue: (r) => r.targetCount > 0 ? `${Math.round((r.deliveredCount / r.targetCount) * 100)}%` : '—',
  },
  {
    key: 'openRate',
    label: 'Open Rate',
    width: 90,
    render: (r) => {
      if (r.deliveredCount === 0) return <span style={{ color: '#aaa' }}>—</span>;
      const rate = Math.round((r.openedCount / r.deliveredCount) * 100);
      return <span style={{ color: '#1565c0', fontWeight: 600 }}>{rate}%</span>;
    },
    csvValue: (r) => r.deliveredCount > 0 ? `${Math.round((r.openedCount / r.deliveredCount) * 100)}%` : '—',
  },
  {
    key: 'optedOutCount',
    label: 'Opt-outs',
    width: 80,
    render: (r) => (
      <span style={{ color: r.optedOutCount > 0 ? '#c62828' : '#aaa', fontWeight: r.optedOutCount > 0 ? 600 : 400 }}>
        {r.optedOutCount}
      </span>
    ),
  },
];

// ── Compose form ──────────────────────────────────────────────────────────────

interface ComposeState {
  title: string;
  body: string;
  segment: TargetSegment;
  cityValue: string;
  roleValue: UserRole;
  radiusLat: string;
  radiusLng: string;
  radiusKm: number;
  scheduleEnabled: boolean;
  scheduledFor: string;
}

function defaultCompose(): ComposeState {
  const soon = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
  return {
    title: '',
    body: '',
    segment: 'all',
    cityValue: 'Baghdad',
    roleValue: 'user',
    radiusLat: '33.34',
    radiusLng: '44.40',
    radiusKm: 5,
    scheduleEnabled: false,
    scheduledFor: soon,
  };
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminPushNotificationsPage() {
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [form, setForm] = useState<ComposeState>(defaultCompose());
  const [history, setHistory] = useState<SentNotification[]>(MOCK_HISTORY);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  function setField<K extends keyof ComposeState>(k: K, v: ComposeState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const estimatedReach = useMemo(
    () => estimateReach(form.segment, form.cityValue, form.roleValue, form.radiusKm),
    [form.segment, form.cityValue, form.roleValue, form.radiusKm],
  );

  async function handleSend(test = false) {
    if (!form.title.trim() || !form.body.trim()) {
      alert('Title and body are required');
      return;
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 900));
    setBusy(false);

    if (test) {
      flash('Test notification sent to your device');
      return;
    }

    const segVal =
      form.segment === 'all' ? 'All users' :
      form.segment === 'city' ? form.cityValue :
      form.segment === 'role' ? (form.roleValue === 'provider' ? 'Providers' : 'Regular users') :
      `${form.radiusKm} km from (${form.radiusLat}, ${form.radiusLng})`;

    const newEntry: SentNotification = {
      id: `notif-${Date.now()}`,
      title: form.title,
      body: form.body,
      segment: form.segment,
      segmentValue: segVal,
      sentAt: new Date().toISOString(),
      status: form.scheduleEnabled ? 'scheduled' : 'sent',
      targetCount: estimatedReach,
      deliveredCount: form.scheduleEnabled ? 0 : Math.round(estimatedReach * 0.94),
      openedCount: form.scheduleEnabled ? 0 : Math.round(estimatedReach * 0.28),
      optedOutCount: form.scheduleEnabled ? 0 : Math.round(estimatedReach * 0.005),
      scheduledFor: form.scheduleEnabled ? form.scheduledFor : null,
    };

    setHistory((prev) => [newEntry, ...prev]);
    setForm(defaultCompose());
    flash(form.scheduleEnabled ? `Notification scheduled for ${form.scheduledFor}` : `Notification sent to ~${estimatedReach.toLocaleString()} users`);
    setTab('history');
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 13,
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 };

  const templateCategories = [...new Set(TEMPLATES.map((t) => t.category))];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#1a237e' }}>📱 Push Notifications</h2>

      <FlashBanner msg={msg} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e0e0e0', marginBottom: 20 }}>
        {(['compose', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1565c0' : '#666',
              borderBottom: tab === t ? '2px solid #1565c0' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'compose' ? '✏ Compose' : '📋 Sent History'}
          </button>
        ))}
      </div>

      {/* ── Compose tab ── */}
      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* Form */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: '#1a237e', fontSize: 16 }}>New Notification</h3>
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                style={{ ...btnStyle('#6a1b9a'), fontSize: 12 }}
              >
                {showTemplates ? 'Hide Templates' : '📝 Templates'}
              </button>
            </div>

            {/* Templates panel */}
            {showTemplates && (
              <div style={{ background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4a148c', marginBottom: 12 }}>Choose a template:</div>
                {templateCategories.map((cat) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7b1fa2', textTransform: 'uppercase', marginBottom: 6 }}>{cat}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {TEMPLATES.filter((t) => t.category === cat).map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => {
                            setField('title', tpl.title);
                            setField('body', tpl.body);
                            setSelectedTemplate(tpl.id);
                            setShowTemplates(false);
                          }}
                          style={{
                            padding: '4px 10px',
                            border: `1px solid ${selectedTemplate === tpl.id ? '#7b1fa2' : '#ce93d8'}`,
                            borderRadius: 12,
                            background: selectedTemplate === tpl.id ? '#7b1fa2' : '#fff',
                            color: selectedTemplate === tpl.id ? '#fff' : '#6a1b9a',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {tpl.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Notification Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Brief, attention-grabbing title"
                maxLength={65}
                style={fieldStyle}
              />
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{form.title.length}/65 chars</div>
            </div>

            {/* Body */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Message Body *</label>
              <textarea
                value={form.body}
                onChange={(e) => setField('body', e.target.value)}
                rows={3}
                placeholder="The notification message. Use {{variable}} for dynamic values."
                maxLength={240}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{form.body.length}/240 chars</div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '18px 0' }} />

            {/* Segment */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Target Segment</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['all', 'city', 'role', 'radius'] as TargetSegment[]).map((s) => (
                  <label
                    key={s}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      border: `1px solid ${form.segment === s ? '#1565c0' : '#ccc'}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: form.segment === s ? '#e3f2fd' : '#fff',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="radio"
                      name="segment"
                      value={s}
                      checked={form.segment === s}
                      onChange={() => setField('segment', s)}
                      style={{ accentColor: '#1565c0' }}
                    />
                    {s === 'all' ? '🌍 All Users' :
                     s === 'city' ? '🏙 By City' :
                     s === 'role' ? '👤 By Role' :
                     '📍 By Location'}
                  </label>
                ))}
              </div>
            </div>

            {/* City picker */}
            {form.segment === 'city' && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>City</label>
                <select value={form.cityValue} onChange={(e) => setField('cityValue', e.target.value)} style={fieldStyle}>
                  {Object.keys(CITY_USER_COUNTS).map((c) => (
                    <option key={c} value={c}>{c} (~{CITY_USER_COUNTS[c].toLocaleString()} users)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Role picker */}
            {form.segment === 'role' && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>User Role</label>
                <select value={form.roleValue} onChange={(e) => setField('roleValue', e.target.value as UserRole)} style={fieldStyle}>
                  <option value="user">Regular Users (~12,980)</option>
                  <option value="provider">Providers (~1,840)</option>
                </select>
              </div>
            )}

            {/* Radius picker */}
            {form.segment === 'radius' && (
              <div style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Center Latitude</label>
                  <input type="text" value={form.radiusLat} onChange={(e) => setField('radiusLat', e.target.value)} placeholder="33.3406" style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Center Longitude</label>
                  <input type="text" value={form.radiusLng} onChange={(e) => setField('radiusLng', e.target.value)} placeholder="44.4009" style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Radius (km): {form.radiusKm}</label>
                  <input
                    type="range" min={1} max={50} step={1}
                    value={form.radiusKm}
                    onChange={(e) => setField('radiusKm', Number(e.target.value))}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '18px 0' }} />

            {/* Schedule */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(e) => setField('scheduleEnabled', e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>📅 Schedule for later</span>
              </label>
              {form.scheduleEnabled && (
                <input
                  type="datetime-local"
                  value={form.scheduledFor}
                  onChange={(e) => setField('scheduledFor', e.target.value)}
                  style={fieldStyle}
                />
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void handleSend(true)}
                disabled={busy || !form.title.trim()}
                style={{ ...btnStyle('#555'), opacity: !form.title.trim() || busy ? 0.5 : 1, marginInlineStart: 0 }}
              >
                🧪 Test (Send to Me)
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => void handleSend(false)}
                disabled={busy || !form.title.trim() || !form.body.trim()}
                style={{
                  ...btnStyle(form.scheduleEnabled ? '#6a1b9a' : '#1565c0'),
                  opacity: !form.title.trim() || !form.body.trim() || busy ? 0.5 : 1,
                  marginInlineStart: 0,
                  fontSize: 14,
                  padding: '8px 20px',
                }}
              >
                {busy ? 'Sending…' : form.scheduleEnabled ? '📅 Schedule Notification' : '🚀 Send Now'}
              </button>
            </div>
          </div>

          {/* Preview + stats panel */}
          <div>
            {/* Phone preview */}
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 12 }}>📱 Preview</div>
              <div style={{
                background: '#1a1a2e',
                borderRadius: 16,
                padding: '14px 14px 10px',
                color: '#fff',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>Iraq Smart Maps · now</div>
                <div style={{
                  background: 'rgba(255,255,255,.1)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    {form.title || 'Notification title will appear here'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', lineHeight: 1.4 }}>
                    {form.body || 'Your message body will appear here. Keep it concise and actionable.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Reach estimate */}
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 12 }}>📊 Estimated Reach</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#1565c0', marginBottom: 4 }}>
                ~{estimatedReach.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>eligible users</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Expected delivery', value: `~${Math.round(estimatedReach * 0.94).toLocaleString()}`, color: '#2e7d32' },
                  { label: 'Expected opens', value: `~${Math.round(estimatedReach * 0.28).toLocaleString()}`, color: '#1565c0' },
                  { label: 'Expected opt-outs', value: `~${Math.round(estimatedReach * 0.005)}`, color: '#c62828' },
                ].map((s) => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#666' }}>{s.label}</span>
                    <span style={{ fontWeight: 600, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Opt-out rate overview */}
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 12 }}>📉 Opt-out Rates by Segment</div>
              {[
                { label: 'All users', rate: 0.58 },
                { label: 'Baghdad', rate: 0.41 },
                { label: 'Erbil', rate: 0.38 },
                { label: 'Providers', rate: 0.65 },
                { label: 'Radius alerts', rate: 0.12 },
              ].map((s) => (
                <div key={s.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: '#666' }}>{s.label}</span>
                    <span style={{ fontWeight: 600, color: s.rate > 0.5 ? '#c62828' : '#2e7d32' }}>{s.rate}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: '#eee' }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${s.rate * 100}%`, background: s.rate > 0.5 ? '#ef9a9a' : '#a5d6a7' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div>
          {/* Aggregate stats */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              {
                label: 'Total Sent',
                value: history.filter((n) => n.status === 'sent').length,
                color: '#1565c0',
              },
              {
                label: 'Avg Delivery Rate',
                value: (() => {
                  const sent = history.filter((n) => n.status === 'sent' && n.targetCount > 0);
                  if (!sent.length) return '—';
                  const avg = sent.reduce((a, n) => a + n.deliveredCount / n.targetCount, 0) / sent.length;
                  return `${Math.round(avg * 100)}%`;
                })(),
                color: '#2e7d32',
              },
              {
                label: 'Avg Open Rate',
                value: (() => {
                  const sent = history.filter((n) => n.status === 'sent' && n.deliveredCount > 0);
                  if (!sent.length) return '—';
                  const avg = sent.reduce((a, n) => a + n.openedCount / n.deliveredCount, 0) / sent.length;
                  return `${Math.round(avg * 100)}%`;
                })(),
                color: '#6a1b9a',
              },
              {
                label: 'Scheduled',
                value: history.filter((n) => n.status === 'scheduled').length,
                color: '#0277bd',
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: '#fff',
                  border: '1px solid #e0e0e0',
                  borderLeft: `4px solid ${s.color}`,
                  borderRadius: 8,
                  padding: '14px 20px',
                  flex: '1 1 140px',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <AdminDataTable
            columns={historyColumns}
            rows={history}
            pageSize={15}
            exportName="push-notifications"
            emptyMessage="No notifications sent yet."
            bulkActions={[
              {
                label: 'Cancel Scheduled',
                color: '#c62828',
                onClick: (rows) => {
                  const ids = new Set(rows.filter((r) => r.status === 'scheduled').map((r) => r.id));
                  setHistory((prev) =>
                    prev.map((n) => ids.has(n.id) ? { ...n, status: 'cancelled' } : n),
                  );
                  flash(`Cancelled ${ids.size} scheduled notifications`);
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
