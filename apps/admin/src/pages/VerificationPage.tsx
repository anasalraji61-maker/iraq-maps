import { useState, useEffect, useCallback } from 'react';
import { api, type Provider } from '../api';
import { ProviderTable } from '../components/ProviderTable';

const PAGE_SIZE = 25;

export function VerificationPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await api.getPendingProviders(p);
      setProviders(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  async function handleVerify(id: string) {
    await api.verifyProvider(id);
    setMsg('تم التوثيق بنجاح');
    void load(page);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleSuspend(id: string) {
    await api.suspendProvider(id);
    setMsg('تم التعليق بنجاح');
    void load(page);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleReject(id: string, reason: string) {
    await api.rejectProvider(id, reason);
    setMsg('تم رفض المزود');
    void load(page);
    setTimeout(() => setMsg(''), 3000);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>طابور التوثيق</h2>
        <span style={{ fontSize: 14, color: '#666' }}>{total} مزود بانتظار التوثيق</span>
      </div>

      {msg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 4, padding: '8px 12px', marginBottom: 12, color: '#2e7d32', fontSize: 13 }}>
          {msg}
        </div>
      )}

      <ProviderTable
        providers={providers}
        onVerify={(id) => void handleVerify(id)}
        onSuspend={(id) => void handleSuspend(id)}
        onReject={(id, reason) => void handleReject(id, reason)}
        loading={loading}
      />

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '6px 14px', cursor: 'pointer' }}
          >
            السابق
          </button>
          <span style={{ padding: '6px 14px', fontSize: 14 }}>{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '6px 14px', cursor: 'pointer' }}
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
