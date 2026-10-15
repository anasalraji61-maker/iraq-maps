import { useState, useCallback } from 'react';
import { api, type AdminUser } from '../api';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

export function UserManagementPage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setMsg('');
    try {
      const data = await api.searchUsers(q);
      setUsers(data);
      setSearched(true);
    } catch {
      setMsg('فشل جلب بيانات المستخدمين');
    } finally {
      setLoading(false);
    }
  }, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleSuspend(id: string) {
    setBusy(id);
    try {
      await api.suspendUser(id);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, suspended: true } : u));
      flash('تم تعليق المستخدم');
    } catch {
      flash('فشلت العملية');
    } finally {
      setBusy(null);
    }
  }

  async function handleUnsuspend(id: string) {
    setBusy(id);
    try {
      await api.unsuspendUser(id);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, suspended: false } : u));
      flash('تم رفع التعليق عن المستخدم');
    } catch {
      flash('فشلت العملية');
    } finally {
      setBusy(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void search(query);
  }

  return (
    <div>
      <PageHeader title="إدارة المستخدمين" />
      <FlashBanner msg={msg} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="اسم المستخدم أو المعرّف..."
          style={{ flex: 1, padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
          dir="auto"
        />
        <button type="submit" disabled={loading} style={btnStyle('#1565c0')}>
          {loading ? 'جارٍ البحث…' : 'بحث'}
        </button>
        <button type="button" disabled={loading} onClick={() => void search('')} style={btnStyle('#555')}>
          عرض الكل
        </button>
      </form>
      {loading && <LoadingRow />}
      {!loading && searched && users.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center' }}>لا توجد نتائج</p>
      )}
      {!loading && users.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>الاسم</th>
              <th style={thStyle}>تاريخ التسجيل</th>
              <th style={thStyle}>المنشورات</th>
              <th style={thStyle}>الاستفسارات</th>
              <th style={thStyle}>الحالة</th>
              <th style={thStyle}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ background: u.suspended ? '#fff3e0' : undefined }}>
                <td style={tdStyle}>
                  <div>{u.name ?? <span style={{ color: '#aaa' }}>—</span>}</div>
                  <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{u.id}</div>
                </td>
                <td style={tdStyle}>{new Date(u.createdAt).toLocaleString('ar-IQ')}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{u.postCount ?? '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{u.inquiryCount ?? '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block',
                    background: u.suspended ? '#b71c1c' : '#2e7d32',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '1px 8px',
                    fontSize: 11,
                  }}>
                    {u.suspended ? 'معلّق' : 'نشط'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {u.suspended ? (
                    <button
                      disabled={busy === u.id}
                      onClick={() => void handleUnsuspend(u.id)}
                      style={btnStyle('#2e7d32')}
                    >
                      رفع التعليق
                    </button>
                  ) : (
                    <button
                      disabled={busy === u.id}
                      onClick={() => void handleSuspend(u.id)}
                      style={btnStyle('#b71c1c')}
                    >
                      تعليق
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
