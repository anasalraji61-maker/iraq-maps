/**
 * Shared admin UI primitives — table styles, flash banner, loading state.
 */
import type { ReactElement, ReactNode } from 'react';

export const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  background: '#f5f5f5',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
  fontSize: 14,
  color: '#333',
};

export const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #eee',
  fontSize: 14,
  color: '#222',
};

export const btnStyle = (color: string): React.CSSProperties => ({
  padding: '5px 12px',
  border: 'none',
  borderRadius: 4,
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  marginInlineStart: 6,
});

export function LoadingRow(): ReactElement {
  return <p style={{ padding: 24, color: '#888' }}>جارٍ التحميل…</p>;
}

export function FlashBanner({ msg }: { msg: string }): ReactElement | null {
  if (!msg) return null;
  return (
    <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 4, padding: '8px 12px', marginBottom: 12, color: '#2e7d32', fontSize: 13 }}>
      {msg}
    </div>
  );
}

export function PageHeader({ title, meta }: { title: string; meta?: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {meta ? <span style={{ fontSize: 14, color: '#666' }}>{meta}</span> : null}
    </div>
  );
}
