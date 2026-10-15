import { useState, useEffect, useCallback } from 'react';
import { api, type ReportedPost } from '../api';
import { thStyle, tdStyle as baseTdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

const tdStyle: React.CSSProperties = { ...baseTdStyle, verticalAlign: 'top' };

const checkboxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  cursor: 'pointer',
  accentColor: '#1565c0',
};

export function ReportedPostsPage() {
  const [posts, setPosts] = useState<ReportedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getReportedPosts();
      setPosts(data);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleApprove(id: string) {
    await api.approvePost(id);
    flash('تمت الموافقة على المنشور');
    void load();
  }

  async function handleRemove(id: string) {
    await api.removePost(id);
    flash('تمت إزالة المنشور');
    void load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      // Graceful: try bulk endpoint, fall back to sequential
      try {
        await api.bulkApprovePost([...selected]);
      } catch {
        await Promise.all([...selected].map((id) => api.approvePost(id)));
      }
      flash(`تمت الموافقة على ${selected.size} منشور`);
      void load();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkRemove() {
    if (selected.size === 0) return;
    if (!window.confirm(`هل تريد إزالة ${selected.size} منشور؟`)) return;
    setBulkLoading(true);
    try {
      try {
        await api.bulkRemovePost([...selected]);
      } catch {
        await Promise.all([...selected].map((id) => api.removePost(id)));
      }
      flash(`تمت إزالة ${selected.size} منشور`);
      void load();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="المنشورات المُبلَّغ عنها" meta={`${posts.length} منشور`} />
      <FlashBanner msg={msg} />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: 6,
            padding: '10px 16px',
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 14, color: '#1565c0', fontWeight: 600 }}>
            {selected.size} محدد
          </span>
          <button
            style={btnStyle('#2e7d32')}
            onClick={() => void handleBulkApprove()}
            disabled={bulkLoading}
          >
            موافقة جماعية
          </button>
          <button
            style={btnStyle('#c62828')}
            onClick={() => void handleBulkRemove()}
            disabled={bulkLoading}
          >
            إزالة جماعية
          </button>
          <button
            style={{ ...btnStyle('#666'), marginInlineStart: 'auto' }}
            onClick={() => setSelected(new Set())}
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {loading ? (
        <LoadingRow />
      ) : posts.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد منشورات مُبلَّغ عنها.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>
                <input
                  type="checkbox"
                  style={checkboxStyle}
                  checked={selected.size === posts.length && posts.length > 0}
                  onChange={toggleAll}
                  title="تحديد الكل"
                />
              </th>
              <th style={thStyle}>المنشور</th>
              <th style={thStyle}>الكاتب</th>
              <th style={thStyle}>عدد البلاغات</th>
              <th style={thStyle}>تاريخ البلاغ</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={post.id}
                style={{ background: selected.has(post.id) ? '#f0f7ff' : undefined }}
              >
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    style={checkboxStyle}
                    checked={selected.has(post.id)}
                    onChange={() => toggleSelect(post.id)}
                  />
                </td>
                <td style={{ ...tdStyle, maxWidth: 320 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {post.body}
                  </div>
                </td>
                <td style={tdStyle}>{post.authorId.slice(0, 8)}…</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: post.reportCount >= 5 ? '#ffebee' : '#fff8e1',
                    color: post.reportCount >= 5 ? '#c62828' : '#e65100',
                    fontWeight: 600,
                  }}>
                    {post.reportCount}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                  {new Date(post.createdAt).toLocaleString('ar-IQ')}
                </td>
                <td style={tdStyle}>
                  <button style={btnStyle('#2e7d32')} onClick={() => void handleApprove(post.id)}>موافقة</button>
                  <button style={btnStyle('#c62828')} onClick={() => void handleRemove(post.id)}>إزالة</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
