import { useState } from 'react';
import type { Provider } from '../api';
import { thStyle, tdStyle, btnStyle } from './shared';

interface Props {
  providers: Provider[];
  onVerify: (id: string) => void;
  onSuspend: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  loading: boolean;
}

const statusBadge = (status: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    pending_verification: { bg: '#fff8e1', color: '#e65100' },
    verified: { bg: '#e8f5e9', color: '#2e7d32' },
    rejected: { bg: '#ffebee', color: '#c62828' },
    suspended: { bg: '#f3e5f5', color: '#6a1b9a' },
  };
  const s = map[status] ?? { bg: '#f5f5f5', color: '#555' };
  return { padding: '3px 8px', borderRadius: 4, fontSize: 12, background: s.bg, color: s.color, fontWeight: 600 };
};

const statusLabel: Record<string, string> = {
  pending_verification: 'قيد المراجعة',
  verified: 'موثَّق',
  rejected: 'مرفوض',
  suspended: 'موقوف',
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE_URL: string = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

function ProviderRow({ p, onVerify, onSuspend, onReject }: {
  p: Provider;
  onVerify: (id: string) => void;
  onSuspend: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  function handleRejectSubmit() {
    if (!reason.trim()) return;
    onReject(p.id, reason.trim());
    setShowReject(false);
    setReason('');
  }

  return (
    <>
      <tr key={p.id}>
        <td style={tdStyle}>
          {p.mediaAssetId && (
            <img
              src={`${BASE_URL}/v1/media/${p.mediaAssetId}`}
              alt={p.nameAr}
              style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, marginInlineEnd: 8, verticalAlign: 'middle' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {p.nameAr}
        </td>
        <td style={{ ...tdStyle, direction: 'ltr', textAlign: 'right' }}>{p.phone}</td>
        <td style={tdStyle}>{new Date(p.submittedAt).toLocaleDateString('ar-IQ')}</td>
        <td style={tdStyle}>
          <span style={statusBadge(p.status)}>{statusLabel[p.status] ?? p.status}</span>
        </td>
        <td style={tdStyle}>
          <button style={btnStyle('#2e7d32')} onClick={() => onVerify(p.id)}>وثّق</button>
          <button style={btnStyle('#e65100')} onClick={() => setShowReject((v) => !v)}>رفض</button>
          <button style={btnStyle('#c62828')} onClick={() => onSuspend(p.id)}>علّق</button>
        </td>
      </tr>
      {showReject && (
        <tr>
          <td colSpan={5} style={{ ...tdStyle, background: '#fff8e1' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="سبب الرفض…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                autoFocus
              />
              <button
                style={btnStyle('#e65100')}
                onClick={handleRejectSubmit}
                disabled={!reason.trim()}
              >
                تأكيد الرفض
              </button>
              <button
                style={{ ...btnStyle('#757575') }}
                onClick={() => { setShowReject(false); setReason(''); }}
              >
                إلغاء
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ProviderTable({ providers, onVerify, onSuspend, onReject, loading }: Props) {
  if (loading) return <p style={{ padding: 24, color: '#888' }}>جارٍ التحميل…</p>;
  if (!providers.length) return <p style={{ padding: 24, color: '#888' }}>لا يوجد مزودون بانتظار التوثيق.</p>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>اسم المتجر</th>
          <th style={thStyle}>رقم الهاتف</th>
          <th style={thStyle}>تاريخ التقديم</th>
          <th style={thStyle}>الحالة</th>
          <th style={thStyle}>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <ProviderRow key={p.id} p={p} onVerify={onVerify} onSuspend={onSuspend} onReject={onReject} />
        ))}
      </tbody>
    </table>
  );
}
