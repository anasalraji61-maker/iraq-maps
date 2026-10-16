/**
 * AdminStatCard — KPI metric card with value, label, trend indicator,
 * and comparison with previous period.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: number | string;
  /** Previous period value for trend comparison */
  prevValue?: number;
  /** Unit suffix, e.g. "%" or "ms" */
  unit?: string;
  /** Icon or emoji prefix */
  icon?: ReactNode;
  /** Colour accent for the left border */
  accent?: string;
  /** Format large numbers with K/M shorthand */
  compact?: boolean;
  onClick?: () => void;
}

function formatValue(v: number, compact: boolean): string {
  if (!compact) return v.toLocaleString();
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
}

function trendPct(current: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((current - prev) / prev) * 100);
}

export function AdminStatCard({
  label,
  value,
  prevValue,
  unit = '',
  icon,
  accent = '#1565c0',
  compact = true,
  onClick,
}: StatCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  const displayValue =
    typeof value === 'number'
      ? formatValue(value, compact) + unit
      : String(value) + unit;

  const pct = typeof numericValue === 'number' && prevValue != null
    ? trendPct(numericValue, prevValue)
    : null;

  const trendUp = pct !== null && pct > 0;
  const trendDown = pct !== null && pct < 0;
  const trendNeutral = pct === 0;

  const cardStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 6,
    padding: '16px 20px',
    minWidth: 160,
    flex: '1 1 160px',
    cursor: onClick ? 'pointer' : undefined,
    transition: 'box-shadow 0.15s',
    position: 'relative',
  };

  const iconStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    right: 16,
    fontSize: 22,
    opacity: 0.25,
  };

  const valueStyle: CSSProperties = {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a1a',
    lineHeight: 1.2,
    marginBottom: 4,
  };

  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 600,
  };

  const trendStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    fontSize: 12,
    fontWeight: 600,
    marginTop: 6,
    color: trendUp ? '#2e7d32' : trendDown ? '#c62828' : '#666',
    background: trendUp ? '#e8f5e9' : trendDown ? '#ffebee' : '#f5f5f5',
    padding: '2px 6px',
    borderRadius: 10,
  };

  return (
    <div style={cardStyle} onClick={onClick}>
      {icon && <span style={iconStyle}>{icon}</span>}
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{displayValue}</div>
      {pct !== null && (
        <div style={trendStyle}>
          {trendUp && '↑'}
          {trendDown && '↓'}
          {trendNeutral && '→'}
          {Math.abs(pct)}% vs prev period
        </div>
      )}
      {prevValue != null && (
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
          Prev: {formatValue(prevValue, compact)}{unit}
        </div>
      )}
    </div>
  );
}

/** Row wrapper for a set of stat cards */
export function StatCardRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}
