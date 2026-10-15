import { useState } from 'react';
import { api } from '../api';
import { btnStyle, FlashBanner, PageHeader } from '../components/shared';

type Entity = 'users' | 'posts' | 'providers';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDataPage() {
  const [entity, setEntity] = useState<Entity>('users');
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  async function handleExport() {
    setLoading(true);
    try {
      const csv = await api.exportCsv(entity, from, to);
      downloadCsv(csv, `${entity}-${from}-${to}.csv`);
      flash('تم تصدير الملف بنجاح');
    } catch {
      flash('فشل التصدير. تأكد من النطاق الزمني والصلاحيات.');
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4 };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  const entityLabels: Record<Entity, string> = {
    users: 'المستخدمون',
    posts: 'المنشورات',
    providers: 'مزودو الخدمة',
  };

  return (
    <div>
      <PageHeader title="تصدير البيانات" />
      <FlashBanner msg={msg} />
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 24, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>نوع البيانات</label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as Entity)}
            style={selectStyle}
          >
            {(Object.entries(entityLabels) as [Entity, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div>
          <button
            disabled={loading || !from || !to}
            onClick={() => void handleExport()}
            style={{ ...btnStyle('#1565c0'), fontSize: 14, padding: '10px 20px' }}
          >
            {loading ? 'جارٍ التصدير…' : `تصدير ${entityLabels[entity]} كـ CSV`}
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          سيتم تنزيل ملف CSV مباشرةً في متصفحك.
        </p>
      </div>
    </div>
  );
}
