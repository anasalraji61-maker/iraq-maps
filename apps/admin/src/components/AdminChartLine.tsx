/**
 * AdminChartLine — lightweight SVG line chart for admin dashboards.
 * Supports multiple series, hover tooltips, and responsive sizing.
 */
import { useState, useRef, useEffect, type CSSProperties } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartSeries {
  label: string;
  data: { x: string; y: number }[];
  color?: string;
}

interface Props {
  series: ChartSeries[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  /** Show every Nth x-axis label to avoid crowding */
  xLabelStep?: number;
}

// ── Default series colours ─────────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#1565c0',
  '#2e7d32',
  '#c62828',
  '#f57f17',
  '#6a1b9a',
  '#00838f',
];

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  items: { series: string; value: number; color: string }[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminChartLine({
  series,
  height = 220,
  xLabel,
  yLabel,
  title,
  xLabelStep,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, label: '', items: [] });

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  if (!series.length || series.every((s) => !s.data.length)) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
        No data to display.
      </div>
    );
  }

  // Layout constants
  const PAD_LEFT = yLabel ? 56 : 44;
  const PAD_RIGHT = 16;
  const PAD_TOP = title ? 36 : 16;
  const PAD_BOTTOM = xLabel ? 44 : 32;
  const chartW = Math.max(100, width - PAD_LEFT - PAD_RIGHT);
  const chartH = height - PAD_TOP - PAD_BOTTOM;

  // Gather all x labels (union of all series, preserving first-seen order)
  const xLabels: string[] = [];
  const xSet = new Set<string>();
  for (const s of series) {
    for (const d of s.data) {
      if (!xSet.has(d.x)) {
        xLabels.push(d.x);
        xSet.add(d.x);
      }
    }
  }

  // Compute y domain
  const allY = series.flatMap((s) => s.data.map((d) => d.y));
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(1, ...allY);
  const yRange = yMax - yMin || 1;

  // Nice y ticks
  const nTicks = 5;
  const rawStep = yRange / nTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.ceil(rawStep / magnitude) * magnitude;
  const yTicks: number[] = [];
  let tick = Math.floor(yMin / niceStep) * niceStep;
  while (tick <= yMax + niceStep) {
    yTicks.push(tick);
    tick += niceStep;
  }

  // Coordinate helpers
  const xScale = (i: number) => (xLabels.length > 1 ? (i / (xLabels.length - 1)) * chartW : chartW / 2);
  const yScale = (v: number) => chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  // Build path for a series
  function buildPath(s: ChartSeries): string {
    const map = new Map(s.data.map((d) => [d.x, d.y]));
    let path = '';
    xLabels.forEach((lbl, i) => {
      const v = map.get(lbl);
      if (v === undefined) return;
      const px = xScale(i) + PAD_LEFT;
      const py = yScale(v) + PAD_TOP;
      path += path ? ` L ${px} ${py}` : `M ${px} ${py}`;
    });
    return path;
  }

  // Hover: find nearest x index
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - PAD_LEFT;
    const rawIdx = (mx / chartW) * (xLabels.length - 1);
    const idx = Math.round(Math.max(0, Math.min(xLabels.length - 1, rawIdx)));
    const lbl = xLabels[idx];
    if (!lbl) return;
    const items = series
      .map((s, si) => {
        const found = s.data.find((d) => d.x === lbl);
        return found
          ? { series: s.label, value: found.y, color: s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length] }
          : null;
      })
      .filter(Boolean) as TooltipState['items'];

    const px = xScale(idx) + PAD_LEFT;
    setTooltip({
      visible: true,
      x: px + rect.left - e.currentTarget.getBoundingClientRect().left,
      y: PAD_TOP,
      label: lbl,
      items,
    });
  }

  function onMouseLeave() {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }

  const outerStyle: CSSProperties = {
    position: 'relative',
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '0',
    overflow: 'hidden',
  };

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    top: tooltip.y + 10,
    left: Math.min(tooltip.x + 8, width - 150),
    background: 'rgba(30,30,30,0.92)',
    color: '#fff',
    borderRadius: 5,
    padding: '7px 10px',
    fontSize: 12,
    pointerEvents: 'none',
    zIndex: 10,
    minWidth: 120,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  };

  const step = xLabelStep ?? Math.max(1, Math.ceil(xLabels.length / 8));

  return (
    <div ref={containerRef} style={outerStyle}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '10px 16px 0', flexWrap: 'wrap' }}>
        {title && (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#333', marginInlineEnd: 8 }}>{title}</span>
        )}
        {series.map((s, si) => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555' }}>
            <span
              style={{
                display: 'inline-block',
                width: 24,
                height: 3,
                background: s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length],
                borderRadius: 2,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        width={width}
        height={height}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block' }}
      >
        {/* Y-axis ticks and grid */}
        {yTicks.map((t) => {
          const py = yScale(t) + PAD_TOP;
          if (py < PAD_TOP - 4 || py > PAD_TOP + chartH + 4) return null;
          return (
            <g key={t}>
              <line
                x1={PAD_LEFT}
                y1={py}
                x2={PAD_LEFT + chartW}
                y2={py}
                stroke="#f0f0f0"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={py + 4}
                textAnchor="end"
                fontSize={10}
                fill="#aaa"
              >
                {t >= 1000 ? (t / 1000).toFixed(0) + 'K' : t}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + chartH} stroke="#ccc" strokeWidth={1} />
        <line x1={PAD_LEFT} y1={PAD_TOP + chartH} x2={PAD_LEFT + chartW} y2={PAD_TOP + chartH} stroke="#ccc" strokeWidth={1} />

        {/* X labels */}
        {xLabels.map((lbl, i) => {
          if (i % step !== 0) return null;
          const px = xScale(i) + PAD_LEFT;
          return (
            <text key={lbl} x={px} y={PAD_TOP + chartH + 14} textAnchor="middle" fontSize={10} fill="#aaa">
              {lbl.slice(5)} {/* Strip year from YYYY-MM-DD */}
            </text>
          );
        })}

        {/* Axis labels */}
        {yLabel && (
          <text
            x={10}
            y={PAD_TOP + chartH / 2}
            textAnchor="middle"
            fontSize={10}
            fill="#999"
            transform={`rotate(-90, 10, ${PAD_TOP + chartH / 2})`}
          >
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text
            x={PAD_LEFT + chartW / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#999"
          >
            {xLabel}
          </text>
        )}

        {/* Series lines */}
        {series.map((s, si) => {
          const color = s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length];
          const path = buildPath(s);
          if (!path) return null;
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* Dots at data points */}
              {s.data.map((d) => {
                const xi = xLabels.indexOf(d.x);
                if (xi < 0) return null;
                return (
                  <circle
                    key={d.x}
                    cx={xScale(xi) + PAD_LEFT}
                    cy={yScale(d.y) + PAD_TOP}
                    r={3}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Hover crosshair */}
        {tooltip.visible && (
          <line
            x1={tooltip.x + PAD_LEFT}
            y1={PAD_TOP}
            x2={tooltip.x + PAD_LEFT}
            y2={PAD_TOP + chartH}
            stroke="#999"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.items.length > 0 && (
        <div style={tooltipStyle}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.label}</div>
          {tooltip.items.map((item) => (
            <div key={item.series} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: item.color }} />
              <span style={{ color: '#ddd' }}>{item.series}:</span>
              <span style={{ fontWeight: 600 }}>{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
