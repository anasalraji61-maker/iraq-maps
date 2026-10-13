import type { Provider } from '../api';

interface Props {
  providers: Provider[];
  onVerify: (id: string) => void;
  onSuspend: (id: string) => void;
  loading: boolean;
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  background: '#f5f5f5',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
  fontSize: 14,
  color: '#333',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #eee',
  fontSize: 14,
  color: '#222',
};

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '5px 12px',
  border: 'none',
  borderRadius: 4,
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  marginInlineStart: 6,
});

export function ProviderTable({ providers, onVerify, onSuspend, loading }: Props) {
  if (loading) return <p style={{ padding: 24, color: '#888' }}>جارٍ التحميل…</p>;
  if (!providers.length) return <p style={{ padding: 24, color: '#888' }}>لا يوجد مزودون بانتظار التوثيق.</p>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>اسم المتجر</th>
          <th style={thStyle}>رقم الهاتف</th>
          <th style={thStyle}>تاريخ التقديم</th>
          <th style={thStyle}>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.id}>
            <td style={tdStyle}>{p.nameAr}</td>
            <td style={{ ...tdStyle, direction: 'ltr', textAlign: 'right' }}>{p.phone}</td>
            <td style={tdStyle}>{new Date(p.submittedAt).toLocaleDateString('ar-IQ')}</td>
            <td style={tdStyle}>
              <button style={btnStyle('#2e7d32')} onClick={() => onVerify(p.id)}>وثّق</button>
              <button style={btnStyle('#c62828')} onClick={() => onSuspend(p.id)}>علّق</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
