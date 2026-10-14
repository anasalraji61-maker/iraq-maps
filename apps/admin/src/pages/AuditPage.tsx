import { useState, useEffect } from 'react';
import { api, type AuditEntry } from '../api';
import { thStyle, tdStyle, LoadingRow } from '../components/shared';

const actionLabel: Record<string, string> = {
  verify: 'توثيق',
  suspend: 'تعليق',
};

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLog().then((data) => {
      setEntries(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingRow />;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>سجل الإجراءات</h2>
      {entries.length === 0 ? (
        <p style={{ color: '#888' }}>لا توجد سجلات.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>الإجراء</th>
              <th style={thStyle}>المزود</th>
              <th style={thStyle}>المشرف</th>
              <th style={thStyle}>الوقت</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={tdStyle}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: e.action === 'verify' ? '#e8f5e9' : '#ffebee',
                    color: e.action === 'verify' ? '#2e7d32' : '#c62828',
                  }}>
                    {actionLabel[e.action] ?? e.action}
                  </span>
                </td>
                <td style={tdStyle}>{e.providerNameAr}</td>
                <td style={tdStyle}>{e.adminUser}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                  {new Date(e.timestamp).toLocaleString('ar-IQ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
