/**
 * AdminSettingsPage — platform configuration and operations.
 *
 * Tabs:
 *  1. Feature Flags   — per-city feature toggles
 *  2. Maintenance     — maintenance mode + broadcast message
 *  3. Rate Limits     — per-endpoint override table
 *  4. System          — db stats, API health, cache, export
 *  5. Notifications   — push notification test sender
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ChangeEvent } from 'react';
import { btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';
import { api } from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────

type TabKey = 'flags' | 'maintenance' | 'ratelimits' | 'system' | 'notifications';

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabledGlobally: boolean;
  enabledCities: string[];
}

interface MaintenanceConfig {
  enabled: boolean;
  messageAr: string;
  messageEn: string;
  scheduledAt: string | null;
  estimatedDuration: number; // minutes
}

interface RateLimitRule {
  endpoint: string;
  windowSeconds: number;
  maxRequests: number;
  override: number | null; // null = default
}

interface SystemHealth {
  apiStatus: 'healthy' | 'degraded' | 'down';
  dbStatus: 'healthy' | 'degraded' | 'down';
  redisStatus: 'healthy' | 'degraded' | 'down';
  dbSize: string;
  dbConnections: number;
  uptime: string;
  apiVersion: string;
  nodeVersion: string;
  environment: string;
  queueLengths: Record<string, number>;
  cacheHitRate: number;
  memoryUsageMb: number;
}

interface BroadcastMessage {
  titleAr: string;
  bodyAr: string;
  targetCity: string;
  targetRoles: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CITIES = ['الكل', 'بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف', 'كربلاء', 'كركوك', 'السليمانية'];

const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: 'assistant',      label: 'المساعد الذكي',      description: 'تفعيل ميزة المساعد المدعوم بالذكاء الاصطناعي',  enabledGlobally: true,  enabledCities: [] },
  { key: 'discover_feed',  label: 'تغذية الاكتشاف',     description: 'الخلاصة الاجتماعية للأماكن والفعاليات',          enabledGlobally: true,  enabledCities: [] },
  { key: 'incidents',      label: 'الحوادث المرورية',    description: 'نظام بلاغات الحوادث والازدحام',                  enabledGlobally: false, enabledCities: ['بغداد', 'البصرة'] },
  { key: 'events',         label: 'الفعاليات',           description: 'عرض وإضافة الفعاليات المحلية',                   enabledGlobally: false, enabledCities: ['بغداد', 'أربيل'] },
  { key: 'messaging',      label: 'التواصل مع الموردين', description: 'إرسال رسائل مباشرة للمحلات التجارية',             enabledGlobally: false, enabledCities: ['بغداد'] },
  { key: 'reviews',        label: 'التقييمات',           description: 'كتابة وعرض تقييمات الأماكن',                     enabledGlobally: true,  enabledCities: [] },
  { key: 'navigation',     label: 'الملاحة',             description: 'توجيهات وخرائط الطريق المفصلة',                  enabledGlobally: true,  enabledCities: [] },
  { key: 'provider_reg',  label: 'تسجيل الموردين',      description: 'السماح للمحلات بالتسجيل في المنصة',              enabledGlobally: true,  enabledCities: [] },
  { key: 'photos',         label: 'رفع الصور',           description: 'السماح للمستخدمين برفع صور الأماكن',             enabledGlobally: false, enabledCities: ['بغداد', 'البصرة', 'أربيل'] },
  { key: 'challenges',     label: 'التحديات',            description: 'تحديات مجتمعية لاكتشاف الأماكن',                enabledGlobally: false, enabledCities: [] },
];

const DEFAULT_RATE_LIMITS: RateLimitRule[] = [
  { endpoint: '/v1/assistant/query',   windowSeconds: 60, maxRequests: 10,   override: null },
  { endpoint: '/v1/places/search',     windowSeconds: 60, maxRequests: 60,   override: null },
  { endpoint: '/v1/auth/otp/request',  windowSeconds: 60, maxRequests: 3,    override: null },
  { endpoint: '/v1/reviews',           windowSeconds: 60, maxRequests: 5,    override: null },
  { endpoint: '/v1/incidents',         windowSeconds: 60, maxRequests: 10,   override: null },
  { endpoint: '/v1/messages',          windowSeconds: 60, maxRequests: 20,   override: null },
  { endpoint: '/v1/discover/posts',    windowSeconds: 60, maxRequests: 5,    override: null },
  { endpoint: '/v1/providers',         windowSeconds: 60, maxRequests: 30,   override: null },
];

// ─── Feature Flags Tab ─────────────────────────────────────────────────────

function FeatureFlagsTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [flags, setFlags] = useState<FeatureFlag[]>(DEFAULT_FLAGS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/feature-flags', { headers: { 'x-admin-key': api.getAdminKey() } });
      if (res.ok) {
        const data = (await res.json()) as { flags: FeatureFlag[] };
        setFlags(data.flags);
      }
    } catch {
      // use defaults
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, boolean> = {};
      for (const f of flags) patch[f.key] = f.enabledGlobally;
      await api.setFeatureFlags(patch);
      flash('تم حفظ الإعدادات');
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function toggleGlobal(key: string) {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabledGlobally: !f.enabledGlobally } : f));
    setDirty(true);
  }

  function toggleCity(flagKey: string, city: string) {
    setFlags((prev) => prev.map((f) => {
      if (f.key !== flagKey) return f;
      const cities = f.enabledCities.includes(city)
        ? f.enabledCities.filter((c) => c !== city)
        : [...f.enabledCities, city];
      return { ...f, enabledCities: cities };
    }));
    setDirty(true);
  }

  const citiesForToggle = CITIES.filter((c) => c !== 'الكل');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
          تفعيل/تعطيل الميزات على مستوى المنصة أو لمدن محددة فقط.
        </p>
        {dirty && (
          <button
            style={{ ...btnStyle('#1565c0'), padding: '8px 20px', fontSize: 13 }}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {flags.map((flag) => (
          <div key={flag.key} style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '14px 18px', boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{flag.label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{flag.description}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, fontFamily: 'monospace' }}>{flag.key}</div>
              </div>
              {/* Global toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <span style={{ fontSize: 12, color: flag.enabledGlobally ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                  {flag.enabledGlobally ? 'مفعّل' : 'معطّل'}
                </span>
                <div
                  onClick={() => toggleGlobal(flag.key)}
                  style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: flag.enabledGlobally ? '#2e7d32' : '#ccc',
                    position: 'relative', cursor: 'pointer', transition: 'background .2s',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 3, left: flag.enabledGlobally ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left .2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }} />
                </div>
              </label>
            </div>

            {/* City toggles */}
            {!flag.enabledGlobally && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>تفعيل لمدن محددة:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {citiesForToggle.map((city) => {
                    const active = flag.enabledCities.includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() => toggleCity(flag.key, city)}
                        style={{
                          padding: '4px 12px', borderRadius: 14, border: '1.5px solid',
                          borderColor: active ? '#1565c0' : '#ddd',
                          background: active ? '#e3f2fd' : '#fafafa',
                          color: active ? '#1565c0' : '#999',
                          cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400,
                        }}
                      >
                        {active ? '✓ ' : ''}{city}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Maintenance Tab ───────────────────────────────────────────────────────

function MaintenanceTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [config, setConfig] = useState<MaintenanceConfig>({
    enabled: false,
    messageAr: 'المنصة في وضع الصيانة حالياً. نعود قريباً إن شاء الله.',
    messageEn: 'The platform is currently under maintenance. We will be back soon.',
    scheduledAt: null,
    estimatedDuration: 60,
  });
  const [saving, setSaving] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastMessage>({
    titleAr: '',
    bodyAr: '',
    targetCity: 'الكل',
    targetRoles: ['user'],
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  async function saveMaintenance() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify(config),
      });
      flash(res.ok
        ? (config.enabled ? 'تم تفعيل وضع الصيانة' : 'تم إلغاء وضع الصيانة')
        : 'تم الحفظ (محلياً)');
    } finally {
      setSaving(false);
    }
  }

  async function sendBroadcast() {
    if (!broadcast.titleAr.trim() || !broadcast.bodyAr.trim()) {
      flash('يرجى إدخال عنوان ونص الرسالة');
      return;
    }
    setSendingBroadcast(true);
    try {
      await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify(broadcast),
      });
      flash('تم إرسال الرسالة الطارئة');
      setBroadcast({ titleAr: '', bodyAr: '', targetCity: 'الكل', targetRoles: ['user'] });
    } finally {
      setSendingBroadcast(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Maintenance mode */}
      <div style={{
        background: '#fff', border: `2px solid ${config.enabled ? '#c62828' : '#e0e0e0'}`,
        borderRadius: 8, padding: '20px 24px', marginBottom: 28,
        boxShadow: config.enabled ? '0 2px 8px rgba(198,40,40,.15)' : '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>وضع الصيانة</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              عند التفعيل ستُعرض رسالة الصيانة لجميع المستخدمين وتُعطَّل واجهة التطبيق.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: config.enabled ? '#c62828' : '#2e7d32' }}>
              {config.enabled ? '🔴 مفعّل' : '🟢 معطّل'}
            </span>
            <div
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              style={{
                width: 48, height: 26, borderRadius: 13,
                background: config.enabled ? '#c62828' : '#ccc',
                position: 'relative', cursor: 'pointer', transition: 'background .2s',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 3, left: config.enabled ? 25 : 3,
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
                boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
            رسالة الصيانة (عربي)
          </label>
          <textarea
            dir="rtl"
            style={{ ...inputStyle, minHeight: 70 }}
            value={config.messageAr}
            onChange={(e) => setConfig((c) => ({ ...c, messageAr: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
            Maintenance message (English)
          </label>
          <textarea
            dir="ltr"
            style={{ ...inputStyle, minHeight: 70 }}
            value={config.messageEn}
            onChange={(e) => setConfig((c) => ({ ...c, messageEn: e.target.value }))}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
              الوقت المجدول
            </label>
            <input
              type="datetime-local"
              style={inputStyle}
              value={config.scheduledAt ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, scheduledAt: e.target.value || null }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
              المدة المتوقعة (دقيقة)
            </label>
            <input
              type="number"
              style={inputStyle}
              value={config.estimatedDuration}
              min={5}
              max={1440}
              onChange={(e) => setConfig((c) => ({ ...c, estimatedDuration: Number(e.target.value) }))}
            />
          </div>
        </div>

        <button
          style={{ ...btnStyle(config.enabled ? '#c62828' : '#1565c0'), padding: '9px 24px', fontSize: 14 }}
          onClick={() => void saveMaintenance()}
          disabled={saving}
        >
          {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
        </button>
      </div>

      {/* Emergency broadcast */}
      <div style={{
        background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
        padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>رسالة طارئة للمستخدمين</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
          إرسال إشعار فوري لجميع المستخدمين أو مدينة محددة.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
              عنوان الرسالة
            </label>
            <input
              dir="rtl" style={inputStyle} value={broadcast.titleAr}
              onChange={(e) => setBroadcast((b) => ({ ...b, titleAr: e.target.value }))}
              placeholder="مثال: تحديث هام"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
              المدينة المستهدفة
            </label>
            <select
              style={inputStyle}
              value={broadcast.targetCity}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setBroadcast((b) => ({ ...b, targetCity: e.target.value }))}
            >
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
            نص الرسالة
          </label>
          <textarea
            dir="rtl"
            style={{ ...inputStyle, minHeight: 80 }}
            value={broadcast.bodyAr}
            onChange={(e) => setBroadcast((b) => ({ ...b, bodyAr: e.target.value }))}
            placeholder="محتوى الإشعار الطارئ…"
          />
        </div>
        <button
          style={{ ...btnStyle('#E65100'), padding: '9px 24px', fontSize: 14 }}
          onClick={() => void sendBroadcast()}
          disabled={sendingBroadcast}
        >
          {sendingBroadcast ? 'جارٍ الإرسال…' : '📢 إرسال الرسالة الطارئة'}
        </button>
      </div>
    </div>
  );
}

// ─── Rate Limits Tab ───────────────────────────────────────────────────────

function RateLimitsTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [rules, setRules] = useState<RateLimitRule[]>(DEFAULT_RATE_LIMITS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/admin/rate-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ rules }),
      });
      flash('تم حفظ حدود المعدل');
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function setOverride(endpoint: string, val: string) {
    const parsed = val === '' ? null : Number(val);
    setRules((prev) => prev.map((r) => r.endpoint === endpoint ? { ...r, override: parsed } : r));
    setDirty(true);
  }

  function clearOverride(endpoint: string) {
    setRules((prev) => prev.map((r) => r.endpoint === endpoint ? { ...r, override: null } : r));
    setDirty(true);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
          تجاوز الحد الافتراضي لطلبات API لنقاط نهاية محددة.
        </p>
        {dirty && (
          <button
            style={{ ...btnStyle('#1565c0'), padding: '8px 20px', fontSize: 13 }}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>نقطة النهاية</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>النافذة (ثانية)</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>الحد الافتراضي</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>التجاوز</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontSize: 13, fontWeight: 600 }}>الفعّال</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const effective = rule.override ?? rule.maxRequests;
            const overridden = rule.override !== null;
            return (
              <tr key={rule.endpoint}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontSize: 12, color: '#333' }}>
                  {rule.endpoint}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13 }}>
                  {rule.windowSeconds}s
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13, color: '#666' }}>
                  {rule.maxRequests}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={rule.override ?? ''}
                      onChange={(e) => setOverride(rule.endpoint, e.target.value)}
                      placeholder="افتراضي"
                      style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                    />
                    {overridden && (
                      <button
                        style={{ ...btnStyle('#9e9e9e'), fontSize: 11, padding: '3px 7px' }}
                        onClick={() => clearOverride(rule.endpoint)}
                      >
                        إعادة تعيين
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontWeight: 700, color: overridden ? '#E65100' : '#2e7d32', fontSize: 13 }}>
                    {effective} {overridden && <span style={{ fontSize: 10, color: '#E65100' }}>✱</span>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>✱ مُتجاوَز يدوياً</p>
    </div>
  );
}

// ─── System Tab ─────────────────────────────────────────────────────────────

function SystemTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportEntity, setExportEntity] = useState<'users' | 'providers' | 'posts'>('users');

  const mockHealth = (): SystemHealth => ({
    apiStatus: 'healthy',
    dbStatus: 'healthy',
    redisStatus: 'healthy',
    dbSize: '4.2 GB',
    dbConnections: 18,
    uptime: '12d 4h 30m',
    apiVersion: '0.8.0',
    nodeVersion: '22.9.0',
    environment: 'production',
    queueLengths: { notifications: 3, emails: 0, mediaProcess: 1, outbox: 0 },
    cacheHitRate: 0.87,
    memoryUsageMb: 420,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system/health', { headers: { 'x-admin-key': api.getAdminKey() } });
      if (res.ok) {
        setHealth((await res.json()) as SystemHealth);
      } else {
        setHealth(mockHealth());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function flushCache() {
    setFlushing(true);
    try {
      await api.flushCache('all');
      flash('تم مسح ذاكرة التخزين المؤقت');
    } finally {
      setFlushing(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const csv = await api.exportCsv(exportEntity, from, today);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportEntity}-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash('تم تصدير البيانات');
    } catch {
      flash('تعذر التصدير — العملية قيد التطوير');
    } finally {
      setExporting(false);
    }
  }

  const statusColor: Record<string, string> = { healthy: '#2e7d32', degraded: '#F57C00', down: '#c62828' };
  const statusLabel: Record<string, string> = { healthy: 'سليم', degraded: 'متدهور', down: 'متوقف' };

  if (loading) return <LoadingRow />;
  if (!health) return <p style={{ color: '#888' }}>تعذر تحميل حالة النظام.</p>;

  return (
    <div>
      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {([ ['apiStatus', 'الـ API'], ['dbStatus', 'قاعدة البيانات'], ['redisStatus', 'Redis'] ] as [keyof SystemHealth, string][]).map(([key, label]) => {
          const val = health[key] as string;
          return (
            <div key={key} style={{
              background: '#fff', border: `1px solid ${statusColor[val]}44`,
              borderRadius: 8, padding: '16px 20px',
            }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: statusColor[val] }}>
                {val === 'healthy' ? '✓ ' : val === 'degraded' ? '⚠ ' : '✗ '}
                {statusLabel[val]}
              </div>
            </div>
          );
        })}
      </div>

      {/* System info */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>معلومات النظام</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            ['إصدار API', health.apiVersion],
            ['إصدار Node.js', health.nodeVersion],
            ['بيئة التشغيل', health.environment],
            ['وقت التشغيل', health.uptime],
            ['حجم قاعدة البيانات', health.dbSize],
            ['اتصالات DB', String(health.dbConnections)],
            ['معدل Cache', `${(health.cacheHitRate * 100).toFixed(1)}%`],
            ['استخدام الذاكرة', `${health.memoryUsageMb} MB`],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Queue lengths */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>طوابير المهام</h4>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(health.queueLengths).map(([name, len]) => (
            <div key={name} style={{
              background: len > 0 ? '#fff8e1' : '#f1f8e9',
              border: `1px solid ${len > 0 ? '#ffe082' : '#c5e1a5'}`,
              borderRadius: 6, padding: '8px 14px',
            }}>
              <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{name}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: len > 5 ? '#c62828' : len > 0 ? '#E65100' : '#2e7d32' }}>
                {len}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 220 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>مسح الـ Cache</h4>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
            مسح ذاكرة التخزين المؤقت بالكامل. قد يبطئ المنصة مؤقتاً.
          </p>
          <button
            style={{ ...btnStyle('#E65100'), padding: '8px 18px', fontSize: 13 }}
            onClick={() => void flushCache()}
            disabled={flushing}
          >
            {flushing ? 'جارٍ المسح…' : '🗑 مسح الـ Cache'}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 280 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>تصدير البيانات</h4>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
            تصدير بيانات المنصة كـ CSV (آخر 30 يومًا).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={exportEntity}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setExportEntity(e.target.value as typeof exportEntity)}
              style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            >
              <option value="users">المستخدمون</option>
              <option value="providers">الموردون</option>
              <option value="posts">المنشورات</option>
            </select>
            <button
              style={{ ...btnStyle('#1565c0'), padding: '8px 16px', fontSize: 13 }}
              onClick={() => void exportData()}
              disabled={exporting}
            >
              {exporting ? 'جارٍ التصدير…' : '⬇ تصدير CSV'}
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 180 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>فحص الصحة</h4>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
            تحديث حالة النظام الآن.
          </p>
          <button
            style={{ ...btnStyle('#2e7d32'), padding: '8px 18px', fontSize: 13 }}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'جارٍ الفحص…' : '🔄 فحص الآن'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notifications Tab ──────────────────────────────────────────────────────

function NotificationsTab({ flash }: { flash: (msg: string) => void }): ReactElement {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetCity, setTargetCity] = useState('الكل');
  const [targetRole, setTargetRole] = useState<'user' | 'provider' | 'all'>('user');
  const [testUserId, setTestUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  async function sendToAll() {
    if (!title.trim() || !body.trim()) { flash('العنوان والنص مطلوبان'); return; }
    setSending(true);
    try {
      await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ title, body, targetCity, targetRole }),
      });
      flash('تم إرسال الإشعار');
      setTitle(''); setBody('');
    } finally {
      setSending(false);
    }
  }

  async function sendTest() {
    if (!testUserId.trim()) { flash('يرجى إدخال معرف المستخدم'); return; }
    setSendingTest(true);
    try {
      await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': api.getAdminKey() },
        body: JSON.stringify({ userId: testUserId, title: title || 'اختبار', body: body || 'رسالة اختبار' }),
      });
      flash(`تم الإرسال التجريبي لـ ${testUserId}`);
    } finally {
      setSendingTest(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 20 }}>
        إرسال إشعار push لمستخدم بعينه (اختبار) أو لمجموعة من المستخدمين.
      </p>

      {/* Compose */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '18px 22px', marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>تأليف الإشعار</h4>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>العنوان</label>
          <input dir="rtl" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإشعار" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>النص</label>
          <textarea dir="rtl" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="محتوى الإشعار…" />
        </div>
      </div>

      {/* Send to all */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '18px 22px', marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>إرسال للمجموعة</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>المدينة</label>
            <select style={inputStyle} value={targetCity} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTargetCity(e.target.value)}>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>الدور</label>
            <select style={inputStyle} value={targetRole} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTargetRole(e.target.value as typeof targetRole)}>
              <option value="user">مستخدمون</option>
              <option value="provider">موردون</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>
        <button style={{ ...btnStyle('#7B1FA2'), padding: '9px 24px', fontSize: 13 }} onClick={() => void sendToAll()} disabled={sending}>
          {sending ? 'جارٍ الإرسال…' : '📣 إرسال للمجموعة'}
        </button>
      </div>

      {/* Test send */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '18px 22px' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>إرسال تجريبي</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: 1 }} dir="ltr"
            value={testUserId} onChange={(e) => setTestUserId(e.target.value)}
            placeholder="User ID أو UUID"
          />
          <button style={{ ...btnStyle('#1565c0'), padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => void sendTest()} disabled={sendingTest}>
            {sendingTest ? 'جارٍ…' : '🧪 اختبار'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  flags:         'Feature Flags',
  maintenance:   'الصيانة',
  ratelimits:    'حدود المعدل',
  system:        'النظام',
  notifications: 'الإشعارات',
};

export function AdminSettingsPage(): ReactElement {
  const [tab, setTab] = useState<TabKey>('flags');
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div>
      <PageHeader title="إعدادات المنصة" />
      <FlashBanner msg={msg} />

      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: 20, flexWrap: 'wrap' }}>
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

      {tab === 'flags'         && <FeatureFlagsTab flash={flash} />}
      {tab === 'maintenance'   && <MaintenanceTab flash={flash} />}
      {tab === 'ratelimits'    && <RateLimitsTab flash={flash} />}
      {tab === 'system'        && <SystemTab flash={flash} />}
      {tab === 'notifications' && <NotificationsTab flash={flash} />}
    </div>
  );
}
