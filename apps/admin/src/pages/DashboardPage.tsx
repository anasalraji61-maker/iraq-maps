import { useState, useEffect } from 'react';
import { api } from '../api';

interface Metrics {
  totalUsers: number;
  totalProviders: number;
  postsToday: number;
  pendingVerification: number;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '20px 24px',
  flex: '1 1 200px',
  minWidth: 180,
};

const metricNum: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: '#1565c0',
  margin: '8px 0 4px',
};

const metricLabel: React.CSSProperties = {
  fontSize: 14,
  color: '#666',
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMetrics().then((m) => {
      setMetrics(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 24, color: '#888' }}>جارٍ التحميل…</p>;
  if (!metrics) return <p style={{ padding: 24, color: '#c00' }}>تعذّر تحميل الإحصاءات.</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>لوحة التحكم</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <div style={metricLabel}>إجمالي المستخدمين</div>
          <div style={metricNum}>{metrics.totalUsers.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={cardStyle}>
          <div style={metricLabel}>إجمالي مزودي الخدمة</div>
          <div style={metricNum}>{metrics.totalProviders.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={cardStyle}>
          <div style={metricLabel}>منشورات اليوم</div>
          <div style={metricNum}>{metrics.postsToday.toLocaleString('ar-IQ')}</div>
        </div>
        <div style={{ ...cardStyle, borderColor: '#ffcc02' }}>
          <div style={metricLabel}>بانتظار التوثيق</div>
          <div style={{ ...metricNum, color: '#e65100' }}>
            {metrics.pendingVerification.toLocaleString('ar-IQ')}
          </div>
        </div>
      </div>
    </div>
  );
}
