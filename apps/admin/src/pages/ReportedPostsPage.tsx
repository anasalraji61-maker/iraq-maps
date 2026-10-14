import { useState, useEffect, useCallback } from 'react';
import { api, type ReportedPost } from '../api';
import { thStyle, tdStyle as baseTdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

const tdStyle: React.CSSProperties = { ...baseTdStyle, verticalAlign: 'top' };

export function ReportedPostsPage() {
  const [posts, setPosts] = useState<ReportedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getReportedPosts();
      setPosts(data);
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

  return (
    <div>
      <PageHeader title="المنشورات المُبلَّغ عنها" meta={`${posts.length} منشور`} />
      <FlashBanner msg={msg} />

      {loading ? (
        <LoadingRow />
      ) : posts.length === 0 ? (
        <p style={{ padding: 24, color: '#888' }}>لا توجد منشورات مُبلَّغ عنها.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>المنشور</th>
              <th style={thStyle}>الكاتب</th>
              <th style={thStyle}>عدد البلاغات</th>
              <th style={thStyle}>تاريخ البلاغ</th>
              <th style={thStyle}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td style={{ ...tdStyle, maxWidth: 320 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {post.body}
                  </div>
                </td>
                <td style={tdStyle}>{post.authorName}</td>
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
                  {new Date(post.firstReportAt).toLocaleString('ar-IQ')}
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
