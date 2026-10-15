import { useState, useEffect, useCallback } from 'react';
import { api, type ReportedComment } from '../api';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

export function ReportedCommentsPage() {
  const [comments, setComments] = useState<ReportedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getReportedComments();
      setComments(data);
    } catch {
      setMsg('فشل جلب التعليقات المُبلَّغ عنها');
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
    setBusy(id);
    try {
      await api.approveComment(id);
      flash('تمت الموافقة على التعليق');
      void load();
    } catch {
      flash('فشلت العملية');
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(id: string) {
    setBusy(id);
    try {
      await api.removeComment(id);
      flash('تمت إزالة التعليق');
      void load();
    } catch {
      flash('فشلت العملية');
    } finally {
      setBusy(null);
    }
  }

  const active = comments.filter((c) => !c.removedAt);
  const removed = comments.filter((c) => !!c.removedAt);

  return (
    <div>
      <PageHeader title="التعليقات المُبلَّغ عنها" meta={`${active.length} نشط`} />
      <FlashBanner msg={msg} />
      {loading && <LoadingRow />}
      {!loading && comments.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center' }}>لا توجد تعليقات مُبلَّغ عنها</p>
      )}
      {!loading && comments.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>التعليق</th>
              <th style={thStyle}>المنشور (سياق)</th>
              <th style={thStyle}>أسباب البلاغ</th>
              <th style={thStyle}>عدد البلاغات</th>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((c) => (
              <tr key={c.id} style={{ background: c.removedAt ? '#fafafa' : undefined, opacity: c.removedAt ? 0.6 : 1 }}>
                <td style={{ ...tdStyle, maxWidth: 260 }}>
                  <div style={{ wordBreak: 'break-word' }}>{c.body}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.authorId}</div>
                </td>
                <td style={{ ...tdStyle, maxWidth: 200, color: '#555', fontSize: 12 }}>
                  {c.postBody.slice(0, 80)}{c.postBody.length > 80 ? '…' : ''}
                </td>
                <td style={tdStyle}>
                  {c.reasons.map((r) => (
                    <span key={r} style={{ display: 'inline-block', background: '#e3f2fd', borderRadius: 3, padding: '1px 6px', fontSize: 11, marginInlineEnd: 4 }}>
                      {r}
                    </span>
                  ))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{c.reportCount}</td>
                <td style={tdStyle}>{new Date(c.createdAt).toLocaleString('ar-IQ')}</td>
                <td style={tdStyle}>
                  {c.removedAt
                    ? <span style={{ color: '#b71c1c', fontSize: 12 }}>محذوف</span>
                    : <span style={{ color: '#2e7d32', fontSize: 12 }}>نشط</span>
                  }
                </td>
                <td style={tdStyle}>
                  {!c.removedAt && (
                    <>
                      <button disabled={busy === c.id} onClick={() => void handleApprove(c.id)} style={btnStyle('#2e7d32')}>
                        إبقاء
                      </button>
                      <button disabled={busy === c.id} onClick={() => void handleRemove(c.id)} style={btnStyle('#b71c1c')}>
                        إزالة
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && removed.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#888' }}>{removed.length} تعليق محذوف مخفي في الأعلى</p>
      )}
    </div>
  );
}
