import { useState, useCallback } from 'react';
import { api, type AdminUser } from '../api';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

export function UserSearchPage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void search(query);
  }

  return (
    <div>
      <PageHeader title="بحث المستخدمين" />
      <FlashBanner msg={msg} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="معرّف المستخدم أو الاسم..."
          style={{ flex: 1, padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
          dir="auto"
        />
        <button
          type="submit"
          disabled={loading}
          style={btnStyle('#1565c0')}
        >
          {loading ? 'جارٍ البحث…' : 'بحث'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void search('')}
          style={btnStyle('#555')}
        >
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
              <th style={thStyle}>المعرّف</th>
              <th style={thStyle}>الاسم</th>
              <th style={thStyle}>اللغة</th>
              <th style={thStyle}>الأدوار</th>
              <th style={thStyle}>تاريخ التسجيل</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#555' }}>
                  {u.id}
                </td>
                <td style={tdStyle}>{u.name ?? <span style={{ color: '#aaa' }}>—</span>}</td>
                <td style={tdStyle}>{u.locale}</td>
                <td style={tdStyle}>
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      style={{
                        display: 'inline-block',
                        background: r === 'admin' ? '#b71c1c' : r === 'moderator' ? '#e65100' : '#1565c0',
                        color: '#fff',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontSize: 11,
                        marginInlineEnd: 4,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </td>
                <td style={tdStyle}>{new Date(u.createdAt).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
