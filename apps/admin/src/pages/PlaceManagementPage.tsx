import { useState, useCallback } from 'react';
import { api, type AdminPlace } from '../api';
import { thStyle, tdStyle, btnStyle, LoadingRow, FlashBanner, PageHeader } from '../components/shared';

interface EditState {
  nameAr: string;
  nameEn: string;
  category: string;
  phone: string;
  hoursRaw: string;
}

export function PlaceManagementPage() {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<AdminPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ nameAr: '', nameEn: '', category: '', phone: '', hoursRaw: '' });
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setMsg('');
    try {
      const data = await api.getPlaces(q);
      setPlaces(data);
      setSearched(true);
    } catch {
      setMsg('فشل جلب بيانات الأماكن');
    } finally {
      setLoading(false);
    }
  }, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  function startEdit(place: AdminPlace) {
    setEditingId(place.id);
    setEditState({
      nameAr: place.nameAr,
      nameEn: place.nameEn ?? '',
      category: place.category,
      phone: place.phone ?? '',
      hoursRaw: place.hoursRaw ?? '',
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await api.updatePlace(id, {
        nameAr: editState.nameAr,
        nameEn: editState.nameEn || null,
        category: editState.category,
        phone: editState.phone || null,
        hoursRaw: editState.hoursRaw || null,
      });
      setPlaces((prev) => prev.map((p) =>
        p.id === id
          ? { ...p, nameAr: editState.nameAr, nameEn: editState.nameEn || null, category: editState.category, phone: editState.phone || null, hoursRaw: editState.hoursRaw || null }
          : p,
      ));
      setEditingId(null);
      flash('تم حفظ التغييرات');
    } catch {
      flash('فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    fontSize: 13,
    border: '1px solid #1565c0',
    borderRadius: 3,
    boxSizing: 'border-box',
  };

  return (
    <div>
      <PageHeader title="إدارة الأماكن" />
      <FlashBanner msg={msg} />
      <form
        onSubmit={(e) => { e.preventDefault(); void search(query); }}
        style={{ display: 'flex', gap: 8, marginBottom: 20 }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="اسم المكان..."
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
      {!loading && searched && places.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center' }}>لا توجد أماكن</p>
      )}
      {!loading && places.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>الاسم (عربي)</th>
              <th style={thStyle}>الاسم (إنجليزي)</th>
              <th style={thStyle}>الفئة</th>
              <th style={thStyle}>الهاتف</th>
              <th style={thStyle}>أوقات العمل</th>
              <th style={thStyle}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {places.map((p) => (
              <tr key={p.id}>
                {editingId === p.id ? (
                  <>
                    <td style={tdStyle}>
                      <input style={inputStyle} value={editState.nameAr} onChange={(e) => setEditState((s) => ({ ...s, nameAr: e.target.value }))} dir="rtl" />
                    </td>
                    <td style={tdStyle}>
                      <input style={inputStyle} value={editState.nameEn} onChange={(e) => setEditState((s) => ({ ...s, nameEn: e.target.value }))} dir="ltr" />
                    </td>
                    <td style={tdStyle}>
                      <input style={inputStyle} value={editState.category} onChange={(e) => setEditState((s) => ({ ...s, category: e.target.value }))} />
                    </td>
                    <td style={tdStyle}>
                      <input style={inputStyle} value={editState.phone} onChange={(e) => setEditState((s) => ({ ...s, phone: e.target.value }))} dir="ltr" />
                    </td>
                    <td style={tdStyle}>
                      <input style={inputStyle} value={editState.hoursRaw} onChange={(e) => setEditState((s) => ({ ...s, hoursRaw: e.target.value }))} />
                    </td>
                    <td style={tdStyle}>
                      <button disabled={saving} onClick={() => void saveEdit(p.id)} style={btnStyle('#2e7d32')}>
                        {saving ? '…' : 'حفظ'}
                      </button>
                      <button disabled={saving} onClick={() => setEditingId(null)} style={btnStyle('#888')}>
                        إلغاء
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{p.nameAr}</td>
                    <td style={{ ...tdStyle, direction: 'ltr', textAlign: 'left' }}>{p.nameEn ?? <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td style={tdStyle}>{p.category}</td>
                    <td style={{ ...tdStyle, direction: 'ltr' }}>{p.phone ?? <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td style={tdStyle}>{p.hoursRaw ?? <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td style={tdStyle}>
                      <button onClick={() => startEdit(p)} style={btnStyle('#1565c0')}>
                        تعديل
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
