import { useEffect, useState } from 'react';
import { api, type AssistantUsageEntry } from '../api';
import { LoadingRow } from '../components/shared';

function total(rows: AssistantUsageEntry[], key: keyof AssistantUsageEntry): number {
  return rows.reduce((s, r) => s + (r[key] as number), 0);
}

export function AssistantUsagePage() {
  const [rows, setRows] = useState<AssistantUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAssistantUsage()
      .then(setRows)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>استخدام المساعد الذكي — آخر 30 يوماً</h2>

      {loading && <LoadingRow />}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <>
          {/* Summary totals */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <StatCard label="إجمالي الطلبات" value={total(rows, 'requestCount').toLocaleString()} />
            <StatCard label="رموز المدخلات" value={total(rows, 'inputTokens').toLocaleString()} />
            <StatCard label="رموز المخرجات" value={total(rows, 'outputTokens').toLocaleString()} />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <Th>التاريخ</Th>
                <Th>الطلبات</Th>
                <Th>رموز الإدخال</Th>
                <Th>رموز الإخراج</Th>
                <Th>الإجمالي</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                    لا توجد بيانات
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.date} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <Td>{r.date}</Td>
                  <Td>{r.requestCount.toLocaleString()}</Td>
                  <Td>{r.inputTokens.toLocaleString()}</Td>
                  <Td>{r.outputTokens.toLocaleString()}</Td>
                  <Td>{(r.inputTokens + r.outputTokens).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', textAlign: 'start', fontWeight: 600 }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 14px' }}>{children}</td>;
}
