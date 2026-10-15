import { useState } from 'react';
import { api } from '../api';
import { thStyle, tdStyle, btnStyle, FlashBanner } from '../components/shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface Challenge {
  id: string;
  title: string;
  description: string;
  badge: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  submissionCount: number;
  status: 'draft' | 'active' | 'ended' | 'cancelled';
  winner?: string;
}

interface Submission {
  id: string;
  challengeId: string;
  userId: string;
  userName: string;
  content: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  imageUrl?: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_CHALLENGES: Challenge[] = [
  {
    id: 'c1',
    title: 'Best Baghdad Sunrise',
    description: 'Share the most beautiful sunrise photo from Baghdad rooftops or riverside.',
    badge: '🌅',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    participantCount: 142,
    submissionCount: 89,
    status: 'active',
  },
  {
    id: 'c2',
    title: 'Hidden Gems of Mosul',
    description: 'Discover and share photos of underrated places in Mosul old city.',
    badge: '💎',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    participantCount: 78,
    submissionCount: 55,
    status: 'ended',
    winner: 'u-3812',
  },
  {
    id: 'c3',
    title: 'Traditional Iraqi Cuisine',
    description: 'Share photos of authentic Iraqi dishes from local restaurants.',
    badge: '🍲',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    participantCount: 0,
    submissionCount: 0,
    status: 'draft',
  },
];

const MOCK_SUBMISSIONS: Submission[] = [
  { id: 's1', challengeId: 'c1', userId: 'u-1001', userName: 'Ahmed Al-Rashidi', content: 'Beautiful sunrise from Karrada bridge, 6:15 AM.', submittedAt: '2026-10-15T06:30:00Z', status: 'pending' },
  { id: 's2', challengeId: 'c1', userId: 'u-1002', userName: 'Sara Hamid', content: 'Rooftop view from Mansour district.', submittedAt: '2026-10-14T07:10:00Z', status: 'approved' },
  { id: 's3', challengeId: 'c1', userId: 'u-1003', userName: 'Omar Khalid', content: 'Tigris river at dawn, near Al-Zawraa.', submittedAt: '2026-10-13T05:55:00Z', status: 'pending' },
  { id: 's4', challengeId: 'c2', userId: 'u-3812', userName: 'Fatima Nouri', content: 'Ancient clock tower of old Mosul city.', submittedAt: '2026-09-25T12:00:00Z', status: 'approved' },
];

// ── Challenge form (create/edit) ───────────────────────────────────────────

interface ChallengeFormProps {
  initial?: Partial<Challenge>;
  onSave: (data: Omit<Challenge, 'id' | 'participantCount' | 'submissionCount'>) => void;
  onCancel: () => void;
}

const BADGE_OPTIONS = ['🌅', '💎', '🍲', '📸', '🏛️', '🎨', '🌿', '🦅', '🏆', '⭐'];

function ChallengeForm({ initial, onSave, onCancel }: ChallengeFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    badge: initial?.badge ?? '🏆',
    startDate: initial?.startDate ?? today,
    endDate: initial?.endDate ?? nextMonth,
    status: (initial?.status ?? 'draft') as Challenge['status'],
  });

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...form, winner: initial?.winner });
  }

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          required
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Description *</label>
        <textarea
          value={form.description}
          onChange={set('description')}
          required
          rows={3}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Start Date *</label>
          <input
            type="date"
            value={form.startDate}
            onChange={set('startDate')}
            required
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>End Date *</label>
          <input
            type="date"
            value={form.endDate}
            onChange={set('endDate')}
            required
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Badge (Reward)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BADGE_OPTIONS.map((b) => (
              <button
                type="button"
                key={b}
                onClick={() => setForm((prev) => ({ ...prev, badge: b }))}
                style={{
                  width: 36,
                  height: 36,
                  fontSize: 20,
                  border: `2px solid ${form.badge === b ? '#1565c0' : '#ddd'}`,
                  borderRadius: 6,
                  background: form.badge === b ? '#e3f2fd' : '#fff',
                  cursor: 'pointer',
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Status</label>
          <select
            value={form.status}
            onChange={set('status')}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={btnStyle('#888')}>Cancel</button>
        <button type="submit" style={btnStyle('#1565c0')}>
          {initial?.title ? 'Save Changes' : 'Create Challenge'}
        </button>
      </div>
    </form>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Challenge['status'] }) {
  const map = {
    draft: { bg: '#e3f2fd', color: '#1565c0', label: 'Draft' },
    active: { bg: '#e8f5e9', color: '#2e7d32', label: '● Active' },
    ended: { bg: '#f5f5f5', color: '#757575', label: 'Ended' },
    cancelled: { bg: '#ffebee', color: '#c62828', label: 'Cancelled' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit' | 'submissions';

export function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>(MOCK_CHALLENGES);
  const [submissions, setSubmissions] = useState<Submission[]>(MOCK_SUBMISSIONS);
  const [view, setView] = useState<View>('list');
  const [editTarget, setEditTarget] = useState<Challenge | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [winnerModal, setWinnerModal] = useState<Challenge | null>(null);
  const [winnerId, setWinnerId] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  function handleCreate(data: Omit<Challenge, 'id' | 'participantCount' | 'submissionCount'>) {
    const newC: Challenge = {
      ...data,
      id: `c${Date.now()}`,
      participantCount: 0,
      submissionCount: 0,
    };
    setChallenges((prev) => [newC, ...prev]);
    setView('list');
    flash('Challenge created');
  }

  function handleEdit(data: Omit<Challenge, 'id' | 'participantCount' | 'submissionCount'>) {
    if (!editTarget) return;
    setChallenges((prev) => prev.map((c) => (c.id === editTarget.id ? { ...c, ...data } : c)));
    setView('list');
    setEditTarget(null);
    flash('Challenge updated');
  }

  async function handleApproveSubmission(id: string) {
    setBusy(id);
    try {
      await api.approveSubmission(id);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'approved' as const } : s)));
      flash('Submission approved');
    } catch {
      flash('Approval failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleRejectSubmission(id: string) {
    setBusy(id);
    try {
      await api.rejectSubmission(id);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'rejected' as const } : s)));
      flash('Submission rejected');
    } catch {
      flash('Rejection failed');
    } finally {
      setBusy(null);
    }
  }

  function announceWinner() {
    if (!winnerModal || !winnerId.trim()) return;
    setChallenges((prev) =>
      prev.map((c) => (c.id === winnerModal.id ? { ...c, status: 'ended', winner: winnerId.trim() } : c)),
    );
    setWinnerModal(null);
    setWinnerId('');
    flash(`Winner announced for "${winnerModal.title}"`);
  }

  const challengeSubs = selectedChallenge
    ? submissions.filter((s) => s.challengeId === selectedChallenge.id)
    : [];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1a237e' }}>
          {view === 'list' && 'Community Challenges'}
          {view === 'create' && '← New Challenge'}
          {view === 'edit' && `← Edit: ${editTarget?.title}`}
          {view === 'submissions' && `← Submissions: ${selectedChallenge?.title}`}
        </h2>
        {view === 'list' && (
          <button onClick={() => setView('create')} style={btnStyle('#1565c0')}>
            + New Challenge
          </button>
        )}
        {view !== 'list' && (
          <button
            onClick={() => { setView('list'); setEditTarget(null); setSelectedChallenge(null); }}
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
          <ChallengeForm initial={editTarget} onSave={handleEdit} onCancel={() => { setView('list'); setEditTarget(null); }} />
        </div>
      )}

      {/* Submissions view */}
      {view === 'submissions' && selectedChallenge && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 24 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
            <div style={{ fontSize: 32 }}>{selectedChallenge.badge}</div>
            <div>
              <h3 style={{ margin: 0 }}>{selectedChallenge.title}</h3>
              <div style={{ fontSize: 13, color: '#777', marginTop: 4 }}>
                {challengeSubs.length} submissions · {selectedChallenge.participantCount} participants
              </div>
            </div>
            <StatusBadge status={selectedChallenge.status} />
          </div>

          {challengeSubs.length === 0 ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: 30 }}>No submissions yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Content</th>
                  <th style={thStyle}>Submitted</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {challengeSubs.map((s) => (
                  <tr key={s.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{s.userName}</div>
                      <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace' }}>{s.userId}</div>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 300 }}>{s.content}</td>
                    <td style={tdStyle}>{new Date(s.submittedAt).toLocaleString('en-US')}</td>
                    <td style={tdStyle}>
                      <span style={{
                        background: s.status === 'approved' ? '#e8f5e9' : s.status === 'rejected' ? '#ffebee' : '#fff9c4',
                        color: s.status === 'approved' ? '#2e7d32' : s.status === 'rejected' ? '#c62828' : '#f57f17',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {s.status === 'pending' && (
                        <>
                          <button
                            disabled={busy === s.id}
                            onClick={() => void handleApproveSubmission(s.id)}
                            style={{ ...btnStyle('#2e7d32'), fontSize: 12 }}
                          >
                            ✓ Approve
                          </button>
                          <button
                            disabled={busy === s.id}
                            onClick={() => void handleRejectSubmission(s.id)}
                            style={{ ...btnStyle('#b71c1c'), fontSize: 12 }}
                          >
                            ✗ Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedChallenge.status === 'active' && challengeSubs.some((s) => s.status === 'approved') && (
            <div style={{ marginTop: 20, padding: 16, background: '#fff8e1', borderRadius: 8, border: '1px solid #ffe082' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#f57f17' }}>🏆 Announce Winner</div>
              <button
                onClick={() => setWinnerModal(selectedChallenge)}
                style={btnStyle('#f57f17')}
              >
                Select & Announce Winner
              </button>
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Challenges', value: challenges.length, color: '#1565c0' },
              { label: 'Active', value: challenges.filter((c) => c.status === 'active').length, color: '#2e7d32' },
              { label: 'Total Participants', value: challenges.reduce((a, c) => a + c.participantCount, 0), color: '#6a1b9a' },
              { label: 'Total Submissions', value: challenges.reduce((a, c) => a + c.submissionCount, 0), color: '#00838f' },
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

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Badge</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Dates</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Participants</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Submissions</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Winner</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontSize: 24, textAlign: 'center' }}>{c.badge}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: '#777', marginTop: 2, maxWidth: 240 }}>{c.description}</div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>
                    <div style={{ color: '#555' }}>Start: {c.startDate}</div>
                    <div style={{ color: '#555' }}>End: {c.endDate}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{c.participantCount}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => { setSelectedChallenge(c); setView('submissions'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', fontWeight: 700, fontSize: 14 }}
                    >
                      {c.submissionCount}
                    </button>
                  </td>
                  <td style={tdStyle}><StatusBadge status={c.status} /></td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                    {c.winner ? (
                      <span style={{ color: '#f57f17', fontWeight: 700 }}>🏆 {c.winner}</span>
                    ) : (
                      <span style={{ color: '#ccc' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => { setEditTarget(c); setView('edit'); }}
                      style={{ ...btnStyle('#1565c0'), fontSize: 12 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { setSelectedChallenge(c); setView('submissions'); }}
                      style={{ ...btnStyle('#2e7d32'), fontSize: 12 }}
                    >
                      Submissions
                    </button>
                    {c.status === 'active' && !c.winner && (
                      <button
                        onClick={() => setWinnerModal(c)}
                        style={{ ...btnStyle('#f57f17'), fontSize: 12 }}
                      >
                        🏆 Winner
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Winner modal */}
      {winnerModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => e.target === e.currentTarget && setWinnerModal(null)}
        >
          <div style={{ background: '#fff', borderRadius: 10, width: 440, boxShadow: '0 8px 40px rgba(0,0,0,.25)', padding: 28 }}>
            <h3 style={{ marginTop: 0 }}>🏆 Announce Winner</h3>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 16 }}>
              Challenge: <strong>{winnerModal.title}</strong>
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Winner User ID or Submission ID *
            </label>
            <input
              type="text"
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
              placeholder="u-1234 or s-5678"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 6, marginBottom: 16 }}>
              The winner will be notified and their badge awarded. The challenge status will be set to "ended".
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setWinnerModal(null)} style={btnStyle('#888')}>Cancel</button>
              <button
                disabled={!winnerId.trim()}
                onClick={announceWinner}
                style={{ ...btnStyle('#f57f17'), opacity: winnerId.trim() ? 1 : 0.5 }}
              >
                Announce Winner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
