/**
 * AdminChallengesPage — full challenge management panel.
 *
 * Features:
 *   - Stats overview (total, active, participants, completions)
 *   - Create new challenge form (all 8 kinds, bilingual titles)
 *   - Edit existing challenges
 *   - Real-time participant counts column
 *   - Force-complete a user (admin power)
 *   - Per-challenge analytics drawer
 *   - Automatic status computation from starts_at / ends_at
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner } from '../components/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

const CHALLENGE_KINDS = [
  { value: 'review_count', label: 'Write Reviews' },
  { value: 'place_visit', label: 'Visit Places' },
  { value: 'photo_upload', label: 'Upload Photos' },
  { value: 'incident_report', label: 'Report Incidents' },
  { value: 'consecutive_login', label: 'Daily Login Streak' },
  { value: 'category_explorer', label: 'Category Explorer' },
  { value: 'neighborhood_mapper', label: 'Neighborhood Mapper' },
  { value: 'first_review', label: 'First Review' },
] as const;

type ChallengeKind = typeof CHALLENGE_KINDS[number]['value'];

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const;
type Difficulty = typeof DIFFICULTY_OPTIONS[number];

interface ChallengeV2 {
  id: string;
  kind: ChallengeKind;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  difficulty: Difficulty;
  cityId: string | null;
  target: number;
  rewardPoints: number;
  rewardBadge: string | null;
  startsAt: string;
  endsAt: string;
  isFeatured: boolean;
  isActive: boolean;
  totalParticipants: number;
  status: 'upcoming' | 'active' | 'completed';
}

interface ChallengeAnalytics {
  totalParticipants: number;
  completedCount: number;
  rewardClaimedCount: number;
  avgProgress: number;
  completionRate: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const NOW = new Date();
const past = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

const MOCK_CHALLENGES: ChallengeV2[] = [
  {
    id: 'ch-001',
    kind: 'review_count',
    titleAr: 'اكتب ١٠ تقييمات',
    titleEn: 'Write 10 Reviews',
    descriptionAr: 'شارك تجربتك مع المجتمع بكتابة ١٠ تقييمات لأماكن مختلفة',
    descriptionEn: 'Share your experience by writing 10 reviews for different places',
    difficulty: 'easy',
    cityId: 'baghdad',
    target: 10,
    rewardPoints: 500,
    rewardBadge: 'badge_reviewer',
    startsAt: past(5),
    endsAt: future(25),
    isFeatured: true,
    isActive: true,
    totalParticipants: 284,
    status: 'active',
  },
  {
    id: 'ch-002',
    kind: 'place_visit',
    titleAr: 'زيارة ٢٠ مكاناً',
    titleEn: 'Visit 20 Places',
    descriptionAr: 'استكشف المدينة وزر ٢٠ مكاناً مختلفاً',
    descriptionEn: 'Explore the city and visit 20 different places',
    difficulty: 'medium',
    cityId: 'baghdad',
    target: 20,
    rewardPoints: 1200,
    rewardBadge: 'badge_explorer',
    startsAt: past(10),
    endsAt: future(20),
    isFeatured: false,
    isActive: true,
    totalParticipants: 156,
    status: 'active',
  },
  {
    id: 'ch-003',
    kind: 'photo_upload',
    titleAr: 'صوّر ٥٠ مكاناً',
    titleEn: 'Upload 50 Photos',
    descriptionAr: 'ساهم في توثيق أماكن بغداد بنشر ٥٠ صورة',
    descriptionEn: 'Help document Baghdad by uploading 50 photos',
    difficulty: 'hard',
    cityId: 'baghdad',
    target: 50,
    rewardPoints: 3000,
    rewardBadge: 'badge_photographer',
    startsAt: future(5),
    endsAt: future(35),
    isFeatured: false,
    isActive: true,
    totalParticipants: 0,
    status: 'upcoming',
  },
  {
    id: 'ch-004',
    kind: 'consecutive_login',
    titleAr: 'سجّل دخول ٣٠ يوماً متواصلة',
    titleEn: '30-Day Login Streak',
    descriptionAr: 'سجّل دخولك كل يوم لمدة ٣٠ يوماً متواصلة',
    descriptionEn: 'Log in every day for 30 consecutive days',
    difficulty: 'hard',
    cityId: null,
    target: 30,
    rewardPoints: 2000,
    rewardBadge: 'badge_dedicated',
    startsAt: past(40),
    endsAt: past(10),
    isFeatured: false,
    isActive: false,
    totalParticipants: 412,
    status: 'completed',
  },
  {
    id: 'ch-005',
    kind: 'first_review',
    titleAr: 'كن أول من يقيّم مكاناً جديداً',
    titleEn: 'Be First to Review',
    descriptionAr: 'سجّل أول تقييم لأي مكان جديد أُضيف للمنصة',
    descriptionEn: 'Leave the first review on any newly added place',
    difficulty: 'easy',
    cityId: null,
    target: 1,
    rewardPoints: 300,
    rewardBadge: 'badge_pioneer',
    startsAt: past(2),
    endsAt: future(60),
    isFeatured: false,
    isActive: true,
    totalParticipants: 89,
    status: 'active',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: ChallengeV2['status']): { bg: string; color: string; label: string } {
  const map = {
    upcoming: { bg: '#e3f2fd', color: '#1565c0', label: 'Upcoming' },
    active:   { bg: '#e8f5e9', color: '#2e7d32', label: '● Active' },
    completed: { bg: '#f5f5f5', color: '#757575', label: 'Completed' },
  };
  return map[status];
}

function difficultyBadge(d: Difficulty) {
  const map: Record<Difficulty, { bg: string; color: string }> = {
    easy:   { bg: '#e8f5e9', color: '#2e7d32' },
    medium: { bg: '#fff9c4', color: '#f57f17' },
    hard:   { bg: '#ffebee', color: '#c62828' },
  };
  return map[d];
}

function kindLabel(kind: ChallengeKind) {
  return CHALLENGE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

// ─── Analytics drawer ─────────────────────────────────────────────────────────

function AnalyticsDrawer({
  challenge,
  onClose,
}: {
  challenge: ChallengeV2;
  onClose: () => void;
}) {
  const [analytics, setAnalytics] = useState<ChallengeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate load with mock data
    const timer = setTimeout(() => {
      setAnalytics({
        totalParticipants: challenge.totalParticipants,
        completedCount: Math.floor(challenge.totalParticipants * 0.32),
        rewardClaimedCount: Math.floor(challenge.totalParticipants * 0.24),
        avgProgress: Math.round(challenge.target * 0.55 * 10) / 10,
        completionRate: 0.32,
      });
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [challenge]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 480,
          boxShadow: '0 8px 40px rgba(0,0,0,.25)',
          padding: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: 0, color: '#1a237e' }}>📊 Analytics: {challenge.titleEn}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#777' }}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>Loading…</div>
        ) : analytics ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Participants', value: analytics.totalParticipants, color: '#1565c0' },
                { label: 'Completed', value: analytics.completedCount, color: '#2e7d32' },
                { label: 'Claimed Reward', value: analytics.rewardClaimedCount, color: '#6a1b9a' },
                {
                  label: 'Completion Rate',
                  value: `${Math.round(analytics.completionRate * 100)}%`,
                  color: '#00838f',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: '#f8f9fa',
                    borderRadius: 8,
                    padding: '12px 16px',
                    borderLeft: `4px solid ${s.color}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                Avg Progress: {analytics.avgProgress} / {challenge.target}
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#e0e0e0',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 10,
                    borderRadius: 5,
                    width: `${(analytics.avgProgress / challenge.target) * 100}%`,
                    backgroundColor: '#1565c0',
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#777', marginTop: 16 }}>
              ⏱ {challenge.startsAt.slice(0, 10)} → {challenge.endsAt.slice(0, 10)} ·{' '}
              <strong>{challenge.difficulty}</strong> difficulty
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Force-complete modal ─────────────────────────────────────────────────────

function ForceCompleteModal({
  challenge,
  onClose,
  onDone,
}: {
  challenge: ChallengeV2;
  onClose: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!userId.trim()) return;
    setBusy(true);
    try {
      await api.forceCompleteChallenge(challenge.id, userId.trim());
      onDone();
    } catch {
      alert('Failed to force-complete');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 440,
          boxShadow: '0 8px 40px rgba(0,0,0,.25)',
          padding: 28,
        }}
      >
        <h3 style={{ marginTop: 0, color: '#b71c1c' }}>⚡ Force Complete</h3>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 16 }}>
          Challenge: <strong>{challenge.titleEn}</strong>
        </div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          User UUID *
        </label>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #ccc',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box',
            fontFamily: 'monospace',
          }}
        />
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 6, marginBottom: 20 }}>
          This sets the user's progress to the challenge target and marks it completed.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#888')}>Cancel</button>
          <button
            disabled={!userId.trim() || busy}
            onClick={() => void submit()}
            style={{ ...btnStyle('#b71c1c'), opacity: userId.trim() && !busy ? 1 : 0.5 }}
          >
            {busy ? '…' : 'Force Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Challenge form ────────────────────────────────────────────────────────────

interface FormState {
  kind: ChallengeKind;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  difficulty: Difficulty;
  cityId: string;
  target: number;
  rewardPoints: number;
  rewardBadge: string;
  startsAt: string;
  endsAt: string;
  isFeatured: boolean;
}

function defaultForm(): FormState {
  const today = new Date().toISOString().slice(0, 16);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16);
  return {
    kind: 'review_count',
    titleAr: '',
    titleEn: '',
    descriptionAr: '',
    descriptionEn: '',
    difficulty: 'medium',
    cityId: '',
    target: 10,
    rewardPoints: 500,
    rewardBadge: '',
    startsAt: today,
    endsAt: nextMonth,
    isFeatured: false,
  };
}

interface ChallengeFormProps {
  initial?: Partial<FormState>;
  onSave: (data: FormState) => void;
  onCancel: () => void;
}

function ChallengeForm({ initial, onSave, onCancel }: ChallengeFormProps) {
  const [form, setForm] = useState<FormState>({ ...defaultForm(), ...initial });

  function set<K extends keyof FormState>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : e.target.type === 'number'
        ? Number(e.target.value)
        : e.target.value;
      setForm((prev) => ({ ...prev, [k]: v }));
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titleAr.trim() || !form.titleEn.trim()) {
      alert('Both Arabic and English titles are required');
      return;
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      alert('End date must be after start date');
      return;
    }
    onSave(form);
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  };
  const row2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    marginBottom: 14,
  };

  return (
    <form onSubmit={submit}>
      {/* Kind + difficulty */}
      <div style={row2}>
        <div>
          <label style={labelStyle}>Challenge Kind *</label>
          <select value={form.kind} onChange={set('kind')} style={fieldStyle}>
            {CHALLENGE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Difficulty *</label>
          <select value={form.difficulty} onChange={set('difficulty')} style={fieldStyle}>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Titles */}
      <div style={row2}>
        <div>
          <label style={labelStyle}>Title (Arabic) *</label>
          <input
            dir="rtl"
            type="text"
            value={form.titleAr}
            onChange={set('titleAr')}
            required
            placeholder="العنوان بالعربية"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Title (English) *</label>
          <input
            type="text"
            value={form.titleEn}
            onChange={set('titleEn')}
            required
            placeholder="English title"
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Descriptions */}
      <div style={row2}>
        <div>
          <label style={labelStyle}>Description (Arabic)</label>
          <textarea
            dir="rtl"
            value={form.descriptionAr}
            onChange={set('descriptionAr')}
            rows={3}
            placeholder="الوصف بالعربية"
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Description (English)</label>
          <textarea
            value={form.descriptionEn}
            onChange={set('descriptionEn')}
            rows={3}
            placeholder="English description"
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Target + points + badge */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Target *</label>
          <input
            type="number"
            min={1}
            value={form.target}
            onChange={set('target')}
            required
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Reward Points</label>
          <input
            type="number"
            min={0}
            value={form.rewardPoints}
            onChange={set('rewardPoints')}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Reward Badge Key</label>
          <input
            type="text"
            value={form.rewardBadge}
            onChange={set('rewardBadge')}
            placeholder="badge_explorer"
            style={fieldStyle}
          />
        </div>
      </div>

      {/* City + dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>City ID (blank = global)</label>
          <input
            type="text"
            value={form.cityId}
            onChange={set('cityId')}
            placeholder="baghdad"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Starts At *</label>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={set('startsAt')}
            required
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Ends At *</label>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={set('endsAt')}
            required
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Featured */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          id="isFeatured"
          checked={form.isFeatured}
          onChange={set('isFeatured')}
          style={{ width: 16, height: 16 }}
        />
        <label htmlFor="isFeatured" style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Featured challenge (appears in carousel)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={btnStyle('#888')}>Cancel</button>
        <button type="submit" style={btnStyle('#1565c0')}>
          {initial?.titleEn ? 'Save Changes' : 'Create Challenge'}
        </button>
      </div>
    </form>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ChallengeV2['status'] }) {
  const s = statusLabel(status);
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit';

export function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeV2[]>(MOCK_CHALLENGES);
  const [view, setView] = useState<View>('list');
  const [editTarget, setEditTarget] = useState<ChallengeV2 | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<ChallengeV2 | null>(null);
  const [forceTarget, setForceTarget] = useState<ChallengeV2 | null>(null);
  const [msg, setMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  function handleCreate(data: FormState) {
    const now = new Date();
    const newC: ChallengeV2 = {
      ...data,
      id: `ch-${Date.now()}`,
      cityId: data.cityId || null,
      rewardBadge: data.rewardBadge || null,
      isActive: true,
      totalParticipants: 0,
      status:
        new Date(data.startsAt) > now
          ? 'upcoming'
          : new Date(data.endsAt) < now
          ? 'completed'
          : 'active',
    };
    setChallenges((prev) => [newC, ...prev]);
    setView('list');
    flash('Challenge created');
  }

  function handleEdit(data: FormState) {
    if (!editTarget) return;
    const now = new Date();
    setChallenges((prev) =>
      prev.map((c) =>
        c.id === editTarget.id
          ? {
              ...c,
              ...data,
              cityId: data.cityId || null,
              rewardBadge: data.rewardBadge || null,
              status:
                new Date(data.startsAt) > now
                  ? 'upcoming'
                  : new Date(data.endsAt) < now
                  ? 'completed'
                  : 'active',
            }
          : c,
      ),
    );
    setView('list');
    setEditTarget(null);
    flash('Challenge updated');
  }

  const filtered = filterStatus === 'all'
    ? challenges
    : challenges.filter((c) => c.status === filterStatus);

  const stats = {
    total: challenges.length,
    active: challenges.filter((c) => c.status === 'active').length,
    participants: challenges.reduce((a, c) => a + c.totalParticipants, 0),
    featured: challenges.filter((c) => c.isFeatured).length,
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      {/* Title + actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>
          {view === 'list' && 'Challenges & Gamification'}
          {view === 'create' && '← New Challenge'}
          {view === 'edit' && `← Edit: ${editTarget?.titleEn}`}
        </h2>
        {view === 'list' && (
          <button onClick={() => setView('create')} style={btnStyle('#1565c0')}>
            + New Challenge
          </button>
        )}
        {view !== 'list' && (
          <button
            onClick={() => { setView('list'); setEditTarget(null); }}
            style={btnStyle('#555')}
          >
            ← Back
          </button>
        )}
      </div>

      <FlashBanner msg={msg} />

      {/* Create form */}
      {view === 'create' && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 24 }}>
          <h3 style={{ marginTop: 0, color: '#1a237e' }}>Create New Challenge</h3>
          <ChallengeForm onSave={handleCreate} onCancel={() => setView('list')} />
        </div>
      )}

      {/* Edit form */}
      {view === 'edit' && editTarget && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 24 }}>
          <h3 style={{ marginTop: 0, color: '#1a237e' }}>Edit Challenge</h3>
          <ChallengeForm
            initial={{
              kind: editTarget.kind,
              titleAr: editTarget.titleAr,
              titleEn: editTarget.titleEn,
              descriptionAr: editTarget.descriptionAr,
              descriptionEn: editTarget.descriptionEn,
              difficulty: editTarget.difficulty,
              cityId: editTarget.cityId ?? '',
              target: editTarget.target,
              rewardPoints: editTarget.rewardPoints,
              rewardBadge: editTarget.rewardBadge ?? '',
              startsAt: editTarget.startsAt.slice(0, 16),
              endsAt: editTarget.endsAt.slice(0, 16),
              isFeatured: editTarget.isFeatured,
            }}
            onSave={handleEdit}
            onCancel={() => { setView('list'); setEditTarget(null); }}
          />
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Challenges', value: stats.total, color: '#1565c0' },
              { label: 'Active Now', value: stats.active, color: '#2e7d32' },
              { label: 'Total Participants', value: stats.participants.toLocaleString(), color: '#6a1b9a' },
              { label: 'Featured', value: stats.featured, color: '#f57f17' },
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
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Status filter */}
          <div style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Filter:</span>
            {(['all', 'active', 'upcoming', 'completed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '4px 14px',
                  borderRadius: 14,
                  border: `1px solid ${filterStatus === s ? '#1565c0' : '#ccc'}`,
                  background: filterStatus === s ? '#1565c0' : '#fff',
                  color: filterStatus === s ? '#fff' : '#555',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Challenges table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Kind</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Difficulty</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Points</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Participants</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const diff = difficultyBadge(c.difficulty);
                return (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{kindLabel(c.kind)}</div>
                      {c.isFeatured && (
                        <span
                          style={{
                            background: '#fff9c4',
                            color: '#f57f17',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}
                        >
                          ★ Featured
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>{c.titleEn}</div>
                      <div style={{ fontSize: 12, color: '#888', direction: 'rtl', textAlign: 'right' }}>
                        {c.titleAr}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          background: diff.bg,
                          color: diff.color,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {c.difficulty}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{c.target}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ color: '#6a1b9a', fontWeight: 700 }}>{c.rewardPoints}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#1565c0' }}>
                      {c.totalParticipants.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>
                      <div>Start: {c.startsAt.slice(0, 10)}</div>
                      <div>End: {c.endsAt.slice(0, 10)}</div>
                      {c.cityId && <div style={{ marginTop: 2 }}>City: {c.cityId}</div>}
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button
                          onClick={() => { setEditTarget(c); setView('edit'); }}
                          style={{ ...btnStyle('#1565c0'), fontSize: 11 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setAnalyticsTarget(c)}
                          style={{ ...btnStyle('#00838f'), fontSize: 11 }}
                        >
                          Analytics
                        </button>
                        {c.status === 'active' && (
                          <button
                            onClick={() => setForceTarget(c)}
                            style={{ ...btnStyle('#b71c1c'), fontSize: 11 }}
                          >
                            ⚡ Force
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: '#aaa', padding: 30 }}>
                    No challenges found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Modals */}
      {analyticsTarget && (
        <AnalyticsDrawer
          challenge={analyticsTarget}
          onClose={() => setAnalyticsTarget(null)}
        />
      )}

      {forceTarget && (
        <ForceCompleteModal
          challenge={forceTarget}
          onClose={() => setForceTarget(null)}
          onDone={() => {
            setForceTarget(null);
            flash(`Force-completed for user`);
          }}
        />
      )}
    </div>
  );
}
